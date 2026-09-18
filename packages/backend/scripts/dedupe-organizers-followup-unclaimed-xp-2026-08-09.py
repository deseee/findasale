#!/usr/bin/env python3
"""
dedupe-organizers-followup-unclaimed-xp-2026-08-09.py

FOLLOW-UP execution script (production Railway Postgres DELETE + UPDATE).
Re-evaluates the 1,407 esnOrgId duplicate groups that were excluded from the
2026-08-09 main dedupe run (packages/backend/scripts/dedupe-organizers-execute-2026-08-09.py,
report: claude_docs/architecture/organizer-dedupe-audit-2026-08-09.md) solely
because a loser's paired scraper-stub User account had a non-zero
PointsTransaction row count.

RULE CHANGE (Patrick, verbatim, this session): "the xp doesn't count if they
are unclaimed" -- i.e. PointsTransaction activity on an UNCLAIMED organizer's
paired stub User must NOT block a merge. Confirmed root cause via sampling
(see followup report): those PointsTransaction rows are the ANNIVERSARY_30DAY
XP-cron-bug grants documented in claude_docs/architecture/db-space-accounting-
2026-08-09.md Sec4 -- a cron job grants "30-day anniversary" gamification XP to
scraper+...@system.finda.sale accounts that never log in.

NARROW SCOPE OF THE RULE CHANGE (everything else from the original run is
unchanged):
  - Name-similarity gate (0.6 threshold, whole-group exclusion on any low
    pair) -- IDENTICAL to the original script, re-run live on current data.
  - Claim-authority gate (>1 CLAIMED/INVITED row in a group excludes it) --
    IDENTICAL.
  - Survivor selection (single CLAIMED/INVITED row, else oldest createdAt) --
    IDENTICAL.
  - HARD_BLOCK_USER_ACTIVITY_RELATIONS (Purchase, Bid, Favorite, Review via
    userId) -- these STILL unconditionally block the whole group regardless
    of claimStatus. Only PointsTransaction is exempted, and only
    conditionally (see below). These activity types mean a real person may
    have interacted with the account regardless of claimStatus, and must
    never be auto-merged away.
  - PointsTransaction exemption is PER-LOSER, not per-group: a loser's
    PointsTransaction activity no longer blocks the merge ONLY IF that
    specific loser Organizer row's claimStatus == 'UNCLAIMED'. If ANY loser
    in the group has PointsTransaction activity AND claimStatus IN
    ('CLAIMED','INVITED') (i.e. not UNCLAIMED), the WHOLE GROUP stays
    excluded -- Patrick's rule was specifically about unclaimed accounts.
  - FK sweep (28 relations into Organizer.id), 1:1-unique-relation conflict
    check, reassign-before-delete, per-group transaction with catch-all
    rollback+continue, resumable batches with progress logging -- ALL
    IDENTICAL to the original script's methodology (same
    ORGANIZER_FK_RELATIONS list, same CHUNK_SIZE batching approach).

SCOPE SOURCE: --scope-file is a JSON list of esnOrgId ints, sourced from the
original audit JSONL's EXCLUDED_USER_ACTIVITY entries (1,407 groups). Per
Evidence-First discipline, this script does NOT trust the original run's
cached survivor/loser assignment -- it re-derives each group's current
Organizer rows LIVE from the database (some scraper activity could have
touched these rows same-day) before applying any gate.

Usage:
  # Phase 1 -- fast, read-only, produces audit log + merge plan:
  PYTHONPATH=/tmp/pylibs python3 dedupe-organizers-followup-unclaimed-xp-2026-08-09.py plan \
    --database-url "$DATABASE_URL" \
    --scope-file organizer-dedupe-followup-scope-2026-08-09.json \
    --audit-out organizer-dedupe-followup-unclaimed-xp-2026-08-09.jsonl \
    --plan-out organizer-dedupe-followup-plan-2026-08-09.jsonl

  # Phase 2 -- real writes, resumable/re-runnable against the same plan file:
  PYTHONPATH=/tmp/pylibs python3 dedupe-organizers-followup-unclaimed-xp-2026-08-09.py execute \
    --database-url "$DATABASE_URL" \
    --audit-out organizer-dedupe-followup-unclaimed-xp-2026-08-09.jsonl \
    --plan-out organizer-dedupe-followup-plan-2026-08-09.jsonl \
    [--start-at N] [--max-count N]
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
PROGRESS_EVERY = 100
CHUNK_SIZE = 300  # groups per batched FK-count query round in phase "plan"

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

# Always block the whole group, regardless of claimStatus.
HARD_BLOCK_USER_ACTIVITY_RELATIONS = [
    ("Purchase", "userId"),
    ("Bid", "userId"),
    ("Favorite", "userId"),
    ("Review", "userId"),
]

# Conditionally exempted: only blocks if the specific loser's claimStatus != UNCLAIMED.
PT_RELATION = ("PointsTransaction", "userId")


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
        return None, f"{len(claimed)} rows in group have claimStatus CLAIMED/INVITED -- ambiguous authority"
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


def phase_plan(conn, audit_f, plan_f, scope_esn_ids):
    def write_audit(record):
        record["ts"] = datetime.now(timezone.utc).isoformat()
        audit_f.write(json.dumps(record, default=str) + "\n")
        audit_f.flush()

    log(f"Scope: {len(scope_esn_ids)} esnOrgIds from original EXCLUDED_USER_ACTIVITY bucket.")
    log("Re-deriving current Organizer rows for scope LIVE (not trusting cached original-run assignment)...")

    cols = (
        'id, "userId", "businessName", "esnOrgId", "claimStatus", "isClaimed", '
        '"isUnmanagedListing", "sourceCount", "corroborationScore", "createdAt", website'
    )
    colnames = [
        "id", "userId", "businessName", "esnOrgId", "claimStatus", "isClaimed",
        "isUnmanagedListing", "sourceCount", "corroborationScore", "createdAt", "website",
    ]
    all_rows = []
    for id_chunk in chunked(scope_esn_ids, 1500):
        r = conn.run(f'SELECT {cols} FROM "Organizer" WHERE "esnOrgId" = ANY(:ids)', ids=id_chunk)
        all_rows.extend(r)
    groups = {}
    for r in all_rows:
        d = dict(zip(colnames, r))
        groups.setdefault(d["esnOrgId"], []).append(d)
    log(f"Fetched {len(all_rows)} live Organizer rows across {len(groups)} groups (of {len(scope_esn_ids)} scoped esnOrgIds).")

    missing_scope = [e for e in scope_esn_ids if e not in groups]
    if missing_scope:
        for e in missing_scope:
            write_audit({"esnOrgId": e, "status": "SKIPPED_NO_LONGER_PRESENT",
                         "reason": "esnOrgId has zero Organizer rows live (unexpected -- logged for review)"})
        log(f"{len(missing_scope)} scoped esnOrgIds had zero live rows -- logged SKIPPED_NO_LONGER_PRESENT.")

    counts = {
        "total_scope": len(scope_esn_ids),
        "already_resolved": 0,
        "excluded_name_mismatch": 0,
        "excluded_claim_conflict": 0,
        "excluded_hard_activity": 0,
        "excluded_claimed_with_xp": 0,
        "excluded_1to1_conflict": 0,
        "plan_candidates": 0,
        "plan_loser_rows": 0,
    }

    candidates = []  # list of (esn_org_id, survivor, losers)
    for esn_org_id, rows in groups.items():
        if len(rows) < 2:
            counts["already_resolved"] += 1
            write_audit({
                "esnOrgId": esn_org_id, "status": "ALREADY_RESOLVED",
                "reason": f"only {len(rows)} live Organizer row(s) for this esnOrgId now -- no longer a duplicate group",
                "rows": [{"id": r["id"], "businessName": r["businessName"]} for r in rows],
            })
            continue
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

    log(f"{len(candidates)} groups passed name+claim gates, entering batched activity+FK sweep "
        f"({len(candidates) // CHUNK_SIZE + 1} chunks of <={CHUNK_SIZE})...")

    processed = 0
    for chunk in chunked(candidates, CHUNK_SIZE):
        loser_user_ids = []
        loser_ids = []
        survivor_ids = []
        for esn_org_id, survivor, losers in chunk:
            loser_user_ids.extend([l["userId"] for l in losers])
            loser_ids.extend([l["id"] for l in losers])
            survivor_ids.append(survivor["id"])

        # Hard-block activity counts (Purchase/Bid/Favorite/Review): {table: {user_id: count}}
        hard_block_counts = {}
        for table, fk in HARD_BLOCK_USER_ACTIVITY_RELATIONS:
            rowsx = conn.run(
                f'SELECT "{fk}", count(*) FROM "{table}" WHERE "{fk}" = ANY(:ids) GROUP BY "{fk}"',
                ids=loser_user_ids,
            )
            hard_block_counts[table] = {row[0]: row[1] for row in rowsx}

        # PointsTransaction counts (conditionally exempt): {user_id: count}
        pt_table, pt_fk = PT_RELATION
        pt_rows = conn.run(
            f'SELECT "{pt_fk}", count(*) FROM "{pt_table}" WHERE "{pt_fk}" = ANY(:ids) GROUP BY "{pt_fk}"',
            ids=loser_user_ids,
        )
        pt_counts = {row[0]: row[1] for row in pt_rows}

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

            hard_hit_table = None
            for table in hard_block_counts:
                if any(uid in hard_block_counts[table] for uid in loser_user_ids_g):
                    hard_hit_table = table
                    break
            if hard_hit_table:
                counts["excluded_hard_activity"] += 1
                write_audit({
                    "esnOrgId": esn_org_id, "status": "EXCLUDED_HARD_ACTIVITY",
                    "reason": f"loser's paired User has real activity in {hard_hit_table} -- never exempted regardless of claimStatus",
                    "survivorId": survivor["id"], "loserIds": loser_ids_g,
                })
                if processed % PROGRESS_EVERY == 0:
                    log(f"plan progress {processed}/{len(candidates)} -- {json.dumps(counts)}")
                continue

            # Per-loser PointsTransaction + claimStatus check.
            pt_losers_with_activity = [l for l in losers if pt_counts.get(l["userId"], 0) > 0]
            non_unclaimed_with_pt = [l for l in pt_losers_with_activity if l["claimStatus"] != "UNCLAIMED"]
            if non_unclaimed_with_pt:
                counts["excluded_claimed_with_xp"] += 1
                write_audit({
                    "esnOrgId": esn_org_id, "status": "EXCLUDED_CLAIMED_WITH_XP",
                    "reason": "loser has PointsTransaction activity but claimStatus is not UNCLAIMED -- exemption does not apply",
                    "survivorId": survivor["id"], "loserIds": loser_ids_g,
                    "nonUnclaimedLosers": [{"id": l["id"], "claimStatus": l["claimStatus"], "businessName": l["businessName"]} for l in non_unclaimed_with_pt],
                })
                if processed % PROGRESS_EVERY == 0:
                    log(f"plan progress {processed}/{len(candidates)} -- {json.dumps(counts)}")
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
                    log(f"plan progress {processed}/{len(candidates)} -- {json.dumps(counts)}")
                continue

            counts["plan_candidates"] += 1
            counts["plan_loser_rows"] += len(losers)
            plan_f.write(json.dumps({
                "esnOrgId": esn_org_id,
                "survivorId": survivor["id"],
                "survivorBusinessName": survivor["businessName"],
                "losers": [{"id": l["id"], "userId": l["userId"], "businessName": l["businessName"],
                            "claimStatus": l["claimStatus"], "hadPointsTransactionExemption": l["userId"] in pt_counts}
                           for l in losers],
                "reassign": plan_reassign,
            }, default=str) + "\n")

            if processed % PROGRESS_EVERY == 0:
                log(f"plan progress {processed}/{len(candidates)} -- {json.dumps(counts)}")

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
            log(f"GROUP FAILED esnOrgId={esn_org_id} (plan idx {idx}): {e} -- rolled back, continuing")

        if (idx + 1) % PROGRESS_EVERY == 0:
            log(f"execute progress {idx + 1}/{len(plan_entries)} -- {json.dumps(counts)}")

    log(f"EXECUTE PHASE BATCH DONE (idx {start_at}..{end_at-1} of {len(plan_entries)}). {json.dumps(counts, indent=2)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("phase", choices=["plan", "execute"])
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--audit-out", required=True)
    ap.add_argument("--plan-out", required=True)
    ap.add_argument("--scope-file", default=None, help="JSON list of esnOrgId ints (required for plan phase)")
    ap.add_argument("--start-at", type=int, default=0)
    ap.add_argument("--max-count", type=int, default=None)
    args = ap.parse_args()

    conn = pg.Connection(**parse_db_url(args.database_url))
    audit_f = open(args.audit_out, "a", encoding="utf-8")

    if args.phase == "plan":
        if not args.scope_file:
            print("--scope-file is required for phase 'plan'", file=sys.stderr)
            sys.exit(1)
        with open(args.scope_file, encoding="utf-8") as f:
            scope_esn_ids = json.load(f)
        plan_f = open(args.plan_out, "w", encoding="utf-8")
        phase_plan(conn, audit_f, plan_f, scope_esn_ids)
        plan_f.close()
    else:
        phase_execute(conn, audit_f, args.plan_out, start_at=args.start_at, max_count=args.max_count)

    audit_f.close()
    conn.close()


if __name__ == "__main__":
    main()
