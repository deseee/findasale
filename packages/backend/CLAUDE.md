# Backend – API & Business Authority

Scope: packages/backend

Behavior rules: CORE.md  
Project contract: root CLAUDE.md  
Stack authority: STACK.md  

If conflict exists between this file and root CLAUDE.md,
root prevails.

This file must not redefine architecture or behavior.

---

## 1. Responsibility

Owns:
- Business logic
- API routes
- Authentication
- Stripe integration
- Background jobs

Not owned here:
- Schema structure (database package)
- UI logic (frontend)

---

## 2. API Contract

Backend defines:
- Response shape
- Error format
- Validation rules

Shared package may export related types.

---

## 3. Boundaries

No schema editing.
No frontend logic.
No duplication of shared types.

---

Status: API Authority