/**
 * ADR-139 §1 / §14 constraint 1: the recruit channel never shares credentials, mailbox, send
 * path, quota table or kill switch with the cold-outreach mailbox or the transactional rail.
 *
 * Static read of every recruit-module source file. Fails if any of them names an outreach
 * mailbox credential / env var, the outreach mailbox address, the shared bulk gate, the
 * transactional send services, or writes to the outreach tables.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');

function recruitFiles(): string[] {
  const dir = path.join(SRC, 'services', 'recruit');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => path.join(dir, f));
  files.push(
    path.join(SRC, 'jobs', 'recruitSendCron.ts'),
    path.join(SRC, 'routes', 'recruit.ts'),
    path.join(SRC, 'routes', 'adminRecruit.ts')
  );
  return files;
}

// Each pattern is an identifier-boundary match, so RECRUIT_* names never trip it.
const BANNED: Array<[string, RegExp]> = [
  ['outreach Gmail OAuth env var (GMAIL_*)', /(?<![A-Z0-9_])GMAIL_[A-Z_]+/],
  ['outreach env var (OUTREACH_*)', /(?<![A-Z0-9_])OUTREACH_[A-Z_]+/],
  ['outreach mailbox address', /outreach@/i],
  ['outreach mailbox alias', /find@outreach/i],
  ['createGmailClient', /createGmailClient/],
  ['googleapis client (outreach rail)', /from ['"]googleapis['"]/],
  ['shared bulk gate', /bulkEmailGate/],
  ['transactional emailService module', /lib\/emailService/],
  ['transactional send service', /transactionalEmailService/],
  ['outreach cron module', /outreachEmailsCron/],
  ['outreach quota table', /outreachQuotaLog|OutreachQuotaLog|checkAndIncrementOutreachQuota/],
  ['write to DirectoryClaimEmail', /directoryClaimEmail\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/],
];

describe('recruit channel isolation', () => {
  const files = recruitFiles();

  it('finds the recruit module files', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) expect(fs.existsSync(f)).toBe(true);
  });

  it.each(BANNED)('no recruit file references: %s', (_label, re) => {
    const offenders = files.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('the banned-name check itself catches a planted outreach credential', () => {
    const planted = 'const t = process.env.GMAIL_REFRESH_TOKEN; const ok = process.env.RECRUIT_GMAIL_REFRESH_TOKEN;';
    expect(BANNED[0][1].test(planted)).toBe(true);
    expect(BANNED[0][1].test('process.env.RECRUIT_GMAIL_REFRESH_TOKEN')).toBe(false);
  });
});
