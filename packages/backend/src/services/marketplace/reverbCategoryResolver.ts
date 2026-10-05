/**
 * reverbCategoryResolver.ts -- picks ONE Reverb sub-category (a leaf below one of the 14 top-level
 * categories) for a FindA.Sale item (S-REVERB-SUBCATEGORY, 2026-10-05). Pure TypeScript: no imports beyond
 * config/reverbCategoryTree.ts, no I/O, no env, no network. BACKEND ONLY.
 *
 * WHY: reverbConnector.ts picked a top-level bucket from 15 keyword rules and stopped there, so an
 * electric guitar landed in "Electric Guitars" and a guitar combo amp in "Amps" with no sub-category.
 * This resolver names the leaf (e.g. amps/Guitar Amps/guitar-combos) when the item text says so
 * unambiguously, and returns null otherwise. reverbConnector.ts then finds that leaf's UUID in the live
 * /categories/flat list it already fetches; on any miss the request it sends is unchanged.
 *
 * PRINCIPLE: a wrong sub-category published silently is worse than none. So:
 *   - The leaf must sit under the top-level category the connector already chose (topLevelName). This
 *     function never moves an item to a different top-level category.
 *   - Layer 1 CURATED_ID: eBay numeric category id -> leaf, for the instrument categories seen in
 *     production. Layer 2 RULE: ordered whole-word keyword rules over title + brand + eBay category text.
 *   - Rules do NOT stop at the first hit. Every matching rule must name the SAME leaf; two different
 *     leaves ("12 string" + "left handed", "acoustic electric" + "dreadnought", "bass" + "pedal") is
 *     ambiguity and returns null. A rule with a null target is a deliberate blank and returns null.
 *   - Specific-before-generic is expressed with `none` guards on the generic rule (e.g. the guitar combo
 *     rule excludes "bass", "modeling", "practice", "cabinet", "head", "stack").
 *   - Accessory and bundle words ("strap", "cable", "with amp") block the guitar-body leaves.
 *   - The description is read in one place only: a veto when ONLY the description says the guitar is
 *     acoustic-electric. It never selects a leaf.
 * Text is normalised first (lower case, accents folded, "&" -> "and", every other non-alphanumeric run
 * -> one space), so "12-string", "Semi-Hollow" and "hi-hat" arrive as "12 string", "semi hollow", "hi hat".
 * Phrases like "with carrying case" are stripped before matching, so a bundled case does not make the item
 * look like a case.
 *
 * Pattern syntax (same as vintedCategoryMap.ts): a body wrapped in \b(?:...)\b. Optional prefix
 * "cat:" (eBay category name + breadcrumb only), "title:" (title + brand only) or "desc:" (description
 * only); no prefix = title or category text.
 */
import {
  REVERB_TOP_LEVEL_NAMES,
  isReverbLeaf,
  reverbPathTitles,
  reverbTopSlug,
  reverbTopSlugForName,
} from '../../config/reverbCategoryTree';

export type ReverbSubcategorySource = 'RULE' | 'CURATED_ID';

export interface ReverbSubcategoryInput {
  /** The top-level category reverbConnector.ts already chose, e.g. "Electric Guitars". */
  topLevelName?: string | null;
  ebayCategoryId?: string | number | null;
  ebayCategoryName?: string | null;
  /** Item.category: a plain name or an eBay colon breadcrumb. */
  categoryBreadcrumb?: string | null;
  title?: string | null;
  description?: string | null;
  brand?: string | null;
}

export interface ReverbSubcategoryResult {
  /** Full tree id of the leaf, e.g. "amps/Guitar Amps/guitar-combos". Always exists in reverbCategoryTree.ts. */
  slug: string;
  /** Titles from the top-level category down to the leaf. */
  path: string[];
  /** "Amps > Guitar Amps > guitar-combos" */
  pathText: string;
  source: ReverbSubcategorySource;
}

export interface ReverbSubcategoryExplanation {
  result: ReverbSubcategoryResult | null;
  stage: 'curated' | 'rule' | 'blank' | 'ambiguous' | 'none';
  /** Rule id(s) / eBay id that decided it. */
  detail: string;
  /** Why the answer is null (empty when there is a result). */
  reason: string;
}

// ---------------------------------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------------------------------

export function normalizeReverbText(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).replace(/&amp;/gi, '&').replace(/&#0?39;|&apos;/gi, "'");
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  s = s.replace(/['\u2019\u2018`]/g, '').replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** "with a hard shell case", "and strap", "includes gig bag" -> removed, so a bundled accessory is not the item. */
const BUNDLE_PHRASE = new RegExp(
  '\\b(?:with|w|includes?|including|plus|and|comes with|free)\\s+(?:(?:an?|the|original|hard ?shell|hardshell|hard|soft|gig|carrying|carry|padded|deluxe|nice|protective|travel|molded)\\s+){0,3}(?:cases?|gig bags?|bags?|straps?|cables?|cords?|picks?|stands?|tuners?|capos?|covers?)\\b',
  'g'
);

/**
 * S-REVERB-CASE-TOPLEVEL (2026-10-05). The title with every BUNDLED extra removed, normalised: "with hard case",
 * "w/ case", "includes gig bag", "and strap" (the BUNDLE_PHRASE above) plus the separators it does not see
 * ("+", ",", ";" are read as "and") plus "in a case" / "case included". Pure; null-safe.
 */
const BUNDLE_IN_CASE = /\b(?:in|inside)\s+(?:(?:an?|the|original|hard ?shell|hardshell|hard|soft|gig|carrying|carry|padded|protective|travel|molded)\s+){0,3}(?:cases?|gig bags?|bags?)\b/g;
const BUNDLE_CASE_INCLUDED = /\b(?:(?:an?|the|original|hard ?shell|hardshell|hard|soft|gig|carrying|carry|padded|protective|travel|molded)\s+){0,3}(?:cases?|gig bags?|bags?)\s+(?:included|incl|too)\b/g;

export function stripReverbBundledAccessories(raw: string | null | undefined): string {
  const text = normalizeReverbText(String(raw || '').replace(/[+,;]/g, ' and '));
  return text
    .replace(BUNDLE_PHRASE, ' ')
    .replace(BUNDLE_IN_CASE, ' ')
    .replace(BUNDLE_CASE_INCLUDED, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the title's product IS a case / gig bag / carrying bag (the case-word survives bundle stripping):
 * "Road Runner guitar/bass hardshell case", "Guitar gig bag", "Soft case for electric guitar". False for a
 * bundled extra ("Strat electric guitar with hard case", "Les Paul + case", "bass guitar includes gig bag").
 * Says nothing about WHICH instrument the case is for; that is the sub-category resolver's job.
 */
export function isReverbCaseItself(title: string | null | undefined): boolean {
  return /\b(?:cases?|gig ?bags?|bags?)\b/.test(stripReverbBundledAccessories(title));
}

interface Prepared {
  cat: string;
  title: string;
  desc: string;
}

function prepare(input: ReverbSubcategoryInput): Prepared {
  const catName = normalizeReverbText(input.ebayCategoryName);
  const crumb = normalizeReverbText(input.categoryBreadcrumb);
  const cat = catName && crumb && crumb.indexOf(catName) === -1 ? catName + ' ' + crumb : catName || crumb;
  const rawTitle = normalizeReverbText((input.title || '') + ' ' + (input.brand || ''));
  const title = rawTitle.replace(BUNDLE_PHRASE, ' ').replace(/\s+/g, ' ').trim();
  const desc = normalizeReverbText(String(input.description || '').slice(0, 1500));
  return { cat, title, desc };
}

// ---------------------------------------------------------------------------------------------------
// Pattern compilation (cached)
// ---------------------------------------------------------------------------------------------------

type PatternScope = 'both' | 'cat' | 'title' | 'desc';
interface CompiledPattern { re: RegExp; scope: PatternScope }
const PATTERN_CACHE = new Map<string, CompiledPattern>();

function compilePattern(p: string): CompiledPattern {
  const hit = PATTERN_CACHE.get(p);
  if (hit) return hit;
  let scope: PatternScope = 'both';
  let body = p;
  if (p.indexOf('cat:') === 0) { scope = 'cat'; body = p.slice(4); }
  else if (p.indexOf('title:') === 0) { scope = 'title'; body = p.slice(6); }
  else if (p.indexOf('desc:') === 0) { scope = 'desc'; body = p.slice(5); }
  const compiled: CompiledPattern = { re: new RegExp('\\b(?:' + body + ')\\b'), scope };
  PATTERN_CACHE.set(p, compiled);
  return compiled;
}

function patternMatches(p: string, t: Prepared): boolean {
  const c = compilePattern(p);
  if (c.scope === 'cat') return c.re.test(t.cat);
  if (c.scope === 'title') return c.re.test(t.title);
  if (c.scope === 'desc') return c.re.test(t.desc);
  return c.re.test(t.cat) || c.re.test(t.title);
}

// ---------------------------------------------------------------------------------------------------
// Layer 1: curated eBay category ids (instrument categories seen in production exports)
// ---------------------------------------------------------------------------------------------------

export type CuratedTarget = string | null;
export type CuratedEntry = CuratedTarget | { split: Array<[string, CuratedTarget]>; fallback?: CuratedTarget };

/**
 * eBay numeric category id -> Reverb leaf id (full tree path). Only categories whose eBay meaning fixes the
 * Reverb leaf are listed. Guitar and amp families (33021 Acoustic Guitars, 33034 Electric Guitars, 4713
 * Bass Guitars, 38072 Guitar Amplifiers, 22669 Other Guitar Effects Pedals, 29948 Stands) deliberately have
 * NO entry: the eBay category alone does not pick a Reverb leaf, so the title rules decide.
 * A split lists [pattern, target] pairs: exactly one distinct target must match; two different targets is
 * ambiguity (null); no match uses `fallback` when present, else the rule layer decides.
 * Curated ids that name a leaf under a different top-level category than the connector chose are ignored.
 */
export const REVERB_CURATED_BY_EBAY_ID: Record<string, CuratedEntry> = {
  '16224': 'folk-instruments/ukuleles', // Ukuleles
  '46677': { split: [['straps?', 'accessories/straps']] }, // Straps (guitar straps)
  '22672': { split: [['tuners?', 'accessories/tuners']] }, // Tuners
  '22670': {
    split: [
      ['title:acoustic|soundhole|sound hole|clip on|piezo|undersaddle|under saddle|transducer', 'parts/acoustic-pickups'],
      ['title:bass', 'parts/bass-pickups'],
      ['title:humbuckers?|single coils?|p ?90|strat|stratocaster|tele|telecaster|les paul|electric', 'parts/guitar-pickups'],
    ],
  }, // Pickups
  '41419': 'effects-and-pedals/multi-effect-unit', // Multi-Effects
  '41459': { split: [['title:adapters?|adaptors?|splitters?|snakes?|breakout|stage box|y cable', null]], fallback: 'accessories/cables' }, // Cables, Snakes & Interconnects
  '47075': 'accessories/cables', // Cables & Leads (instrument cables)
  '14964': { split: [['title:usb|hdmi|optical|adapters?|splitters?', null]], fallback: 'accessories/cables' }, // Audio Cables & Interconnects
  '21766': 'accessories/cables', // MIDI cables
  '47091': { split: [['studio monitors?', 'pro-audio/Speakers/studio-monitors']] }, // Speakers (studio monitors only)
  '29946': { split: [['title:wireless|receivers?|transmitters?|cables?|stands?|clips?', null]], fallback: 'pro-audio/microphones' }, // Microphones & Wireless Systems
  '41408': {
    split: [
      ['title:gig bags?|soft cases?|soft', null],
      ['title:bass', 'accessories/Cases and Gig Bags/bass-cases'],
      ['title:guitar|acoustic|electric', 'accessories/Cases and Gig Bags/guitar-cases'],
    ],
  }, // Cases (hard cases)
};

// ---------------------------------------------------------------------------------------------------
// Layer 2: rules
// ---------------------------------------------------------------------------------------------------

export interface ReverbRule {
  id: string;
  /** Top-level slug the rule applies to. */
  top: string;
  all: string[];
  none: string[];
  /** Full leaf id, or null = deliberate blank (stops everything, returns null). */
  target: string | null;
}

function r(id: string, top: string, all: string[], none: string[], target: string | null): ReverbRule {
  return { id, top, all, none, target };
}

/** Words that mean the item is an accessory, part or bundle rather than the guitar itself. */
const GUITAR_ACCESSORY_WORDS =
  'straps?|strap locks?|cases?|gig bags?|bags?|guitar strings|bass strings|strings? sets?|picks?|capos?|tuners?|cables?|cords?|stands?|pickups?|humbuckers?|bridges?|tuning pegs?|machine heads?|pickguards?|slides?|humidifiers?|hangers?|wall mounts?|lessons?|books?|dvds?|amps?|amplifiers?|pedals?(?! steel)|effects?|necks?|bodies|body only|parts?|replacement|covers?|polish|cleaners?|stickers?|decals?|posters?|toys?|figurines?|ornaments?|keychains?|miniatures?';

/** Words that mean an instrument is an accessory or souvenir, for the folk / wind / brass / string instrument rules. */
const INSTRUMENT_ACCESSORY_WORDS =
  'cases?|bags?|gig bags?|stands?|straps?|mouthpieces?|reeds?|bows?|rosin|mutes?|covers?|books?|dvds?|posters?|figurines?|statues?|ornaments?|lamps?|toys?|stickers?|decals?|cleaning|swabs?|polish|cleaners?|oils?|lessons?|songbooks?|sheet music|replacement|parts?|capos?|tuners?|picks?|pickups?|cables?|cords?|strings? sets?|replacement strings?|new strings?|extra strings?|ligatures?|key chains?|keychains?|miniatures?|(?:ukulele|ukelele|uke|mandolin|banjo|violin|viola|cello|guitar|bass) strings?|strings? for';

const AMP_WITH_PHRASE = 'with .*\\b(?:amps?|amplifiers?|heads?|combos?)';

/** Amp form factors (mutually exclusive) and variants, as pattern bodies. */
const AMP_FORM: Record<string, string> = {
  combo: 'combos?',
  head: 'heads?',
  cab: 'cabs?|cabinets?',
  stack: 'half stacks?|full stacks?|amp stacks?|stacks?',
  preamp: 'preamps?',
  power: 'power amps?|power amplifiers?',
  headphone: 'headphones?|headphone amps?|amplug',
  attenuator: 'attenuators?',
};
const AMP_VARIANT: Record<string, string> = {
  modeling: 'model(?:l)?ing',
  small: 'practice|mini|micro|desktop|battery|portable',
  acoustic: 'acoustic',
  keyboard: 'keyboard',
  drum: '(?:electronic|e|digital) drum',
};
/** Every pattern in `group` except `self`. */
function ampNone(self: string, group: Record<string, string>): string[] {
  return Object.keys(group).filter((k) => k !== self).map((k) => group[k]);
}

export const REVERB_RULES: ReverbRule[] = [
  // ---- guitar bodies: accessory / bundle guard (blank) --------------------------------------------
  r('guard-acoustic-accessory', 'acoustic-guitars', ['title:' + GUITAR_ACCESSORY_WORDS], [], null),
  r('guard-electric-accessory', 'electric-guitars', ['title:' + GUITAR_ACCESSORY_WORDS], [], null),
  r('guard-bass-accessory', 'bass-guitars', ['title:' + GUITAR_ACCESSORY_WORDS], [], null),
  // acoustic-electric flagged only in the description: the title alone may be a plain acoustic leaf, so do not pick one
  r('acoustic-electric-desc-only', 'acoustic-guitars', ['desc:acoustic electric|electro acoustic|built in electronics|onboard preamp|onboard electronics'], ['title:acoustic electric|electro acoustic|built in electronics'], null),

  // ---- acoustic guitars ---------------------------------------------------------------------------
  r('acoustic-built-in-electronics', 'acoustic-guitars', ['acoustic electric|electro acoustic|acoustic with electronics|built in electronics'], [], 'acoustic-guitars/built-in-electronics'),
  r('acoustic-dreadnought', 'acoustic-guitars', ['dreadnoughts?'], [], 'acoustic-guitars/dreadnought'),
  r('acoustic-jumbo', 'acoustic-guitars', ['jumbo'], ['jumbo frets?|jumbo fret wire'], 'acoustic-guitars/jumbo'),
  r('acoustic-parlor', 'acoustic-guitars', ['parlou?r'], [], 'acoustic-guitars/parlor'),
  r('acoustic-concert', 'acoustic-guitars', ['concert (?:size|body|shape|cutaway)|grand concert'], [], 'acoustic-guitars/concert'),
  r('acoustic-om-auditorium', 'acoustic-guitars', ['auditorium|orchestra model|om'], [], 'acoustic-guitars/om-and-auditorium'),
  r('acoustic-archtop', 'acoustic-guitars', ['archtops?|arch tops?'], [], 'acoustic-guitars/archtop'),
  r('acoustic-resonator', 'acoustic-guitars', ['resonators?|dobro'], ['lap steel'], 'acoustic-guitars/resonator'),
  r('acoustic-classical', 'acoustic-guitars', ['classical'], ['electric|electro|pickups?|electronics'], 'acoustic-guitars/classical'),
  r('acoustic-12-string', 'acoustic-guitars', ['12 strings?|twelve strings?'], [], 'acoustic-guitars/12-string'),
  r('acoustic-baritone', 'acoustic-guitars', ['baritone'], [], 'acoustic-guitars/baritone'),
  r('acoustic-tenor', 'acoustic-guitars', ['tenor guitars?|tenor acoustic'], [], 'acoustic-guitars/tenor'),
  r('acoustic-left-handed', 'acoustic-guitars', ['left handed|lefty|left hand'], [], 'acoustic-guitars/left-handed'),
  r('acoustic-mini-travel', 'acoustic-guitars', ['travel (?:size )?(?:acoustic )?guitars?|mini (?:acoustic )?guitars?|backpacker|baby taylor|little martin|travel size'], [], 'acoustic-guitars/mini-slash-travel'),

  // ---- electric guitars ---------------------------------------------------------------------------
  r('electric-lap-steel', 'electric-guitars', ['lap steels?'], [], 'electric-guitars/lap-steel'),
  r('electric-pedal-steel', 'electric-guitars', ['pedal steels?'], [], 'electric-guitars/pedal-steel'),
  r('electric-semi-hollow', 'electric-guitars', ['semi hollow(?: body)?|semihollow|semi acoustic|thinline'], [], 'electric-guitars/semi-hollow'),
  r('electric-hollow-body', 'electric-guitars', ['hollow ?body|hollowbody'], ['semi'], 'electric-guitars/hollow-body'),
  r('electric-solid-body', 'electric-guitars', ['solid ?body|solidbody|stratocasters?|telecasters?|strats?|teles?|les pauls?|flying v|jazzmasters?|firebird|superstrat|super strat'], ['bass'], 'electric-guitars/solid-body'),
  r('electric-archtop', 'electric-guitars', ['archtops?|arch tops?'], [], 'electric-guitars/archtop'),
  r('electric-12-string', 'electric-guitars', ['12 strings?|twelve strings?'], [], 'electric-guitars/12-string'),
  r('electric-baritone', 'electric-guitars', ['baritone'], [], 'electric-guitars/baritone'),
  r('electric-tenor', 'electric-guitars', ['tenor guitars?'], [], 'electric-guitars/tenor'),
  r('electric-left-handed', 'electric-guitars', ['left handed|lefty|left hand'], [], 'electric-guitars/left-handed'),
  r('electric-travel-mini', 'electric-guitars', ['travel (?:size )?(?:electric )?guitars?|mini (?:electric )?guitars?'], [], 'electric-guitars/travel-slash-mini'),

  // ---- bass guitars -------------------------------------------------------------------------------
  r('bass-acoustic', 'bass-guitars', ['acoustic bass(?: guitars?)?|acoustic electric bass'], [], 'bass-guitars/acoustic-bass-guitars'),
  r('bass-fretless', 'bass-guitars', ['fretless'], [], 'bass-guitars/fretless'),
  r('bass-short-scale', 'bass-guitars', ['short scale|shortscale'], [], 'bass-guitars/short-scale'),
  r('bass-5-string-or-more', 'bass-guitars', ['5 strings?|five strings?|6 strings?|six strings?|7 strings?'], [], 'bass-guitars/5-string-or-more'),
  r('bass-4-string', 'bass-guitars', ['4 strings?|four strings?'], [], 'bass-guitars/4-string'),
  r('bass-left-handed', 'bass-guitars', ['left handed|lefty|left hand'], [], 'bass-guitars/left-handed'),

  // ---- amps ----------------------------------------------------------------------------------------
  // Form factors (combo/head/cabinet/stack/preamp/power amp/headphone amp/attenuator) are mutually exclusive:
  // each rule excludes every OTHER form word, so a title naming two forms resolves to nothing.
  // Variants (modeling/practice/acoustic/keyboard/drum) are their own leaves; the generic combo rule steps aside for them.
  // Guitar family: "guitar" named and "bass" not named. Bass family: "bass" named and "guitar bass" not named.
  r('amp-guitar-combo', 'amps', ['guitar', AMP_FORM.combo], ['bass', ...ampNone('combo', AMP_FORM), ...ampNone('combo', AMP_VARIANT)], 'amps/Guitar Amps/guitar-combos'),
  r('amp-guitar-head', 'amps', ['guitar', AMP_FORM.head], ['bass', ...ampNone('head', AMP_FORM), AMP_FORM.combo], 'amps/Guitar Amps/guitar-heads'),
  r('amp-guitar-cabinet', 'amps', ['guitar', AMP_FORM.cab], ['bass', ...ampNone('cab', AMP_FORM), AMP_WITH_PHRASE, '(?:amps?|amplifiers?) and'], 'amps/Guitar Amps/guitar-cabinets'),
  r('amp-guitar-stack', 'amps', ['guitar', AMP_FORM.stack], ['bass', ...ampNone('stack', AMP_FORM)], 'amps/Guitar Amps/guitar-amp-stacks'),
  r('amp-guitar-modeling', 'amps', ['guitar', 'model(?:l)?ing (?:guitar )?(?:amps?|amplifiers?|combos?)|digital model(?:l)?ing'], ['bass'], 'amps/Guitar Amps/guitar-modeling-amps'),
  r('amp-guitar-power', 'amps', ['guitar', AMP_FORM.power], ['bass', ...ampNone('power', AMP_FORM)], 'amps/Guitar Amps/guitar-power-amps'),
  r('amp-guitar-preamp', 'amps', ['guitar', AMP_FORM.preamp], ['bass', 'microphone|mic', 'amps?|amplifiers?', ...ampNone('preamp', AMP_FORM)], 'amps/Guitar Amps/guitar-preamps'),
  r('amp-guitar-headphone', 'amps', ['guitar', 'headphone amps?|headphone amplifiers?|amplug'], ['bass', ...ampNone('headphone', AMP_FORM)], 'amps/Guitar Amps/guitar-headphone-amps'),
  r('amp-acoustic-guitar', 'amps', ['acoustic (?:guitar )?(?:amps?|amplifiers?|combos?)'], ['bass', 'acoustic control|acoustic corp|keyboard'], 'amps/Guitar Amps/acoustic-guitar-amps'),
  r('amp-bass-combo', 'amps', ['bass', AMP_FORM.combo], ['guitar bass', ...ampNone('combo', AMP_FORM), AMP_VARIANT.modeling, AMP_VARIANT.keyboard, AMP_VARIANT.drum], 'amps/Bass Amps/bass-combos'),
  r('amp-bass-head', 'amps', ['bass', AMP_FORM.head], ['guitar bass', ...ampNone('head', AMP_FORM), AMP_FORM.combo], 'amps/Bass Amps/bass-heads'),
  r('amp-bass-cabinet', 'amps', ['bass', AMP_FORM.cab], ['guitar bass', ...ampNone('cab', AMP_FORM), AMP_WITH_PHRASE, '(?:amps?|amplifiers?) and', AMP_VARIANT.drum, AMP_VARIANT.keyboard], 'amps/Bass Amps/bass-cabinets'),
  r('amp-bass-stack', 'amps', ['bass', AMP_FORM.stack], ['guitar bass', ...ampNone('stack', AMP_FORM)], 'amps/Bass Amps/bass-amp-stacks'),
  r('amp-bass-modeling', 'amps', ['bass', 'model(?:l)?ing (?:bass )?(?:amps?|amplifiers?|combos?)'], ['guitar bass'], 'amps/Bass Amps/bass-modeling-amps'),
  r('amp-bass-preamp', 'amps', ['bass', AMP_FORM.preamp], ['guitar bass', 'microphone|mic', 'amps?|amplifiers?', ...ampNone('preamp', AMP_FORM)], 'amps/Bass Amps/bass-preamps'),
  r('amp-bass-headphone', 'amps', ['bass', 'headphone amps?|headphone amplifiers?'], ['guitar bass', ...ampNone('headphone', AMP_FORM)], 'amps/Bass Amps/bass-headphone-amps'),
  r('amp-keyboard', 'amps', ['keyboard (?:amps?|amplifiers?|combos?)'], ['bass', 'guitar'], 'amps/keyboard-amps'),
  r('amp-electronic-drum', 'amps', ['(?:electronic|e|digital) drum (?:amps?|amplifiers?|monitors?)'], [], 'amps/electronic-drum-amps'),
  r('amp-attenuator', 'amps', ['attenuators?'], ['speaker cables?', ...ampNone('attenuator', AMP_FORM)], 'amps/amp-attenuators'),
  r('amp-small', 'amps', ['(?:practice|mini|micro|desktop|battery powered|portable)(?: guitar)?(?: combo)? (?:amps?|amplifiers?)'], ['bass', 'acoustic', 'keyboard', ...ampNone('combo', AMP_FORM)], 'amps/small-amps'),

  // ---- effects and pedals ------------------------------------------------------------------------
  r('fx-distortion', 'effects-and-pedals', ['distortion'], [], 'effects-and-pedals/distortion'),
  r('fx-overdrive-boost', 'effects-and-pedals', ['overdrive|over drive|boosters?|tube screamer|screamer'], [], 'effects-and-pedals/overdrive-and-boost'),
  r('fx-fuzz', 'effects-and-pedals', ['fuzz|big muff'], [], 'effects-and-pedals/fuzz'),
  r('fx-delay', 'effects-and-pedals', ['delay'], [], 'effects-and-pedals/delay'),
  r('fx-reverb', 'effects-and-pedals', ['reverb'], [], 'effects-and-pedals/reverb'),
  r('fx-chorus-vibrato', 'effects-and-pedals', ['chorus|vibrato'], [], 'effects-and-pedals/chorus-and-vibrato'),
  r('fx-flanger', 'effects-and-pedals', ['flangers?'], [], 'effects-and-pedals/flanger'),
  r('fx-phaser', 'effects-and-pedals', ['phasers?|phase shifters?|phase 90|phase 45'], [], 'effects-and-pedals/phase-shifters'),
  r('fx-tremolo', 'effects-and-pedals', ['tremolo'], ['bridge|arm|whammy|claw|springs?|system'], 'effects-and-pedals/tremolo'),
  r('fx-wah-filter', 'effects-and-pedals', ['wahs?|wah wah|auto wah|envelope filter'], [], 'effects-and-pedals/wahs-and-filters'),
  r('fx-compressor', 'effects-and-pedals', ['compressors?|compression|sustainers?'], [], 'effects-and-pedals/compression-and-sustain'),
  r('fx-eq', 'effects-and-pedals', ['eq|equalizers?|graphic eq'], [], 'effects-and-pedals/eq'),
  r('fx-octave-pitch', 'effects-and-pedals', ['octavers?|octave|pitch shift(?:er|ing)?|whammy|harmonizer'], [], 'effects-and-pedals/octave-and-pitch'),
  r('fx-looper', 'effects-and-pedals', ['loopers?|loop pedals?|loop stations?'], [], 'effects-and-pedals/loop-pedals-and-samplers'),
  r('fx-multi-effect', 'effects-and-pedals', ['multi ?effects?|multi fx'], [], 'effects-and-pedals/multi-effect-unit'),
  r('fx-tuner-pedal', 'effects-and-pedals', ['tuner pedals?|pedal tuners?|tuning pedals?'], [], 'effects-and-pedals/tuning-pedals'),
  r('fx-pedalboard-power', 'effects-and-pedals', ['pedal ?boards?|pedal power supply|pedal power supplies'], [], 'effects-and-pedals/pedalboards-and-power-supplies'),
  r('fx-amp-simulator', 'effects-and-pedals', ['amp simulators?|amp sims?|amp modelers?|amp modellers?'], [], 'effects-and-pedals/amp-simulators'),
  r('fx-cab-simulator', 'effects-and-pedals', ['cab sims?|cabinet simulators?|cab simulators?|cab clone|ir loader'], [], 'effects-and-pedals/cabinet-simulators'),
  r('fx-preamp', 'effects-and-pedals', ['preamps?'], ['bass'], 'effects-and-pedals/preamps'),
  r('fx-vocal', 'effects-and-pedals', ['vocal (?:effects?|processors?|harmonizers?|pedals?)|voicelive'], [], 'effects-and-pedals/vocal'),
  r('fx-noise-gate', 'effects-and-pedals', ['noise gates?|noise suppressors?|noise reducers?'], [], 'effects-and-pedals/noise-and-reduction-gates'),
  r('fx-expression-volume', 'effects-and-pedals', ['expression pedals?|volume pedals?'], [], 'effects-and-pedals/controllers-volume-and-expression'),
  r('fx-ring-mod', 'effects-and-pedals', ['ring mod(?:ulators?)?'], [], 'effects-and-pedals/ring-modulators'),
  r('fx-guitar-synth', 'effects-and-pedals', ['guitar synth(?:esizers?)?'], [], 'effects-and-pedals/guitar-synths'),
  r('fx-bass-pedal', 'effects-and-pedals', ['bass (?:[a-z0-9]+ ){0,2}(?:effects?|fx|distortion|overdrive|chorus|fuzz|compressor|octave|eq|wah|delay|reverb|flanger|phaser|tremolo|synth)'], [], 'effects-and-pedals/bass-pedals'),

  // ---- keyboards and synths ----------------------------------------------------------------------
  r('kb-electric-piano', 'keyboards-and-synths', ['electric pianos?|rhodes|wurlitzer|clavinet'], ['digital|stage piano'], 'keyboards-and-synths/electric-pianos'),
  r('kb-organ', 'keyboards-and-synths', ['organs?'], ['mouth|pipe|harmonica|donor|transplant'], 'keyboards-and-synths/organs'),
  r('kb-arranger', 'keyboards-and-synths', ['arranger keyboards?'], [], 'keyboards-and-synths/arranger-keyboards'),
  r('kb-portable', 'keyboards-and-synths', ['portable (?:electronic )?keyboards?'], [], 'keyboards-and-synths/portable-keyboards'),
  r('kb-workstation', 'keyboards-and-synths', ['workstations?'], [], 'keyboards-and-synths/workstation-keyboards'),
  r('kb-sampler', 'keyboards-and-synths', ['samplers?'], ['pack|cd|candy|chocolate|set'], 'keyboards-and-synths/samplers'),
  r('kb-sequencer', 'keyboards-and-synths', ['sequencers?'], [], 'keyboards-and-synths/sequencers'),
  r('kb-groovebox', 'keyboards-and-synths', ['grooveboxe?s?'], [], 'keyboards-and-synths/grooveboxes'),
  r('kb-drum-machine', 'keyboards-and-synths', ['drum machines?'], [], 'keyboards-and-synths/drum-machines'),
  r('kb-grand-piano', 'keyboards-and-synths', ['grand pianos?|baby grand|concert grand|parlou?r grand'], ['digital|electric|stage|keyboard'], 'keyboards-and-synths/Acoustic Pianos/grand-pianos'),
  r('kb-upright-piano', 'keyboards-and-synths', ['upright pianos?|spinet pianos?|console pianos?|studio pianos?'], ['digital|electric|stage|keyboard'], 'keyboards-and-synths/Acoustic Pianos/upright-pianos'),
  r('kb-stage-piano', 'keyboards-and-synths', ['stage pianos?'], ['rhodes|wurlitzer|electric piano|electro mechanical'], 'keyboards-and-synths/Digital Pianos/digital-stage-pianos'),
  r('kb-analog-synth', 'keyboards-and-synths', ['analog synth(?:esizers?)?s?|analogue synth(?:esizers?)?s?'], [], 'keyboards-and-synths/Synths/analog-synths'),
  r('kb-digital-synth', 'keyboards-and-synths', ['digital synth(?:esizers?)?s?'], [], 'keyboards-and-synths/Synths/digital-synths'),
  r('kb-desktop-synth', 'keyboards-and-synths', ['desktop synth(?:esizers?)?s?|tabletop synth(?:esizers?)?s?'], [], 'keyboards-and-synths/Synths/desktop-synths'),
  r('kb-vocoder', 'keyboards-and-synths', ['vocoders?'], [], 'keyboards-and-synths/Synths/vocoders'),
  r('kb-keytar', 'keyboards-and-synths', ['keytars?'], [], 'keyboards-and-synths/MIDI Controllers/keytar-midi-controllers'),
  r('kb-midi-keyboard', 'keyboards-and-synths', ['midi keyboards?|keyboard midi controllers?|midi controller keyboards?|usb midi keyboards?'], [], 'keyboards-and-synths/MIDI Controllers/keyboard-midi-controllers'),
  r('kb-midi-pad', 'keyboards-and-synths', ['pad midi controllers?|midi pad controllers?|launchpad'], [], 'keyboards-and-synths/MIDI Controllers/pad-midi-controllers'),
  r('kb-midi-foot', 'keyboards-and-synths', ['midi foot ?controllers?|foot controller midi'], [], 'keyboards-and-synths/MIDI Controllers/foot-pedal-midi-controllers'),

  // ---- folk instruments --------------------------------------------------------------------------
  r('folk-ukulele', 'folk-instruments', ['ukuleles?|ukeleles?|ukes?'], [INSTRUMENT_ACCESSORY_WORDS, 'banjo|banjolele|mandolin|bass|u bass|ubass'], 'folk-instruments/ukuleles'),
  r('folk-banjo', 'folk-instruments', ['banjos?'], ['cases?|bags?|stands?|straps?|banjo strings|strings? sets?|replacement strings?|heads?|bridges?|capos?|tuners?|picks?|books?|dvds?|posters?|figurines?|ornaments?|lamps?|toys?|parts?|ukulele|banjolele|mandolin'], 'folk-instruments/banjos'),
  r('folk-mandolin', 'folk-instruments', ['mandolins?'], [INSTRUMENT_ACCESSORY_WORDS, 'mandola|mandocello|octave|bouzouki|banjo|ukulele'], 'folk-instruments/mandolins'),
  r('folk-harmonica', 'folk-instruments', ['harmonicas?|mouth organs?|blues harps?'], ['holders?|racks?|cases?|belts?|books?|dvds?|posters?|figurines?|ornaments?|amps?|microphones?'], 'folk-instruments/harmonicas'),
  r('folk-accordion', 'folk-instruments', ['accordions?'], [INSTRUMENT_ACCESSORY_WORDS, 'bellows'], 'folk-instruments/accordions'),
  r('folk-sitar', 'folk-instruments', ['sitars?'], [INSTRUMENT_ACCESSORY_WORDS], 'folk-instruments/sitars'),
  r('folk-oud', 'folk-instruments', ['ouds?'], [INSTRUMENT_ACCESSORY_WORDS], 'folk-instruments/ouds'),
  r('folk-harmonium', 'folk-instruments', ['harmoniums?'], [INSTRUMENT_ACCESSORY_WORDS], 'folk-instruments/harmoniums'),

  // ---- band and orchestra ------------------------------------------------------------------------
  r('band-trumpet', 'band-and-orchestra', ['trumpets?'], [INSTRUMENT_ACCESSORY_WORDS, 'valve oil|trumpet vine'], 'band-and-orchestra/Brass/trumpets'),
  r('band-trombone', 'band-and-orchestra', ['trombones?'], [INSTRUMENT_ACCESSORY_WORDS, 'slide oil'], 'band-and-orchestra/Brass/trombones'),
  r('band-tuba', 'band-and-orchestra', ['tubas?'], [INSTRUMENT_ACCESSORY_WORDS, 'sousaphone'], 'band-and-orchestra/Brass/tubas'),
  r('band-french-horn', 'band-and-orchestra', ['french horns?'], [INSTRUMENT_ACCESSORY_WORDS], 'band-and-orchestra/Brass/french-horns'),
  r('band-baritone-euphonium', 'band-and-orchestra', ['euphoniums?|baritone horns?'], [INSTRUMENT_ACCESSORY_WORDS, 'sax|saxophone'], 'band-and-orchestra/Brass/baritone'),
  r('band-saxophone', 'band-and-orchestra', ['saxophones?|saxes|sax'], [INSTRUMENT_ACCESSORY_WORDS, 'necks?|ligatures?|pads?|neck straps?'], 'band-and-orchestra/Woodwind/saxophones'),
  r('band-clarinet', 'band-and-orchestra', ['clarinets?'], [INSTRUMENT_ACCESSORY_WORDS, 'barrels?|bell'], 'band-and-orchestra/Woodwind/clarinets'),
  r('band-flute', 'band-and-orchestra', ['flutes?'], [INSTRUMENT_ACCESSORY_WORDS, 'headjoints?|native|pan|bamboo|wooden|nose|celtic|tin whistle|penny'], 'band-and-orchestra/Woodwind/flutes'),
  r('band-oboe', 'band-and-orchestra', ['oboes?'], [INSTRUMENT_ACCESSORY_WORDS], 'band-and-orchestra/Woodwind/oboes'),
  r('band-bassoon', 'band-and-orchestra', ['bassoons?'], [INSTRUMENT_ACCESSORY_WORDS], 'band-and-orchestra/Woodwind/bassoons'),
  r('band-violin', 'band-and-orchestra', ['violins?|fiddles?'], [INSTRUMENT_ACCESSORY_WORDS, 'rosin|shoulder rests?|chin rests?|bridges?|pegs?|viola|cello|bass'], 'band-and-orchestra/String/violins'),
  r('band-viola', 'band-and-orchestra', ['violas?'], [INSTRUMENT_ACCESSORY_WORDS, 'rosin|shoulder rests?|chin rests?|bridges?|pegs?|violin|cello|bass'], 'band-and-orchestra/String/violas'),
  r('band-cello', 'band-and-orchestra', ['cellos?'], [INSTRUMENT_ACCESSORY_WORDS, 'rosin|endpins?|bridges?|pegs?|violin|viola|bass'], 'band-and-orchestra/String/cellos'),
  r('band-upright-bass', 'band-and-orchestra', ['upright bass|double bass|stand ?up bass|string bass|contrabass'], [INSTRUMENT_ACCESSORY_WORDS], 'band-and-orchestra/String/upright-bass'),

  // ---- drums and percussion ----------------------------------------------------------------------
  r('drum-full-acoustic-kit', 'drums-and-percussion', ['drum kits?|drum sets?|drumsets?|[0-9] piece (?:drum )?(?:kit|set)|complete drum'], ['electronic|digital|e drum|practice|junior|toy|mini|mesh|midi|roland|alesis|cases?|bags?|stands?|throne'], 'drums-and-percussion/Acoustic Drums/full-acoustic-kits'),
  r('drum-electronic-kit', 'drums-and-percussion', ['(?:electronic|e|digital) drum (?:kits?|sets?)|electronic drums?'], ['cases?|bags?|stands?|throne|amps?'], 'drums-and-percussion/Electronic Drums/full-electronic-kits'),
  r('drum-snare', 'drums-and-percussion', ['snares?(?: drums?)?'], ['marching|concert|stands?|cases?|bags?|wires?|strainers?|heads?|electronic|pads?|kits?|sets?|pieces?|sticks?|brushes'], 'drums-and-percussion/Acoustic Drums/snare'),
  r('drum-marching-snare', 'drums-and-percussion', ['marching', 'snares?'], ['stands?|cases?|bags?|heads?'], 'drums-and-percussion/Marching Percussion/marching-snare-drums'),
  r('drum-concert-snare', 'drums-and-percussion', ['concert', 'snares?'], ['stands?|cases?|bags?|heads?'], 'drums-and-percussion/Concert Percussion/concert-snare-drums'),
  r('drum-tom', 'drums-and-percussion', ['toms?|tom toms?|floor toms?|rack toms?'], ['stands?|mounts?|holders?|arms?|kits?|sets?|pieces?|marching|concert|electronic|pads?|cases?|bags?|heads?|tomb'], 'drums-and-percussion/Acoustic Drums/tom'),
  r('drum-bass-drum', 'drums-and-percussion', ['bass drums?|kick drums?'], ['pedals?|beaters?|mallets?|marching|concert|heads?|ports?|kits?|sets?|pieces?|cases?|stands?|electronic|pads?|mic|microphones?'], 'drums-and-percussion/Acoustic Drums/bass-drum'),
  r('drum-crash', 'drums-and-percussion', ['cymbals?', 'crash'], ['bags?|cases?|stands?|packs?|sets?'], 'drums-and-percussion/Cymbals/crash'),
  r('drum-ride', 'drums-and-percussion', ['cymbals?', 'ride'], ['bags?|cases?|stands?|packs?|sets?'], 'drums-and-percussion/Cymbals/ride'),
  r('drum-hi-hat', 'drums-and-percussion', ['hi ?hats?'], ['stands?|pedals?|clutch|mounts?|holders?|machine|cases?|bags?|hardware|tambourines?'], 'drums-and-percussion/Cymbals/hi-hats'),
  r('drum-splash-china', 'drums-and-percussion', ['cymbals?', 'splash|china'], ['bags?|cases?|stands?|packs?|sets?'], 'drums-and-percussion/Cymbals/other-splash-china-etc'),
  r('drum-cymbal-pack', 'drums-and-percussion', ['cymbal (?:packs?|sets?)'], [], 'drums-and-percussion/Cymbals/cymbal-packs'),
  r('drum-cajon', 'drums-and-percussion', ['cajons?'], ['bags?|cases?|pads?|cushions?|straps?|stands?|mic|pedals?'], 'drums-and-percussion/Hand Drums/cajons'),
  r('drum-djembe', 'drums-and-percussion', ['djembes?'], ['stands?|bags?|cases?|straps?|heads?|rope|keys?'], 'drums-and-percussion/Hand Drums/djembes'),
  r('drum-conga-bongo', 'drums-and-percussion', ['congas?|bongos?'], ['stands?|bags?|cases?|straps?|heads?|rope|keys?|congo'], 'drums-and-percussion/Hand Drums/congas-and-bongos'),
  r('drum-practice-pad', 'drums-and-percussion', ['practice pads?'], ['kits?|sets?|stands?'], 'drums-and-percussion/practice-pads'),
  r('drum-sticks', 'drums-and-percussion', ['drum ?sticks?|drum sticks?'], ['kits?|sets? of drums'], 'drums-and-percussion/Parts and Accessories/drum-sticks-and-mallets'),
  r('drum-throne', 'drums-and-percussion', ['drum thrones?|drum stools?|drummers? thrones?'], [], 'drums-and-percussion/Parts and Accessories/thrones'),
  r('drum-key', 'drums-and-percussion', ['drum keys?'], [], 'drums-and-percussion/Parts and Accessories/drum-keys-and-tuners'),
  r('drum-heads', 'drums-and-percussion', ['drum ?heads?|drum skins?'], ['kits?|sets?|pieces?'], 'drums-and-percussion/Parts and Accessories/heads'),
  r('drum-pedal', 'drums-and-percussion', ['(?:kick|bass) drum pedals?|double pedals?|drum pedals?'], ['hi ?hats?'], 'drums-and-percussion/Parts and Accessories/pedals'),
  r('drum-cases-bags', 'drums-and-percussion', ['drum (?:cases?|bags?)|cymbal bags?|stick bags?|hardware (?:cases?|bags?)'], [], 'drums-and-percussion/Parts and Accessories/cases-and-bags'),
  r('drum-timpani', 'drums-and-percussion', ['timpani|kettle drums?'], ['mallets?|sticks?|heads?'], 'drums-and-percussion/Concert Percussion/timpani'),
  r('drum-xylophone', 'drums-and-percussion', ['xylophones?'], ['mallets?|toys?'], 'drums-and-percussion/Mallet Percussion/xylophones'),
  r('drum-marimba', 'drums-and-percussion', ['marimbas?'], ['mallets?'], 'drums-and-percussion/Mallet Percussion/marimbas'),
  r('drum-vibraphone', 'drums-and-percussion', ['vibraphones?'], ['mallets?'], 'drums-and-percussion/Mallet Percussion/vibraphones'),
  r('drum-glockenspiel', 'drums-and-percussion', ['glockenspiels?|orchestra bells'], ['mallets?|toys?'], 'drums-and-percussion/Mallet Percussion/bells-and-glockenspiels'),

  // ---- pro audio ---------------------------------------------------------------------------------
  r('pro-studio-monitor', 'pro-audio', ['studio monitors?|nearfield monitors?'], ['stands?|pads?|isolation|cables?'], 'pro-audio/Speakers/studio-monitors'),
  r('pro-mic-preamp', 'pro-audio', ['(?:microphone|mic) preamps?|mic pre'], [], 'pro-audio/Outboard Gear/microphone-preamps'),
  r('pro-microphone', 'pro-audio', ['microphones?|mics?'], ['cables?|stands?|clips?|holders?|boom|pop filters?|windscreens?|shock ?mounts?|cases?|bags?|preamps?|mixers?|wireless|receivers?|transmitters?|mic pre|stereo bars?|adapters?|arms?'], 'pro-audio/microphones'),
  r('pro-audio-interface', 'pro-audio', ['audio interfaces?|usb audio interfaces?|firewire audio interfaces?'], ['cables?'], 'pro-audio/interfaces'),
  r('pro-powered-mixer', 'pro-audio', ['powered mixers?|power mixers?'], [], 'pro-audio/powered-mixers'),
  r('pro-mixer', 'pro-audio', ['mixers?|mixing consoles?|mixing desks?'], ['powered|power mixer|dj|cases?|covers?|stands?'], 'pro-audio/mixers'),
  r('pro-portable-pa', 'pro-audio', ['portable pa(?: systems?)?'], [], 'pro-audio/portable-pa-systems'),
  r('pro-di-box', 'pro-audio', ['di boxe?s?|direct boxe?s?|direct inject(?:ion)? boxe?s?'], [], 'pro-audio/di-boxes'),
  r('pro-portable-recorder', 'pro-audio', ['portable recorders?|handheld recorders?|field recorders?'], [], 'pro-audio/portable-recorders'),
  r('pro-patchbay', 'pro-audio', ['patch ?bays?|patch panels?'], [], 'pro-audio/patchbays'),
  r('pro-500-series', 'pro-audio', ['500 series|api 500|lunchbox'], [], 'pro-audio/500-series'),
  r('pro-channel-strip', 'pro-audio', ['channel strips?'], [], 'pro-audio/Outboard Gear/channel-strips'),
  r('pro-compressor', 'pro-audio', ['compressors?|limiters?'], ['pedals?'], 'pro-audio/Outboard Gear/compressors-and-limiters'),
  r('pro-power-amp', 'pro-audio', ['power amps?|power amplifiers?'], ['guitar|bass'], 'pro-audio/power-amps'),
  r('pro-wireless-instrument', 'pro-audio', ['wireless (?:instrument|guitar) systems?'], [], 'pro-audio/Accessories/wireless-instrument-systems'),

  // ---- home audio --------------------------------------------------------------------------------
  r('home-receiver', 'home-audio', ['receivers?'], ['wireless|microphone|mic|bluetooth adapter|remote'], 'home-audio/receivers'),
  r('home-complete-stereo', 'home-audio', ['stereo systems?|home stereo systems?|component systems?|hi ?fi systems?'], ['turntables?|speakers?|receivers?'], 'home-audio/complete-stereo-systems'),
  r('home-bookshelf-speaker', 'home-audio', ['bookshelf speakers?'], [], 'home-audio/Speakers/bookshelf-speakers'),
  r('home-floor-speaker', 'home-audio', ['floor ?standing speakers?|tower speakers?|floor speakers?'], [], 'home-audio/Speakers/floor-speakers'),
  r('home-subwoofer', 'home-audio', ['subwoofers?'], [], 'home-audio/Speakers/subwoofers'),
  r('home-cd-player', 'home-audio', ['cd players?'], [], 'home-audio/Digital Players/cd-players'),
  r('home-tape-deck', 'home-audio', ['tape decks?|cassette decks?'], [], 'home-audio/tape-decks'),

  // ---- dj and lighting ---------------------------------------------------------------------------
  r('dj-controller', 'dj-and-lighting-gear', ['dj controllers?'], [], 'dj-and-lighting-gear/dj-controllers'),
  r('dj-mixer', 'dj-and-lighting-gear', ['dj mixers?'], [], 'dj-and-lighting-gear/mixers'),
  r('dj-turntable', 'dj-and-lighting-gear', ['turntables?'], ['cartridges?|styluses|stylus|needles?|belts?|mats?|slipmats?|platters?|dust covers?|lids?|tonearms?|cases?|covers?|stands?|receivers?|stereo systems?|speakers?'], 'dj-and-lighting-gear/turntables'),
  r('dj-lighting', 'dj-and-lighting-gear', ['stage (?:lights?|lighting)|par cans?|led par|moving heads?|lighting rig|strobe lights?'], ['stands?|cases?|clamps?'], 'dj-and-lighting-gear/lighting'),

  // ---- parts -------------------------------------------------------------------------------------
  // The "with .* pickups" guard keeps a whole guitar ("Strat with Seymour Duncan pickups") out of the pickup leaves.
  r('parts-acoustic-pickup', 'parts', ['pickups?', 'acoustic|soundhole|sound hole|clip on|piezo|undersaddle|under saddle|transducer'], ['with .*\\bpickups?', 'bass'], 'parts/acoustic-pickups'),
  r('parts-bass-pickup', 'parts', ['pickups?', 'bass'], ['with .*\\bpickups?', 'acoustic|soundhole|piezo|clip on|transducer'], 'parts/bass-pickups'),
  r('parts-guitar-pickup', 'parts', ['pickups?', 'humbuckers?|single coils?|p ?90|strat|stratocaster|tele|telecaster|les paul|electric|guitar'], ['with .*\\bpickups?', 'acoustic|bass|soundhole|piezo|clip on|transducer|violin|banjo|ukulele|mandolin|cigar box'], 'parts/guitar-pickups'),
  r('parts-tubes', 'parts', ['(?:vacuum|preamp|power|amp) tubes?|12ax7|el34|6l6|6v6|kt88|ecc83|el84|12at7'], ['amps?|amplifiers?|combos?|heads?'], 'parts/tubes'),
  r('parts-pickguard', 'parts', ['pick ?guards?|scratch ?plates?'], ['with .*\\b(?:guitar|strat|tele)'], 'parts/pickguards'),
  r('parts-tuning-heads', 'parts', ['tuning (?:pegs?|machines?|heads?|keys?)|machine heads?|tuner keys?'], ['with .*\\btuning'], 'parts/tuning-heads'),
  r('parts-bridge', 'parts', ['(?:guitar|bass|tune o matic|tremolo|floyd rose|hardtail|wraparound|wrap around|acoustic|violin|ukulele) bridges?|tune o matic'], ['pins?', 'pickups?', 'with', 'position'], 'parts/Guitar Parts/bridges'),
  r('parts-bridge-pins', 'parts', ['bridge pins?'], [], 'parts/Guitar Parts/bridge-pins'),
  r('parts-tailpiece', 'parts', ['tailpieces?|stop ?tailpieces?|trapeze tailpieces?'], [], 'parts/Guitar Parts/tailpieces'),

  // ---- accessories -------------------------------------------------------------------------------
  r('acc-capo', 'accessories', ['capos?'], [], 'accessories/capos'),
  r('acc-picks', 'accessories', ['picks?|plectrums?'], ['pick ?guards?|pickups?|pick ?ups?|pickaxe|picker|pickle|picked'], 'accessories/picks'),
  r('acc-strap', 'accessories', ['straps?'], ['locks?|buttons?|watch|camera|luggage|tie|ratchet'], 'accessories/straps'),
  r('acc-tuner', 'accessories', ['tuners?'], ['keys?|pegs?|machine heads?|pedals?|radio|tv|fm|am'], 'accessories/tuners'),
  r('acc-cable-adapter', 'accessories', ['cable adapters?|cable splitters?|y cables?|splitter cables?|adapter cables?|snakes?'], [], 'accessories/cable-adapters-and-splitters'),
  r('acc-cable', 'accessories', ['instrument cables?|guitar cables?|patch cables?|speaker cables?|speaker wire|microphone cables?|mic cables?|xlr cables?|midi cables?|cables?|cords?'], ['adapters?|adaptors?|splitters?|y cables?|snakes?|usb|hdmi|power|charger|stage box|breakout'], 'accessories/cables'),
  r('acc-humidifier', 'accessories', ['humidifiers?'], [], 'accessories/humidifiers'),
  r('acc-metronome', 'accessories', ['metronomes?'], [], 'accessories/metronome'),
  r('acc-power-supply', 'accessories', ['power supplys?|power supplies|ac adapters?|daisy chain'], [], 'accessories/power-supplies'),
  r('acc-stand', 'accessories', ['(?:guitar|bass|ukulele|banjo|violin|music|sheet music|instrument) stands?'], ['cases?|bags?|hangers?'], 'accessories/stands'),
  r('acc-slide', 'accessories', ['slides?'], ['trombone|whistle|projector|slide guitar|show|rule'], 'accessories/slides'),
  r('acc-headphones', 'accessories', ['headphones?|earphones?|earbuds?|in ear monitors?'], ['amps?|amplifiers?|stands?|cases?|cables?|adapters?|pads?|cushions?'], 'accessories/headphones'),
  r('acc-bass-case', 'accessories', ['bass', 'cases?'], ['guitar bass', 'bags?|soft', 'drum|amp|keyboard'], 'accessories/Cases and Gig Bags/bass-cases'),
  r('acc-bass-gig-bag', 'accessories', ['bass', 'gig ?bags?|soft cases?'], ['guitar bass', 'drum|amp|keyboard'], 'accessories/Cases and Gig Bags/bass-gig-bags'),
  r('acc-guitar-case', 'accessories', ['guitar|acoustic|electric', 'cases?'], ['bass', 'bags?|soft', 'banjo|ukulele|mandolin|violin|keyboard|amp|drum|pedal'], 'accessories/Cases and Gig Bags/guitar-cases'),
  r('acc-guitar-gig-bag', 'accessories', ['guitar|acoustic|electric', 'gig ?bags?|soft cases?'], ['bass', 'banjo|ukulele|mandolin|violin|keyboard|amp|drum|pedal'], 'accessories/Cases and Gig Bags/guitar-gig-bags'),
  r('acc-guitar-strings', 'accessories', ['guitar|acoustic|electric', 'strings?'], ['bass|banjo|mandolin|ukulele|ukelele|uke|violin|viola|cello|harp|piano|stringed'], 'accessories/Strings/guitar-strings'),
  r('acc-bass-strings', 'accessories', ['bass', 'strings?'], ['guitar bass|upright|double|violin|cello|banjo|mandolin|ukulele|stringed'], 'accessories/Strings/bass-strings'),
  r('acc-banjo-strings', 'accessories', ['banjo', 'strings?'], ['stringed'], 'accessories/Strings/banjo-strings'),
  r('acc-mandolin-strings', 'accessories', ['mandolin', 'strings?'], ['stringed'], 'accessories/Strings/mandolin-strings'),
  r('acc-ukulele-strings', 'accessories', ['ukuleles?|ukeleles?|ukes?', 'strings?'], ['stringed'], 'accessories/Strings/ukulele-strings'),
];

const RULES_BY_TOP: Record<string, ReverbRule[]> = {};
for (const rule of REVERB_RULES) {
  (RULES_BY_TOP[rule.top] = RULES_BY_TOP[rule.top] || []).push(rule);
}

// ---------------------------------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------------------------------

function makeResult(leafId: string, source: ReverbSubcategorySource): ReverbSubcategoryResult | null {
  if (!isReverbLeaf(leafId)) return null;
  const path = reverbPathTitles(leafId);
  return { slug: leafId, path, pathText: path.join(' > '), source };
}

function curatedLookup(input: ReverbSubcategoryInput, t: Prepared, topSlug: string): ReverbSubcategoryExplanation | null {
  if (input.ebayCategoryId == null || input.ebayCategoryId === '') return null;
  const key = String(input.ebayCategoryId).trim();
  if (!Object.prototype.hasOwnProperty.call(REVERB_CURATED_BY_EBAY_ID, key)) return null;
  const entry = REVERB_CURATED_BY_EBAY_ID[key];
  let target: CuratedTarget | undefined;
  if (entry === null || typeof entry === 'string') {
    target = entry;
  } else {
    const hits = new Set<string>();
    let blank = false;
    for (const [pat, tgt] of entry.split) {
      if (!patternMatches(pat, t)) continue;
      if (tgt === null) blank = true;
      else hits.add(tgt);
    }
    if (blank) return { result: null, stage: 'blank', detail: 'curated:' + key, reason: 'deliberate-blank' };
    if (hits.size > 1) return { result: null, stage: 'ambiguous', detail: 'curated:' + key, reason: 'ambiguous:' + Array.from(hits).join(',') };
    if (hits.size === 1) target = Array.from(hits)[0];
    else if (entry.fallback !== undefined) target = entry.fallback;
    else return null; // no sub-rule matched: let the rule layer decide
  }
  if (target === null) return { result: null, stage: 'blank', detail: 'curated:' + key, reason: 'deliberate-blank' };
  if (target === undefined) return null;
  if (reverbTopSlug(target) !== topSlug) return null; // never move the item to another top-level category
  const res = makeResult(target, 'CURATED_ID');
  if (!res) return null;
  return { result: res, stage: 'curated', detail: key, reason: '' };
}

function ruleLookup(t: Prepared, topSlug: string): ReverbSubcategoryExplanation {
  const rules = RULES_BY_TOP[topSlug] || [];
  const hits: ReverbRule[] = [];
  for (const rule of rules) {
    let ok = true;
    for (const p of rule.all) { if (!patternMatches(p, t)) { ok = false; break; } }
    if (!ok) continue;
    for (const p of rule.none) { if (patternMatches(p, t)) { ok = false; break; } }
    if (!ok) continue;
    if (rule.target === null) {
      return { result: null, stage: 'blank', detail: rule.id, reason: 'deliberate-blank' };
    }
    hits.push(rule);
  }
  if (hits.length === 0) return { result: null, stage: 'none', detail: '', reason: 'no-rule' };
  const targets = Array.from(new Set(hits.map((h) => h.target as string)));
  if (targets.length > 1) {
    return { result: null, stage: 'ambiguous', detail: hits.map((h) => h.id).join(','), reason: 'ambiguous:' + targets.join(',') };
  }
  const res = makeResult(targets[0], 'RULE');
  if (!res) return { result: null, stage: 'none', detail: hits[0].id, reason: 'target-not-a-leaf' };
  return { result: res, stage: 'rule', detail: hits.map((h) => h.id).join(','), reason: '' };
}

/** Full decision trail: which layer answered, or why nothing did. resolveReverbSubcategory() is the thin wrapper. */
export function explainReverbSubcategory(input: ReverbSubcategoryInput): ReverbSubcategoryExplanation {
  const inp: ReverbSubcategoryInput = input || {};
  const topSlug = reverbTopSlugForName(inp.topLevelName);
  if (!topSlug) return { result: null, stage: 'none', detail: '', reason: 'unknown-top-level' };
  const t = prepare(inp);
  const cur = curatedLookup(inp, t, topSlug);
  if (cur) return cur;
  return ruleLookup(t, topSlug);
}

/** The Reverb leaf for an item under the given top-level category, or null when no safe answer exists. */
export function resolveReverbSubcategory(input: ReverbSubcategoryInput): ReverbSubcategoryResult | null {
  try {
    return explainReverbSubcategory(input).result;
  } catch {
    return null;
  }
}

/** Re-export so callers need only this module. */
export { REVERB_TOP_LEVEL_NAMES };
