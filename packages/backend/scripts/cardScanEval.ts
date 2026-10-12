/**
 * Card scan accuracy harness (ADR-138 decision D4, batch B4). A command line wrapper around runEval in
 * src/services/cardScan/evalScoring.ts, where all the scoring and every safety check live and are unit tested.
 *
 * NOTHING RUNS BY ITSELF. Importing this file does nothing; only running it directly starts the harness, and even
 * then a run that can spend money is refused unless ALL of these are present:
 *   - the --confirm-spend flag,
 *   - CARD_SCAN_EVAL_APPROVED=yes in the environment,
 *   - ANTHROPIC_API_KEY (and GOOGLE_VISION_API_KEY for --mode OCR_PLUS_HAIKU).
 * The estimated spend is printed first. The recognizer, and so any network capable object, is created only after
 * every one of those checks has passed.
 *
 * Scoring a saved run needs no keys and makes no call:
 *   pnpm --filter backend exec tsx scripts/cardScanEval.ts --results run.json
 *
 * A live run reads each labelled photo once, blind (the label is not shown to the recognizer), resolves the reading
 * against the card catalog the way a live scan does, and reports the READY / AFTER_PICK / WRONG_READY / UNMATCHED
 * buckets against the D4 pass bar (90 percent of modern nonfoil correct, at most 1 percent WRONG_READY). The catalog
 * is READ only: it needs CARD_CATALOG_ENABLED=true and a DATABASE_URL that points at a database holding the card list.
 *   CARD_SCAN_EVAL_APPROVED=yes pnpm --filter backend exec tsx scripts/cardScanEval.ts \
 *     --labels labels.json --images ./photos --confirm-spend --out run.json
 *
 * labels.json is a hand-labelled array: { "file": "001.jpg", "game": "MTG", "name": "Lightning Bolt",
 * "setCode": "m10", "collectorNumber": "146", "finish": "NONFOIL", "era": "MODERN" }.
 */
import fs from 'fs';
import { parseEvalArgs, runEval } from '../src/services/cardScan/evalScoring';
import type { EvalRecognizer, EvalRunDeps } from '../src/services/cardScan/evalScoring';
import type { EnvLike } from '../src/services/cardScan/config';
import { DEFAULT_FRAME_COST_ESTIMATE_USD, DEFAULT_OCR_FRAME_COST_ESTIMATE_USD } from '../src/services/cardScan/recognition/scanCostGuard';

export function buildDeps(): EvalRunDeps {
  return {
    readText: (filePath) => fs.readFileSync(filePath, 'utf8'),
    fileExists: (filePath) => fs.existsSync(filePath),
    readImage: (filePath) => fs.readFileSync(filePath),
    writeText: (filePath, content) => fs.writeFileSync(filePath, content, 'utf8'),
    log: (line) => console.log(line),
    estimatePerFrameUsd: (mode) => (mode === 'OCR_PLUS_HAIKU' ? DEFAULT_OCR_FRAME_COST_ESTIMATE_USD : DEFAULT_FRAME_COST_ESTIMATE_USD),

    // Loaded only after the run gate passed, so a refused run never touches the database module.
    getResolver: async (env: EnvLike) => {
      const lookup = await import('../src/services/cardCatalog/cardCatalogLookup');
      const { resolveObservation } = await import('../src/services/cardScan/resolveObservation');
      const state = await lookup.loadCatalogState(undefined, env);
      if (!state.catalogReady) {
        throw new Error('the card list is not ready; set CARD_CATALOG_ENABLED=true and point DATABASE_URL at a database that holds it');
      }
      return (observation) => resolveObservation(observation, { catalog: state, resolve: (refs) => lookup.resolveRefs(refs) });
    },

    // The only place a network capable provider is created.
    getRecognizer: async (env: EnvLike): Promise<EvalRecognizer> => {
      const registry = await import('../src/services/cardScan/recognition/registry');
      return registry.getRecognitionProvider(env);
    },
  };
}

export async function main(argv: string[], env: EnvLike): Promise<number> {
  const report = await runEval(parseEvalArgs(argv), env, buildDeps());
  return report.exitCode;
}

if (require.main === module) {
  main(process.argv.slice(2), process.env)
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error('The card scan harness failed:', err instanceof Error ? err.message : 'unknown error');
      process.exit(2);
    });
}
