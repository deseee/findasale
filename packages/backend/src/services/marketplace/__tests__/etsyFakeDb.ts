/**
 * In-memory stand-in for the slice of Prisma that the Etsy B1 modules use (test helper, not a test).
 * Implements just enough of where/data semantics (equality, OR, AND, lt, gt, lte, gte, not, in,
 * notIn) for MarketplaceAccount, EtsyShopSettings, EtsyOAuthState, EtsyListing and EtsyApiState.
 * updateMany is synchronous inside its async wrapper, so the lease claim is genuinely atomic.
 */

type Row = Record<string, any>;

const num = (v: any) => (v instanceof Date ? v.getTime() : v);

export function matchesWhere(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Row[]).some((w) => matchesWhere(row, w));
    if (k === 'AND') return (cond as Row[]).every((w) => matchesWhere(row, w));
    const v = row[k] === undefined ? null : row[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, arg]: [string, any]) => {
        switch (op) {
          case 'lt':
            return v !== null && num(v) < num(arg);
          case 'lte':
            return v !== null && num(v) <= num(arg);
          case 'gt':
            return v !== null && num(v) > num(arg);
          case 'gte':
            return v !== null && num(v) >= num(arg);
          case 'not':
            return num(v) !== num(arg);
          case 'in':
            return (arg as any[]).includes(v);
          case 'notIn':
            return !(arg as any[]).includes(v);
          default:
            throw new Error(`etsyFakeDb: unsupported operator ${op}`);
        }
      });
    }
    return num(v) === num(cond === undefined ? null : cond);
  });
}

export function makeEtsyFakeDb() {
  let seq = 0;
  const id = (p: string) => `${p}_${++seq}`;
  const store = {
    accounts: [] as Row[],
    settings: [] as Row[],
    states: [] as Row[],
    listings: [] as Row[],
    apiState: null as Row | null,
  };

  const accountWhere = (where: Row): Row =>
    where.organizerId_platform ? { ...where.organizerId_platform } : where;

  const db: any = {
    store,
    marketplaceAccount: {
      findUnique: async ({ where, include }: Row) => {
        const row = store.accounts.find((r) => matchesWhere(r, accountWhere(where)));
        if (!row) return null;
        const out: Row = { ...row };
        if (include?.etsyShopSettings) {
          const s = store.settings.find((x) => x.marketplaceAccountId === row.id);
          out.etsyShopSettings = s ? { ...s } : null;
        }
        return out;
      },
      upsert: async ({ where, create, update }: Row) => {
        const existing = store.accounts.find((r) => matchesWhere(r, accountWhere(where)));
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = { id: id('acct'), refreshLeaseUntil: null, lastErrorAt: null, lastErrorMessage: null, ...create };
        store.accounts.push(row);
        return { ...row };
      },
      update: async ({ where, data }: Row) => {
        const row = store.accounts.find((r) => matchesWhere(r, accountWhere(where)));
        if (!row) throw new Error('etsyFakeDb: account not found');
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: Row) => {
        let count = 0;
        for (const r of store.accounts) {
          if (matchesWhere(r, accountWhere(where))) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      },
      deleteMany: async ({ where }: Row) => {
        const before = store.accounts.length;
        const doomed = store.accounts.filter((r) => matchesWhere(r, where));
        store.accounts = store.accounts.filter((r) => !doomed.includes(r));
        // onDelete: Cascade on EtsyShopSettings.marketplaceAccount
        store.settings = store.settings.filter((s) => !doomed.some((d) => d.id === s.marketplaceAccountId));
        return { count: before - store.accounts.length };
      },
    },
    etsyShopSettings: {
      findUnique: async ({ where }: Row) => {
        const r = store.settings.find((x) => matchesWhere(x, where));
        return r ? { ...r } : null;
      },
      findFirst: async ({ where }: Row) => {
        const r = store.settings.find((x) => matchesWhere(x, where));
        return r ? { ...r } : null;
      },
      upsert: async ({ where, create, update }: Row) => {
        const existing = store.settings.find((x) => matchesWhere(x, where));
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = {
          id: id('settings'),
          defaultShippingProfileId: null,
          defaultReturnPolicyId: null,
          defaultReadinessStateId: null,
          receiptCursor: null,
          ...create,
        };
        store.settings.push(row);
        return { ...row };
      },
      update: async ({ where, data }: Row) => {
        const row = store.settings.find((x) => matchesWhere(x, where));
        if (!row) throw new Error('etsyFakeDb: settings not found');
        Object.assign(row, data);
        return { ...row };
      },
    },
    etsyOAuthState: {
      create: async ({ data }: Row) => {
        if (store.states.some((s) => s.stateHash === data.stateHash)) throw new Error('unique violation');
        const row = { id: id('state'), consumedAt: null, createdAt: new Date(), ...data };
        store.states.push(row);
        return { ...row };
      },
      updateMany: async ({ where, data }: Row) => {
        let count = 0;
        for (const r of store.states) {
          if (matchesWhere(r, where)) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      },
      findUnique: async ({ where }: Row) => {
        const r = store.states.find((x) => matchesWhere(x, where));
        return r ? { ...r } : null;
      },
      deleteMany: async ({ where }: Row) => {
        const before = store.states.length;
        store.states = store.states.filter((r) => !matchesWhere(r, where));
        return { count: before - store.states.length };
      },
    },
    etsyListing: {
      count: async ({ where }: Row) => store.listings.filter((r) => matchesWhere(r, where)).length,
      updateMany: async ({ where, data }: Row) => {
        let count = 0;
        for (const r of store.listings) {
          if (matchesWhere(r, where)) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      },
    },
    etsyApiState: {
      findUnique: async () => (store.apiState ? { ...store.apiState } : null),
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(db),
  };
  return db;
}

/** Reversible stand-in for tokenCrypto that still produces enc:v1: envelopes. */
export const fakeTokenCrypto = {
  encrypt: (s: string) => `enc:v1:${Buffer.from(s, 'utf8').toString('hex')}`,
  decrypt: (s: string) => {
    if (!s.startsWith('enc:v1:')) throw new Error('not an envelope');
    return Buffer.from(s.slice('enc:v1:'.length), 'hex').toString('utf8');
  },
};

/** Test double for the response shape returned by etsyRequest / etsyTokenRequest. */
export function etsyResp(status: number, data: any = null, headers: Record<string, string> = {}) {
  return { status, ok: status >= 200 && status < 300, headers, data, rawText: data === null ? '' : JSON.stringify(data) };
}
