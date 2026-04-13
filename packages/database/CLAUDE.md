# Database – Schema Authority

Scope: packages/database

Project contract: root CLAUDE.md
Stack authority: STACK.md

If conflict exists between this file and root CLAUDE.md,
root prevails.

This file must not redefine architecture or behavior.

---

## 1. Responsibility

Owns:
- Prisma schema
- Migrations
- Seed data

---

## 2. Migration Discipline

- Never edit applied migrations
- Create new migration for changes
- Validate migration locally before commit

---

## 3. Boundaries

No business logic.
No API logic.
No UI logic.

---

Status: Schema Authority
