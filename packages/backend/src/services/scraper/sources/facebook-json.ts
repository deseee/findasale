/**
 * ADR-082 Phase 2: Facebook embedded-JSON extraction utilities.
 *
 * Facebook serves its own event-search and event-page data as structured JSON
 * embedded in `<script type="application/json">` tags, rendered for logged-out
 * browsers in the INITIAL HTML (no JS hydration needed for the search surface --
 * confirmed live S1113/this session: HTTP 200, ~7 Event objects/page, markers
 * `"__typename":"Event"`, `start_timestamp`, `event_place`, `is_past`,
 * `day_time_sentence` all present in the plain-GET proxy response).
 *
 * This module is PURE (no network). It exposes:
 *   - findJsonInString()          -- balanced-bracket object slicer (lifted from the
 *                                    MIT-licensed francescov1/facebook-event-scraper).
 *   - findObjectsByTypename()     -- recursive walker collecting every object whose
 *                                    `__typename` matches (scrapfly's durable rule:
 *                                    key on `__typename`, never rotating CSS classes).
 *   - extractEventObjects()       -- top-level: pull every `Event` object out of a
 *                                    page's HTML, using both the parse-each-script
 *                                    path and a raw-string fallback.
 *   - extractFbEventIdFromUrl()   -- numeric event id from any FB events URL variant
 *                                    (www / m / mbasic / /events/s/<share>/<id>/).
 *   - canonicalizeEventUrl()      -- normalise any variant to
 *                                    https://www.facebook.com/events/<id>/
 *
 * Attribution: `findJsonInString` is adapted from
 * https://github.com/francescov1/facebook-event-scraper (src/utils/json.ts, MIT).
 */

// ---------------------------------------------------------------------------
// findJsonInString -- balanced-bracket extractor (MIT, francescov1)
// ---------------------------------------------------------------------------

export interface FindJsonResult {
  startIndex: number;
  endIndex: number;
  jsonData: any;
}

/**
 * Locate `"<key>":` in `dataString` and slice out the JSON value that follows by
 * walking braces/brackets while respecting string literals (so `{` / `}` inside a
 * quoted value are ignored). Returns the parsed value. When `isDesiredValue` is
 * supplied, keeps scanning subsequent matches until one satisfies the predicate.
 * Adapted from francescov1/facebook-event-scraper (MIT).
 */
export function findJsonInString(
  dataString: string,
  key: string,
  isDesiredValue?: (value: Record<string, any>) => boolean
): FindJsonResult {
  const prefix = `"${key}":`;
  let startPosition = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let idx = dataString.indexOf(prefix, startPosition);
    if (idx === -1) {
      return { startIndex: -1, endIndex: -1, jsonData: null };
    }

    idx += prefix.length;
    const startIndex = idx;
    const startCharacter = dataString[startIndex];

    // Value is null
    if (
      startCharacter === 'n' &&
      dataString.slice(startIndex, startIndex + 4) === 'null'
    ) {
      startPosition = startIndex + 4;
      continue;
    }

    // Only object/array values are sliceable here; anything else, skip ahead.
    if (startCharacter !== '{' && startCharacter !== '[') {
      startPosition = startIndex + 1;
      continue;
    }

    const endCharacter = startCharacter === '{' ? '}' : ']';
    let nestedLevel = 0;
    let isIndexInString = false;

    while (idx < dataString.length - 1) {
      idx++;
      // '\\' is a single literal backslash -- escape it so an escaped quote inside
      // a string does not flip the in-string flag.
      if (dataString[idx] === '"' && dataString[idx - 1] !== '\\') {
        isIndexInString = !isIndexInString;
      } else if (dataString[idx] === endCharacter && !isIndexInString) {
        if (nestedLevel === 0) break;
        nestedLevel--;
      } else if (dataString[idx] === startCharacter && !isIndexInString) {
        nestedLevel++;
      }
    }

    const jsonDataString = dataString.slice(startIndex, idx + 1);
    try {
      const jsonData = JSON.parse(jsonDataString);
      if (!isDesiredValue || isDesiredValue(jsonData)) {
        return { startIndex, endIndex: idx, jsonData };
      }
    } catch {
      // Malformed slice -- advance and keep looking.
    }
    startPosition = idx + 1;
  }
}

// ---------------------------------------------------------------------------
// findObjectsByTypename -- recursive walker (scrapfly's durable rule)
// ---------------------------------------------------------------------------

/**
 * Recursively collect every object in `root` whose `__typename` equals one of
 * `typenames`. Depth-guarded (default 50) to avoid pathological/cyclic structures.
 * This is the durable extraction primitive: it keys on `__typename`, which FB
 * keeps stable, rather than rotating CSS classes.
 */
export function findObjectsByTypename(
  root: any,
  typenames: string | string[],
  maxDepth = 50
): any[] {
  const wanted = Array.isArray(typenames) ? typenames : [typenames];
  const out: any[] = [];
  const seen = new Set<any>();

  const walk = (node: any, depth: number): void => {
    if (node === null || typeof node !== 'object' || depth > maxDepth) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const el of node) walk(el, depth + 1);
      return;
    }

    if (typeof node.__typename === 'string' && wanted.includes(node.__typename)) {
      out.push(node);
    }
    for (const k of Object.keys(node)) {
      walk(node[k], depth + 1);
    }
  };

  walk(root, 0);
  return out;
}

// ---------------------------------------------------------------------------
// extractEventObjects -- top-level Event harvester
// ---------------------------------------------------------------------------

const SCRIPT_JSON_RE = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;

/**
 * Extract every `__typename:"Event"` object from a page's raw HTML.
 *
 * Two complementary passes, results merged and de-duplicated by object identity:
 *   1. PRIMARY -- parse each `<script type="application/json">` block fully, then
 *      run findObjectsByTypename() over the parsed tree. Handles any field
 *      ordering and arbitrary nesting.
 *   2. FALLBACK -- raw-string scan for `{"__typename":"Event"` (FB serialises the
 *      lean typeahead Event objects with __typename first) and balanced-bracket
 *      slice each. Recovers events from script blocks that fail a full JSON.parse
 *      (truncated / concatenated payloads).
 *
 * Never throws -- malformed input yields an empty array.
 */
export function extractEventObjects(html: string): any[] {
  const collected: any[] = [];
  const seenIds = new Set<string>();

  const pushUnique = (ev: any): void => {
    if (!ev || typeof ev !== 'object') return;
    // Prefer the FB numeric id as the identity key; fall back to url, then a
    // JSON fingerprint so genuinely distinct objects are not merged away.
    const key =
      (typeof ev.id === 'string' && ev.id) ||
      (typeof ev.url === 'string' && ev.url) ||
      (() => {
        try {
          return JSON.stringify(ev).slice(0, 200);
        } catch {
          return null;
        }
      })();
    if (!key) return;
    if (seenIds.has(key)) return;
    seenIds.add(key);
    collected.push(ev);
  };

  // Pass 1: parse each JSON script block, walk for Event objects.
  try {
    let m: RegExpExecArray | null;
    SCRIPT_JSON_RE.lastIndex = 0;
    while ((m = SCRIPT_JSON_RE.exec(html)) !== null) {
      const raw = m[1];
      if (!raw || raw.indexOf('"Event"') === -1) continue;
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue; // handled by the raw-string fallback below
      }
      for (const ev of findObjectsByTypename(parsed, 'Event')) {
        pushUnique(ev);
      }
    }
  } catch {
    // fall through to raw-string pass
  }

  // Pass 2: raw-string fallback keyed on the object-start marker.
  try {
    const marker = '{"__typename":"Event"';
    let from = 0;
    // Cap iterations defensively so a hostile page can't spin forever.
    for (let guard = 0; guard < 5000; guard++) {
      const at = html.indexOf(marker, from);
      if (at === -1) break;
      const sliced = sliceBalancedObject(html, at);
      from = sliced ? sliced.endIndex + 1 : at + marker.length;
      if (!sliced) continue;
      try {
        pushUnique(JSON.parse(sliced.text));
      } catch {
        /* skip malformed slice */
      }
    }
  } catch {
    // best-effort
  }

  return collected;
}

/**
 * Given an index pointing at an opening `{`, return the balanced-object substring
 * (respecting string literals). Returns null if no balanced object is found.
 */
function sliceBalancedObject(
  s: string,
  openIndex: number
): { text: string; endIndex: number } | null {
  if (s[openIndex] !== '{') return null;
  let idx = openIndex;
  let nestedLevel = 0;
  let inString = false;
  while (idx < s.length) {
    const ch = s[idx];
    if (ch === '"' && s[idx - 1] !== '\\') {
      inString = !inString;
    } else if (!inString && ch === '{') {
      nestedLevel++;
    } else if (!inString && ch === '}') {
      nestedLevel--;
      if (nestedLevel === 0) {
        return { text: s.slice(openIndex, idx + 1), endIndex: idx };
      }
    }
    idx++;
  }
  return null;
}

// ---------------------------------------------------------------------------
// URL helpers -- numeric id extraction + canonicalization
// ---------------------------------------------------------------------------

/**
 * Extract the numeric Facebook event id from any FB events URL variant:
 *   - https://www.facebook.com/events/1718611872705802/
 *   - https://m.facebook.com/events/1718611872705802
 *   - https://mbasic.facebook.com/events/1718611872705802/
 *   - https://www.facebook.com/events/s/<share-slug>/1718611872705802/
 *   - venue-slug form .../events/4900-six-flags-rd-.../Fall-Sale/402022744578852/
 * Returns the LAST run of 8+ digits in the path after /events/ (so a street
 * number embedded in a venue slug is never mistaken for the id), or null.
 */
export function extractFbEventIdFromUrl(url: string): string | null {
  if (!url) return null;

  // Share-redirect form: /events/s/<slug>/<id>
  const redirectMatch = url.match(/facebook\.com\/events\/s\/[^/]+\/(\d+)/);
  if (redirectMatch) return redirectMatch[1];

  // Direct numeric form: /events/<id>
  const directMatch = url.match(/\/events\/(\d{8,})/);
  if (directMatch) return directMatch[1];

  // Venue-slug form: take the LAST 8+ digit run in the path after /events/.
  const eventsIdx = url.indexOf('/events/');
  if (eventsIdx === -1) return null;
  const pathAfter = url.slice(eventsIdx);
  const runs = pathAfter.match(/\d{8,}/g);
  if (runs && runs.length > 0) return runs[runs.length - 1];
  return null;
}

/**
 * Normalise any FB event URL variant (m / mbasic / share-redirect) to the
 * canonical desktop form https://www.facebook.com/events/<id>/. Falls back to the
 * input URL when no numeric id can be extracted.
 */
export function canonicalizeEventUrl(url: string): string {
  const id = extractFbEventIdFromUrl(url);
  return id ? `https://www.facebook.com/events/${id}/` : url;
}
