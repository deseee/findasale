# Shared – Cross-Boundary Contracts

Scope: packages/shared

Project contract: root CLAUDE.md
Stack authority: STACK.md

If conflict exists between this file and root CLAUDE.md,
root prevails.

This file must not redefine architecture or behavior.

---

## 1. Responsibility

Owns:
- Shared TypeScript interfaces
- Re-exported Prisma types
- Shared API request/response contracts
- Shared validation schemas (if used by both layers)

No runtime logic.

---

## 2. Discipline

- No business rules
- No environment usage
- No side effects
- Keep compile-time only

---

## 3. Change Protocol

If modifying contract types:
1. Update exports
2. Rebuild
3. Verify backend compiles
4. Verify frontend compiles
5. Update STATE.md if contract changed

No silent contract drift.

---

## 4. Vercel Build Warning

This package's exports are **not reliably resolved at Vercel build time**.
Frontend must not depend on `@findasale/shared` imports. If frontend needs
a type from this package, it should copy the type definition locally.

Evidence: Sessions 196–202 — seven consecutive Vercel build failures from
unresolved @findasale/shared imports.

---

Status: Type Authority Only
