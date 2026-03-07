# Pre-Commit Validation

## What's installed

`.githooks/pre-commit` — runs automatically on every `git commit`.

Git hooks path is set to `.githooks/` (configured via `git config core.hooksPath .githooks`).
Both `pre-push` (TypeScript check) and `pre-commit` (secret guard) are now active.

## Pre-commit checks

| Check | Behavior |
|-------|----------|
| `.env` files staged | **Blocks** commit — removes from staging, do `git restore --staged <file>` |
| Stripe live keys in staged code | **Blocks** commit |
| Unguarded `console.log` in backend routes/controllers | **Warns** only, does not block |

## Pre-push checks (existing)

TypeScript compile check across all packages — blocks push on type errors.

## Running the stress test manually

```
node scripts/stress-test.js
```

Checks: schema drift, migration completeness, route registration, env secrets, docs freshness, component presence, security patterns.
Expected output: 43 checks, all green.

## When to run stress test

- Before any production deploy (health-scout skill triggers it)
- After a large feature sprint
- When STATE.md or context.md feels stale

## Adding new checks

Edit `scripts/stress-test.js` — add a `check('label', () => ...)` call.
Return `true` for pass, a string for failure detail.
