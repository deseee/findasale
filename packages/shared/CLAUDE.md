# Shared – Cross-Boundary Contracts

Scope: packages/shared

Behavior rules: CORE.md  
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

Status: Type Authority Only