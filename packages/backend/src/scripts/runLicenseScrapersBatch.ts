/**
 * runLicenseScrapersBatch.ts
 *
 * Consolidated batch runner for all state license / registry "Phase 2" scrapers.
 *
 * Purpose: replace ~51 individual GitHub Actions workflows (each paying its own
 * pnpm-install + prisma-generate setup and rounding up to a billed minute) with a
 * single workflow that runs every scraper sequentially inside one job.
 *
 * Behavior:
 *  - Runs each scraper sequentially, each wrapped in its own try/catch so a single
 *    failure cannot abort the rest of the batch.
 *  - Collects per-scraper { name, status, items, error, ms }.
 *  - Prints a readable pass/fail/items table to stdout.
 *  - If GITHUB_STEP_SUMMARY is set, appends the same table as markdown to that file.
 *  - Emits a GitHub Actions ::warning:: annotation per failed scraper and per
 *    silent-zero scraper, so partial failures stay visible even on a green run.
 *  - Prints a one-line machine-readable summary.
 *  - Exits non-zero only when the FAILURE RATE crosses MAX_FAILURE_RATE.
 *
 * EXIT-CODE CONTRACT (changed 2026-08-16, roadmap #558 -- read before "fixing" this):
 *   This runner used to `process.exit(failed > 0 ? 1 : 0)`. Across 51 independent
 *   third-party government/open-data sites, at least one site being down, rate-
 *   limited or reshaped on any given Monday is the NORMAL case, not an incident --
 *   so all-or-nothing made a green run structurally unachievable. Evidence: 8
 *   attempted runs, 0 green, while run #7 (2026-08-02) passed 48/51 and run #8
 *   (2026-08-10) passed 49/51. A red X that is red every single week carries no
 *   information and trained everyone to ignore it (the 2026-07-06..2026-08-03
 *   failures went un-triaged for a month for exactly this reason).
 *
 *   The signal is now: per-scraper attribution ALWAYS reported, and a non-zero exit
 *   ONLY for a systemic break. Individual failures do not red the run -- they are
 *   annotated, tabulated, and named.
 *
 * This file is generated/maintained to mirror the function set of the per-state
 * Phase 2 workflows. Do NOT remove a scraper here without removing its source.
 */

import fs from "fs";

import {
  resetScrapedOrganizerWriteCount,
  getScrapedOrganizerWriteCount
} from "../services/scraper/index";

import { runAlabamaPhase2Scraper } from "../services/scraper/sources/alabamaPhase2Scraper";
import { runAlaskaPhase2Scraper } from "../services/scraper/sources/alaskaPhase2Scraper";
import { runArizonaPhase2Scraper } from "../services/scraper/sources/arizonaPhase2Scraper";
import { runArkansasPhase2Scraper } from "../services/scraper/sources/arkansasPhase2Scraper";
import { runCaliforniaPhase2Scraper } from "../services/scraper/sources/californiaPhase2Scraper";
import { runColoradoPhase2Scraper } from "../services/scraper/sources/coloradoPhase2Scraper";
import { runConnecticutPhase2Scraper } from "../services/scraper/sources/connecticutPhase2Scraper";
import { runDelawarePhase2Scraper } from "../services/scraper/sources/delawarePhase2Scraper";
import { runFloridaPhase2Scraper } from "../services/scraper/sources/floridaPhase2Scraper";
import { runGeorgiaPhase2Scraper } from "../services/scraper/sources/georgiaPhase2Scraper";
import { runHawaiiPhase2Scraper } from "../services/scraper/sources/hawaiiPhase2Scraper";
import { runIdahoPhase2Scraper } from "../services/scraper/sources/idahoPhase2Scraper";
import { runIllinoisPhase2Scraper } from "../services/scraper/sources/illinoisPhase2Scraper";
import { runIndianaPhase2Scraper } from "../services/scraper/sources/indianaPhase2Scraper";
import { runIowaPhase2Scraper } from "../services/scraper/sources/iowaPhase2Scraper";
import { runKansasPhase2Scraper } from "../services/scraper/sources/kansasPhase2Scraper";
import { runKentuckyPhase2Scraper } from "../services/scraper/sources/kentuckyPhase2Scraper";
import { runLouisianaPhase2Scraper } from "../services/scraper/sources/louisianaPhase2Scraper";
import { runMainePhase2Scraper } from "../services/scraper/sources/mainePhase2Scraper";
import { runMarylandPhase2Scraper } from "../services/scraper/sources/marylandPhase2Scraper";
import { runMassachusettsPhase2Scraper } from "../services/scraper/sources/massachusettsPhase2Scraper";
import { runMichiganPhase2Scraper } from "../services/scraper/sources/michiganPhase2Scraper";
import { runMinnesotaPhase2Scraper } from "../services/scraper/sources/minnesotaPhase2Scraper";
import { runMississippiPhase2Scraper } from "../services/scraper/sources/mississippiPhase2Scraper";
import { runMissouriPhase2Scraper } from "../services/scraper/sources/missouriPhase2Scraper";
import { runMontanaPhase2Scraper } from "../services/scraper/sources/montanaPhase2Scraper";
import { runNebraskaPhase2Scraper } from "../services/scraper/sources/nebraskaPhase2Scraper";
import { runNevadaPhase2Scraper } from "../services/scraper/sources/nevadaPhase2Scraper";
import { runNewHampshirePhase2Scraper } from "../services/scraper/sources/newHampshirePhase2Scraper";
import { runNewJerseyPhase2Scraper } from "../services/scraper/sources/newjerseyPhase2Scraper";
import { runNewMexicoPhase2Scraper } from "../services/scraper/sources/newmexicoPhase2Scraper";
import { runNewYorkPhase2Scraper } from "../services/scraper/sources/newyorkPhase2Scraper";
import { runNorthCarolinaPhase2Scraper } from "../services/scraper/sources/northCarolinaPhase2Scraper";
import { runNorthDakotaPhase2Scraper } from "../services/scraper/sources/northDakotaPhase2Scraper";
import { runOhioPhase2Scraper } from "../services/scraper/sources/ohioPhase2Scraper";
import { runOklahomaphase2Scraper } from "../services/scraper/sources/oklahomaphase2Scraper";
import { runOregonPhase2Scraper } from "../services/scraper/sources/oregonPhase2Scraper";
import { runPennsylvaniaPhase2Scraper } from "../services/scraper/sources/pennsylvaniaPhase2Scraper";
import { runRhodeIslandPhase2Scraper } from "../services/scraper/sources/rhodeislandPhase2Scraper";
import { runSouthCarolinaPhase2Scraper } from "../services/scraper/sources/southCarolinaPhase2Scraper";
import { runSouthDakotaPhase2Scraper } from "../services/scraper/sources/southDakotaPhase2Scraper";
import { runTennesseePhase2Scraper } from "../services/scraper/sources/tennesseePhase2Scraper";
import { runTexasPhase2Scraper } from "../services/scraper/sources/texasPhase2Scraper";
import { runUtahPhase2Scraper } from "../services/scraper/sources/utahPhase2Scraper";
import { runVermontPhase2Scraper } from "../services/scraper/sources/vermontPhase2Scraper";
import { runVirginiaGeneralPhase2Scraper } from "../services/scraper/sources/virginiaGeneralPhase2Scraper";
import { runVirginiaPhase2Scraper } from "../services/scraper/sources/virginiaPhase2Scraper";
import { runWashingtonPhase2Scraper } from "../services/scraper/sources/washingtonPhase2Scraper";
import { runWestVirginiaPhase2Scraper } from "../services/scraper/sources/westVirginiaPhase2Scraper";
import { runWisconsinPhase2Scraper } from "../services/scraper/sources/wisconsinPhase2Scraper";
import { runWyomingPhase2Scraper } from "../services/scraper/sources/wyomingPhase2Scraper";

// Most scrapers return Promise<void>; a few (e.g. Wyoming) return a stats object.
// The runner ignores the resolved value, so accept any awaitable return type.
type ScraperFn = () => Promise<unknown>;

interface ScraperEntry {
  name: string;
  fn: ScraperFn;
}

interface ScraperResult {
  name: string;
  status: "ok" | "fail";
  /** Organizer records written by this scraper (see scraper/index.ts write counter). */
  items: number;
  error?: string;
  ms: number;
}

/**
 * Failure-rate ceiling. The batch exits non-zero only when the share of failed
 * scrapers EXCEEDS this fraction.
 *
 * Why 20%:
 *   - Observed steady-state failure across the two runs with real per-scraper
 *     data is 2-3 of 51 (3.9% on run #8, 5.9% on run #7) -- independent,
 *     transient, third-party-site outages that we cannot fix and should not be
 *     paged for every week.
 *   - 20% of 51 is >10 scrapers failing at once. That is ~3-5x the observed
 *     baseline, which no plausible combination of unrelated site outages
 *     reaches, but which EVERY systemic break trips instantly: a bad/expired
 *     DATABASE_URL, a Prisma client/schema mismatch, a regression in the shared
 *     upsert helper, or blocked network egress all fail most or all 51 at once.
 *   - So: independent breakage stays green-with-annotations; correlated
 *     breakage goes red. That is the distinction the exit code should encode.
 * Tune this if the observed baseline moves; do not replace it with `failed > 0`.
 */
const MAX_FAILURE_RATE = 0.20;

/**
 * GitHub Actions renders at most 10 annotations PER LEVEL PER STEP. Anything the job
 * emits beyond that is accepted by the runner and then silently dropped from the run's
 * Annotations panel and the check-runs API.
 *
 * VERIFIED 2026-08-17 against the real run (roadmap #558 post-ship verification): run #9
 * (id 31998258067, commit 73233bbd3) exited 0 and the check-run annotations API returned
 * exactly 11 entries -- 1 actions/setup-node deprecation notice, 1 "Phase2 scraper failed:
 * Texas", and 9 "wrote 0 records" warnings running alphabetically Alaska -> Illinois and
 * then stopping mid-alphabet. Cross-checked against the production DB for that run's window
 * (2026-08-17 05:32-05:45Z): only 14 distinct directoryMostRecentSource labels wrote at all,
 * so roughly 36 of the 51 scrapers produced zero records -- i.e. ~27 zero-record warnings
 * were emitted and thrown away. Among the ones the cap hid were Iowa, New York, Illinois,
 * Texas and Hawaii, every one of which HAS produced records historically (IowaPhase2 2,715
 * rows, NewYorkPhase2 29,727, IllinoisPhase2 3,154, TexasPhase2 1,971, HawaiiPhase2 47 --
 * none touched since 2026-05). Those are exactly the regressions the zero-record annotation
 * was added to surface, and the cap was eating them.
 *
 * Fix: emit ONE consolidated zero-record annotation naming every affected scraper, and cap
 * individual failure annotations so a bad week cannot push the consolidated one out either.
 * The full per-scraper table is unaffected -- it still goes to stdout and to the job summary.
 */
const GITHUB_MAX_ANNOTATIONS_PER_STEP = 10;
/** Individual failure annotations to emit before collapsing the rest into one overflow line. */
const MAX_INDIVIDUAL_FAILURE_ANNOTATIONS = GITHUB_MAX_ANNOTATIONS_PER_STEP - 2;

// NOTE (roadmap #558): a scraper that succeeds but writes zero organizer records
// is deliberately NOT counted as a failure -- many registry entries are known
// stubs with no accessible data source, and zero-results scrapes now warn rather
// than throw. It IS reported separately below, because after the throw-to-warn
// sweep the item count is the only place a newly-and-permanently-broken scraper
// can surface.

// Registry - one entry per state license/registry Phase 2 scraper.
const SCRAPERS: ScraperEntry[] = [
  { name: "Alabama", fn: runAlabamaPhase2Scraper },
  { name: "Alaska", fn: runAlaskaPhase2Scraper },
  { name: "Arizona", fn: runArizonaPhase2Scraper },
  { name: "Arkansas", fn: runArkansasPhase2Scraper },
  { name: "California", fn: runCaliforniaPhase2Scraper },
  { name: "Colorado", fn: runColoradoPhase2Scraper },
  { name: "Connecticut", fn: runConnecticutPhase2Scraper },
  { name: "Delaware", fn: runDelawarePhase2Scraper },
  { name: "Florida", fn: runFloridaPhase2Scraper },
  { name: "Georgia", fn: runGeorgiaPhase2Scraper },
  { name: "Hawaii", fn: runHawaiiPhase2Scraper },
  { name: "Idaho", fn: runIdahoPhase2Scraper },
  { name: "Illinois", fn: runIllinoisPhase2Scraper },
  { name: "Indiana", fn: runIndianaPhase2Scraper },
  { name: "Iowa", fn: runIowaPhase2Scraper },
  { name: "Kansas", fn: runKansasPhase2Scraper },
  { name: "Kentucky", fn: runKentuckyPhase2Scraper },
  { name: "Louisiana", fn: runLouisianaPhase2Scraper },
  { name: "Maine", fn: runMainePhase2Scraper },
  { name: "Maryland", fn: runMarylandPhase2Scraper },
  { name: "Massachusetts", fn: runMassachusettsPhase2Scraper },
  { name: "Michigan", fn: runMichiganPhase2Scraper },
  { name: "Minnesota", fn: runMinnesotaPhase2Scraper },
  { name: "Mississippi", fn: runMississippiPhase2Scraper },
  { name: "Missouri", fn: runMissouriPhase2Scraper },
  { name: "Montana", fn: runMontanaPhase2Scraper },
  { name: "Nebraska", fn: runNebraskaPhase2Scraper },
  { name: "Nevada", fn: runNevadaPhase2Scraper },
  { name: "New Hampshire", fn: runNewHampshirePhase2Scraper },
  { name: "New Jersey", fn: runNewJerseyPhase2Scraper },
  { name: "New Mexico", fn: runNewMexicoPhase2Scraper },
  { name: "New York", fn: runNewYorkPhase2Scraper },
  { name: "North Carolina", fn: runNorthCarolinaPhase2Scraper },
  { name: "North Dakota", fn: runNorthDakotaPhase2Scraper },
  { name: "Ohio", fn: runOhioPhase2Scraper },
  { name: "Oklahoma", fn: runOklahomaphase2Scraper },
  { name: "Oregon", fn: runOregonPhase2Scraper },
  { name: "Pennsylvania", fn: runPennsylvaniaPhase2Scraper },
  { name: "Rhode Island", fn: runRhodeIslandPhase2Scraper },
  { name: "South Carolina", fn: runSouthCarolinaPhase2Scraper },
  { name: "South Dakota", fn: runSouthDakotaPhase2Scraper },
  { name: "Tennessee", fn: runTennesseePhase2Scraper },
  { name: "Texas", fn: runTexasPhase2Scraper },
  { name: "Utah", fn: runUtahPhase2Scraper },
  { name: "Vermont", fn: runVermontPhase2Scraper },
  { name: "Virginia General", fn: runVirginiaGeneralPhase2Scraper },
  { name: "Virginia", fn: runVirginiaPhase2Scraper },
  { name: "Washington", fn: runWashingtonPhase2Scraper },
  { name: "West Virginia", fn: runWestVirginiaPhase2Scraper },
  { name: "Wisconsin", fn: runWisconsinPhase2Scraper },
  { name: "Wyoming", fn: runWyomingPhase2Scraper }
];

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

async function main(): Promise<void> {
  const results: ScraperResult[] = [];
  const batchStart = Date.now();

  console.log(`[batch] Starting license/registry Phase 2 batch - ${SCRAPERS.length} scrapers`);

  for (const entry of SCRAPERS) {
    const start = Date.now();
    // Scrapers run strictly sequentially in this process, so a shared counter
    // reset here is a safe per-scraper measurement.
    resetScrapedOrganizerWriteCount();
    try {
      console.log(`[batch] > ${entry.name} - starting`);
      await entry.fn();
      const ms = Date.now() - start;
      const items = getScrapedOrganizerWriteCount();
      results.push({ name: entry.name, status: "ok", items, ms });
      console.log(`[batch] OK ${entry.name} - ok (${items} items, ${ms}ms)`);
    } catch (err) {
      const ms = Date.now() - start;
      const items = getScrapedOrganizerWriteCount();
      const message = err instanceof Error ? (err.stack || err.message) : String(err);
      results.push({ name: entry.name, status: "fail", items, error: message, ms });
      console.error(`[batch] X ${entry.name} - FAILED after ${items} items (${ms}ms):`, message);
    }
  }

  const totalMs = Date.now() - batchStart;
  const passed = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const totalItems = results.reduce((sum, r) => sum + r.items, 0);
  const failureRate = results.length > 0 ? failed / results.length : 0;
  const failureRatePct = (failureRate * 100).toFixed(1);
  const thresholdPct = (MAX_FAILURE_RATE * 100).toFixed(0);
  const silentZero = results.filter((r) => r.status === "ok" && r.items === 0);
  const overThreshold = failureRate > MAX_FAILURE_RATE;

  // --- Readable stdout table ---
  const nameWidth = Math.max(8, ...results.map((r) => r.name.length));
  const sep = "-".repeat(nameWidth + 36);
  console.log("");
  console.log("Per-scraper results:");
  console.log(sep);
  console.log(
    `${pad("Scraper", nameWidth)}  ${pad("Status", 8)}  ${pad("Items", 8)}  ${pad("Time", 10)}`
  );
  console.log(sep);
  for (const r of results) {
    const status = r.status === "ok" ? "PASS" : "FAIL";
    console.log(
      `${pad(r.name, nameWidth)}  ${pad(status, 8)}  ${pad(String(r.items), 8)}  ${pad(r.ms + "ms", 10)}`
    );
  }
  console.log(sep);
  console.log(
    `Totals: ${passed} passed, ${failed} failed, ${results.length} total, ` +
    `${totalItems} items in ${totalMs}ms`
  );
  console.log(
    `Failure rate: ${failureRatePct}% (threshold ${thresholdPct}%) - ` +
    `${overThreshold ? "OVER threshold, exiting non-zero" : "within threshold, exiting 0"}`
  );

  if (failed > 0) {
    console.log("");
    console.log("Failures:");
    const failures = results.filter((x) => x.status === "fail");
    failures.forEach((r, idx) => {
      const firstLine = (r.error || "unknown error").split("\n")[0];
      console.log(`  - ${r.name}: ${firstLine}`);
      // Keep individual failures visible in the GitHub UI even when the overall run
      // exits 0 -- but only up to the annotation budget (see
      // GITHUB_MAX_ANNOTATIONS_PER_STEP). Everything past that is collapsed into one
      // annotation below so the consolidated zero-record annotation still has a slot.
      if (idx < MAX_INDIVIDUAL_FAILURE_ANNOTATIONS) {
        console.log(`::warning title=Phase2 scraper failed: ${r.name}::${firstLine}`);
      }
    });
    const hiddenFailures = failures.slice(MAX_INDIVIDUAL_FAILURE_ANNOTATIONS);
    if (hiddenFailures.length > 0) {
      console.log(
        `::warning title=Phase2: ${hiddenFailures.length} more scrapers failed::` +
        `${hiddenFailures.map((r) => r.name).join(", ")}. ` +
        "See the job summary table for the full per-scraper status."
      );
    }
  }

  if (silentZero.length > 0) {
    console.log("");
    console.log(
      `Passed but wrote 0 records (${silentZero.length}) - expected for known stubs, ` +
      "investigate any state that previously produced records:"
    );
    for (const r of silentZero) {
      console.log(`  - ${r.name}`);
    }
    // ONE annotation for the whole set, not one per scraper. See
    // GITHUB_MAX_ANNOTATIONS_PER_STEP: the per-scraper form silently lost ~27 of these
    // on run #9 because GitHub caps annotations at 10 per level per step, and the ones
    // it dropped included states that have produced records before.
    console.log(
      `::warning title=Phase2: ${silentZero.length} of ${results.length} scrapers wrote 0 records::` +
      `${silentZero.map((r) => r.name).join(", ")}. ` +
      "These completed without error but produced no organizer records. Expected for a " +
      "known stub; a regression for any state that has produced records before. " +
      "Full per-scraper counts are in the job summary table."
    );
  }

  // --- GitHub Step Summary (markdown) ---
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      const lines: string[] = [];
      lines.push(`## License / Registry Phase 2 Batch`);
      lines.push("");
      lines.push(
        `**${passed} passed, ${failed} failed** of ${results.length} scrapers - ` +
        `${totalItems} records written - ${totalMs}ms total`
      );
      lines.push("");
      lines.push(
        `Failure rate **${failureRatePct}%** (threshold ${thresholdPct}%) - ` +
        `run exits **${overThreshold ? "1 (systemic failure)" : "0"}**.`
      );
      lines.push("");
      lines.push("| Scraper | Status | Items | Time (ms) |");
      lines.push("| --- | --- | --- | --- |");
      for (const r of results) {
        const status = r.status === "ok" ? "PASS" : "FAIL";
        lines.push(`| ${r.name} | ${status} | ${r.items} | ${r.ms} |`);
      }
      if (failed > 0) {
        lines.push("");
        lines.push("### Failures");
        for (const r of results.filter((x) => x.status === "fail")) {
          const firstLine = (r.error || "unknown error").split("\n")[0];
          lines.push(`- **${r.name}**: ${firstLine}`);
        }
      }
      if (silentZero.length > 0) {
        lines.push("");
        lines.push("### Passed but wrote 0 records");
        lines.push(
          "Expected for known stubs with no accessible data source. " +
          "Investigate any state that previously produced records."
        );
        for (const r of silentZero) {
          lines.push(`- ${r.name}`);
        }
      }
      lines.push("");
      fs.appendFileSync(summaryPath, lines.join("\n") + "\n");
    } catch (e) {
      console.error("[batch] Failed to write GITHUB_STEP_SUMMARY:", e);
    }
  }

  // --- One-line machine-readable summary ---
  console.log(
    `BATCH_SUMMARY total=${results.length} passed=${passed} failed=${failed} ` +
    `items=${totalItems} silentZero=${silentZero.length} ` +
    `failRate=${failureRatePct}% threshold=${thresholdPct}% ` +
    `exit=${overThreshold ? 1 : 0} ms=${totalMs}`
  );

  if (overThreshold) {
    console.log(
      `::error title=Phase2 batch failure rate ${failureRatePct}%::` +
      `${failed} of ${results.length} scrapers failed, above the ${thresholdPct}% ceiling. ` +
      "This pattern indicates a systemic problem (credentials, Prisma client, network egress, " +
      "or a shared-helper regression) rather than independent third-party site outages."
    );
  }

  // Silent-zero scrapers are reported, not failed -- see the note above the
  // MAX_FAILURE_RATE block. Only a systemic failure rate reds the run.
  process.exit(overThreshold ? 1 : 0);
}

main().catch((err) => {
  console.error("[batch] Fatal error in batch runner:", err);
  process.exit(1);
});
