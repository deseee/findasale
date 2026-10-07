/**
 * verifyBulkLotPackSquareSandbox.ts: runs the online bulk lot PACK checkout (ADR-136 Addendum E, roadmap #659) against the REAL
 * Square SANDBOX API, on a throwaway local scratch database. It is the companion of verifyBulkLotConcurrency.ts, whose scenario S6
 * proves the duplicate protection with in-process stand-ins for the Square charge, the refund and the cash fee debt claim. Here
 * the charge and the refund are real Square sandbox calls, made by the same service code the controller uses, and every scenario
 * READS SQUARE BACK through the Square API afterwards (payments.get, refunds.get, payments.list) instead of trusting what our own
 * code returned. Run by Patrick on Windows, never by CI and never by a dev agent. A dev agent cannot reach a database or Square.
 *
 * MONEY SAFETY (payment rail QA is SANDBOX ONLY, real money is banned). The script refuses to start (exit code 2, a message on
 * stderr, nothing sent to Square) unless ALL of these hold; every one is an exported pure helper covered by
 * src/__tests__/verifyBulkLotPackSquareSandbox.test.ts:
 *   1. DATABASE_URL passes checkScratchDatabaseUrl from verifyBulkLotConcurrency.ts (localhost or 127.0.0.1, database name ending
 *      _scratch, _test or _bulktest). The script WRITES to that database.
 *   2. process.env.SQUARE_ENVIRONMENT is exactly the text sandbox. The services themselves treat anything except production as
 *      sandbox (utils/square.ts:41-44, squareConnectService.ts:100-101, squareRefundService.ts:158-163), so a blank or a differently
 *      cased value would "work" in them; this script wants the explicit word.
 *   3. The two verify variables below are set and well formed, the token is not the same text as SQUARE_ACCESS_TOKEN (the production
 *      platform token variable, utils/square.ts:48) and SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED is not 1 (the kill switch would turn
 *      every refund into MANUAL and the checks could not prove anything).
 *   4. The Square SDK client that the real charge and refund code builds (getSquareClientForMerchant, utils/square.ts:71-81, called by
 *      createSquareCharge at squarePaymentService.ts:223 and by squareDeadInvoiceRefundService.ts:103) is inspected: its resolved base
 *      URL must be the SDK's Sandbox environment constant, no baseUrl override may be set, and the resolved host must contain
 *      "sandbox" and end in squareupsandbox.com. This is checked on the client OBJECT (its _options), not only on the env var.
 *   5. The access token is read from one environment variable (below) and passed only to the Square SDK. It is never printed. Every
 *      message and the final JSON are scrubbed of the token, of any Bearer text and of Square token shapes (redactSquareSecrets,
 *      scrubText). The JSON report holds Square payment and refund ids only.
 *   After the DB connects the script also asks the server for current_database() and refuses unless it is the database named in the
 *   URL, exactly like the concurrency script. Every fixture id carries a run prefix (bulksqsb_<time>_<random>) and a finally block
 *   deletes only the rows this run created, by id. Square sandbox payments cannot be deleted; they stay in the sandbox account
 *   (fake money) and are recognizable by the reference id, which starts with the run prefix.
 *
 * ENVIRONMENT VARIABLES (set in the PowerShell window; names that already exist in the code are reused, only two are new):
 *   DATABASE_URL                            existing. The scratch database URL (see HOW TO RUN).
 *   SQUARE_ENVIRONMENT                      existing (utils/square.ts:42). Must be exactly: sandbox
 *   SQUARE_SANDBOX_VERIFY_ACCESS_TOKEN      NEW. The Square sandbox access token the pack checkout will charge and refund with. See THE FEE.
 *   SQUARE_SANDBOX_VERIFY_LOCATION_ID       NEW. The sandbox location id of the seller test account that owns that token.
 *   Read by the code under test but NOT needed here: SQUARE_SANDBOX_APPLICATION_ID and SQUARE_SANDBOX_APPLICATION_SECRET are read only
 *   by refreshSquareAccessToken (squareConnectService.ts:527-540), which resolveOrganizerSquareAccessToken calls only when the stored
 *   token expires within 5 minutes (squarePaymentService.ts:103-138). The fixture stores the token with no expiry, so that branch is
 *   never reached (it is listed in notProven). SOCIAL_TOKEN_ENC_KEY (utils/tokenCrypto.ts:34,58) is replaced inside this process by a
 *   random throwaway key before the encryption module loads, so a real key never touches this run. Note that SQUARE_SANDBOX_ACCESS_TOKEN
 *   and SQUARE_SANDBOX_LOCATION_ID already exist (utils/square.ts:120,145, used by the POS sandbox adapter); this script deliberately does
 *   NOT read them, so a token left in some other window or file can never be picked up by accident.
 *
 * FIDELITY: HOW CLOSE TO PRODUCTION CAN A SCRIPT GET (researched 2026-10-06, file:line from the repo, docs cited below)
 *   Production, one online pack purchase (controllers/bulkLotPackPaymentController.ts:78-413): the shopper's browser tokenizes the card
 *   with the Web Payments SDK and posts the one-time card token as sourceId (:81,:83); the server plans and prices the pack (:177),
 *   works out the fee with computePackFees (:181, bulkLotPackCheckout.ts:68-72: calculateApplicationFee + applyInclusiveFloor),
 *   refuses a pack that is too cheap (:182-188, bulkLotPackCheckout.ts:80-86), loads the CONNECTED ORGANIZER's own OAuth access token
 *   with resolveOrganizerSquareAccessToken (:196, squarePaymentService.ts:78-139: decrypts Organizer.squareAccessTokenEncrypted,
 *   refreshes it near expiry), and executePackCheckout (:257, bulkLotPackCheckout.ts:176-281) then claims cash fee debt, charges through
 *   createSquareCharge (squarePaymentService.ts:222-262: client.payments.create with amountMoney, appFeeMoney when the fee is above zero
 *   :232, the organizer's locationId :233, autocomplete true :234) and records the Purchase and the stock in one transaction, refunding
 *   through settleOversoldPayment (:431-440, oversoldPaymentRefundService.ts:100-153 -> squareDeadInvoiceRefundService.ts:80-171) when
 *   the payment turns out to be a duplicate or the cards ran out. A later refund of the sale goes through executeVerifiedSquareRefund
 *   (squareRefundService.ts:518, bulk lot rows return cards through applyBulkRefundReturn at :373).
 *   WHAT THIS SCRIPT DRIVES FOR REAL (same functions, unchanged, nothing re-implemented except where listed under BYPASSED):
 *     - planPackLine, computePackFees, assertPackSellableOnline, packBuyerKey, packClientTransactionId, executePackCheckout
 *     - resolveOrganizerSquareAccessToken: the fixture organizer row holds the supplied token encrypted with encryptToken
 *       (utils/tokenCrypto.ts:64), so the real decrypt path runs, exactly as for a connected organizer
 *     - createSquareCharge with the same request fields as production, to the real Square sandbox API (network)
 *     - applyCashDebtToAppFee and releaseCashDebtClaim (cashFeeService.ts:247,301) against the scratch database
 *     - sellItemUnitsInTransaction, the guarded stock decrement
 *     - computeOversoldSettlement and settleOversoldPayment with kind online-pack -> refundSquarePaymentForDeadInvoice -> Square
 *       payments.get and refunds.refundPayment (network), with the same deterministic refund idempotency key
 *     - executeVerifiedSquareRefund (partial then full refund of a bulk pack sale, scenario P5) against the real sandbox payment
 *   WHAT CANNOT BE REPRODUCED, AND WHAT THE SCRIPT DOES INSTEAD:
 *     (a) The browser card token. Square's documented sandbox nonce cnon:card-nonce-ok is used as sourceId (a documented value that
 *         always succeeds, https://developer.squareup.com/docs/devtools/sandbox/payments). It is a fixed string, so a "double
 *         tokenization" cannot give two different sourceIds. createSquareCharge folds a hash of the sourceId into the Square
 *         idempotency key (squarePaymentService.ts:177-178, :229). Production's double click has the SAME base key and two DIFFERENT
 *         sourceIds; this script gives each attempt a DIFFERENT base key and the same nonce. Either way Square sees two distinct
 *         idempotency keys, i.e. two real payments, which is the only property the duplicate protection relies on.
 *     (b) The application fee. app_fee_money needs the OAuth access token of a CONNECTED seller (Square: "Square identifies the seller's
 *         Square account by reading the access token obtained in the OAuth code flow and used in the CreatePayment request",
 *         https://developer.squareup.com/docs/payments-api/take-payments-and-collect-fees, and the CreatePayment reference
 *         https://developer.squareup.com/reference/square/payments-api/create-payment: the fee needs PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS).
 *         A plain personal access token of the default sandbox test account cannot take an application fee (Square forum, staff
 *         answer: https://developer.squareup.com/forums/t/when-taking-app-fees-do-i-connect-with-my-own-api-keys/7589), and Square also
 *         says app fees are not fully supported in the Sandbox (https://developer.squareup.com/forums/t/sandbox-oauth-app-fee-money-where-should-the-application-fee-appear/27900).
 *         So the script does not guess: after the fixtures exist it makes ONE probe payment WITH an app fee through the real
 *         createSquareCharge and reads it back. If Square accepted it and reports the same appFeeMoney, the fee mode is WITH_APP_FEE and
 *         every scenario charges with the real fee (padded by the real debt claim where the scenario sets one). If Square refused it, or
 *         accepted it without reporting the fee, the fee mode is NO_APP_FEE: every charge is sent WITHOUT appFeeMoney (the real
 *         createSquareCharge simply omits the field when the fee argument is 0, squarePaymentService.ts:232), and notProven in the
 *         report says exactly which behavior was therefore not exercised. The probe is refunded at once (script-level SDK call, ids
 *         recorded). The report states the mode and the reason; a NO_APP_FEE run is still a valid proof of everything else.
 *         Best fidelity for Patrick: use the OAuth access token of an additional sandbox seller test account (Developer Console ->
 *         Sandbox test accounts -> create an account with "Automatically create authorizations" cleared, then the OAuth page, scopes
 *         PAYMENTS_WRITE, PAYMENTS_READ, MERCHANT_PROFILE_READ and PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS; see
 *         https://developer.squareup.com/docs/devtools/sandbox/overview and https://developer.squareup.com/docs/oauth-api/walkthrough, or
 *         the token the app's own sandbox Connect flow stored). Second best: the default test account's sandbox access token (NO_APP_FEE).
 *     (c) The existing POST /api/square-payment/test-transaction endpoint (controllers/squarePaymentController.ts:985-1099) is NOT a
 *         Square sandbox mechanism: it never calls Square (its own header, :985-1012, and the response text at :1093 say so), it writes a
 *         synthetic Purchase with a made up payment id (:1066). It proves fee math only. The real sandbox payment code in the repo is
 *         createAndCaptureSandboxPayment (services/squarePosPaymentAdapter.ts:461), which uses a platform-level sandbox token
 *         (utils/square.ts:118-135), a delayed capture and NO app fee (:445,:490); this script does not use it because it would skip
 *         the organizer token path and createSquareCharge.
 *     (d) The HTTP layer. handleBulkPackPayment needs a full Sale/Organizer/Item graph, the guest velocity and checkout guards, the
 *         eligibility check and sends real notifications and emails (:333-405, :441-455), so it is not called. The script runs the
 *         controller's money steps in the controller's order (plan :177, fee :178-181, too-cheap refusal :182-188, token :196, keys
 *         :211-213, executePackCheckout :257) as runPackPurchase below. refundPackPayment (:420-466) is not exported, so its money part
 *         (:431-440) is mirrored in mirrorRefundPackPayment, WITHOUT the notifications.
 *     (e) Affiliate attribution (resolveAffiliateAttribution, :245) is replaced by a function that returns null.
 *
 * SCENARIOS (each reads Square back; a scenario passes only with no setup error, no unexpected attempt error and every check true):
 *   P1 happy path         one real sandbox pack purchase: one Purchase row with the right bulkQuantity and amount, stock down by exactly
 *                         one pack, the Square payment COMPLETED for the exact amount (and the app fee, in WITH_APP_FEE mode). The
 *                         organizer starts with 10 cents of cash fee debt that the real claim must move onto the sale.
 *   P2 duplicate click    two real sandbox payments, same buyer key and retry token, released together (a barrier inside the charge
 *                         dependency makes sure both pass the replay check, like a real double submit): exactly one Purchase, exactly one
 *                         pack taken, the second Square payment fully refunded (refund read back: amount equals the payment, status
 *                         COMPLETED or PENDING), the winner not refunded, the cash fee debt conserved (kept on the sale or given back).
 *   P3 lost race          a lot with exactly one pack left, two different buyers pay concurrently: exactly one Purchase, one pack taken,
 *                         the loser's payment fully refunded, the loser's answer is the lost-race refusal (SOLD_OUT_AFTER_PAYMENT, which the
 *                         controller maps to HTTP 409 code BULK_SOLD_OUT_AFTER_PAYMENT, bulkLotPackPaymentController.ts:297-309).
 *   P4 too cheap          BULK_PACK_TOO_CHEAP is refused BEFORE any Square call, for a 40 cent pack and for a 75 cent pack (the fee floor is
 *                         75 cents, feeCalculator.ts:406, and the rule is fee >= price): zero charge calls, and Square's own payment list
 *                         (read before and after) shows no payment created for it. The list must see the run's earlier payments, or the
 *                         "none" would mean nothing.
 *   P5 refund the winner  a fresh real pack purchase, then executeVerifiedSquareRefund for half the cards (a partial refund) and for the
 *                         other half (the full refund) against the sandbox payment: Purchase status and refunded amounts, cards returned to
 *                         the lot, BulkLotRefund audit rows, and Square's refunded money, refund ids and refund records.
 *
 * HOW TO RUN (Windows PowerShell, repo root C:\Users\desee\ClaudeProjects\FindaSale; chain with ; never with &&):
 *   1. Scratch database and migrations exactly as in the header of verifyBulkLotConcurrency.ts (steps 1 to 3). Reuse that database.
 *   2. Set the window (the values live only in this window; close it afterwards or Remove-Item each variable):
 *        $env:DATABASE_URL="postgresql://findasale:findasale@localhost:5432/findasale_bulktest"
 *        $env:SQUARE_ENVIRONMENT="sandbox"
 *        $env:SQUARE_SANDBOX_VERIFY_ACCESS_TOKEN="<paste the sandbox access token here>"
 *        $env:SQUARE_SANDBOX_VERIFY_LOCATION_ID="<paste the sandbox location id here>"
 *        echo $env:DATABASE_URL; echo $env:SQUARE_ENVIRONMENT
 *      The location id: Developer Console -> Sandbox test accounts -> the seller account -> Square Dashboard (sandbox) -> Locations, or one
 *      ListLocations call with the same token. Do not echo the token.
 *   3. Run it. Progress goes to the console (stderr), the JSON report goes to the file (stdout):
 *        cd C:\Users\desee\ClaudeProjects\FindaSale; pnpm --filter backend exec tsx src/scripts/verifyBulkLotPackSquareSandbox.ts | Out-File -Encoding utf8 bulk-lot-pack-square-sandbox.json
 *      Exit code (echo $LASTEXITCODE): 0 only when all five scenarios PASSED and the cleanup left nothing behind; 1 a scenario failed, was
 *      skipped, the cleanup left rows, or Square or the database was not usable; 2 refused to start (nothing was sent to Square).
 *   4. Clear the window: Remove-Item Env:SQUARE_SANDBOX_VERIFY_ACCESS_TOKEN; Remove-Item Env:SQUARE_SANDBOX_VERIFY_LOCATION_ID; Remove-Item Env:SQUARE_ENVIRONMENT; Remove-Item Env:DATABASE_URL
 *   Attach bulk-lot-pack-square-sandbox.json to the ADR-136 PR (it holds ids, never the token).
 *
 * NOT PROVEN (also in the JSON report as notProven, with the fee mode of the run filled in): see buildNotProven.
 *
 * Square documentation used (read 2026-10-06):
 *   https://developer.squareup.com/docs/devtools/sandbox/payments          sandbox nonces: cnon:card-nonce-ok succeeds; declined and CVV nonces fail
 *   https://developer.squareup.com/docs/devtools/sandbox/overview          test accounts, OAuth tokens for extra seller accounts, sandbox limits
 *   https://developer.squareup.com/docs/oauth-api/walkthrough              sandbox OAuth: connect.squareupsandbox.com, sandbox tokens behave like production tokens
 *   https://developer.squareup.com/docs/payments-api/take-payments-and-collect-fees   app fee: OAuth seller token, fee cap 90 percent (60 percent below 5.00 USD)
 *   https://developer.squareup.com/reference/square/payments-api/create-payment        app_fee_money, idempotency_key (max 45 characters), reference_id (max 40)
 *   https://developer.squareup.com/docs/payments-api/refund-payments       refund statuses PENDING, COMPLETED, FAILED, REJECTED; GetPaymentRefund; partial refunds
 */

import crypto from 'crypto';
import { format } from 'util';
import { SquareEnvironment } from 'square';
import {
  AttemptOutcome,
  InvariantCheck,
  ScenarioResult,
  Tally,
  buildScenarioResult,
  checkAtMost,
  checkEquals,
  checkScratchDatabaseUrl,
  classifyError,
  expectedStatus,
  onlyOwnedIds,
  sanitizeMessage,
  secretsOf,
  skippedScenario,
  summarizeResults,
  tallyOutcomes,
  withPoolParams,
} from './verifyBulkLotConcurrency';
import {
  PackCheckoutDeps,
  PackCheckoutOutcome,
  assertPackSellableOnline,
  computePackFees,
  executePackCheckout,
  packBuyerKey,
  packClientTransactionId,
  parsePackClientToken,
} from '../services/bulkLot/bulkLotPackCheckout';
import { planPackLine } from '../services/bulkLot/bulkLotPackService';
import { MINIMUM_TRANSACTION_FEE_CENTS, getInclusivePlatformFeeRate } from '../utils/feeCalculator';

/** The Prisma client is created at run time from the generated package, so importing this file (the unit test does) loads no database code. */
type Db = any;
/** Everything that reads DATABASE_URL, a Square token or SOCIAL_TOKEN_ENC_KEY at load time is imported only after the guards passed. */
interface Mods {
  stock: typeof import('../services/itemStockService');
  squareUtil: typeof import('../utils/square');
  squarePay: typeof import('../services/squarePaymentService');
  oversold: typeof import('../services/oversoldPaymentRefundService');
  cashFee: typeof import('../services/cashFeeService');
  tokenCrypto: typeof import('../utils/tokenCrypto');
}
type SquareClientT = ReturnType<Mods['squareUtil']['getSquareClientForMerchant']>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Square's documented always-succeeds sandbox card token (https://developer.squareup.com/docs/devtools/sandbox/payments). */
export const SANDBOX_CARD_NONCE_OK = 'cnon:card-nonce-ok';
export const TOKEN_ENV_NAME = 'SQUARE_SANDBOX_VERIFY_ACCESS_TOKEN';
export const LOCATION_ENV_NAME = 'SQUARE_SANDBOX_VERIFY_LOCATION_ID';
export const SANDBOX_API_HOST_SUFFIX = 'squareupsandbox.com';
/** Lot economics: $2.00 per 1,000 cards and a 1,000 card pack = 200 cents per pack. The platform fee floor is 75 cents (37.5 percent of 200). */
export const PACK_SIZE_CARDS = 1000;
export const PRICE_DOLLARS_PER_THOUSAND = 2;
export const EXPECTED_PACK_CENTS = 200;
export const SCENARIO_COUNT = 5;
export const ACCEPTED_REFUND_STATUSES: readonly string[] = ['COMPLETED', 'PENDING'];
export const REFUSAL_EXIT = 2;
const SQUARE_POLL_TRIES = 8;
const SQUARE_POLL_DELAY_MS = 1500;
const BARRIER_TIMEOUT_MS = 30000;
const TX_POOL = 10;

type EnvLike = Record<string, string | undefined>;
export type { EnvLike };

// ---------------------------------------------------------------------------
// Pure helpers (exported and unit tested)
// ---------------------------------------------------------------------------

export type Refusal = { ok: false; reason: string };

/** SQUARE_ENVIRONMENT must be exactly the text sandbox. Blank, unset, Sandbox, production and everything else are refused. */
export function checkSquareEnvironment(raw: string | undefined | null): { ok: true } | Refusal {
  if (raw === 'sandbox') return { ok: true };
  const shown = raw === undefined || raw === null ? 'not set' : JSON.stringify(String(raw).slice(0, 30));
  return { ok: false, reason: `SQUARE_ENVIRONMENT must be exactly "sandbox" in this window (it is ${shown}).` };
}

export type VerifyConfigCheck = { ok: true; accessToken: string; locationId: string } | Refusal;

/** Reads the two verify variables. Never puts the token in a reason. */
export function readVerifyConfig(env: EnvLike): VerifyConfigCheck {
  const rawToken = env[TOKEN_ENV_NAME];
  if (typeof rawToken !== 'string' || rawToken.trim() === '') return { ok: false, reason: `${TOKEN_ENV_NAME} is not set in this window.` };
  const accessToken = rawToken.trim();
  if (!/^[A-Za-z0-9._~+\/=-]{16,512}$/.test(accessToken)) {
    return { ok: false, reason: `${TOKEN_ENV_NAME} does not look like a Square access token (unexpected characters or length).` };
  }
  const rawLocation = env[LOCATION_ENV_NAME];
  if (typeof rawLocation !== 'string' || rawLocation.trim() === '') return { ok: false, reason: `${LOCATION_ENV_NAME} is not set in this window.` };
  const locationId = rawLocation.trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(locationId)) return { ok: false, reason: `${LOCATION_ENV_NAME} does not look like a Square location id.` };
  const platformToken = env.SQUARE_ACCESS_TOKEN;
  if (typeof platformToken === 'string' && platformToken.trim() !== '' && platformToken.trim() === accessToken) {
    return { ok: false, reason: `${TOKEN_ENV_NAME} has the same value as the production platform token variable. Use a sandbox token.` };
  }
  if (env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED === '1') {
    return { ok: false, reason: 'SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED is 1 in this window: every refund would be skipped and the checks could not prove anything. Clear it first.' };
  }
  return { ok: true, accessToken, locationId };
}

export interface SquareClientOptionsLike {
  environment?: unknown;
  baseUrl?: unknown;
}

const supplied = (v: unknown): unknown => (typeof v === 'function' ? (v as () => unknown)() : v);

/** The base URL the Square SDK would call: baseUrl first, then environment (the SDK falls back to Production when neither is set). */
export function resolveSquareApiHost(options: SquareClientOptionsLike | null | undefined): { ok: true; baseUrl: string; host: string } | Refusal {
  if (!options || typeof options !== 'object') return { ok: false, reason: 'the Square client has no readable options, so its environment cannot be verified.' };
  const base = supplied(options.baseUrl);
  const env = supplied(options.environment);
  const url = base !== undefined && base !== null ? base : env;
  if (url === undefined || url === null) return { ok: false, reason: 'the Square client has neither an environment nor a baseUrl, so the SDK would call Production.' };
  if (typeof url !== 'string') return { ok: false, reason: 'the Square client environment is not a plain string, so it cannot be verified.' };
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, reason: 'the Square client base URL is not a valid URL.' };
  }
  return { ok: true, baseUrl: url, host };
}

/**
 * Accepts only a client whose base URL is the SDK's Sandbox constant: no baseUrl override, not the Production constant, and a host that
 * contains "sandbox" and ends in squareupsandbox.com. The constants are parameters so a test can pass look-alikes.
 */
export function assertSandboxApiOptions(
  options: SquareClientOptionsLike | null | undefined,
  sandboxUrl: string = SquareEnvironment.Sandbox,
  productionUrl: string = SquareEnvironment.Production
): { ok: true; host: string; baseUrl: string } | Refusal {
  if (options && typeof options === 'object' && options.baseUrl !== undefined && options.baseUrl !== null) {
    return { ok: false, reason: 'the Square client has a baseUrl override, which beats the environment. Not allowed.' };
  }
  const r = resolveSquareApiHost(options);
  if (!r.ok) return r;
  if (r.baseUrl === productionUrl) return { ok: false, reason: `the Square client would call Production (${r.host}).` };
  if (r.baseUrl !== sandboxUrl) return { ok: false, reason: `the Square client base URL (${r.host}) is not the SDK's Sandbox environment.` };
  if (!r.host.includes('sandbox')) return { ok: false, reason: `the resolved Square API host (${r.host}) does not contain "sandbox".` };
  if (!r.host.endsWith(SANDBOX_API_HOST_SUFFIX)) return { ok: false, reason: `the resolved Square API host (${r.host}) does not end in ${SANDBOX_API_HOST_SUFFIX}.` };
  return { ok: true, host: r.host, baseUrl: r.baseUrl };
}

/** Looks inside a constructed SquareClient (its protected _options) and applies assertSandboxApiOptions. */
export function assertSandboxClient(client: unknown): { ok: true; host: string; baseUrl: string } | Refusal {
  const options = client && typeof client === 'object' ? (client as { _options?: SquareClientOptionsLike })._options : undefined;
  return assertSandboxApiOptions(options);
}

/** Strings that must never reach stdout or stderr for the access token: the token and its URL encoded form. */
export function tokenSecrets(token: string | undefined | null): string[] {
  if (typeof token !== 'string' || token.length < 3) return [];
  const out = [token];
  const enc = encodeURIComponent(token);
  if (enc !== token) out.push(enc);
  return out;
}

/** One line, the listed secrets, any postgres URL, Bearer text and Square token shapes removed, cut to maxLength. Pure. */
export function redactSquareSecrets(text: unknown, secrets: ReadonlyArray<string> = [], maxLength = 300): string {
  let out = sanitizeMessage(text, secrets, 1_000_000);
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]');
  out = out.replace(/\bEAA[A-Za-z0-9_-]{16,}/g, '[redacted-token]');
  out = out.replace(/\bsq0[a-z]{3}-[A-Za-z0-9_-]{8,}/gi, '[redacted-token]');
  return out.length > maxLength ? `${out.slice(0, maxLength)}...` : out;
}

/** Removes every listed secret from a longer text (the JSON report) without touching its layout. */
export function scrubText(text: string, secrets: ReadonlyArray<string>): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join('[redacted]');
  }
  return out;
}

/** Run-unique id prefix. Every fixture id this run creates starts with it; it is also the start of every Square reference id. */
export function makeSandboxRunPrefix(nowMs: number, rand: () => number = Math.random): string {
  const tail = Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0');
  return `bulksqsb_${nowMs.toString(36)}_${tail}`;
}

/** A unique Square idempotency key for a call the harness makes itself: sha256 base64url, 43 characters (Square allows 45). */
export function deriveIdempotencyKey(prefix: string, label: string): string {
  return crypto.createHash('sha256').update(`${prefix}|${label}`).digest('base64url').slice(0, 43);
}

/** Square Money amount (a bigint in the SDK, sometimes a number or digit string) as a number of cents, or null. */
export function moneyCents(m: unknown): number | null {
  if (!m || typeof m !== 'object') return null;
  const a = (m as { amount?: unknown }).amount;
  if (typeof a === 'bigint') return Number(a);
  if (typeof a === 'number' && Number.isFinite(a)) return a;
  if (typeof a === 'string' && /^-?\d+$/.test(a)) return Number(a);
  return null;
}

/** Cents for `cards` of `soldCards` on a sale of `purchaseCents`, rounded half up once (the rule the refund service's cumulative share follows). */
export function expectedCentsForCards(purchaseCents: number, cards: number, soldCards: number): number {
  if (cards >= soldCards) return purchaseCents;
  return Math.floor((purchaseCents * cards * 2 + soldCards) / (soldCards * 2));
}

export interface PaymentFacts {
  id: string;
  status: string | null;
  amountCents: number | null;
  currency: string | null;
  appFeeCents: number | null;
  refundedCents: number;
  refundIds: string[];
  locationId: string | null;
  referenceId: string | null;
}

export interface RefundFacts {
  id: string;
  status: string | null;
  amountCents: number | null;
  paymentId: string | null;
  appFeeCents: number | null;
}

export interface ListedPayment {
  id: string;
  referenceId: string | null;
}

/** A Square Payment object (SDK shape) as plain facts. */
export function toPaymentFacts(p: any): PaymentFacts {
  const refundIds: string[] = Array.isArray(p?.refundIds) ? p.refundIds.filter((x: unknown): x is string => typeof x === 'string') : [];
  return {
    id: String(p?.id ?? ''),
    status: typeof p?.status === 'string' ? p.status : null,
    amountCents: moneyCents(p?.amountMoney),
    currency: typeof p?.amountMoney?.currency === 'string' ? p.amountMoney.currency : null,
    appFeeCents: moneyCents(p?.appFeeMoney),
    refundedCents: moneyCents(p?.refundedMoney) ?? 0,
    refundIds,
    locationId: typeof p?.locationId === 'string' ? p.locationId : null,
    referenceId: typeof p?.referenceId === 'string' ? p.referenceId : null,
  };
}

/** A Square PaymentRefund object (SDK shape) as plain facts. */
export function toRefundFacts(r: any): RefundFacts {
  return {
    id: String(r?.id ?? ''),
    status: typeof r?.status === 'string' ? r.status : null,
    amountCents: moneyCents(r?.amountMoney),
    paymentId: typeof r?.paymentId === 'string' ? r.paymentId : null,
    appFeeCents: moneyCents(r?.appFeeMoney),
  };
}

export type FeeMode = 'WITH_APP_FEE' | 'NO_APP_FEE';

/** Decides the fee mode from the probe payment. Pure. */
export function evaluateFeeProbe(a: { chargeOk: boolean; errorCode?: string | null; expectedAppFeeCents: number; readBackAppFeeCents: number | null }): { mode: FeeMode; reason: string } {
  if (!a.chargeOk) {
    return {
      mode: 'NO_APP_FEE',
      reason: `Square refused the probe payment that carried app_fee_money (${a.errorCode || 'no error code'}): the supplied token cannot take an application fee.`,
    };
  }
  if (a.readBackAppFeeCents === a.expectedAppFeeCents) {
    return { mode: 'WITH_APP_FEE', reason: 'Square accepted app_fee_money on the probe payment and reported the same fee when the payment was read back.' };
  }
  return {
    mode: 'NO_APP_FEE',
    reason: `Square accepted the probe payment but did not report the app fee on it (read back ${a.readBackAppFeeCents === null ? 'none' : a.readBackAppFeeCents} cents, expected ${a.expectedAppFeeCents}).`,
  };
}

/** Checks on one completed sandbox payment as read back from Square. appFeeCents null means no fee was requested in this run. */
export function checkPaymentCompleted(label: string, p: PaymentFacts, e: { cents: number; locationId: string; referenceId: string; appFeeCents: number | null }): InvariantCheck[] {
  const checks: InvariantCheck[] = [
    checkEquals(`${label}: Square payment status`, 'COMPLETED', p.status),
    checkEquals(`${label}: Square payment amount in cents`, e.cents, p.amountCents),
    checkEquals(`${label}: Square payment currency`, 'USD', p.currency),
    checkEquals(`${label}: Square payment location`, e.locationId, p.locationId),
    checkEquals(`${label}: Square payment reference id (the lot item id)`, e.referenceId.slice(0, 40), p.referenceId),
  ];
  if (e.appFeeCents === null) checks.push(checkEquals(`${label}: Square payment app fee in cents (none was requested in this run)`, 0, p.appFeeCents ?? 0));
  else checks.push(checkEquals(`${label}: Square payment app fee in cents as read back`, e.appFeeCents, p.appFeeCents));
  return checks;
}

/** The payment has no refund at all. */
export function checkNotRefunded(label: string, p: PaymentFacts): InvariantCheck[] {
  return [
    checkEquals(`${label}: refunded money on the Square payment (cents)`, 0, p.refundedCents),
    checkEquals(`${label}: refund ids on the Square payment`, 0, p.refundIds.length),
  ];
}

/** Refunds read back: their number, their sum, their status, and (expectFull) that the sum equals the payment itself. */
export function checkRefunds(label: string, p: PaymentFacts, refunds: ReadonlyArray<RefundFacts>, expectedTotalCents: number, expectedCount: number, expectFull: boolean): InvariantCheck[] {
  const total = refunds.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const checks: InvariantCheck[] = [
    checkEquals(`${label}: refunded money on the Square payment (cents)`, expectedTotalCents, p.refundedCents),
    checkEquals(`${label}: refund ids on the Square payment`, expectedCount, p.refundIds.length),
    checkEquals(`${label}: refunds read back by id`, expectedCount, refunds.length),
    checkEquals(`${label}: sum of the refunds read back (cents)`, expectedTotalCents, total),
    checkEquals(`${label}: every refund belongs to this payment`, true, refunds.length > 0 && refunds.every((r) => r.paymentId === p.id)),
    checkEquals(`${label}: every refund is COMPLETED or PENDING`, true, refunds.length > 0 && refunds.every((r) => r.status !== null && ACCEPTED_REFUND_STATUSES.includes(r.status))),
  ];
  if (expectFull) checks.push(checkEquals(`${label}: refunds read back add up to the payment amount read back (cents)`, p.amountCents ?? -1, total));
  return checks;
}

/** Payments listed after a step that are new, and the subset that carries this run's prefix in the reference id. Pure. */
export function newOwnPayments(before: ReadonlyArray<ListedPayment>, after: ReadonlyArray<ListedPayment>, prefix: string): { newTotal: number; newOwn: string[] } {
  const seen = new Set(before.map((p) => p.id));
  const fresh = after.filter((p) => !seen.has(p.id));
  return { newTotal: fresh.length, newOwn: fresh.filter((p) => typeof p.referenceId === 'string' && p.referenceId.startsWith(prefix)).map((p) => p.id) };
}

/** 0 only when all five scenarios ran and passed (a skipped one is not a pass here) and the cleanup left nothing behind. */
export function sandboxExitCode(results: ReadonlyArray<ScenarioResult>, cleanupOk = true, requiredScenarios: number = SCENARIO_COUNT): 0 | 1 {
  return cleanupOk && results.length === requiredScenarios && results.every((r) => r.status === 'PASSED' && r.pass) ? 0 : 1;
}

/** Name of a checkout outcome as an attempt kind: the sale is a success, the designed non-sales are refusals, everything else is unexpected. */
export function classifyPackOutcomeName(name: string): 'success' | 'refusal' | 'unexpected' {
  if (name === 'RECORDED') return 'success';
  if (name === 'REPLAY' || name === 'DUPLICATE_REFUNDED' || name === 'SOLD_OUT_AFTER_PAYMENT') return 'refusal';
  return 'unexpected';
}

/** What this run did not prove. The fee mode of the run decides the Square app fee entries. */
export function buildNotProven(feeMode: FeeMode): string[] {
  const out: string[] = [
    'The Square sandbox, not production: sandbox payments settle at once with fake money, and Square documents that app fees are not fully supported there. A pass says the code behaves correctly against the sandbox API, not that production Square will answer identically.',
    'The browser card token: the sandbox nonce cnon:card-nonce-ok replaces the Web Payments SDK token and the verification token (3D Secure). Only the always-succeeds nonce is used; real decline, CVV and postal code paths and card network behavior are not exercised. A double click is simulated with two different idempotency keys and one nonce (see the header).',
    'The HTTP layer: handleBulkPackPayment (auth, guest velocity guard, checkout guards, sale eligibility, request parsing, response mapping, receipts, notifications, emails, marketplace sync) is not called. The controller money steps are run in the controller order by this script. The refund step mirrors refundPackPayment without its notifications. Affiliate attribution is replaced by null.',
    'The OAuth token lifecycle: onboarding, the refresh branch of resolveOrganizerSquareAccessToken and the scopes of the token Square gave the production app. The fixture stores the supplied token encrypted with no expiry, so the refresh branch is never reached.',
    'Square webhooks, payment and refund reconciliation sweeps, disputes and chargebacks.',
    'Load: two simultaneous payments are the most this run makes. Database concurrency is covered by verifyBulkLotConcurrency.ts. Square sandbox payments are not deleted (fake money); they remain in the sandbox account with a reference id that starts with the run prefix.',
    'Square fee cap on small packs: Square caps an application fee at 90 percent of the payment, and at 60 percent for payments under 5.00 USD (https://developer.squareup.com/docs/payments-api/take-payments-and-collect-fees). The platform fee has a 75 cent floor, so a pack priced between 76 and 124 cents passes assertPackSellableOnline (it only refuses when the fee is at least the price) but asks Square for more than 60 percent. Every amount in this run is 2.00 USD (a 37.5 percent fee), so this is not exercised.',
  ];
  if (feeMode === 'NO_APP_FEE') {
    out.unshift(
      'THE APPLICATION FEE WAS BYPASSED IN THIS RUN: every charge was sent without appFeeMoney (createSquareCharge omits it when the fee argument is 0, squarePaymentService.ts:232). Not exercised: Square accepting app_fee_money with the organizer OAuth token, Square echoing the fee on the payment, the fee cap, and the proportional app fee refund on RefundPayment (squareRefundService.ts header). The Purchase row still records the platform fee the service computed, so its platformFeeAmount check proves our bookkeeping, not what Square collected. Run again with the OAuth access token of a sandbox seller test account to cover it.'
    );
  } else {
    out.unshift(
      'The app fee WAS sent in this run and Square echoed it on the payment, but the sandbox does not show where the fee lands (Square: app fees are not fully supported in the sandbox), so the movement of the fee money to the developer account is not observed.'
    );
  }
  return out;
}

/** A barrier: arrive() resolves when `parties` callers have arrived, or after timeoutMs (so one stuck caller never hangs the others). */
export class Barrier {
  private waiting: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private done = false;
  arrived = 0;
  timedOut = false;
  constructor(private readonly parties: number, private readonly timeoutMs: number = BARRIER_TIMEOUT_MS) {}
  private release(): void {
    this.done = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const all = this.waiting;
    this.waiting = [];
    for (const resolve of all) resolve();
  }
  arrive(): Promise<void> {
    if (this.done) return Promise.resolve();
    this.arrived++;
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
      if (this.arrived >= this.parties) {
        this.release();
        return;
      }
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timedOut = true;
          this.release();
        }, this.timeoutMs);
      }
    });
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads until `done(value)` or the tries run out; returns the last value read (Square answers can lag a moment behind a write). */
export async function pollUntil<T>(read: () => Promise<T>, done: (v: T) => boolean, tries: number = SQUARE_POLL_TRIES, delayMs: number = SQUARE_POLL_DELAY_MS, sleep: (ms: number) => Promise<void> = defaultSleep): Promise<T> {
  let last = await read();
  for (let i = 1; i < tries && !done(last); i++) {
    await sleep(delayMs);
    last = await read();
  }
  return last;
}

// ---------------------------------------------------------------------------
// Run context, fixtures and Square readers (not unit tested: they need the database and Square)
// ---------------------------------------------------------------------------

interface Registry {
  userIds: string[];
  organizerIds: string[];
  saleIds: string[];
  itemIds: string[];
}

export interface ChargeRecord {
  paymentId: string;
  amountCents: number;
  appFeeSentCents: number;
  itemId: string;
  label: string;
}

export interface RefundRecord {
  paymentId: string;
  refundId: string | null;
  status: string;
  refundCents: number;
  reason: string;
}

/** What the dependency wrappers saw during one scenario. */
interface Tracker {
  chargeCalls: number;
  charges: ChargeRecord[];
  refunds: RefundRecord[];
  claimedCents: number;
  releasedCents: number;
  captured: string[];
}

const newTracker = (): Tracker => ({ chargeCalls: 0, charges: [], refunds: [], claimedCents: 0, releasedCents: 0, captured: [] });

interface Ctx {
  prisma: Db;
  mods: Mods;
  client: SquareClientT;
  accessToken: string;
  locationId: string;
  merchantId: string;
  secrets: string[];
  prefix: string;
  reg: Registry;
  organizerId: string;
  organizerUserId: string;
  saleId: string;
  feeMode: FeeMode;
  startedAt: Date;
  /** Every Square payment id this run created (probe included), in creation order. */
  paymentIds: string[];
  /** Every Square refund id this run created or saw, in creation order. */
  refundIds: string[];
}

const errText = (err: unknown, secrets: ReadonlyArray<string>): string =>
  redactSquareSecrets(err instanceof Error ? `${err.name}: ${err.message}` : String(err), secrets);
const toCents = (dollars: number | null | undefined): number => Math.round((Number(dollars) || 0) * 100);
const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function createLot(ctx: Ctx, tag: string, o: { stockTotal: number; price: number }): Promise<string> {
  const id = `${ctx.prefix}_item_${tag}`;
  ctx.reg.itemIds.push(id); // registered before the insert, so a half-finished insert is still cleaned up
  await ctx.prisma.item.create({
    data: {
      id,
      title: `${ctx.prefix} lot ${tag}`,
      price: o.price, // dollars per 1,000 cards
      status: 'AVAILABLE',
      stockTotal: o.stockTotal,
      stockSold: 0,
      photoUrls: [],
      embedding: [], // Item.embedding is a required array column
      saleId: ctx.saleId,
      organizerId: ctx.organizerId,
      isActive: true,
      draftStatus: 'PUBLISHED',
    },
  });
  await ctx.prisma.itemBulkLot.create({ data: { itemId: id, organizerId: ctx.organizerId, packSize: PACK_SIZE_CARDS } });
  return id;
}

async function readLot(ctx: Ctx, itemId: string): Promise<{ stockTotal: number; stockSold: number; status: string }> {
  const r = await ctx.prisma.item.findUnique({ where: { id: itemId }, select: { stockTotal: true, stockSold: true, status: true } });
  if (!r) throw new Error(`fixture lot ${itemId} is missing`);
  return { stockTotal: r.stockTotal ?? 1, stockSold: r.stockSold, status: r.status };
}

async function readForPlan(ctx: Ctx, itemId: string): Promise<{ price: number | null; status: string; stockTotal: number | null; stockSold: number; packSize: number | null }> {
  const r = await ctx.prisma.item.findUnique({
    where: { id: itemId },
    select: { price: true, status: true, stockTotal: true, stockSold: true, bulkLot: { select: { packSize: true } } },
  });
  if (!r) throw new Error(`fixture lot ${itemId} is missing`);
  return { price: r.price, status: r.status, stockTotal: r.stockTotal, stockSold: r.stockSold, packSize: r.bulkLot ? r.bulkLot.packSize : null };
}

interface PurchaseRow {
  id: string;
  status: string;
  processor: string | null;
  squarePaymentId: string | null;
  amountCents: number;
  platformFeeCents: number;
  debtCents: number;
  bulkQuantity: number;
  bulkRefundedQuantity: number;
  refundedCents: number;
}

async function readPurchaseRows(ctx: Ctx, where: Record<string, unknown>): Promise<PurchaseRow[]> {
  const rows: any[] = await ctx.prisma.purchase.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      processor: true,
      squarePaymentId: true,
      amount: true,
      platformFeeAmount: true,
      cashDebtCollectedAmount: true,
      bulkQuantity: true,
      bulkRefundedQuantity: true,
      refundedAmount: true,
    },
  });
  return rows.map((r) => ({
    id: String(r.id),
    status: String(r.status),
    processor: typeof r.processor === 'string' ? r.processor : null,
    squarePaymentId: typeof r.squarePaymentId === 'string' ? r.squarePaymentId : null,
    amountCents: toCents(r.amount),
    platformFeeCents: toCents(r.platformFeeAmount),
    debtCents: toCents(r.cashDebtCollectedAmount),
    bulkQuantity: Number(r.bulkQuantity) || 0,
    bulkRefundedQuantity: Number(r.bulkRefundedQuantity) || 0,
    refundedCents: toCents(r.refundedAmount),
  }));
}

async function setDebt(ctx: Ctx, dollars: number): Promise<void> {
  await ctx.prisma.organizer.update({ where: { id: ctx.organizerId }, data: { cashFeeBalance: dollars } });
}

async function readDebtCents(ctx: Ctx): Promise<number> {
  const o = await ctx.prisma.organizer.findUnique({ where: { id: ctx.organizerId }, select: { cashFeeBalance: true } });
  return toCents(o ? o.cashFeeBalance : 0);
}

// ---- Square readers: every one is a real API call, polled because Square can lag a moment behind a write ----

async function readPayment(ctx: Ctx, paymentId: string, done: (p: PaymentFacts) => boolean = (p) => p.status === 'COMPLETED'): Promise<PaymentFacts> {
  return pollUntil(
    async () => {
      const res: any = await ctx.client.payments.get({ paymentId });
      return toPaymentFacts(res?.payment);
    },
    done
  );
}

async function readRefunds(ctx: Ctx, refundIds: ReadonlyArray<string>): Promise<RefundFacts[]> {
  const out: RefundFacts[] = [];
  for (const refundId of refundIds) {
    out.push(
      await pollUntil(
        async () => {
          const res: any = await ctx.client.refunds.get({ refundId });
          return toRefundFacts(res?.refund);
        },
        (r) => r.status !== null && r.status !== 'PENDING'
      )
    );
  }
  return out;
}

/** Payments of the seller location created since beginTime (newest first, at most 2000). */
async function listPayments(ctx: Ctx, beginTime: string): Promise<ListedPayment[]> {
  const out: ListedPayment[] = [];
  const page: any = await ctx.client.payments.list({ beginTime, locationId: ctx.locationId, limit: 100, sortOrder: 'DESC' });
  for await (const p of page) {
    out.push({ id: String(p?.id ?? ''), referenceId: typeof p?.referenceId === 'string' ? p.referenceId : null });
    if (out.length >= 2000) break;
  }
  return out;
}

interface SquareSide {
  checks: InvariantCheck[];
  payment: PaymentFacts;
  refunds: RefundFacts[];
}

/**
 * Reads one payment (and, when refunds are expected, every refund on it by id) back from Square and turns it into checks.
 * The application fee check is made only on a payment that has no refund: whether Square keeps app_fee_money unchanged on a refunded
 * payment is not something this script has proven, so it is not asserted there.
 */
async function squareSide(ctx: Ctx, label: string, rec: ChargeRecord, refund: { cents: number; count: number; full: boolean } | null): Promise<SquareSide> {
  const e = { cents: rec.amountCents, locationId: ctx.locationId, referenceId: rec.itemId, appFeeCents: ctx.feeMode === 'WITH_APP_FEE' ? rec.appFeeSentCents : null };
  if (!refund) {
    const payment = await readPayment(ctx, rec.paymentId);
    return { checks: [...checkPaymentCompleted(label, payment, e), ...checkNotRefunded(label, payment)], payment, refunds: [] };
  }
  const payment = await readPayment(ctx, rec.paymentId, (x) => x.status === 'COMPLETED' && x.refundedCents === refund.cents && x.refundIds.length === refund.count);
  const refunds = await readRefunds(ctx, payment.refundIds);
  for (const id of payment.refundIds) if (!ctx.refundIds.includes(id)) ctx.refundIds.push(id);
  const base = checkPaymentCompleted(label, payment, e).filter((c) => !c.name.includes('app fee'));
  return { checks: [...base, ...checkRefunds(label, payment, refunds, refund.cents, refund.count, refund.full)], payment, refunds };
}

// ---------------------------------------------------------------------------
// The pack purchase, in the controller's order, with the real service code
// ---------------------------------------------------------------------------

interface PurchaseSpec {
  itemId: string;
  email: string;
  clientToken: string;
  /** Folded into the Square idempotency key, so two attempts with the same token are two real payments (the double click). */
  attempt: string;
  packs: number;
  barrier?: Barrier;
  track: Tracker;
}

const txnKeyFor = (email: string, clientToken: string): string => packClientTransactionId(packBuyerKey(null, email), clientToken);

function buildPackDeps(ctx: Ctx, spec: PurchaseSpec, organizerAccessToken: string, squareLocationId: string | null): PackCheckoutDeps {
  const { stock, squarePay, oversold, cashFee } = ctx.mods;
  const { track } = spec;
  return {
    db: ctx.prisma,
    sell: (tx, id, units) => stock.sellItemUnitsInTransaction(tx, id, units),
    applyDebt: async ({ baseAppFeeCents, saleAmountCents }) => {
      const r = await cashFee.applyCashDebtToAppFee({ organizerId: ctx.organizerId, baseAppFeeCents, saleAmountCents });
      track.claimedCents += r.debtAppliedCents;
      return r;
    },
    releaseDebt: async (debtAppliedCents) => {
      await cashFee.releaseCashDebtClaim({ organizerId: ctx.organizerId, debtAppliedCents });
      track.releasedCents += debtAppliedCents > 0 ? debtAppliedCents : 0;
    },
    charge: async ({ amountCents, appFeeCents, idempotencyKey }) => {
      // Holds each double-submit attempt here until all of them passed the replay check, so both really charge (like a real double click).
      if (spec.barrier) await spec.barrier.arrive();
      const appFeeSentCents = ctx.feeMode === 'WITH_APP_FEE' ? appFeeCents : 0;
      track.chargeCalls++;
      const r = await squarePay.createSquareCharge({
        organizerAccessToken,
        idempotencyKey,
        sourceId: SANDBOX_CARD_NONCE_OK,
        amountCents,
        appFeeCents: appFeeSentCents,
        locationId: squareLocationId,
        referenceId: spec.itemId,
        note: `${ctx.prefix} pack ${spec.attempt}`.slice(0, 80),
        buyerEmailAddress: spec.email,
      });
      if (!r.ok) return { ok: false, code: r.code, message: r.message };
      track.charges.push({ paymentId: r.paymentId, amountCents, appFeeSentCents, itemId: spec.itemId, label: spec.attempt });
      ctx.paymentIds.push(r.paymentId);
      return { ok: true, paymentId: r.paymentId, cardFingerprint: r.cardFingerprint };
    },
    // Mirrors refundPackPayment (bulkLotPackPaymentController.ts:431-440) without its notifications; it is not exported.
    refund: async (a) => {
      try {
        const settlement = oversold.computeOversoldSettlement({ cardCents: a.amountCents, cashCents: 0, weightsCents: [a.amountCents], oversoldIdx: [0] });
        const settled = await oversold.settleOversoldPayment({
          kind: 'online-pack',
          refId: a.paymentId,
          organizerProfileId: ctx.organizerId,
          processor: 'SQUARE',
          paymentId: a.paymentId,
          cardPaidCents: a.amountCents,
          settlement,
        });
        track.refunds.push({ paymentId: a.paymentId, refundId: settled.refundId ?? null, status: settled.status, refundCents: settled.refundCents, reason: redactSquareSecrets(settled.reason, ctx.secrets) });
        if (settled.refundId && !ctx.refundIds.includes(settled.refundId)) ctx.refundIds.push(settled.refundId);
        return { status: settled.status, refundCents: settled.refundCents };
      } catch (err) {
        track.refunds.push({ paymentId: a.paymentId, refundId: null, status: 'MANUAL', refundCents: a.amountCents, reason: `THREW: ${errText(err, ctx.secrets)}` });
        return { status: 'MANUAL', refundCents: a.amountCents };
      }
    },
    resolveAttribution: async () => null,
    captureError: (err, extra) => {
      track.captured.push(errText(err, ctx.secrets) + ` ${redactSquareSecrets(JSON.stringify(extra), ctx.secrets, 200)}`);
    },
  };
}

/** What handleBulkPackPayment does for one request, in its order: plan, fee, too-cheap refusal, token, keys, executePackCheckout. */
async function runPackPurchase(ctx: Ctx, spec: PurchaseSpec): Promise<PackCheckoutOutcome> {
  const row = await readForPlan(ctx, spec.itemId);
  const org = await ctx.prisma.organizer.findUnique({
    where: { id: ctx.organizerId },
    select: { subscriptionTier: true, referralDiscountExpiry: true, squareMerchantId: true, squareOnboarded: true, squareLocationId: true },
  });
  if (!org) throw new Error('fixture organizer is missing');
  const plan = planPackLine(row, row.packSize, spec.packs, null); // bulkLotPackPaymentController.ts:177
  const baseFeePercent = getInclusivePlatformFeeRate(org.subscriptionTier, 'ONLINE'); // :179
  const feePercent = org.referralDiscountExpiry != null && org.referralDiscountExpiry > new Date() ? 0 : baseFeePercent; // :180-181
  const fees = computePackFees({ cents: plan.cents, feePercent }); // :181
  assertPackSellableOnline({ cents: plan.cents, platformFeeCents: fees.platformFeeCents, shippingRequested: false, couponCode: null, organizerDiscountAmount: 0 }); // :182-188
  const organizerAccessToken = await ctx.mods.squarePay.resolveOrganizerSquareAccessToken({ id: ctx.organizerId, squareMerchantId: org.squareMerchantId, squareOnboarded: org.squareOnboarded }); // :196
  const clientToken = parsePackClientToken(spec.clientToken);
  if (clientToken === null) throw new Error('the generated retry token is not accepted by parsePackClientToken');
  const buyerKey = packBuyerKey(null, spec.email);
  const txnKey = packClientTransactionId(buyerKey, clientToken);
  const idempotencyKey = ctx.mods.squarePay.buildSquareIdempotencyKey(['sqpack', spec.itemId, buyerKey, clientToken, String(plan.packs), String(plan.cards), String(plan.cents), spec.attempt]); // :211-213 plus the attempt label
  const deps = buildPackDeps(ctx, spec, organizerAccessToken, org.squareLocationId);
  return executePackCheckout(deps, {
    itemId: spec.itemId,
    saleId: ctx.saleId,
    txnKey,
    idempotencyKey,
    plan,
    feeBreakdown: fees.feeBreakdown,
    platformFeeCents: fees.platformFeeCents,
    feePercent,
    buyer: { userId: null, email: spec.email, name: 'Sandbox Verify Guest' },
  });
}

interface Fired {
  index: number;
  outcome: PackCheckoutOutcome | null;
  attempt: AttemptOutcome;
}

/** Starts every attempt in the same tick (the barrier inside the charge dependency lines them up) and classifies each settled result. */
async function fireAll(ctx: Ctx, fns: Array<() => Promise<PackCheckoutOutcome>>, allowedErrors: readonly string[] = []): Promise<{ tally: Tally; fired: Fired[] }> {
  const settled = await Promise.allSettled(fns.map((f) => f()));
  const fired = settled.map((s, index): Fired => {
    if (s.status === 'fulfilled') {
      const name = s.value.outcome;
      const kind = classifyPackOutcomeName(name);
      if (kind === 'success') return { index, outcome: s.value, attempt: { index, kind: 'success' } };
      if (kind === 'refusal') return { index, outcome: s.value, attempt: { index, kind: 'refusal', code: name } };
      const detail = s.value.outcome === 'DECLINED' ? ` (${s.value.code})` : '';
      return { index, outcome: s.value, attempt: { index, kind: 'unexpected', message: `checkout outcome ${name}${detail}` } };
    }
    const c = classifyError(s.reason, allowedErrors, ctx.secrets);
    const message = redactSquareSecrets(c.message, ctx.secrets);
    if (c.kind === 'refusal') return { index, outcome: null, attempt: { index, kind: 'refusal', code: c.code, message } };
    return { index, outcome: null, attempt: { index, kind: 'unexpected', code: c.code, message, deadlockOrSerialization: c.deadlockOrSerialization } };
  });
  return { tally: tallyOutcomes(fired.map((f) => f.attempt)), fired };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

interface ScenarioBody {
  tally: Tally;
  checks: InvariantCheck[];
  notes?: string[];
}

async function runScenario(ctx: Ctx, name: string, calls: string[], notes: string[], body: (c: Ctx) => Promise<ScenarioBody>): Promise<ScenarioResult> {
  const started = Date.now();
  console.error(`... ${name}`);
  try {
    const r = await body(ctx);
    return buildScenarioResult({ name, calls, notes: [...notes, ...(r.notes ?? [])], tally: r.tally, checks: r.checks, durationMs: Date.now() - started });
  } catch (err) {
    return buildScenarioResult({ name, calls, notes, checks: [], durationMs: Date.now() - started, error: errText(err, ctx.secrets) });
  }
}

const CALLS_CHECKOUT = [
  'services/bulkLot/bulkLotPackService.ts:34 planPackLine; services/bulkLot/bulkLotPackCheckout.ts:68 computePackFees, :80 assertPackSellableOnline, :46 packBuyerKey, :53 packClientTransactionId',
  'services/squarePaymentService.ts:78 resolveOrganizerSquareAccessToken (decrypts the fixture organizer token), :158 buildSquareIdempotencyKey',
  'services/bulkLot/bulkLotPackCheckout.ts:176 executePackCheckout (replay check, claim, charge, transaction, refund paths)',
  'services/squarePaymentService.ts:222 createSquareCharge -> Square POST /v2/payments (sandbox API)',
  'services/cashFeeService.ts:247 applyCashDebtToAppFee, :301 releaseCashDebtClaim; services/itemStockService.ts sellItemUnitsInTransaction',
];
const CALLS_REFUND_PATH = [
  'services/oversoldPaymentRefundService.ts:52 computeOversoldSettlement, :100 settleOversoldPayment (kind online-pack)',
  'services/squareDeadInvoiceRefundService.ts:80 refundSquarePaymentForDeadInvoice -> Square GET /v2/payments/{id}, POST /v2/refunds',
];
const SQUARE_READS = 'Square read back with client.payments.get and client.refunds.get (the harness reads, it does not trust return values)';

/** P1: one real sandbox pack purchase. */
async function scenarioHappyPath(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'P1 happy path: one real sandbox pack purchase',
    [...CALLS_CHECKOUT, SQUARE_READS],
    [
      `Lot of 3,000 cards at ${PRICE_DOLLARS_PER_THOUSAND} dollars per 1,000, pack of ${PACK_SIZE_CARDS} cards = ${EXPECTED_PACK_CENTS} cents. The organizer starts with 10 cents of cash fee debt, which the real claim must move onto this sale.`,
    ],
    async (c) => {
      const track = newTracker();
      const itemId = await createLot(c, 'p1', { stockTotal: 3 * PACK_SIZE_CARDS, price: PRICE_DOLLARS_PER_THOUSAND });
      await setDebt(c, 0.1);
      const email = `${c.prefix}_p1@example.com`;
      const token = `${c.prefix}-p1`;
      const run = await fireAll(c, [() => runPackPurchase(c, { itemId, email, clientToken: token, attempt: 'p1', packs: 1, track })]);
      const rows = await readPurchaseRows(c, { clientTransactionId: txnKeyFor(email, token) });
      const lot = await readLot(c, itemId);
      const debtAfter = await readDebtCents(c);
      const first = run.fired[0] ? run.fired[0].outcome : null;
      const rec = first && first.outcome === 'RECORDED' ? first : null;
      const row = rows[0];
      const expectedFee = MINIMUM_TRANSACTION_FEE_CENTS + 10;
      const checks: InvariantCheck[] = [
        checkEquals('checkouts answered RECORDED', 1, run.tally.succeeded),
        checkEquals('Purchase rows with this clientTransactionId in the database', 1, rows.length),
        checkEquals('Purchase amount in cents', EXPECTED_PACK_CENTS, row ? row.amountCents : null),
        checkEquals('Purchase bulkQuantity (cards)', PACK_SIZE_CARDS, row ? row.bulkQuantity : null),
        checkEquals('Purchase processor', 'SQUARE', row ? row.processor : null),
        checkEquals('Purchase status', 'PAID', row ? row.status : null),
        checkEquals('Purchase squarePaymentId is the payment the charge returned', rec ? rec.paymentId : 'no RECORDED outcome', row ? row.squarePaymentId : null),
        checkEquals('cards taken from the lot (Item.stockSold)', PACK_SIZE_CARDS, lot.stockSold),
        checkEquals('Square charge calls made', 1, track.chargeCalls),
        checkEquals('refunds made (none expected)', 0, track.refunds.length),
        checkEquals('cash fee debt claimed onto the sale (cents)', 10, rec ? rec.debtAppliedCents : null),
        checkEquals('Purchase cashDebtCollectedAmount in cents', 10, row ? row.debtCents : null),
        checkEquals('organizer cashFeeBalance after the sale in cents (debt moved off the balance)', 0, debtAfter),
        checkEquals('app fee in cents (platform fee floor plus the 10 cent claim)', expectedFee, rec ? rec.appFeeCents : null),
        checkEquals('Purchase platformFeeAmount in cents equals the app fee the checkout used', rec ? rec.appFeeCents : -1, row ? row.platformFeeCents : null),
        checkEquals('errors reported through captureError', 0, track.captured.length),
      ];
      const charge = track.charges[0];
      if (charge) {
        const sq = await squareSide(c, 'P1 payment', charge, null);
        checks.push(...sq.checks);
      } else {
        checks.push(checkEquals('a Square payment exists to read back', true, false));
      }
      return { tally: run.tally, checks };
    }
  );
}

/** P2: two real payments for one purchase attempt; the second is refunded. */
async function scenarioDuplicateClick(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'P2 duplicate click: two real sandbox payments, the second fully refunded',
    [...CALLS_CHECKOUT, ...CALLS_REFUND_PATH, SQUARE_READS],
    [
      'Both attempts use the same buyer key and retry token (so the same Purchase.clientTransactionId) and different Square idempotency keys, which makes them two real payments. A barrier inside the charge dependency releases both after both passed the replay check.',
      'In this scenario "failedWithExpectedRefusal" counts the designed non-sale DUPLICATE_REFUNDED. The organizer starts with 20 cents of cash fee debt: whatever the two attempts claim must end up either on the winning sale or back on the balance.',
    ],
    async (c) => {
      const track = newTracker();
      const barrier = new Barrier(2);
      const itemId = await createLot(c, 'p2', { stockTotal: 3 * PACK_SIZE_CARDS, price: PRICE_DOLLARS_PER_THOUSAND });
      await setDebt(c, 0.2);
      const email = `${c.prefix}_p2@example.com`;
      const token = `${c.prefix}-p2`;
      const run = await fireAll(c, [
        () => runPackPurchase(c, { itemId, email, clientToken: token, attempt: 'p2a', packs: 1, barrier, track }),
        () => runPackPurchase(c, { itemId, email, clientToken: token, attempt: 'p2b', packs: 1, barrier, track }),
      ]);
      const rows = await readPurchaseRows(c, { clientTransactionId: txnKeyFor(email, token) });
      const lot = await readLot(c, itemId);
      const debtAfter = await readDebtCents(c);
      const row = rows[0];
      const winnerId = row ? row.squarePaymentId : null;
      const winnerRec = track.charges.find((x) => x.paymentId === winnerId);
      const loserRec = track.charges.find((x) => x.paymentId !== winnerId);
      const refund = track.refunds[0];
      const checks: InvariantCheck[] = [
        checkEquals('both attempts reached the charge together (barrier did not time out)', true, !barrier.timedOut),
        checkEquals('Purchase rows with this clientTransactionId in the database', 1, rows.length),
        checkEquals('checkouts answered RECORDED', 1, run.tally.succeeded),
        checkEquals('checkouts answered DUPLICATE_REFUNDED', 1, run.tally.refusalCodes.DUPLICATE_REFUNDED ?? 0),
        checkEquals('cards taken from the lot (one pack)', PACK_SIZE_CARDS, lot.stockSold),
        checkEquals('Purchase bulkQuantity (cards)', PACK_SIZE_CARDS, row ? row.bulkQuantity : null),
        checkEquals('Square charge calls made (two real payments)', 2, track.chargeCalls),
        checkEquals('distinct Square payment ids', 2, new Set(track.charges.map((x) => x.paymentId)).size),
        checkEquals('refunds made by the refund path', 1, track.refunds.length),
        checkEquals('refund status reported by the service', 'REFUNDED', refund ? refund.status : null),
        checkEquals('refund amount reported by the service in cents', EXPECTED_PACK_CENTS, refund ? refund.refundCents : null),
        checkEquals('the refund is for the payment that did not win', loserRec ? loserRec.paymentId : 'no second payment', refund ? refund.paymentId : null),
        checkEquals('the service reported a Square refund id', true, !!(refund && refund.refundId)),
        checkEquals('cash fee debt: claimed minus given back equals what the sale kept (cents)', row ? row.debtCents : -1, track.claimedCents - track.releasedCents),
        checkEquals('cash fee debt conserved: organizer balance plus what the sale kept (cents)', 20, debtAfter + (row ? row.debtCents : 0)),
        checkEquals('errors reported through captureError', 0, track.captured.length),
      ];
      if (winnerRec) checks.push(...(await squareSide(c, 'P2 winning payment', winnerRec, null)).checks);
      else checks.push(checkEquals('the Purchase points at a payment this run made', true, false));
      if (loserRec) {
        const sq = await squareSide(c, 'P2 duplicate payment', loserRec, { cents: EXPECTED_PACK_CENTS, count: 1, full: true });
        checks.push(...sq.checks);
        checks.push(checkEquals('the refund id the service reported is on the Square payment', true, !!(refund && refund.refundId && sq.payment.refundIds.includes(refund.refundId))));
      } else {
        checks.push(checkEquals('a second Square payment exists to read back', true, false));
      }
      return { tally: run.tally, checks };
    }
  );
}

/** P3: the last pack, two different buyers pay together. */
async function scenarioLostRace(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'P3 lost race: last pack, two buyers pay together, the loser is refunded',
    [...CALLS_CHECKOUT, ...CALLS_REFUND_PATH, SQUARE_READS, 'controllers/bulkLotPackPaymentController.ts:297-309 maps SOLD_OUT_AFTER_PAYMENT to HTTP 409 BULK_SOLD_OUT_AFTER_PAYMENT (not called here; the outcome name is asserted)'],
    [
      'The lot holds exactly one pack. Both buyers plan the purchase while the pack is still there and both charge (the barrier); the guarded stock decrement inside the recording transaction lets one win. In this scenario "failedWithExpectedRefusal" counts the designed non-sale SOLD_OUT_AFTER_PAYMENT.',
    ],
    async (c) => {
      const track = newTracker();
      const barrier = new Barrier(2);
      await setDebt(c, 0);
      const itemId = await createLot(c, 'p3', { stockTotal: PACK_SIZE_CARDS, price: PRICE_DOLLARS_PER_THOUSAND });
      const run = await fireAll(c, [
        () => runPackPurchase(c, { itemId, email: `${c.prefix}_p3a@example.com`, clientToken: `${c.prefix}-p3a`, attempt: 'p3a', packs: 1, barrier, track }),
        () => runPackPurchase(c, { itemId, email: `${c.prefix}_p3b@example.com`, clientToken: `${c.prefix}-p3b`, attempt: 'p3b', packs: 1, barrier, track }),
      ]);
      const rows = await readPurchaseRows(c, { itemId });
      const lot = await readLot(c, itemId);
      const row = rows[0];
      const winnerId = row ? row.squarePaymentId : null;
      const winnerRec = track.charges.find((x) => x.paymentId === winnerId);
      const loserRec = track.charges.find((x) => x.paymentId !== winnerId);
      const refund = track.refunds[0];
      const checks: InvariantCheck[] = [
        checkEquals('both buyers reached the charge together (barrier did not time out)', true, !barrier.timedOut),
        checkEquals('Purchase rows for the lot in the database', 1, rows.length),
        checkEquals('checkouts answered RECORDED', 1, run.tally.succeeded),
        checkEquals('checkouts answered SOLD_OUT_AFTER_PAYMENT (the lost-race refusal)', 1, run.tally.refusalCodes.SOLD_OUT_AFTER_PAYMENT ?? 0),
        checkEquals('cards taken from the lot (the one pack)', PACK_SIZE_CARDS, lot.stockSold),
        checkAtMost('Item.stockSold never above Item.stockTotal', lot.stockTotal, lot.stockSold),
        checkEquals('Item.status (SOLD once the last pack went)', expectedStatus(lot.stockTotal, lot.stockSold), lot.status),
        checkEquals('Square charge calls made (both buyers were charged)', 2, track.chargeCalls),
        checkEquals('refunds made by the refund path', 1, track.refunds.length),
        checkEquals('refund status reported by the service', 'REFUNDED', refund ? refund.status : null),
        checkEquals('refund amount reported by the service in cents', EXPECTED_PACK_CENTS, refund ? refund.refundCents : null),
        checkEquals('the refund is for the payment that did not win', loserRec ? loserRec.paymentId : 'no second payment', refund ? refund.paymentId : null),
        checkEquals('the service reported a Square refund id', true, !!(refund && refund.refundId)),
        checkEquals('errors reported through captureError', 0, track.captured.length),
      ];
      if (winnerRec) checks.push(...(await squareSide(c, 'P3 winning payment', winnerRec, null)).checks);
      else checks.push(checkEquals('the Purchase points at a payment this run made', true, false));
      if (loserRec) {
        const sq = await squareSide(c, 'P3 losing payment', loserRec, { cents: EXPECTED_PACK_CENTS, count: 1, full: true });
        checks.push(...sq.checks);
        checks.push(checkEquals('the refund id the service reported is on the Square payment', true, !!(refund && refund.refundId && sq.payment.refundIds.includes(refund.refundId))));
      } else {
        checks.push(checkEquals('a second Square payment exists to read back', true, false));
      }
      return { tally: run.tally, checks };
    }
  );
}

/** P4: packs that are too cheap to charge are refused before Square is called. */
async function scenarioTooCheap(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'P4 too cheap: BULK_PACK_TOO_CHEAP is refused before any Square call',
    [
      'services/bulkLot/bulkLotPackCheckout.ts:80 assertPackSellableOnline (cents under 50, or platform fee at least the price) via the controller-order steps of runPackPurchase',
      'client.payments.list (Square) before and after, matched on the reference id (the lot item id)',
    ],
    [
      'Two lots: a 40 cent pack (under the 50 cent Square minimum) and a 75 cent pack (the platform fee floor is 75 cents, and the rule is fee at least the price). Both must be refused by the code, and Square must show no payment for either.',
      'A "no payment" answer from a list only means something if the list can see this run\'s other payments, so the before list must contain a payment made earlier in this run (polled until it does).',
    ],
    async (c) => {
      const track = newTracker();
      await setDebt(c, 0);
      const beginIso = new Date(c.startedAt.getTime() - 10 * 60 * 1000).toISOString();
      const anchorId = c.paymentIds[0];
      const before = await pollUntil(() => listPayments(c, beginIso), (l) => !anchorId || l.some((p) => p.id === anchorId));
      const anchorSeen = !!anchorId && before.some((p) => p.id === anchorId);
      const cheapA = await createLot(c, 'p4a', { stockTotal: 3 * PACK_SIZE_CARDS, price: 0.4 });
      const cheapB = await createLot(c, 'p4b', { stockTotal: 3 * PACK_SIZE_CARDS, price: 0.75 });
      const plans = [cheapA, cheapB].map((id) => ({ id, plan: planPackLine({ price: id === cheapA ? 0.4 : 0.75, status: 'AVAILABLE', stockTotal: 3 * PACK_SIZE_CARDS, stockSold: 0 }, PACK_SIZE_CARDS, 1, null) }));
      const fees = plans.map((p) => computePackFees({ cents: p.plan.cents, feePercent: getInclusivePlatformFeeRate('SIMPLE' as any, 'ONLINE') }));
      const run = await fireAll(
        c,
        [cheapA, cheapB].map((itemId, i) => () => runPackPurchase(c, { itemId, email: `${c.prefix}_p4${i}@example.com`, clientToken: `${c.prefix}-p4${i}`, attempt: `p4${i}`, packs: 1, track })),
        ['BULK_PACK_TOO_CHEAP']
      );
      await sleepMs(SQUARE_POLL_DELAY_MS * 2);
      const after = await listPayments(c, beginIso);
      const p4Prefix = `${c.prefix}_item_p4`;
      const diff = newOwnPayments(before, after, p4Prefix);
      const listedForP4 = after.filter((p) => typeof p.referenceId === 'string' && p.referenceId.startsWith(p4Prefix)).length;
      const dbPurchases = await ctx.prisma.purchase.count({ where: { itemId: { in: [cheapA, cheapB] } } });
      const lots = [await readLot(c, cheapA), await readLot(c, cheapB)];
      const checks: InvariantCheck[] = [
        checkEquals('40 cent pack: pack price in cents', 40, plans[0].plan.cents),
        checkEquals('75 cent pack: pack price in cents', 75, plans[1].plan.cents),
        checkEquals('75 cent pack: platform fee in cents (the floor)', MINIMUM_TRANSACTION_FEE_CENTS, fees[1].platformFeeCents),
        checkEquals('checkouts refused with BULK_PACK_TOO_CHEAP', 2, run.tally.refusalCodes.BULK_PACK_TOO_CHEAP ?? 0),
        checkEquals('checkouts that went through', 0, run.tally.succeeded),
        checkEquals('Square charge calls made', 0, track.chargeCalls),
        checkEquals('cash fee debt claimed (it is claimed only just before a charge)', 0, track.claimedCents),
        checkEquals('Purchase rows for the two lots', 0, dbPurchases),
        checkEquals('cards taken from the 40 cent lot', 0, lots[0].stockSold),
        checkEquals('cards taken from the 75 cent lot', 0, lots[1].stockSold),
        checkEquals('control: Square listing sees a payment made earlier in this run (so "none" below means something)', true, anchorSeen),
        checkEquals('payments Square lists for the two lots (reference id check)', 0, listedForP4),
        checkEquals('new payments with this run prefix for the two lots between the before and after listing', 0, diff.newOwn.length),
      ];
      return { tally: run.tally, checks, notes: [`Square listed ${before.length} payments before and ${after.length} after; ${diff.newTotal} new payment(s) appeared in the window, none for these lots.`] };
    }
  );
}

/** P5: a fresh real sale, then a partial and a full refund of it through the real refund service. */
async function scenarioRefundWinner(ctx: Ctx): Promise<ScenarioResult> {
  const name = 'P5 refund the winner: partial then full refund through executeVerifiedSquareRefund';
  const calls = [
    ...CALLS_CHECKOUT,
    'services/squareRefundService.ts:518 executeVerifiedSquareRefund (organizer token via resolveOrganizerSquareAccessToken, Square POST /v2/refunds, finalizeSquareRefundTx)',
    'services/bulkLot/bulkLotRefundService.ts:128 planExplicitCardRefund, :197 applyBulkRefundReturn (BulkLotRefund audit rows)',
    SQUARE_READS,
  ];
  let refundSvc: typeof import('../services/squareRefundService');
  try {
    refundSvc = await import('../services/squareRefundService');
  } catch (err) {
    return skippedScenario(name, `services/squareRefundService.ts could not be loaded in this process (${errText(err, ctx.secrets)}), so the real refund service was not exercised.`, calls);
  }
  return runScenario(
    ctx,
    name,
    calls,
    [
      'executeVerifiedSquareRefund does not return the Square refund id, so the refund ids are read from the Square payment (refundIds) and each is fetched with refunds.get.',
      'Cash fee debt is 0 for this scenario, so no debt is re-accrued by the refund.',
    ],
    async (c) => {
      const track = newTracker();
      await setDebt(c, 0);
      const itemId = await createLot(c, 'p5', { stockTotal: 3 * PACK_SIZE_CARDS, price: PRICE_DOLLARS_PER_THOUSAND });
      const email = `${c.prefix}_p5@example.com`;
      const token = `${c.prefix}-p5`;
      const run = await fireAll(c, [() => runPackPurchase(c, { itemId, email, clientToken: token, attempt: 'p5', packs: 1, track })]);
      const rows = await readPurchaseRows(c, { clientTransactionId: txnKeyFor(email, token) });
      const row = rows[0];
      const charge = track.charges[0];
      const checks: InvariantCheck[] = [
        checkEquals('checkouts answered RECORDED', 1, run.tally.succeeded),
        checkEquals('Purchase rows with this clientTransactionId in the database', 1, rows.length),
        checkEquals('Square charge calls made', 1, track.chargeCalls),
      ];
      if (!row || !charge) {
        checks.push(checkEquals('a Purchase and a Square payment exist to refund', true, false));
        return { tally: run.tally, checks };
      }
      const half = PACK_SIZE_CARDS / 2;
      const halfCents = expectedCentsForCards(row.amountCents, half, row.bulkQuantity);
      const aggRefunds = async () => {
        const a = await c.prisma.bulkLotRefund.aggregate({ where: { purchaseId: row.id }, _count: { _all: true }, _sum: { cardsReturned: true, cents: true } });
        return { rows: a._count._all as number, cards: (a._sum.cardsReturned ?? 0) as number, cents: (a._sum.cents ?? 0) as number };
      };
      const reread = async () => (await readPurchaseRows(c, { id: row.id }))[0];

      // Refund 1 of 2: half the cards, a partial refund.
      const r1 = await refundSvc.executeVerifiedSquareRefund(row.id, halfCents / 100, 'organizer', 'requested_by_customer', {
        bulkCards: half,
        source: 'ORGANIZER',
        actorUserId: c.organizerUserId,
        idempotencyKey: `${c.prefix}_p5_r1`,
      });
      const p1 = await reread();
      const lot1 = await readLot(c, itemId);
      const audit1 = await aggRefunds();
      checks.push(
        checkEquals('refund 1 (partial): isFullRefund', false, r1.isFullRefund),
        checkEquals('refund 1: cards returned reported', half, r1.bulkCardsReturned ?? null),
        checkEquals('refund 1: Purchase status (a partial refund leaves it PAID)', 'PAID', p1 ? p1.status : null),
        checkEquals('refund 1: Purchase refunded amount in cents', halfCents, p1 ? p1.refundedCents : null),
        checkEquals('refund 1: Purchase bulkRefundedQuantity', half, p1 ? p1.bulkRefundedQuantity : null),
        checkEquals('refund 1: cards still sold on the lot (Item.stockSold)', PACK_SIZE_CARDS - half, lot1.stockSold),
        checkEquals('refund 1: BulkLotRefund audit rows', 1, audit1.rows),
        checkEquals('refund 1: cards on the audit rows', half, audit1.cards),
        checkEquals('refund 1: cents on the audit rows', halfCents, audit1.cents)
      );
      checks.push(...(await squareSide(c, 'P5 payment after refund 1', charge, { cents: halfCents, count: 1, full: false })).checks);

      // Refund 2 of 2: the other half, which makes it a full refund.
      const restCents = row.amountCents - halfCents;
      const r2 = await refundSvc.executeVerifiedSquareRefund(row.id, restCents / 100, 'organizer', 'requested_by_customer', {
        bulkCards: half,
        source: 'ORGANIZER',
        actorUserId: c.organizerUserId,
        idempotencyKey: `${c.prefix}_p5_r2`,
      });
      const p2 = await reread();
      const lot2 = await readLot(c, itemId);
      const audit2 = await aggRefunds();
      checks.push(
        checkEquals('refund 2 (full): isFullRefund', true, r2.isFullRefund),
        checkEquals('refund 2: cards returned reported', half, r2.bulkCardsReturned ?? null),
        checkEquals('refund 2: Purchase status', 'REFUNDED', p2 ? p2.status : null),
        checkEquals('refund 2: Purchase refunded amount in cents (the whole sale)', row.amountCents, p2 ? p2.refundedCents : null),
        checkEquals('refund 2: Purchase bulkRefundedQuantity (all cards)', PACK_SIZE_CARDS, p2 ? p2.bulkRefundedQuantity : null),
        checkEquals('refund 2: cards still sold on the lot (Item.stockSold)', 0, lot2.stockSold),
        checkEquals('refund 2: BulkLotRefund audit rows', 2, audit2.rows),
        checkEquals('refund 2: cards on the audit rows', PACK_SIZE_CARDS, audit2.cards),
        checkEquals('refund 2: cents on the audit rows', row.amountCents, audit2.cents)
      );
      checks.push(...(await squareSide(c, 'P5 payment after refund 2', charge, { cents: row.amountCents, count: 2, full: true })).checks);
      checks.push(checkEquals('errors reported through captureError', 0, track.captured.length));
      return { tally: run.tally, checks };
    }
  );
}

// ---------------------------------------------------------------------------
// The app fee probe
// ---------------------------------------------------------------------------

export interface ProbeReport {
  mode: FeeMode;
  reason: string;
  probePaymentId: string | null;
  probeRefundId: string | null;
  probeRefundOk: boolean;
  note?: string;
}

/** One payment WITH an app fee through the real createSquareCharge, read back, then refunded with an SDK call (the harness's own, ids recorded). */
async function runFeeProbe(ctx: Ctx): Promise<ProbeReport> {
  const feeCents = MINIMUM_TRANSACTION_FEE_CENTS;
  const charge = await ctx.mods.squarePay.createSquareCharge({
    organizerAccessToken: ctx.accessToken,
    idempotencyKey: deriveIdempotencyKey(ctx.prefix, 'probe'),
    sourceId: SANDBOX_CARD_NONCE_OK,
    amountCents: EXPECTED_PACK_CENTS,
    appFeeCents: feeCents,
    locationId: ctx.locationId,
    referenceId: `${ctx.prefix}_probe`,
    note: `${ctx.prefix} app fee probe`,
  });
  if (!charge.ok) {
    const ev = evaluateFeeProbe({ chargeOk: false, errorCode: charge.code, expectedAppFeeCents: feeCents, readBackAppFeeCents: null });
    return { ...ev, probePaymentId: null, probeRefundId: null, probeRefundOk: true };
  }
  ctx.paymentIds.push(charge.paymentId);
  const payment = await readPayment(ctx, charge.paymentId);
  const ev = evaluateFeeProbe({ chargeOk: true, expectedAppFeeCents: feeCents, readBackAppFeeCents: payment.appFeeCents });
  let refundId: string | null = null;
  let refundOk = false;
  let note: string | undefined;
  try {
    const res: any = await ctx.client.refunds.refundPayment({
      idempotencyKey: deriveIdempotencyKey(ctx.prefix, 'probe-refund'),
      paymentId: charge.paymentId,
      amountMoney: { amount: BigInt(EXPECTED_PACK_CENTS), currency: 'USD' },
      reason: 'sandbox verification probe',
    } as any);
    refundId = res?.refund?.id ?? null;
    if (refundId) {
      ctx.refundIds.push(refundId);
      const [rf] = await readRefunds(ctx, [refundId]);
      refundOk = !!rf && rf.status !== null && ACCEPTED_REFUND_STATUSES.includes(rf.status) && rf.amountCents === EXPECTED_PACK_CENTS;
      if (!refundOk) note = `the probe refund read back as status ${rf ? rf.status : 'missing'}, amount ${rf ? rf.amountCents : 'none'}`;
    } else {
      note = 'Square answered the probe refund without a refund id';
    }
  } catch (err) {
    note = `the probe refund failed: ${errText(err, ctx.secrets)}`;
  }
  return { ...ev, probePaymentId: charge.paymentId, probeRefundId: refundId, probeRefundOk: refundOk, ...(note ? { note } : {}) };
}

// ---------------------------------------------------------------------------
// Console and cleanup
// ---------------------------------------------------------------------------

/** Console text with the listed secrets, postgres URLs, Bearer text and Square token shapes removed. Layout is kept. Pure. */
export function scrubConsoleText(text: string, secrets: ReadonlyArray<string>): string {
  let out = scrubText(text, secrets);
  out = out.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]');
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]');
  out = out.replace(/\bEAA[A-Za-z0-9_-]{16,}/g, '[redacted-token]');
  out = out.replace(/\bsq0[a-z]{3}-[A-Za-z0-9_-]{8,}/gi, '[redacted-token]');
  return out;
}

/**
 * Sends every console call (log, info, warn, error, debug) to stderr through scrubConsoleText for the rest of the run, so a service that
 * logs an error object can never print the token, and its console.log can never end up in the JSON on stdout. Returns the restore function.
 */
export function installConsoleScrubber(secrets: ReadonlyArray<string>): () => void {
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  const write = (args: unknown[]) => {
    process.stderr.write(`${scrubConsoleText(format(...(args as [unknown, ...unknown[]])), secrets)}\n`);
  };
  console.log = (...args: unknown[]) => write(args);
  console.info = (...args: unknown[]) => write(args);
  console.warn = (...args: unknown[]) => write(args);
  console.error = (...args: unknown[]) => write(args);
  console.debug = (...args: unknown[]) => write(args);
  return () => {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    console.debug = original.debug;
  };
}

export interface CleanupReport {
  ok: boolean;
  deleted: Record<string, number>;
  leftover: Record<string, number>;
  errors: string[];
}

async function idsByItem(delegate: any, itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const rows: Array<{ id: string }> = await delegate.findMany({ where: { itemId: { in: itemIds } }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function deleteByIds(delegate: any, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await delegate.deleteMany({ where: { id: { in: ids } } });
  return res.count;
}

/** Deletes only the rows this run created, by id, children first, then counts what is left. Square payments are not deletable. */
async function cleanup(prisma: Db, prefix: string, reg: Registry, secrets: string[]): Promise<CleanupReport> {
  const report: CleanupReport = { ok: true, deleted: {}, leftover: {}, errors: [] };
  const itemIds = onlyOwnedIds(prefix, reg.itemIds);
  const saleIds = onlyOwnedIds(prefix, reg.saleIds);
  const organizerIds = onlyOwnedIds(prefix, reg.organizerIds);
  const userIds = onlyOwnedIds(prefix, reg.userIds);
  const step = async (label: string, fn: () => Promise<number>) => {
    try {
      report.deleted[label] = await fn();
    } catch (err) {
      report.ok = false;
      report.errors.push(`${label}: ${errText(err, secrets)}`);
    }
  };
  await step('bulkLotRefund', async () => deleteByIds(prisma.bulkLotRefund, await idsByItem(prisma.bulkLotRefund, itemIds)));
  await step('purchase', async () => deleteByIds(prisma.purchase, await idsByItem(prisma.purchase, itemIds)));
  await step('itemBulkLot', async () => deleteByIds(prisma.itemBulkLot, await idsByItem(prisma.itemBulkLot, itemIds)));
  await step('item', async () => deleteByIds(prisma.item, itemIds));
  await step('sale', async () => deleteByIds(prisma.sale, saleIds));
  await step('organizer', async () => deleteByIds(prisma.organizer, organizerIds));
  await step('user', async () => deleteByIds(prisma.user, userIds));

  const count = async (label: string, fn: () => Promise<number>) => {
    try {
      report.leftover[label] = await fn();
      if (report.leftover[label] > 0) report.ok = false;
    } catch (err) {
      report.ok = false;
      report.errors.push(`leftover ${label}: ${errText(err, secrets)}`);
    }
  };
  const byItem = { itemId: { in: itemIds } };
  await count('bulkLotRefund', () => prisma.bulkLotRefund.count({ where: byItem }));
  await count('purchase', () => prisma.purchase.count({ where: byItem }));
  await count('itemBulkLot', () => prisma.itemBulkLot.count({ where: byItem }));
  await count('item', () => prisma.item.count({ where: { id: { in: itemIds } } }));
  await count('sale', () => prisma.sale.count({ where: { id: { in: saleIds } } }));
  await count('organizer', () => prisma.organizer.count({ where: { id: { in: organizerIds } } }));
  await count('user', () => prisma.user.count({ where: { id: { in: userIds } } }));
  return report;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function printSummary(results: ScenarioResult[]): void {
  console.error('');
  console.error('Summary');
  for (const r of results) {
    const head = r.status === 'PASSED' ? 'PASS' : r.status === 'SKIPPED' ? 'SKIP' : 'FAIL';
    console.error(`  ${head}  ${r.name}`);
    if (r.status === 'SKIPPED') {
      console.error(`        skipped: ${r.skipReason}`);
      continue;
    }
    console.error(`        attempts ${r.attempts}, succeeded ${r.succeeded}, expected refusals ${r.failedWithExpectedRefusal}, unexpected errors ${r.failedUnexpected.length}, ${r.durationMs} ms`);
    if (r.error) console.error(`        scenario error: ${r.error}`);
    for (const f of r.failedUnexpected.slice(0, 3)) console.error(`        unexpected: ${f.message}`);
    for (const ck of r.invariantChecks.filter((x) => !x.pass)) console.error(`        FAILED CHECK: ${ck.name}: expected ${ck.expected}, actual ${ck.actual}`);
  }
}

async function loadModules(): Promise<Mods> {
  // Sequential on purpose: tokenCrypto reads SOCIAL_TOKEN_ENC_KEY when it loads, and lib/prisma reads DATABASE_URL.
  const tokenCrypto = await import('../utils/tokenCrypto');
  const stock = await import('../services/itemStockService');
  const squareUtil = await import('../utils/square');
  const squarePay = await import('../services/squarePaymentService');
  const oversold = await import('../services/oversoldPaymentRefundService');
  const cashFee = await import('../services/cashFeeService');
  return { stock, squareUtil, squarePay, oversold, cashFee, tokenCrypto };
}

const refuse = (reason: string): number => {
  console.error(`REFUSED to start: ${reason}`);
  console.error('Nothing was sent to Square and nothing was written to a database. See the header of this file.');
  return REFUSAL_EXIT;
};

/**
 * Returns the process exit code: 0 all five scenarios passed and the cleanup is clean, 1 a scenario failed or was skipped, the cleanup
 * left rows, or Square or the database was not usable, 2 refused to start (nothing was sent to Square).
 * `env` is injectable only so a test can reach the refusals; once every guard passes, anything but the real process.env is refused
 * too, so a test can never reach Square.
 */
export async function runSandboxVerification(env: EnvLike = process.env): Promise<number> {
  const db = checkScratchDatabaseUrl(env.DATABASE_URL);
  if (!db.ok) return refuse(db.reason);
  const sqEnv = checkSquareEnvironment(env.SQUARE_ENVIRONMENT);
  if (!sqEnv.ok) return refuse(sqEnv.reason);
  const cfg = readVerifyConfig(env);
  if (!cfg.ok) return refuse(cfg.reason);
  if (env !== process.env) return refuse('the run only uses the real process environment (this call was given another one).');

  const jsonSecrets = [...tokenSecrets(cfg.accessToken), db.url];
  const restoreConsole = installConsoleScrubber(jsonSecrets);
  try {
    return await runChecked(db, cfg, jsonSecrets);
  } finally {
    restoreConsole();
  }
}

async function runChecked(db: Extract<ReturnType<typeof checkScratchDatabaseUrl>, { ok: true }>, cfg: { accessToken: string; locationId: string }, jsonSecrets: string[]): Promise<number> {
  const secrets = [...tokenSecrets(cfg.accessToken), ...secretsOf(db.url)];
  // Set before any service module loads: lib/prisma reads DATABASE_URL, tokenCrypto reads its key. The key is a throwaway for this process only.
  process.env.DATABASE_URL = db.url;
  process.env.SOCIAL_TOKEN_ENC_KEY = crypto.randomBytes(32).toString('hex');

  const prefix = makeSandboxRunPrefix(Date.now());
  const startedAt = new Date();
  const reg: Registry = { userIds: [], organizerIds: [], saleIds: [], itemIds: [] };
  const paymentIds: string[] = [];
  const refundIds: string[] = [];
  const results: ScenarioResult[] = [];
  let setupError: string | null = null;
  let refused: string | null = null;
  let cleanupReport: CleanupReport = { ok: true, deleted: {}, leftover: {}, errors: [] };
  let apiHost: string | null = null;
  let square: Record<string, unknown> = {};
  let probe: ProbeReport | null = null;
  let feeMode: FeeMode | null = null;

  const { PrismaClient } = await import('@prisma/client');
  const prisma: Db = new PrismaClient({ datasources: { db: { url: withPoolParams(db.url, TX_POOL, 60) } }, log: [] });
  try {
    const who: Array<{ name: string; lot_table: string | null; refund_table: string | null }> = await prisma.$queryRaw`
      SELECT current_database() AS name, to_regclass('"ItemBulkLot"')::text AS lot_table, to_regclass('"BulkLotRefund"')::text AS refund_table
    `;
    if (!who[0] || who[0].name !== db.database) {
      refused = `the server reports a different database than the one named in DATABASE_URL (${db.database}).`;
    } else if (!who[0].lot_table || !who[0].refund_table) {
      setupError = 'The scratch database is not migrated (the ItemBulkLot or BulkLotRefund table is missing). Run prisma migrate deploy against it first (see the header of verifyBulkLotConcurrency.ts).';
    } else {
      console.error(`Scratch database ${db.database} on ${db.host}:${db.port}, run ${prefix}.`);
      const mods = await loadModules();
      // The client the real charge and refund code builds (utils/square.ts:71-81). Its environment is checked on the object, before any Square call.
      const client = mods.squareUtil.getSquareClientForMerchant(cfg.accessToken);
      const sandbox = assertSandboxClient(client);
      if (!sandbox.ok) {
        refused = sandbox.reason;
      } else {
        apiHost = sandbox.host;
        console.error(`Square client verified: ${sandbox.baseUrl} (host ${sandbox.host}).`);

        // Square preflight: the location must exist for this token, be active and be in USD.
        const locRes: any = await client.locations.get({ locationId: cfg.locationId });
        const location = locRes?.location;
        if (!location || location.id !== cfg.locationId) throw new Error(`Square did not return the location named in ${LOCATION_ENV_NAME}.`);
        if (location.status !== 'ACTIVE') throw new Error(`The Square location is not ACTIVE (status ${location.status}).`);
        if (location.currency !== 'USD') throw new Error(`The Square location currency is ${location.currency}, not USD.`);
        if (typeof location.merchantId !== 'string' || location.merchantId === '') throw new Error('Square returned no merchant id for the location.');
        const merchantId: string = location.merchantId;
        let oauth: Record<string, unknown>;
        try {
          const ts: any = await client.oAuth.retrieveTokenStatus();
          const scopes: string[] = Array.isArray(ts?.scopes) ? ts.scopes.filter((s: unknown): s is string => typeof s === 'string') : [];
          oauth = { available: true, scopes, hasAdditionalRecipientsScope: scopes.includes('PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS'), expiresAt: ts?.expiresAt ?? null, merchantMatchesLocation: ts?.merchantId === merchantId };
        } catch (err) {
          oauth = { available: false, note: `RetrieveTokenStatus did not answer for this token (a personal access token is not an OAuth token): ${errText(err, secrets)}` };
        }
        square = { environment: 'sandbox', apiHost, locationId: cfg.locationId, merchantId, locationStatus: location.status, currency: location.currency, oauthTokenStatus: oauth };

        // Fixtures. Every id starts with the run prefix and is registered before the insert.
        const organizerUserId = `${prefix}_user_org`;
        reg.userIds.push(organizerUserId);
        await prisma.user.create({ data: { id: organizerUserId, email: `${organizerUserId}@example.com`, name: 'Sandbox Verify Organizer' } });
        const organizerId = `${prefix}_organizer`;
        reg.organizerIds.push(organizerId);
        await prisma.organizer.create({
          data: {
            id: organizerId,
            businessName: `${prefix} shop`,
            address: '1 Test Street, Paw Paw, MI 49079',
            userId: organizerUserId,
            squareMerchantId: merchantId,
            squareOnboarded: true,
            squareLocationId: cfg.locationId,
            squareAccessTokenEncrypted: mods.tokenCrypto.encryptToken(cfg.accessToken),
          },
        });
        const saleId = `${prefix}_sale`;
        reg.saleIds.push(saleId);
        await prisma.sale.create({
          data: {
            id: saleId,
            title: `${prefix} sale`,
            startDate: new Date(),
            endDate: new Date(Date.now() + 86_400_000),
            address: '1 Test Street',
            city: 'Paw Paw',
            state: 'MI',
            zip: '49079',
            organizerId,
          },
        });
        const resolved = await mods.squarePay.resolveOrganizerSquareAccessToken({ id: organizerId, squareMerchantId: merchantId, squareOnboarded: true });
        if (resolved !== cfg.accessToken) throw new Error('the real token resolve path did not return the supplied token (the encrypt and decrypt round trip failed).');
        const ctx: Ctx = {
          prisma,
          mods,
          client,
          accessToken: cfg.accessToken,
          locationId: cfg.locationId,
          merchantId,
          secrets,
          prefix,
          reg,
          organizerId,
          organizerUserId,
          saleId,
          feeMode: 'NO_APP_FEE',
          startedAt,
          paymentIds,
          refundIds,
        };

        probe = await runFeeProbe(ctx);
        ctx.feeMode = probe.mode;
        feeMode = probe.mode;
        console.error(`Fee mode ${probe.mode}: ${probe.reason}`);

        results.push(await scenarioHappyPath(ctx));
        results.push(await scenarioDuplicateClick(ctx));
        results.push(await scenarioLostRace(ctx));
        results.push(await scenarioTooCheap(ctx));
        results.push(await scenarioRefundWinner(ctx));
      }
    }
  } catch (err) {
    setupError = errText(err, secrets);
    console.error(`Setup or scenario run failed: ${setupError}`);
  } finally {
    if (reg.userIds.length + reg.organizerIds.length + reg.saleIds.length + reg.itemIds.length > 0) cleanupReport = await cleanup(prisma, prefix, reg, secrets);
    await prisma.$disconnect().catch(() => undefined);
    try {
      const shared = await import('../lib/prisma');
      await shared.prisma.$disconnect();
    } catch {
      // the shared client was never loaded or is already closed
    }
  }

  if (refused) return refuse(refused);

  printSummary(results);
  console.error('');
  console.error(`Cleanup: ${cleanupReport.ok ? 'clean, no fixture rows left' : 'PROBLEM, see the cleanup section of the report'}`);
  const summary = summarizeResults(results);
  const code = setupError ? 1 : sandboxExitCode(results, cleanupReport.ok);
  console.error(`Result: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped, ${SCENARIO_COUNT - results.length} not run. Exit code ${code}.`);
  console.error(`Square payments created: ${paymentIds.length}, refunds: ${refundIds.length}. They stay in the sandbox account (reference ids start with ${prefix}).`);
  const report = {
    generatedAt: new Date().toISOString(),
    runPrefix: prefix,
    database: { host: db.host, port: db.port, name: db.database },
    square,
    feeMode,
    feeProbe: probe,
    node: process.version,
    summary,
    scenarios: results,
    squarePaymentIds: paymentIds,
    squareRefundIds: refundIds,
    cleanup: cleanupReport,
    ...(setupError ? { setupError } : {}),
    notProven: buildNotProven(feeMode ?? 'NO_APP_FEE'),
    pass: code === 0,
  };
  process.stdout.write(`${scrubText(JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2), jsonSecrets)}\n`);
  return code;
}

if (require.main === module) {
  runSandboxVerification()
    .then((code) => {
      process.stdout.write('', () => process.exit(code));
    })
    .catch((err) => {
      const secrets = [...tokenSecrets(process.env[TOKEN_ENV_NAME]), ...secretsOf(process.env.DATABASE_URL)];
      process.stderr.write(`verifyBulkLotPackSquareSandbox failed: ${redactSquareSecrets(err instanceof Error ? err.message : String(err), secrets)}\n`);
      process.stdout.write('', () => process.exit(1));
    });
}
