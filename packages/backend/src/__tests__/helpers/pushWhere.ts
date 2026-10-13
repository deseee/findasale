/**
 * Tiny evaluator for the subset of Prisma `where` used on ItemMarketplacePush, with SQL NULL semantics
 * (`NULL NOT IN (...)` is not true, so a bare `notIn` drops NULL rows). Lets a test check what a where clause would
 * actually return for sample rows instead of only checking its shape.
 */
export function matchesWhere(row: Record<string, any>, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as any[]).some((c) => matchesWhere(row, c));
    if (key === 'AND') return (cond as any[]).every((c) => matchesWhere(row, c));
    const v = row[key];
    if (cond === null) return v === null || v === undefined;
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return v != null && cond.in.includes(v);
      if ('notIn' in cond) return v != null && !cond.notIn.includes(v); // SQL: NULL NOT IN (...) is unknown, so not matched
      return false;
    }
    return v === cond;
  });
}
