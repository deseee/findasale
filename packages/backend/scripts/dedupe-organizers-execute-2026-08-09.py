#!/usr/bin/env python3
"""
dedupe-organizers-execute-2026-08-09.py

REAL EXECUTION script (production Railway Postgres DELETE + UPDATE). Merges
duplicate Organizer rows that share the same esnOrgId (EstateSales.NET's own
per-location company ID) -- the ONLY signal confirmed safe to auto-merge on,
per packages/backend/scripts/dedupe-duplicate-organizers-dryrun-2026-08-08.ts
(same-session predecessor; read in full before writing this file). Website
domain is explicitly NOT a merge key -- franchise networks (grasons.com,
theoccasionalwife.com, ultimatetreasuresstore.com) share one domain across
many distinct real businesses; merging on domain would combine unrelated
accounts into one and is a data-integrity incident, not a cleanup.

WHY PYTHON, NOT THE TYPESCRIPT/PRISMA CONVENTION: the VM's
packages/backend/node_modules/@prisma/client symlink returned "Input/output
error" this session (the same class of broken-node_modules-symlink issue
documented in CLAUDE.md's "TS check gate" section for `typescript`, now also
hitting `@prisma/client`). Confirmed by direct `ls` + `npx ts-node` attempts
before writing this file -- not assumed. This script talks to Postgres
directly via pg8000 (raw SQL), replicating the FK-relation map, survivor-
selection logic, and CLEAN/NEEDS_REASSIGN/MANUAL_REVIEW buckets from the
dry-run .ts script, with two additions the dry-run did not need (it only
read data): a business-name similarity gate per group, and transactional
per-group execution with catch-all rollback.

ONE CORRECTION vs the dry-run script's FK map, found and fixed this session:
the dry-run's USER_ACTIVITY_RELATIONS listed `{ model: 'review', fkField:
'authorId' }` -- Review has no `authorId` column (verified live: a --dry-run
test pass threw Postgres error 42703 "column authorId does not exist" on
first contact; confirmed against schema.prisma directly before fixing). The
correct column is Review.userId (nullable, onDelete SetNull). Fixed below.

TWO-PHASE DESIGN (network latency to the Railway proxy makes 33
one-row-at-a-time queries per group too slow at 3,759 groups -- confirmed by
timeout during initial testing):
  PHASE "plan"    -- batched, read-only. Processes groups in chunks; for each
                     chunk, issues ONE grouped-count query per FK relation
                     across ALL loser/survivor ids in that chunk (not one
                     query per group). Writes every decision to the audit
                     JSONL immediately, and writes approved merge plans to a
                     separate --plan-out JSONL for phase "execute" to consume.
                     No writes to the database in this phase.
  PHASE "execute" -- reads --plan-out, and for each approved group runs the
                     actual UPDATE (reassign FK rows to survivor) + DELETE
                     (loser Organizer, then loser User) inside a single
                     per-group transaction. Any exception rolls back that
                     group only and logs FAILED_DB_ERROR; processing
                     continues with the next group. Idempotent-ish: re-running
                     "execute" against a plan whose groups were already
                     merged will simply find 0 rows to update/delete and the
                     DELETE will affect 0 rows (not an error) -- but this
                     script is intended to be run once per plan file.

SAFETY LAYERS (in order, per esnOrgId group, all computed in phase "plan"):
  1. Name-similarity gate: normalize every business name in the group,
     compare pairwise (base name = text before a " - "/"–"/"—" separator,
     to tolerate "Selling Your Estate - Moorpark" vs "... - Ventura"). If any
     pair's similarity ratio falls below NAME_SIMILARITY_THRESHOLD, the group
     is excluded and logged to manual review -- esnOrgId is the merge key,
     never name-similarity, but incoherent names inside one esnOrgId group is
     a signal the id itself may be a scraper mis-assignment.
  2. Claim-authority gate: >1 row with claimStatus IN ('CLAIMED','INVITED')
     is ambiguous (two real accounts should not share one esnOrgId) -- excluded.
  3. Survivor selection: the single CLAIMED/INVITED row if exactly one exists
     (a real person may be attached to it, per Patrick's explicit approval);
     otherwise the row with the oldest createdAt.
  4. User-activity sweep: any loser's paired scraper-stub User account with
     real Purchase/Bid/Favorite/PointsTransaction/Review(userId) rows
     excludes the WHOLE GROUP (never auto-delete a User with real activity).
  5. FK sweep (28 relations into Organizer.id) + 1:1-relation conflict check
     (EbayConnection, EbayPolicyMapping, OrganizerHoldSettings,
     OrganizerScore, OrganizerWorkspace.ownerId are all @unique -- if BOTH
     survivor and a loser have a row, that's a genuine conflict, excluded).
  6. Reassignment before delete: every non-empty FK relation on a loser is
     UPDATEd to point at the survivor BEFORE the loser is deleted.
  7. Per-group transaction with catch-all rollback + continue.

Usage:
  # Phase 1 -- fast, read-only, produces audit log + merge plan:
  PYTHONPATH=/tmp/pylibs python3 dedupe-organizers-execute-2026-08-09.py plan \
    --database-url "$DATABASE_URL" \
    --audit-out organizer-dedupe-audit-2026-08-09.jsonl \
    --plan-out organizer-dedupe-plan-2026-08-09.jsonl

  # Phase 2 -- real writes, resumable/re-runnable against the same plan file:
  PYTHONPATH=/tmp/pylibs python3 dedupe-organizers-execute-2026-08-09.py execute \
    --database-url "$DATABASE_URL" \
    --audit-out organizer-dedupe-audit-2026-08-09.jsonl \
    --plan-out organizer-dedupe-plan-2026-08-09.jsonl \
    [--start-at N]   # resume from the Nth plan entry (0-indexed)
"""

import argparse
import difflib
import json
import re
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse

import pg8000.native as pg

NAME_SIMILARITY_THRESHOLD = 0.6
PROGRESS_EVERY = 200
CHUNK_SIZE = 800  # groups per batched FK-count query round in phase "plan"

ORGANIZER_FK_RELATIONS = [
    ("Sale", "organizerId", "RESTRICT", False),
    ("SaleHub", "organizerId", "RESTRICT", False),
    ("TreasureTrail", "organizerId", "RESTRICT", False),
    ("Review", "organizerId", "SETNULL", False),
    ("Testimonial", "organizerId", "SETNULL", False),
    ("OrganizerHours", "organizerId", "CASCADE", False),
    ("OrganizerBroadcast", "organizerId", "CASCADE", False),
    ("EbayConnection", "organizerId", "CASCADE", True),
    ("EbayPolicyMapping", "organizerId", "CASCADE", True),
    ("Conversation", "organizerId", "CASCADE", False),
    ("Follow", "organizerId", "CASCADE", False),
    ("ShopifyListing", "organizerId", "CASCADE", False),
    ("OrganizerHoldSettings", "organizerId", "CASCADE", True),
    ("SaleTemplate", "organizerId", "CASCADE", False),
    ("PriceOverrideLog", "organizerId", "CASCADE", False),
    ("SmartFollow", "organizerId", "CASCADE", False),
    ("WorkspaceMember", "organizerId", "CASCADE", False),
    ("SaleDonation", "organizerId", "CASCADE", False),
    ("POSSession", "organizerId", "CASCADE", False),
    ("POSPaymentLink", "organizerId", "CASCADE", False),
    ("WorkspaceChatMessage", "organizerId", "CASCADE", False),
    ("OrganizerScore", "organizerId", "CASCADE", True),
    ("MarkdownCycle", "organizerId", "CASCADE", False),
    ("DirectoryClaimEmail", "organizerId", "CASCADE", False),
    ("ClaimRequest", "organizerId", "CASCADE", False),
    ("ShopperOrganizerIntroduction", "organizerId", "CASCADE", False),
    ("OutreachAuditLog", "organizerId", "CASCADE", False),
    ("MessageAutosendLog", "organizerId", "CASCADE", False),
    ("OrganizerWorkspace", "ownerId", "CASCADE", True),
]

USER_ACTIVITY_RELATIONS = [
    ("Purchase", "userId"),
    ("Bid", "userId"),
    ("Favorite", "userId"),
    ("PointsTransaction", "userId"),
    ("Review", "userId"),  # CORRECTED vs dry-run script (see header) -- not authorId
]


def log(msg):
    print(f"[{datetime.now(timezone.utc).isoformat()}] {msg}", flush=True)


def normalize(name):
    n = (name or "").lower().strip()
    n = re.sub(r"[^\w\s]", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def base_name(name):
    raw = (name or "").strip()
    parts = re.split(r"\s+[-–—]\s+", raw)
    base = parts[0] if parts and parts[0] else raw
    b = normalize(base)
    return b if len(b) >= 3 else normalize(raw)


def group_name_mismatch(rows):
    bases = [(r["businessName"], base_name(r["businessName"])) for r in rows]
    for i in range(len(bases)):
        for j in range(i + 1, len(bases)):
            name_a, base_a = bases[i]
            name_b, base_b = bases[j]
            if base_a == base_b:
                continue
            ratio = difflib.SequenceMatcher(None, base_a, base_b).ratio()
            if ratio < NAME_SIMILARITY_THRESHOLD:
                return (
                    f"name mismatch: '{name_a}' vs '{name_b}' "
                    f"(base '{base_a}' vs '{base_b}', similarity {ratio:.2f} < {NAME_SIMILARITY_THRESHOLD})"
                )
    return None


def pick_survivor(rows):
    claimed = [r for r in rows if r["claimStatus"] in ("CLAIMED", "INVITED")]
    if len(claimed) > 1:
        return None, f"{len(claimed)} rows in group have claimStatus CLAIMED/INVITED — ambiguous authority"
    if len(claimed) == 1:
        return claimed[0], None
    survivor = min(rows, key=lambda r: r["createdAt"])
    return survivor, None


def parse_db_url(url):
    p = urlparse(url)
    return dict(user=p.username, password=p.password, host=p.hostname, port=p.port or 5432, database=p.path.lstrip("/"))


def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def phase_plan(conn, audit_f, plan_f, limit_groups=None):
    def write_audit(record):
        record["ts"] = datetime.now(timezone.utc).isoformat()
        audit_f.write(json.dumps(record, default=str) + "\n")
        audit_f.flush()

    log("Re-deriving esnOrgId duplicate groups fresh (live query)...")
    esn_ids = conn.run(
        'SELECT "esnOrgId" FROM "Organizer" WHERE "esnOrgId" IS NOT NULL '
        'GROUP BY "esnOrgId" HAVING count(*) > 1'
    )
    esn_ids = [row[0] for row in esn_ids]
    log(f"Found {len(esn_ids)} esnOrgId duplicate groups (live).")
    if limit_groups:
        esn_ids = esn_ids[:limit_groups]
        log(f"--limit-groups set: {len(esn_ids)} groups")

    cols = (
        'id, "userId", "businessName", "esnOrgId", "claimStatus", "isClaimed", '
        '"isUnmanagedListing", "sourceCount", "corroborationScore", "createdAt", website'
    )
    colnames = [
        "id", "userId", "businessName", "esnOrgId", "claimStatus", "isClaimed",
        "isUnmanagedListing", "sourceCount", "corroborationScore", "createdAt", "website",
    ]
    all_rows = []
    for id_chunk in chunked(esn_ids, 2000):
        r = conn.run(f'SELECT {cols} FROM "Organizer" WHERE "esnOrgId" = ANY(:ids)', ids=id_chunk)
        all_rows.extend(r)
    groups = {}
    for r in all_rows:
        d = dict(zip(colnames, r))
        groups.setdefault(d["esnOrgId"], []).append(d)
    log(f"Fetched {len(all_rows)} Organizer rows across {len(groups)} groups.")

    counts = {
        "total_groups": len(groups), "excluded_name_mismatch": 0, "excluded_claim_conflict": 0,
        "excluded_user_activity": 0, "excluded_1to1_conflict": 0, "plan_candidates": 0,
        "plan_loser_rows": 0,
    }

    # ── Early gates (no DB calls): name-mismatch + claim-conflict, per group ──
    candidates = []  # list of (esn_org_id, survivor, losers)
    for esn_org_id, rows in groups.items():
        mismatch_reason = group_name_mismatch(rows)
        if mismatch_reason:
            counts["excluded_name_mismatch"] += 1
            write_audit({
                "esnOrgId": esn_org_id, "status": "EXCLUDED_NAME_MISMATCH", "reason": mismatch_reason,
                "rows": [{"id": r["id"], "businessName": r["businessName"]} for r in rows],
            })
            continue
        survivor, conflict_reason = pick_survivor(rows)
        if conflict_reason:
            counts["excluded_claim_conflict"] += 1
            write_audit({
                "esnOrgId": esn_org_id, "status": "EXCLUDED_CLAIM_CONFLICT", "reason": conflict_reason,
                "rows": [{"id": r["id"], "businessName": r["businessName"], "claimStatus": r["claimStatus"]} for r in rows],
            })
            continue
        losers = [r for r in rows if r["id"] != survivor["id"]]
        candidates.append((esn_org_id, survivor, losers))

    log(f"{len(candidates)} groups passed name+claim gates, entering batched FK sweep "
        f"({len(candidates) // CHUNK_SIZE + 1} chunks of ≤{CHUNK_SIZE})...")

    processed = 0
    for chunk in chunked(candidates, CHUNK_SIZE):
        loser_user_ids = []
        loser_ids = []
        survivor_ids = []
        for esn_org_id, survivor, losers in chunk:
            loser_user_ids.extend([l["userId"] for l in losers])
            loser_ids.extend([l["id"] for l in losers])
            survivor_ids.append(survivor["id"])

        # Batched user-activity counts: {table: {user_id: count}}
        user_activity_counts = {}
        for table, fk in USER_ACTIVITY_RELATIONS:
            rowsx = conn.run(
                f'SELECT "{fk}", count(*) FROM "{table}" WHERE "{fk}" = ANY(:ids) GROUP BY "{fk}"',
                ids=loser_user_ids,
            )
            user_activity_counts[table] = {row[0]: row[1] for row in rowsx}

        # Batched org-FK counts on losers: {table: {org_id: count}}
        fk_counts = {}
        for table, fk, on_delete, is_unique in ORGANIZER_FK_RELATIONS:
            rowsx = conn.run(
                f'SELECT "{fk}", count(*) FROM "{table}" WHERE "{fk}" = ANY(:ids) GROUP BY "{fk}"',
                ids=loser_ids,
            )
            fk_counts[table] = {row[0]: row[1] for row in rowsx}

        # Batched survivor counts for the 5 unique relations only: {table: {org_id: count}}
        survivor_unique_counts = {}
        for table, fk, on_delete, is_unique in ORGANIZER_FK_RELATIONS:
            if not is_unique:
                continue
            rowsx = conn.run(
                f'SELECT "{fk}", count(*) FROM "{table}" WHERE "{fk}" = ANY(:ids) GROUP BY "{fk}"',
                ids=survivor_ids,
            )
            survivor_unique_counts[table] = {row[0]: row[1] for row in rowsx}

        for esn_org_id, survivor, losers in chunk:
            processed += 1
            loser_ids_g = [l["id"] for l in losers]
            loser_user_ids_g = [l["userId"] for l in losers]

            hit_table = None
            for table in user_activity_counts:
                if any(uid in user_activity_counts[table] for uid in loser_user_ids_g):
                    hit_table = table
                    break
            if hit_table:
                counts["excluded_user_activity"] += 1
                write_audit({
                    "esnOrgId": esn_org_id, "status": "EXCLUDED_USER_ACTIVITY",
                    "reason": f"loser's paired User has real activity in {hit_table}",
                    "survivorId": survivor["id"], "loserIds": loser_ids_g,
                })
                if processed % PROGRESS_EVERY == 0:
                    log(f"plan progress {processed}/{len(candidates)} — {json.dumps(counts)}")
                continue

            conflict_1to1 = None
            plan_reassign = {}  # loser_id -> [table.fk, ...]
            for table, fk, on_delete, is_unique in ORGANIZER_FK_RELATIONS:
                table_counts = fk_counts.get(table, {})
                relevant = {lid: table_counts[lid] for lid in loser_ids_g if lid in table_counts and table_counts[lid] > 0}
                if not relevant:
                    continue
                if is_unique:
                    surv_c = survivor_unique_counts.get(table, {}).get(survivor["id"], 0)
                    if surv_c > 0:
                        conflict_1to1 = f"{table}.{fk}: both survivor and a loser have a row (unique-per-organizer)"
                        break
                for lid in relevant:
                    plan_reassign.setdefault(lid, []).append(f"{table}.{fk}")

            if conflict_1to1:
                counts["excluded_1to1_conflict"] += 1
                write_audit({
                    "esnOrgId": esn_org_id, "status": "EXCLUDED_1TO1_CONFLICT", "reason": conflict_1to1,
                    "survivorId": survivor["id"], "loserIds": loser_ids_g,
                })
                if processed % PROGRESS_EVERY == 0:
                    log(f"plan progress {processed}/{len(candidates)} — {json.dumps(counts)}")
                continue

            counts["plan_candidates"] += 1
            counts["plan_loser_rows"] += len(losers)
            plan_f.write(json.dumps({
                "esnOrgId": esn_org_id,
                "survivorId": survivor["id"],
                "survivorBusinessName": survivor["businessName"],
                "losers": [{"id": l["id"], "userId": l["userId"], "businessName": l["businessName"]} for l in losers],
                "reassign": plan_reassign,
            }, default=str) + "\n")

            if processed % PROGRESS_EVERY == 0:
                log(f"plan progress {processed}/{len(candidates)} — {json.dumps(counts)}")

    plan_f.flush()
    log(f"PLAN PHASE DONE. {json.dumps(counts, indent=2)}")


def phase_execute(conn, audit_f, plan_path, start_at=0, max_count=None):
    def write_audit(record):
        record["ts"] = datetime.now(timezone.utc).isoformat()
        audit_f.write(json.dumps(record, default=str) + "\n")
        audit_f.flush()

    with open(plan_path, encoding="utf-8") as f:
        plan_entries = [json.loads(line) for line in f if line.strip()]
    log(f"Loaded {len(plan_entries)} approved groups from plan file. Starting at index {start_at}.")

    counts = {"merged": 0, "failed": 0, "loser_rows_removed": 0}
    end_at = len(plan_entries) if max_count is None else min(len(plan_entries), start_at + max_count)
    for idx in range(start_at, end_at):
        entry = plan_entries[idx]
        esn_org_id = entry["esnOrgId"]
        survivor_id = entry["survivorId"]
        losers = entry["losers"]
        reassign = entry["reassign"]
        try:
            conn.run("BEGIN")
            reassign_summary = {}
            # Invert {loser_id: [table.fk,...]} -> {table.fk: [loser_ids]} so each
            # (table, fk) pair needs only ONE batched UPDATE per group, not one per
            # loser -- cuts round-trips substantially for groups with many losers.
            inverted = {}
            for loser in losers:
                for table_fk in reassign.get(loser["id"], []):
                    inverted.setdefault(table_fk, []).append(loser["id"])
            for table_fk, lids in inverted.items():
                table, fk = table_fk.split(".")
                conn.run(f'UPDATE "{table}" SET "{fk}" = :sid WHERE "{fk}" = ANY(:lids)', sid=survivor_id, lids=lids)
                reassign_summary[table_fk] = len(lids)
            loser_ids_all = [l["id"] for l in losers]
            loser_user_ids_all = [l["userId"] for l in losers]
            conn.run('DELETE FROM "Organizer" WHERE id = ANY(:ids)', ids=loser_ids_all)
            conn.run('DELETE FROM "User" WHERE id = ANY(:ids)', ids=loser_user_ids_all)
            conn.run("COMMIT")

            counts["merged"] += 1
            counts["loser_rows_removed"] += len(losers)
            write_audit({
                "esnOrgId": esn_org_id, "status": "MERGED", "survivorId": survivor_id,
                "survivorBusinessName": entry["survivorBusinessName"],
                "loserIds": [l["id"] for l in losers],
                "loserBusinessNames": [l["businessName"] for l in losers],
                "reassignments": reassign_summary,
            })
        except Exception as e:
            try:
                conn.run("ROLLBACK")
            except Exception:
                pass
            counts["failed"] += 1
            write_audit({
                "esnOrgId": esn_org_id, "status": "FAILED_DB_ERROR", "survivorId": survivor_id,
                "loserIds": [l["id"] for l in losers], "error": str(e),
            })
            log(f"GROUP FAILED esnOrgId={esn_org_id} (plan idx {idx}): {e} — rolled back, continuing")

        if (idx + 1) % PROGRESS_EVERY == 0:
            log(f"execute progress {idx + 1}/{len(plan_entries)} — {json.dumps(counts)}")

    log(f"EXECUTE PHASE BATCH DONE (idx {start_at}..{end_at-1} of {len(plan_entries)}). {json.dumps(counts, indent=2)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("phase", choices=["plan", "execute"])
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--audit-out", required=True)
    ap.add_argument("--plan-out", required=True)
    ap.add_argument("--limit-groups", type=int, default=None)
    ap.add_argument("--start-at", type=int, default=0)
    ap.add_argument("--max-count", type=int, default=None)
    args = ap.parse_args()

    conn = pg.Connection(**parse_db_url(args.database_url))
    audit_f = open(args.audit_out, "a", encoding="utf-8")

    if args.phase == "plan":
        plan_f = open(args.plan_out, "w", encoding="utf-8")
        phase_plan(conn, audit_f, plan_f, limit_groups=args.limit_groups)
        plan_f.close()
    else:
        phase_execute(conn, audit_f, args.plan_out, start_at=args.start_at, max_count=args.max_count)

    audit_f.close()
    conn.close()


if __name__ == "__main__":
    main()
