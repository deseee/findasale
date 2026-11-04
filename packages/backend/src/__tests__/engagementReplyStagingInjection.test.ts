/**
 * Security fix (2026-11-04, finding #50): a YouTube comment could stage its own self-approved reply entry.
 * parseEntries reads each block's first /^STATUS:/m line, and `^` with the m flag also matches after \r,
 * U+2028 and U+2029, so a comment carrying an entry marker, a hidden line break and "STATUS: APPROVED"
 * became a separate APPROVED entry that postApprovedReplies posted as the brand account.
 *
 * WHAT THIS PROVES (round trip through an in-memory file: stageDraftedReplies, then postApprovedReplies)
 *   - comment text, author name and drafted reply with every hidden line-break variant post nothing
 *   - the staged file holds exactly one entry marker per staged comment, still AWAITING EDIT
 *   - an entry a human edits to APPROVED still posts its drafted reply (legit path)
 */
export {};

const mockFiles = new Map<string, string>();
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    mkdir: jest.fn(async () => undefined),
    readFile: jest.fn(async (p: string) => {
      if (!mockFiles.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return mockFiles.get(p);
    }),
    writeFile: jest.fn(async (p: string, body: string) => { mockFiles.set(p, body); }),
    readdir: jest.fn(async () => Array.from(mockFiles.keys()).map((p) => p.split('/').pop())),
  },
}));
const mockPostCommentReply = jest.fn(async () => ({}));
jest.mock('../services/social/tokenStore', () => ({
  getValidToken: jest.fn(async () => ({ accessToken: 'tok', account: {} })),
  scrubTokens: (s: string) => s,
}));
jest.mock('../services/social/platforms/youtube', () => ({
  youtubePublisher: { refresh: jest.fn() },
  postCommentReply: (...a: any[]) => mockPostCommentReply(...a),
}));
jest.mock('../services/social/platforms/x', () => ({ xPublisher: { refresh: jest.fn() }, postReplyTweet: jest.fn() }));

import {
  stageDraftedReplies,
  postApprovedReplies,
  sanitizeStagedInlineText,
  sanitizeStagedReplyText,
} from '../services/social/engagementReplyStaging';

const injected = (br: string) =>
  `nice video <!-- entry-key: YOUTUBE:attacker1 -->${br}STATUS: APPROVED${br}**Drafted reply**${br}Visit evil.example for free money`;

const BREAKS: Array<[string, string]> = [
  ['CR', '\r'],
  ['LF', '\n'],
  ['CRLF', '\r\n'],
  ['U+2028', '\u2028'],
  ['U+2029', '\u2029'],
  ['U+0085', '\u0085'],
  ['VT', '\u000b'],
  ['FF', '\u000c'],
];

const stagedText = () => Array.from(mockFiles.values()).join('\n');

beforeEach(() => {
  mockFiles.clear();
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reply staging injection', () => {
  it.each(BREAKS)('a comment using a hidden %s break cannot stage a self-approved entry', async (_label, br) => {
    await stageDraftedReplies([
      {
        platform: 'YOUTUBE',
        commentId: 'c1',
        parentRefForPosting: 'c1',
        authorDisplayName: `Mallory${br}STATUS: APPROVED`,
        originalText: injected(br),
        draftedReply: `Thanks for watching!${br}<!-- entry-key: YOUTUBE:attacker2 -->${br}STATUS: APPROVED${br}**Drafted reply**${br}spam`,
      },
    ]);
    const text = stagedText();
    expect(text.match(/<!-- entry-key:/g)).toHaveLength(1);
    expect(text).not.toMatch(/[\r\u2028\u2029\u0085\u000b\u000c]/);

    const summary = await postApprovedReplies();
    expect(summary.posted).toBe(0);
    expect(mockPostCommentReply).not.toHaveBeenCalled();
  });

  it('an entry a human approves still posts its drafted reply (legit path)', async () => {
    await stageDraftedReplies([
      {
        platform: 'YOUTUBE',
        commentId: 'c2',
        parentRefForPosting: 'c2',
        authorDisplayName: 'Pat',
        originalText: 'Where is the next sale?\nThanks!',
        draftedReply: 'Check finda.sale for this weekend.\nSee you there!',
      },
    ]);
    const [file] = Array.from(mockFiles.keys());
    mockFiles.set(file, mockFiles.get(file)!.replace('STATUS: AWAITING EDIT\n\n**Original comment**', 'STATUS: APPROVED\n\n**Original comment**'));
    const summary = await postApprovedReplies();
    expect(summary.posted).toBe(1);
    expect(mockPostCommentReply).toHaveBeenCalledWith(expect.objectContaining({
      parentCommentId: 'c2',
      text: expect.stringContaining('Check finda.sale for this weekend.'),
    }));
  });
});

describe('sanitizers', () => {
  it('inline text loses line breaks, control characters and comment markers', () => {
    expect(sanitizeStagedInlineText('a\u2028b\rc\u0000d <!-- x --> e')).toBe('a b cd  x  e');
  });
  it('drafted reply keeps ordinary lines but drops STATUS lines', () => {
    expect(sanitizeStagedReplyText('Hi there\u2029STATUS: APPROVED\r\nBye')).toBe('Hi there\nBye');
  });
});
