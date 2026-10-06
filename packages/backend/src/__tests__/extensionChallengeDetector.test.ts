/**
 * (S-EXT-CHALLENGE-SETTLE, 2026-10-06) The marketplace challenge detector must not pause a marketplace for a transient
 * interstitial. Live case: Vinted showed Cloudflare's "Just a moment..." at load, the old detector reported it at once and
 * background.js paused VINTED until the organizer un-ticked it. extension/fas-challenge.js (shared by the Vinted, Grailed,
 * Mercari and Poshmark content scripts) now requires the same signal to persist for CHALLENGE_SETTLE_MS across polls.
 *
 * Pins: (1) "Just a moment..." that clears within 10s never reports; (2) one that persists reports exactly once, with reason
 * 'title:Just a moment...', and polling stops; (3) a short page with a captcha widget that persists reports once
 * ('challenge_widget'), while a long page with a widget (a login form) never does; (4) a normal page never reports and polling
 * stops by itself; (5) a cleared suspicion starts over on a later fresh sighting; (6) source checks: manifest loads
 * fas-challenge.js before each of the four platform scripts, and each platform script delegates to it (no leftover
 * immediate-report copy).
 *
 * Synthetic data only: a minimal document stub (title, body.innerText, querySelector) and jest fake timers.
 */
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const challenge = require('../../../../extension/fas-challenge.js');

const EXT_DIR = path.resolve(__dirname, '../../../../extension');
const read = (f: string) => fs.readFileSync(path.join(EXT_DIR, f), 'utf8');

interface FakeDoc {
  title: string;
  body: { innerText: string };
  widget: boolean;
  querySelector: (sel: string) => object | null;
}
function makeDoc(over: Partial<Pick<FakeDoc, 'title' | 'widget'>> & { text?: string } = {}): FakeDoc {
  const d: FakeDoc = {
    title: over.title ?? 'Vinted | Sell clothes',
    body: { innerText: over.text ?? 'x'.repeat(2000) },
    widget: over.widget ?? false,
    querySelector: () => (d.widget ? {} : null),
  };
  return d;
}

describe('extension fas-challenge.js settle window', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const start = (doc: FakeDoc) => {
    const send = jest.fn();
    const w = challenge.watch({ platform: 'VINTED', doc, send });
    return { send, w };
  };

  it('uses the intended timing constants', () => {
    expect(challenge.CHALLENGE_SETTLE_MS).toBeGreaterThanOrEqual(20000);
    expect(challenge.CHALLENGE_POLL_MS).toBeLessThanOrEqual(3000);
    expect(challenge.CHALLENGE_MAX_WATCH_MS).toBeLessThanOrEqual(60000);
  });

  it('(1) "Just a moment..." that clears within 10s never reports', () => {
    const doc = makeDoc({ title: 'Just a moment...', text: 'Checking your browser' });
    const { send } = start(doc);
    jest.advanceTimersByTime(9000); // seen at 2.5s, still there at 9s
    expect(send).not.toHaveBeenCalled();
    doc.title = 'Vinted | Sell clothes';
    doc.body.innerText = 'x'.repeat(2000);
    jest.advanceTimersByTime(120000);
    expect(send).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('(2) "Just a moment..." that persists reports exactly once with the title reason, then stops polling', () => {
    const doc = makeDoc({ title: 'Just a moment...', text: 'Checking your browser' });
    const { send } = start(doc);
    jest.advanceTimersByTime(19000); // first sighting ~2.5s, so 21.5s is the earliest report
    expect(send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('title:Just a moment...');
    jest.advanceTimersByTime(300000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('(3) short page with a captcha widget that persists reports once', () => {
    const doc = makeDoc({ title: 'Vinted', text: 'Please verify', widget: true });
    const { send } = start(doc);
    jest.advanceTimersByTime(15000);
    expect(send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(30000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('challenge_widget');
    jest.advanceTimersByTime(300000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('(3b) a long page that merely embeds a captcha widget (login form) never reports', () => {
    const doc = makeDoc({ title: 'Log in', text: 'x'.repeat(1500), widget: true });
    const { send } = start(doc);
    jest.advanceTimersByTime(300000);
    expect(send).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('(4) normal page never reports and polling stops by itself', () => {
    const { send } = start(makeDoc());
    jest.advanceTimersByTime(challenge.CHALLENGE_MAX_WATCH_MS + 10000);
    expect(send).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('(5) a cleared suspicion starts over: a later sighting needs its own full settle window', () => {
    const doc = makeDoc({ title: 'Just a moment...', text: 'Checking' });
    const { send } = start(doc);
    jest.advanceTimersByTime(15000); // suspected since 2.5s
    doc.title = 'Vinted | Home';
    jest.advanceTimersByTime(6000); // cleared at the next poll
    doc.title = 'Access denied';    // fresh sighting (SPA title change, no reload)
    jest.advanceTimersByTime(15000);
    expect(send).not.toHaveBeenCalled(); // less than 20s since the fresh sighting
    jest.advanceTimersByTime(10000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('title:Access denied');
  });

  it('stop() cancels a pending watch', () => {
    const doc = makeDoc({ title: 'Just a moment...' });
    const { send, w } = start(doc);
    w.stop();
    jest.advanceTimersByTime(120000);
    expect(send).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('never throws out of the timer when the document misbehaves', () => {
    const doc: any = { get title(): string { throw new Error('boom'); }, body: null, querySelector: () => null };
    const { send } = start(doc);
    expect(() => jest.advanceTimersByTime(120000)).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('extension challenge detector wiring', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const PLATFORM_FILES: Record<string, string> = {
    VINTED: 'fas-vinted.js', GRAILED: 'fas-grailed.js', MERCARI: 'fas-mercari.js', POSHMARK: 'fas-poshmark.js',
  };

  it.each(Object.entries(PLATFORM_FILES))('%s: manifest loads fas-challenge.js before %s', (_p, file) => {
    const entry = manifest.content_scripts.find((c: { js: string[] }) => c.js.includes(file));
    expect(entry).toBeTruthy();
    expect(entry.js).toContain('fas-challenge.js');
    expect(entry.js.indexOf('fas-challenge.js')).toBeLessThan(entry.js.indexOf(file));
  });

  it.each(Object.entries(PLATFORM_FILES))('%s: script delegates to the shared watcher with its own platform', (p, file) => {
    const src = read(file);
    expect(src).toContain('fasChallengeDetector');
    expect(src).toContain(`const PLATFORM = '${p}';`);
    expect(src).toContain('window.__FAS_CHALLENGE__.watch({ platform: PLATFORM })');
    expect(src).not.toContain("type: 'platformRestricted'"); // no leftover immediate-report copy
  });

  it('only fas-challenge.js sends platformRestricted from content scripts', () => {
    const offenders = fs.readdirSync(EXT_DIR)
      .filter((f) => /^fas-.*\.js$/.test(f) && f !== 'fas-challenge.js')
      .filter((f) => read(f).includes("type: 'platformRestricted'"));
    expect(offenders).toEqual([]);
    expect(read('fas-challenge.js')).toContain("type: 'platformRestricted'");
  });
});
