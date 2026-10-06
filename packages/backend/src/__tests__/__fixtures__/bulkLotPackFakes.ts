/**
 * In-memory fake database for the bulk lot PACK tests (ADR-136 Addendum E). Builds on FakeDb (real rollback, guarded stock
 * decrement) and adds what packs need: ItemBulkLot.packSize on every lot read (item reads and itemBulkLot.findMany), nested
 * bulkLot updates from updateBulkLot, and $executeRaw (records the advisory lock statement). Transactions run one at a time with a
 * real rollback; see $transaction below for what that does and does not prove.
 */
import { FakeDb, Row } from './bulkLotFollowupFakes';

export class PackFakeDb extends FakeDb {
  /** itemId -> pack size (absent or null = not sold in packs). */
  packs = new Map<string, number | null>();
  lotKinds = new Map<string, string>();
  rawCalls: string[] = [];

  constructor() {
    super();
    const decorate = (row: Row | null): Row | null => {
      if (!row || !row.bulkLot) return row;
      return { ...row, bulkLot: { ...row.bulkLot, game: 'MTG', lotKind: this.lotKinds.get(row.id) ?? 'BULK_COMMON_UNCOMMON', packSize: this.packs.get(row.id) ?? null } };
    };
    const t = this.item;
    const findUnique = t.findUnique.bind(t);
    const findFirst = t.findFirst.bind(t);
    const findMany = t.findMany.bind(t);
    const update = t.update.bind(t);
    t.findUnique = async (a: any) => decorate(await findUnique(a)) as Row | null;
    t.findFirst = async (a: any) => decorate(await findFirst(a)) as Row | null;
    t.findMany = async (a: any) => (await findMany(a)).map((r: Row) => decorate(r) as Row);
    t.update = async (args: { where: Row; data: Row }) => {
      const { bulkLot, ...rest } = args.data;
      const row = await update({ where: args.where, data: rest });
      if (bulkLot && bulkLot.update) {
        if ('packSize' in bulkLot.update) this.packs.set(row.id, bulkLot.update.packSize);
        if ('lotKind' in bulkLot.update) this.lotKinds.set(row.id, bulkLot.update.lotKind);
      }
      return decorate(row) as Row;
    };
    this.itemBulkLot = {
      findMany: async (args: { where?: { itemId?: { in?: string[] } } }) =>
        [...this.lots].filter((id) => !args.where?.itemId?.in || args.where.itemId.in.includes(id)).map((itemId) => ({ itemId, packSize: this.packs.get(itemId) ?? null })),
    };
  }

  private txTail: Promise<void> = Promise.resolve();

  private rawCall(strings: TemplateStringsArray | string, values: unknown[]): string {
    const text = typeof strings === 'string' ? strings : strings.join('?');
    this.rawCalls.push(text + ' ' + JSON.stringify(values));
    return text;
  }

  /** Records the call (the tests assert the advisory lock was taken on the right key). */
  $executeRaw = async (strings: TemplateStringsArray | string, ...values: unknown[]): Promise<number> => {
    this.rawCall(strings, values);
    return 1;
  };

  /**
   * Real rollback (from FakeDb), and transactions run ONE AT A TIME, in the order they started. That is a stricter schedule than
   * Postgres runs (which interleaves transactions and uses the advisory lock to order the ones that share a key), so a test here
   * proves the logic is right for the order the lock produces; it does not prove Postgres takes the lock. The tests therefore also
   * assert that the lock statement was issued, with the right key (rawCalls).
   */
  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const previous = this.txTail;
    let release!: () => void;
    this.txTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await super.$transaction(fn);
    } finally {
      release();
    }
  }

  /** A lot with a pack size. */
  addPackLot(over: Row = {}, packSize = 1000): Row {
    const lot = this.addLot(over);
    this.packs.set(lot.id, packSize);
    return lot;
  }
}
