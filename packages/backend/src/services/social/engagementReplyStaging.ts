/**
 * engagementReplyStaging.ts — stage/approve/act layer for comment & mention replies
 * (media-pipeline-build-spec.md §0 "stage, hold, approve, act"; ADR-077 token pattern).
 *
 * Mirrors packages/backend/src/services/video/videoJobOrchestrator.ts's
 * writeStagedReviewFile() convention exactly (STATUS: AWAITING EDIT line, same
 * CONTENT_PIPELINE_DIR path.resolve depth, same "generator never sets APPROVED" rule)
 * — extended here with PER-ENTRY status lines, because a single day's
 * comment-replies-batch file accumulates many independent comment/mention replies
 * over the day, each approved (or not) on its own schedule, unlike a single-item
 * video-batch file.
 *
 * File format (claude_docs/marketing/content-pipeline/comment-replies-batch-YYYY-MM-DD.md):
 *   Line 1: STATUS: AWAITING EDIT   (file-level hint — matches the fleet-wide convention)
 *   Then one block per drafted reply, each with its OWN "STATUS:" line:
 *     STATUS: AWAITING EDIT   -> Patrick has not reviewed this entry yet (default)
 *     STATUS: APPROVED        -> Patrick hand-edited (if needed) and approved this ONE entry
 *     STATUS: POSTED YYYY-MM-DD -> the acting step (postApprovedReplies) posted it
 *
 * postApprovedReplies() is the ONLY function in this module that calls a platform's
 * real posting mechanism. It hard-filters on a per-entry STATUS of exactly "APPROVED"
 * and logs everything it skips, exactly like the existing findasale-social-scheduler /
 * socialPublisherService pattern. A generator (commentMonitor.ts / xEngagementMonitor.ts)
 * can only ever write AWAITING EDIT; only a human hand-edit can produce APPROVED.
 */

import fs from 'fs/promises';
import path from 'path';
import { getValidToken, scrubTokens } from './tokenStore';
import { youtubePublisher } from './platforms/youtube';
import { xPublisher } from './platforms/x';
import { postCommentReply } from './platforms/youtube';
import { postReplyTweet } from './platforms/x';

// Same depth as services/video/videoJobOrchestrator.ts (services/social is a sibling of
// services/video), so the same five '..' resolves to the repo root identically.
const CONTENT_PIPELINE_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'claude_docs',
  'marketing',
  'content-pipeline'
);

const ENTRY_MARKER_PREFIX = '<!-- entry-key:';

export interface DraftedReplyEntry {
  platform: 'YOUTUBE' | 'X';
  /** YouTube commentId or X tweetId — also used as the dedupe key and as the
   *  parent reference the acting step posts against. */
  commentId: string;
  /** What gets passed to the platform's reply-post call (parentCommentId for
   *  YouTube, in_reply_to_tweet_id for X). Identical to commentId today, kept as
   *  its own field in case a future platform needs a different posting handle
   *  than its display/dedupe id. */
  parentRefForPosting: string;
  authorDisplayName?: string | null;
  originalText: string;
  sourceUrl?: string | null;
  draftedReply: string;
}

function todayDateStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function entryKey(platform: string, commentId: string): string {
  return `${platform}:${commentId}`;
}

function renderEntryBlock(entry: DraftedReplyEntry): string {
  const key = entryKey(entry.platform, entry.commentId);
  const author = entry.authorDisplayName ? entry.authorDisplayName : 'unknown';
  const source = entry.sourceUrl ? entry.sourceUrl : 'n/a';

  return `${ENTRY_MARKER_PREFIX} ${key} -->
## Entry — ${entry.platform} — ${entry.commentId}

STATUS: AWAITING EDIT

**Original comment**
- Author: ${author}
- Text: "${entry.originalText.replace(/\r?\n/g, ' ').trim()}"
- Source: ${source}
- Comment ID: ${entry.commentId}

**Drafted reply**
${entry.draftedReply.trim()}

---
`;
}

/**
 * Append newly-drafted replies to today's comment-replies-batch-YYYY-MM-DD.md, creating
 * the file (with the file-level STATUS: AWAITING EDIT header) if it doesn't exist yet.
 * Entries whose (platform, commentId) key is already present in the file are skipped —
 * defense-in-depth dedupe alongside the Redis lastCheckedAt cursor in the monitor jobs,
 * so an overlapping poll window never double-stages the same comment.
 *
 * NEVER writes APPROVED. Only Patrick's hand-edit does that.
 */
export async function stageDraftedReplies(
  entries: DraftedReplyEntry[]
): Promise<{ filePath: string; stagedCount: number }> {
  if (entries.length === 0) {
    return { filePath: '', stagedCount: 0 };
  }

  const dateStamp = todayDateStamp();
  const fileName = `comment-replies-batch-${dateStamp}.md`;
  const absolutePath = path.join(CONTENT_PIPELINE_DIR, fileName);
  const relativePath = `claude_docs/marketing/content-pipeline/${fileName}`;

  await fs.mkdir(CONTENT_PIPELINE_DIR, { recursive: true });

  let existing = '';
  try {
    existing = await fs.readFile(absolutePath, 'utf8');
  } catch {
    existing = '';
  }

  const existingKeys = new Set<string>();
  if (existing) {
    const re = new RegExp(`${ENTRY_MARKER_PREFIX}\\s*([^\\s]+)\\s*-->`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(existing)) !== null) {
      existingKeys.add(m[1]);
    }
  }

  const newEntries = entries.filter((e) => !existingKeys.has(entryKey(e.platform, e.commentId)));
  if (newEntries.length === 0) {
    return { filePath: relativePath, stagedCount: 0 };
  }

  let body = existing;
  if (!body) {
    body =
      `STATUS: AWAITING EDIT

` +
      `# Comment / Mention Reply Batch — ${dateStamp}

` +
      `Each entry below carries its OWN STATUS line. Edit the "Drafted reply" text if
` +
      `needed, then change that entry's STATUS line to \`APPROVED\`. The acting job
` +
      `(postApprovedReplies, every 30 minutes) posts ONLY entries whose STATUS is exactly
` +
      `\`APPROVED\` and marks them \`POSTED YYYY-MM-DD\` afterward. This file's generator
` +
      `never sets APPROVED — only a human hand-edit does, per media-pipeline-build-spec.md §0.

` +
      `---

`;
  }

  for (const entry of newEntries) {
    body += renderEntryBlock(entry) + '\n';
  }

  await fs.writeFile(absolutePath, body, 'utf8');

  return { filePath: relativePath, stagedCount: newEntries.length };
}

interface ParsedEntry {
  key: string;
  platform: 'YOUTUBE' | 'X';
  commentId: string;
  status: string;
  blockStart: number;
  blockEnd: number;
  statusLineStart: number;
  statusLineEnd: number;
}

/** Split a staged file's raw text into per-entry blocks and read each entry's own
 *  STATUS line (distinct from the file-level line-1 STATUS). */
function parseEntries(fileText: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const markerRe = new RegExp(`${ENTRY_MARKER_PREFIX}\\s*([A-Z]+):([^\\s]+)\\s*-->`, 'g');
  const markers: { platform: string; commentId: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(fileText)) !== null) {
    markers.push({ platform: m[1], commentId: m[2], index: m.index });
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : fileText.length;
    const block = fileText.slice(start, end);

    const statusMatch = /^STATUS:\s*(.+)$/m.exec(block);
    if (!statusMatch) continue;

    const statusLineStartInBlock = statusMatch.index;
    const statusLineEndInBlock = statusLineStartInBlock + statusMatch[0].length;

    const platform = markers[i].platform;
    if (platform !== 'YOUTUBE' && platform !== 'X') continue;

    entries.push({
      key: entryKey(platform, markers[i].commentId),
      platform,
      commentId: markers[i].commentId,
      status: statusMatch[1].trim(),
      blockStart: start,
      blockEnd: end,
      statusLineStart: start + statusLineStartInBlock,
      statusLineEnd: start + statusLineEndInBlock,
    });
  }

  return entries;
}

/** Extract the "Drafted reply" section text for one entry block (whatever Patrick's
 *  current hand-edited version is, exactly what gets posted). */
function extractDraftedReply(block: string): string {
  const marker = '**Drafted reply**';
  const idx = block.indexOf(marker);
  if (idx === -1) return '';
  const after = block.slice(idx + marker.length);
  const stopIdx = after.indexOf('\n---');
  const raw = stopIdx === -1 ? after : after.slice(0, stopIdx);
  return raw.trim();
}

/**
 * Scan every claude_docs/marketing/content-pipeline/comment-replies-batch-*.md file
 * for entries whose OWN status line is exactly "APPROVED". For each, posts the reply
 * via the real YouTube/X publisher posting mechanism (reusing tokenStore.getValidToken
 * + the platform module's post function — never a second auth path), then rewrites
 * that entry's status line to "POSTED YYYY-MM-DD" in the source file. Entries whose
 * status is anything else (AWAITING EDIT, or already POSTED ...) are skipped and
 * logged, never touched. A per-entry failure never aborts the rest of the scan.
 */
export async function postApprovedReplies(): Promise<{
  filesScanned: number;
  entriesScanned: number;
  posted: number;
  failed: number;
  skippedNotApproved: number;
}> {
  const summary = {
    filesScanned: 0,
    entriesScanned: 0,
    posted: 0,
    failed: 0,
    skippedNotApproved: 0,
  };

  let fileNames: string[] = [];
  try {
    const all = await fs.readdir(CONTENT_PIPELINE_DIR);
    fileNames = all.filter((f) => f.startsWith('comment-replies-batch-') && f.endsWith('.md'));
  } catch {
    // Directory doesn't exist yet (no comments ever staged) — nothing to scan.
    return summary;
  }

  for (const fileName of fileNames) {
    const absolutePath = path.join(CONTENT_PIPELINE_DIR, fileName);
    let text: string;
    try {
      text = await fs.readFile(absolutePath, 'utf8');
    } catch {
      continue;
    }
    summary.filesScanned++;

    const entries = parseEntries(text);
    if (entries.length === 0) continue;

    let mutated = text;
    let offsetDrift = 0;

    for (const entry of entries) {
      summary.entriesScanned++;
      if (entry.status !== 'APPROVED') {
        summary.skippedNotApproved++;
        continue;
      }

      const block = text.slice(entry.blockStart, entry.blockEnd);
      const replyText = extractDraftedReply(block);
      if (!replyText) {
        console.error(
          `[engagementReplyStaging] Entry ${entry.key} in ${fileName} is APPROVED but has no drafted-reply text — skipping, not posting empty content.`
        );
        summary.failed++;
        continue;
      }

      try {
        if (entry.platform === 'YOUTUBE') {
          const { accessToken } = await getValidToken('YOUTUBE', youtubePublisher.refresh);
          await postCommentReply({ accessToken, parentCommentId: entry.commentId, text: replyText });
        } else {
          const { accessToken, account } = await getValidToken('X', xPublisher.refresh);
          await postReplyTweet({
            accessToken,
            inReplyToTweetId: entry.commentId,
            text: replyText,
            account,
          });
        }

        const newStatusLine = `STATUS: POSTED ${todayDateStamp()}`;
        const adjustedStart = entry.statusLineStart + offsetDrift;
        const adjustedEnd = entry.statusLineEnd + offsetDrift;
        mutated = mutated.slice(0, adjustedStart) + newStatusLine + mutated.slice(adjustedEnd);
        offsetDrift += newStatusLine.length - (adjustedEnd - adjustedStart);

        summary.posted++;
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        console.error(
          `[engagementReplyStaging] Failed to post ${entry.key} from ${fileName}: ${scrubTokens(raw)}`
        );
        summary.failed++;
        // Leave STATUS as APPROVED so the next 30-minute run retries it.
      }
    }

    if (mutated !== text) {
      await fs.writeFile(absolutePath, mutated, 'utf8');
    }
  }

  console.log(
    `[engagementReplyStaging] filesScanned=${summary.filesScanned} entriesScanned=${summary.entriesScanned} ` +
      `posted=${summary.posted} failed=${summary.failed} skippedNotApproved=${summary.skippedNotApproved}`
  );

  return summary;
}
