/**
 * SUPERSEDED (ADR-114, 2026-08-31): createCombinedInvoice was removed as a dead subsystem
 * (never reachable from the frontend -- PosInvoiceModal's sessionId-branch that targeted it
 * was never supplied a sessionId by its only caller, pos.tsx). sendHoldInvoice is now the
 * sole invoice-creation path, including the cash/card-split-on-card-portion-only fee math
 * this suite used to cover.
 *
 * Those assertions were ported (not dropped) into
 * packages/backend/src/__tests__/sendHoldInvoiceCashCardSplit.test.ts, which covers the
 * same TEAMS-8%/SIMPLE-10%-on-the-card-portion-only behavior against sendHoldInvoice, plus
 * a new fully-cash-immediate-paid case createCombinedInvoice never had.
 *
 * This file could not be deleted directly -- the sandbox this dispatch ran in cannot
 * delete or rename files under the mounted FindA.Sale repo (`rm`/`os.remove` both returned
 * "Operation not permitted"; confirmed, not assumed). Left as an inert placeholder so the
 * test suite stays green; `git rm` this file the next time you're touching this area, or
 * any time before/after this dispatch's push.
 */
describe('posCombinedInvoiceFee (superseded, ADR-114)', () => {
  it('is a placeholder -- see sendHoldInvoiceCashCardSplit.test.ts for the real coverage', () => {
    expect(true).toBe(true);
  });
});
