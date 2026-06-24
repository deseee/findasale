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
 *  - Collects per-scraper { name, status, error, ms }.
 *  - Prints a readable pass/fail table to stdout.
 *  - If GITHUB_STEP_SUMMARY is set, appends the same table as markdown to that file.
 *  - Prints a one-line machine-readable summary.
 *  - Exits 1 if ANY scraper failed (keeps the run red so the daily health monitor
 *    catches it); exits 0 only when every scraper succeeded.
 *
 * This file is generated/maintained to mirror the function set of the per-state
 * Phase 2 workflows. Do NOT remove a scraper here without removing its source.
 */

import fs from "fs";

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
  error?: string;
  ms: number;
}

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
    try {
      console.log(`[batch] > ${entry.name} - starting`);
      await entry.fn();
      const ms = Date.now() - start;
      results.push({ name: entry.name, status: "ok", ms });
      console.log(`[batch] OK ${entry.name} - ok (${ms}ms)`);
    } catch (err) {
      const ms = Date.now() - start;
      const message = err instanceof Error ? (err.stack || err.message) : String(err);
      results.push({ name: entry.name, status: "fail", error: message, ms });
      console.error(`[batch] X ${entry.name} - FAILED (${ms}ms):`, message);
    }
  }

  const totalMs = Date.now() - batchStart;
  const passed = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "fail").length;

  // --- Readable stdout table ---
  const nameWidth = Math.max(8, ...results.map((r) => r.name.length));
  const sep = "-".repeat(nameWidth + 24);
  console.log("");
  console.log("Per-scraper results:");
  console.log(sep);
  console.log(`${pad("Scraper", nameWidth)}  ${pad("Status", 8)}  ${pad("Time", 10)}`);
  console.log(sep);
  for (const r of results) {
        const status = r.status === "ok" ? "PASS" : "FAIL";
    console.log(`${pad(r.name, nameWidth)}  ${pad(status, 8)}  ${pad(r.ms + "ms", 10)}`);
  }
  console.log(sep);
  console.log(`Totals: ${passed} passed, ${failed} failed, ${results.length} total in ${totalMs}ms`);

  if (failed > 0) {
    console.log("");
    console.log("Failures:");
    for (const r of results.filter((x) => x.status === "fail")) {
      console.log(`  - ${r.name}: ${(r.error || "unknown error").split("\n")[0]}`);
    }
  }

  // --- GitHub Step Summary (markdown) ---
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      const lines: string[] = [];
      lines.push(`## License / Registry Phase 2 Batch`);
      lines.push("");
      lines.push(`**${passed} passed, ${failed} failed** of ${results.length} scrapers - ${totalMs}ms total`);
      lines.push("");
      lines.push("| Scraper | Status | Time (ms) |");
      lines.push("| --- | --- | --- |");
      for (const r of results) {
        const status = r.status === "ok" ? "PASS" : "FAIL";
        lines.push(`| ${r.name} | ${status} | ${r.ms} |`);
      }
      if (failed > 0) {
        lines.push("");
        lines.push("### Failures");
        for (const r of results.filter((x) => x.status === "fail")) {
          const firstLine = (r.error || "unknown error").split("\n")[0];
          lines.push(`- **${r.name}**: ${firstLine}`);
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
    `BATCH_SUMMARY total=${results.length} passed=${passed} failed=${failed} ms=${totalMs}`
  );

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[batch] Fatal error in batch runner:", err);
  process.exit(1);
});
