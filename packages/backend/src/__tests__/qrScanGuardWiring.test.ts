/**
 * Static guard: every endpoint that converts a client-reported location into XP must run checkQrScan BEFORE it
 * awards anything, and must answer a rejection with the guard's status/body. The three controllers are too heavy to
 * import in a unit test (they pull in the whole app), so this reads the source, like engagementWiringAudit.
 */
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** Text of the exported function `name`, from its declaration to the next top-level `export`. */
function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`export (async function|const) ${name}\\b`));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = src.slice(start + 10);
  const next = rest.search(/\nexport /);
  return next === -1 ? rest : rest.slice(0, next);
}

const cases: Array<{ file: string; fn: string; awardMarkers: string[] }> = [
  { file: 'controllers/itemController.ts', fn: 'recordQrScan', awardMarkers: ["awardXp(userId, 'TREASURE_HUNT_SCAN'", 'prisma.userBadge'] },
  { file: 'controllers/treasureHuntQRController.ts', fn: 'markClueFound', awardMarkers: ['treasureHuntQRScan.create', "awardXp(req.user.id, 'TREASURE_HUNT_SCAN'"] },
  { file: 'controllers/saleController.ts', fn: 'checkInToSale', awardMarkers: ["awardXp(userId, 'SALE_CHECKIN'", "awardStampDetailed(userId, 'ATTEND_SALE'"] },
  // 2026-09-30: the second check-in path (POST /api/reservations/checkin) runs the same guard before it writes or stamps.
  { file: 'controllers/reservationController.ts', fn: 'checkinAtSale', awardMarkers: ['prisma.saleCheckin.create', "awardStamp(userId, 'ATTEND_SALE'"] },
];

describe('location-gated XP endpoints run the anti-spoof guard first', () => {
  for (const c of cases) {
    describe(`${c.fn}`, () => {
      const body = fnBody(read(c.file), c.fn);
      it('calls checkQrScan and returns the guard status + body on rejection', () => {
        expect(body).toContain('checkQrScan(');
        expect(body).toMatch(/\.status\((guard|checkinGuard)\.status\)\.json\(qrScanRejectionBody\((guard|checkinGuard)\)\)/);
      });
      it('runs the guard before any award or write', () => {
        const guardAt = body.indexOf('checkQrScan(');
        for (const marker of c.awardMarkers) {
          const at = body.indexOf(marker);
          expect(at).toBeGreaterThan(guardAt);
        }
      });
      it('passes the request IP and the sale schedule/organizer timezone', () => {
        expect(body).toContain('ip: req.ip');
        expect(body).toContain('startDate');
        expect(body).toContain('endDate');
        expect(body).toMatch(/organizer\??\.timezone/);
      });
    });
  }

  it('markClueFound no longer trusts raw req.body coordinates', () => {
    const body = fnBody(read('controllers/treasureHuntQRController.ts'), 'markClueFound');
    expect(body).not.toMatch(/const latitude = req\.body\.latitude/);
    expect(body).toContain('parseBodyLatitude(');
    expect(body).toContain("sale.status !== 'PUBLISHED'");
  });

  it('the guard never uses an em dash or the word AI in strings shown to shoppers', () => {
    const src = read('services/qrScanGuardService.ts');
    const messages = src.slice(src.indexOf('const MESSAGES'), src.indexOf('function reject('));
    expect(messages).not.toMatch(/\u2014|\bAI\b/);
  });
});
