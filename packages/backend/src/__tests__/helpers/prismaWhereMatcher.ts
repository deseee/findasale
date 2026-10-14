/**
 * Minimal in-memory evaluator for the Prisma where operators used by the public visibility gates
 * (AND / OR / NOT, equality, null, gt, gte, lt, lte, in, notIn, not, equals). Lets tests run the real
 * where clause a service builds against sample rows instead of asserting on hand-picked mock returns.
 * Comparisons against null are never true (SQL semantics). Relation filters and `mode` are not supported:
 * pass only the scalar part of a where (e.g. its AND array).
 */
export function matchField(value: any, cond: any): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond !== 'object') return value === cond;
  if (value === null || value === undefined) return Object.keys(cond).length === 0;
  const v = value instanceof Date ? value.getTime() : value;
  const n = (x: any) => (x instanceof Date ? x.getTime() : x);
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case 'gt': return v > n(arg);
      case 'gte': return v >= n(arg);
      case 'lt': return v < n(arg);
      case 'lte': return v <= n(arg);
      case 'in': return (arg as any[]).includes(value);
      case 'notIn': return !(arg as any[]).includes(value);
      case 'not': return arg === null ? true : !matchField(value, arg);
      case 'equals': return matchField(value, arg);
      default: throw new Error(`unsupported operator ${op}`);
    }
  });
}

export function matchesWhere(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'AND') return (Array.isArray(cond) ? cond : [cond]).every((w) => matchesWhere(row, w));
    if (k === 'OR') return (cond as any[]).some((w) => matchesWhere(row, w));
    if (k === 'NOT') return (Array.isArray(cond) ? cond : [cond]).every((w) => !matchesWhere(row, w));
    return matchField(row[k], cond);
  });
}
