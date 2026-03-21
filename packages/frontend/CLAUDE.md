# Frontend – UI & Presentation Layer

Scope: packages/frontend

Project contract: root CLAUDE.md
Stack authority: STACK.md

If conflict exists between this file and root CLAUDE.md,
root prevails.

This file must not redefine architecture or behavior.

---

## 1. Responsibility

Owns:
- UI components
- Routing
- Client state
- API consumption

Not owned here:
- Business logic
- Schema authority

---

## 2. Data Rules

Consume backend contract exactly.
Do not reshape API responses silently.
Use shared types when available.

---

## 3. Boundaries

No direct database access.
No business rule duplication.

---

## 4. Import Ban

**Never import from `@findasale/shared`** — always causes Vercel build failure.
Use local type definitions instead. If a shared type is needed, copy it into
a local types file within packages/frontend.

Evidence: Sessions 196–202 — seven consecutive Vercel build failures caused
by @findasale/shared imports that fail resolution at Vercel build time.

---

Status: Presentation Authority
