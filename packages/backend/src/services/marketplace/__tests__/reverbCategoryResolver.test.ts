/**
 * (S-REVERB-SUBCATEGORY, 2026-10-05) Reverb sub-category resolver + tree integrity.
 *
 * The resolver names ONE Reverb leaf (e.g. amps/Guitar Amps/guitar-combos) under the top-level category the
 * connector already chose, or returns null. A wrong sub-category on a REAL listing is worse than none, so
 * these tests pin the null paths (ambiguity, accessories, wrong top-level) as hard as the hit paths.
 *
 * Pure unit test: nothing is mocked and every title is synthetic ("Acme ..."). NOT EXECUTED under jest
 * when written (jest cannot run on the authoring machine -- see dev-environment skill). The same
 * assertions were executed there against a minimal describe/it/expect shim using Node's TypeScript
 * stripping; CI is the real gate.
 */
import type { ReverbSubcategoryInput } from '../reverbCategoryResolver';
import {
  resolveReverbSubcategory,
  explainReverbSubcategory,
  normalizeReverbText,
  REVERB_RULES,
  REVERB_CURATED_BY_EBAY_ID,
} from '../reverbCategoryResolver';
import {
  REVERB_NODES,
  REVERB_TOP_LEVEL_NAMES,
  getReverbNode,
  isReverbLeaf,
  reverbTopSlug,
  reverbLeafSlug,
  reverbTopSlugForName,
} from '../../../config/reverbCategoryTree';

function slugOf(topLevelName: string, title: string, extra: Partial<ReverbSubcategoryInput> = {}): string | null {
  const r = resolveReverbSubcategory({ topLevelName, title, ...extra });
  return r ? r.slug : null;
}

describe('reverbCategoryTree: data integrity', () => {
  it('has the audited totals: 350 nodes, 14 top-level, 30 groups, 306 leaves, depth 4', () => {
    const tops = REVERB_NODES.filter((n) => n.parentId === '');
    const leaves = REVERB_NODES.filter((n) => n.parentId !== '' && n.childIds.length === 0);
    const groups = REVERB_NODES.filter((n) => n.parentId !== '' && n.childIds.length > 0);
    expect(REVERB_NODES.length).toBe(350);
    expect(tops.length).toBe(14);
    expect(groups.length).toBe(30);
    expect(leaves.length).toBe(306);
    expect(Math.max(...REVERB_NODES.map((n) => n.depth))).toBe(4);
  });

  it('ids are unique, titles are the last path segment, parents exist and come first', () => {
    const seen = new Set<string>();
    for (const n of REVERB_NODES) {
      expect(seen.has(n.id)).toBe(false);
      expect(n.title).toBe(n.id.split('/').pop());
      if (n.parentId !== '') expect(seen.has(n.parentId)).toBe(true);
      seen.add(n.id);
    }
  });

  it('the 14 top-level slugs match the connector top-level names exactly', () => {
    const tops = REVERB_NODES.filter((n) => n.parentId === '').map((n) => n.id).sort();
    expect(tops).toEqual(Object.keys(REVERB_TOP_LEVEL_NAMES).sort());
    expect(reverbTopSlugForName('Electric Guitars')).toBe('electric-guitars');
    expect(reverbTopSlugForName('  amps ')).toBe('amps');
    expect(reverbTopSlugForName('Nope')).toBeNull();
    expect(reverbTopSlugForName(null)).toBeNull();
  });

  it('a leaf slug is unique inside its top-level category (repeats across tops are why the connector also checks root_slug)', () => {
    const seen = new Set<string>();
    for (const n of REVERB_NODES) {
      if (!isReverbLeaf(n.id)) continue;
      const key = reverbTopSlug(n.id) + '|' + reverbLeafSlug(n.id);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(isReverbLeaf('amps')).toBe(false);
    expect(isReverbLeaf('amps/Bass Amps')).toBe(false);
    expect(isReverbLeaf('amps/Bass Amps/bass-combos')).toBe(true);
    expect(getReverbNode('amps/Bass Amps/bass-combos')!.parentId).toBe('amps/Bass Amps');
  });
});

describe('reverbCategoryResolver: every target slug exists in the committed tree', () => {
  it('every rule target is a leaf under the rule top-level category', () => {
    const ids = new Set<string>();
    for (const rule of REVERB_RULES) {
      expect(ids.has(rule.id)).toBe(false);
      ids.add(rule.id);
      expect(REVERB_TOP_LEVEL_NAMES[rule.top]).toBeDefined();
      if (rule.target === null) continue;
      expect(isReverbLeaf(rule.target)).toBe(true);
      expect(reverbTopSlug(rule.target)).toBe(rule.top);
    }
  });

  it('every curated eBay id target is a leaf', () => {
    const targets: string[] = [];
    for (const key of Object.keys(REVERB_CURATED_BY_EBAY_ID)) {
      expect(/^[0-9]+$/.test(key)).toBe(true);
      const entry = REVERB_CURATED_BY_EBAY_ID[key];
      if (entry === null) continue;
      if (typeof entry === 'string') targets.push(entry);
      else {
        for (const pair of entry.split) if (pair[1] !== null) targets.push(pair[1]);
        if (entry.fallback) targets.push(entry.fallback);
      }
    }
    expect(targets.length).toBeGreaterThan(10);
    for (const t of targets) expect(isReverbLeaf(t)).toBe(true);
  });

  it('result.slug, path and pathText come from the tree', () => {
    const r = resolveReverbSubcategory({ topLevelName: 'Amps', title: 'Acme LA15R Guitar Combo Amplifier', ebayCategoryName: 'Guitar Amplifiers' });
    expect(r).not.toBeNull();
    expect(r!.slug).toBe('amps/Guitar Amps/guitar-combos');
    expect(r!.path).toEqual(['Amps', 'Guitar Amps', 'guitar-combos']);
    expect(r!.pathText).toBe('Amps > Guitar Amps > guitar-combos');
    expect(r!.source).toBe('RULE');
    expect(isReverbLeaf(r!.slug)).toBe(true);
  });
});

// [rule id, top-level name, synthetic title, expected leaf id]
const FIXTURES: Array<[string, string, string, string]> = [
  ['acoustic-built-in-electronics', 'Acoustic Guitars', 'Acme AX100 acoustic-electric guitar', 'acoustic-guitars/built-in-electronics'],
  ['acoustic-dreadnought', 'Acoustic Guitars', 'Acme D-18 dreadnought guitar', 'acoustic-guitars/dreadnought'],
  ['acoustic-jumbo', 'Acoustic Guitars', 'Acme J-200 jumbo acoustic guitar', 'acoustic-guitars/jumbo'],
  ['acoustic-parlor', 'Acoustic Guitars', 'Acme parlor guitar', 'acoustic-guitars/parlor'],
  ['acoustic-concert', 'Acoustic Guitars', 'Acme grand concert acoustic guitar', 'acoustic-guitars/concert'],
  ['acoustic-om-auditorium', 'Acoustic Guitars', 'Acme OM-28 acoustic guitar', 'acoustic-guitars/om-and-auditorium'],
  ['acoustic-archtop', 'Acoustic Guitars', 'Acme archtop acoustic guitar', 'acoustic-guitars/archtop'],
  ['acoustic-resonator', 'Acoustic Guitars', 'Acme resonator guitar', 'acoustic-guitars/resonator'],
  ['acoustic-classical', 'Acoustic Guitars', 'Acme C40 classical guitar', 'acoustic-guitars/classical'],
  ['acoustic-12-string', 'Acoustic Guitars', 'Acme 12-string acoustic guitar', 'acoustic-guitars/12-string'],
  ['acoustic-baritone', 'Acoustic Guitars', 'Acme baritone acoustic guitar', 'acoustic-guitars/baritone'],
  ['acoustic-tenor', 'Acoustic Guitars', 'Acme tenor guitar', 'acoustic-guitars/tenor'],
  ['acoustic-left-handed', 'Acoustic Guitars', 'Acme left-handed acoustic guitar', 'acoustic-guitars/left-handed'],
  ['acoustic-mini-travel', 'Acoustic Guitars', 'Acme travel acoustic guitar', 'acoustic-guitars/mini-slash-travel'],
  ['electric-lap-steel', 'Electric Guitars', 'Acme lap steel guitar', 'electric-guitars/lap-steel'],
  ['electric-pedal-steel', 'Electric Guitars', 'Acme pedal steel guitar', 'electric-guitars/pedal-steel'],
  ['electric-semi-hollow', 'Electric Guitars', 'Acme semi-hollow body electric guitar', 'electric-guitars/semi-hollow'],
  ['electric-hollow-body', 'Electric Guitars', 'Acme hollow body electric guitar', 'electric-guitars/hollow-body'],
  ['electric-solid-body', 'Electric Guitars', 'Acme Stratocaster electric guitar', 'electric-guitars/solid-body'],
  ['electric-archtop', 'Electric Guitars', 'Acme archtop electric guitar', 'electric-guitars/archtop'],
  ['electric-12-string', 'Electric Guitars', 'Acme 12 string electric guitar', 'electric-guitars/12-string'],
  ['electric-baritone', 'Electric Guitars', 'Acme baritone electric guitar', 'electric-guitars/baritone'],
  ['electric-tenor', 'Electric Guitars', 'Acme tenor guitar', 'electric-guitars/tenor'],
  ['electric-left-handed', 'Electric Guitars', 'Acme left-handed electric guitar', 'electric-guitars/left-handed'],
  ['electric-travel-mini', 'Electric Guitars', 'Acme travel electric guitar', 'electric-guitars/travel-slash-mini'],
  ['bass-acoustic', 'Bass Guitars', 'Acme acoustic bass guitar', 'bass-guitars/acoustic-bass-guitars'],
  ['bass-fretless', 'Bass Guitars', 'Acme fretless bass guitar', 'bass-guitars/fretless'],
  ['bass-short-scale', 'Bass Guitars', 'Acme short scale bass guitar', 'bass-guitars/short-scale'],
  ['bass-5-string-or-more', 'Bass Guitars', 'Acme 5-string bass guitar', 'bass-guitars/5-string-or-more'],
  ['bass-4-string', 'Bass Guitars', 'Acme 4-string bass guitar', 'bass-guitars/4-string'],
  ['bass-left-handed', 'Bass Guitars', 'Acme left-handed bass guitar', 'bass-guitars/left-handed'],
  ['amp-guitar-combo', 'Amps', 'Acme Guitar Combo Amplifier', 'amps/Guitar Amps/guitar-combos'],
  ['amp-guitar-head', 'Amps', 'Acme Guitar Amp Head', 'amps/Guitar Amps/guitar-heads'],
  ['amp-guitar-cabinet', 'Amps', 'Acme 4x12 Guitar Speaker Cabinet', 'amps/Guitar Amps/guitar-cabinets'],
  ['amp-guitar-stack', 'Amps', 'Acme Guitar Amp Half Stack', 'amps/Guitar Amps/guitar-amp-stacks'],
  ['amp-guitar-modeling', 'Amps', 'Acme Guitar Modeling Amp', 'amps/Guitar Amps/guitar-modeling-amps'],
  ['amp-guitar-power', 'Amps', 'Acme Guitar Power Amp', 'amps/Guitar Amps/guitar-power-amps'],
  ['amp-guitar-preamp', 'Amps', 'Acme Guitar Preamp', 'amps/Guitar Amps/guitar-preamps'],
  ['amp-guitar-headphone', 'Amps', 'Acme Guitar Headphone Amp', 'amps/Guitar Amps/guitar-headphone-amps'],
  ['amp-acoustic-guitar', 'Amps', 'Acme acoustic guitar amp', 'amps/Guitar Amps/acoustic-guitar-amps'],
  ['amp-bass-combo', 'Amps', 'Acme Bass Combo Amp', 'amps/Bass Amps/bass-combos'],
  ['amp-bass-head', 'Amps', 'Acme Bass Amp Head', 'amps/Bass Amps/bass-heads'],
  ['amp-bass-cabinet', 'Amps', 'Acme 8x10 Bass Cabinet', 'amps/Bass Amps/bass-cabinets'],
  ['amp-bass-stack', 'Amps', 'Acme Bass Amp Full Stack', 'amps/Bass Amps/bass-amp-stacks'],
  ['amp-bass-modeling', 'Amps', 'Acme Bass Modeling Amp', 'amps/Bass Amps/bass-modeling-amps'],
  ['amp-bass-preamp', 'Amps', 'Acme Bass Preamp', 'amps/Bass Amps/bass-preamps'],
  ['amp-bass-headphone', 'Amps', 'Acme Bass Headphone Amp', 'amps/Bass Amps/bass-headphone-amps'],
  ['amp-keyboard', 'Amps', 'Acme Keyboard Amp', 'amps/keyboard-amps'],
  ['amp-electronic-drum', 'Amps', 'Acme Electronic Drum Amp', 'amps/electronic-drum-amps'],
  ['amp-attenuator', 'Amps', 'Acme Amp Attenuator', 'amps/amp-attenuators'],
  ['amp-small', 'Amps', 'Acme Mini Guitar Amp', 'amps/small-amps'],
  ['fx-distortion', 'Effects and Pedals', 'Acme distortion pedal', 'effects-and-pedals/distortion'],
  ['fx-overdrive-boost', 'Effects and Pedals', 'Acme overdrive pedal', 'effects-and-pedals/overdrive-and-boost'],
  ['fx-fuzz', 'Effects and Pedals', 'Acme fuzz pedal', 'effects-and-pedals/fuzz'],
  ['fx-delay', 'Effects and Pedals', 'Acme delay pedal', 'effects-and-pedals/delay'],
  ['fx-reverb', 'Effects and Pedals', 'Acme reverb pedal', 'effects-and-pedals/reverb'],
  ['fx-chorus-vibrato', 'Effects and Pedals', 'Acme chorus pedal', 'effects-and-pedals/chorus-and-vibrato'],
  ['fx-flanger', 'Effects and Pedals', 'Acme flanger pedal', 'effects-and-pedals/flanger'],
  ['fx-phaser', 'Effects and Pedals', 'Acme phaser pedal', 'effects-and-pedals/phase-shifters'],
  ['fx-tremolo', 'Effects and Pedals', 'Acme tremolo pedal', 'effects-and-pedals/tremolo'],
  ['fx-wah-filter', 'Effects and Pedals', 'Acme wah pedal', 'effects-and-pedals/wahs-and-filters'],
  ['fx-compressor', 'Effects and Pedals', 'Acme compressor pedal', 'effects-and-pedals/compression-and-sustain'],
  ['fx-eq', 'Effects and Pedals', 'Acme 7 band EQ pedal', 'effects-and-pedals/eq'],
  ['fx-octave-pitch', 'Effects and Pedals', 'Acme octave pedal', 'effects-and-pedals/octave-and-pitch'],
  ['fx-looper', 'Effects and Pedals', 'Acme looper pedal', 'effects-and-pedals/loop-pedals-and-samplers'],
  ['fx-multi-effect', 'Effects and Pedals', 'Acme multi-effects pedal', 'effects-and-pedals/multi-effect-unit'],
  ['fx-tuner-pedal', 'Effects and Pedals', 'Acme tuner pedal', 'effects-and-pedals/tuning-pedals'],
  ['fx-pedalboard-power', 'Effects and Pedals', 'Acme pedalboard with case', 'effects-and-pedals/pedalboards-and-power-supplies'],
  ['fx-amp-simulator', 'Effects and Pedals', 'Acme amp simulator pedal', 'effects-and-pedals/amp-simulators'],
  ['fx-cab-simulator', 'Effects and Pedals', 'Acme cab sim pedal', 'effects-and-pedals/cabinet-simulators'],
  ['fx-preamp', 'Effects and Pedals', 'Acme preamp pedal', 'effects-and-pedals/preamps'],
  ['fx-vocal', 'Effects and Pedals', 'Acme vocal effects processor', 'effects-and-pedals/vocal'],
  ['fx-noise-gate', 'Effects and Pedals', 'Acme noise gate pedal', 'effects-and-pedals/noise-and-reduction-gates'],
  ['fx-expression-volume', 'Effects and Pedals', 'Acme expression pedal', 'effects-and-pedals/controllers-volume-and-expression'],
  ['fx-ring-mod', 'Effects and Pedals', 'Acme ring modulator', 'effects-and-pedals/ring-modulators'],
  ['fx-guitar-synth', 'Effects and Pedals', 'Acme guitar synth pedal', 'effects-and-pedals/guitar-synths'],
  ['fx-bass-pedal', 'Effects and Pedals', 'Acme bass effects pedal', 'effects-and-pedals/bass-pedals'],
  ['kb-electric-piano', 'Keyboards and Synths', 'Acme Rhodes electric piano', 'keyboards-and-synths/electric-pianos'],
  ['kb-organ', 'Keyboards and Synths', 'Acme combo organ', 'keyboards-and-synths/organs'],
  ['kb-arranger', 'Keyboards and Synths', 'Acme arranger keyboard', 'keyboards-and-synths/arranger-keyboards'],
  ['kb-portable', 'Keyboards and Synths', 'Acme 61 key portable keyboard', 'keyboards-and-synths/portable-keyboards'],
  ['kb-workstation', 'Keyboards and Synths', 'Acme music workstation', 'keyboards-and-synths/workstation-keyboards'],
  ['kb-sampler', 'Keyboards and Synths', 'Acme hardware sampler', 'keyboards-and-synths/samplers'],
  ['kb-sequencer', 'Keyboards and Synths', 'Acme hardware sequencer', 'keyboards-and-synths/sequencers'],
  ['kb-groovebox', 'Keyboards and Synths', 'Acme groovebox', 'keyboards-and-synths/grooveboxes'],
  ['kb-drum-machine', 'Keyboards and Synths', 'Acme drum machine', 'keyboards-and-synths/drum-machines'],
  ['kb-grand-piano', 'Keyboards and Synths', 'Acme baby grand piano', 'keyboards-and-synths/Acoustic Pianos/grand-pianos'],
  ['kb-upright-piano', 'Keyboards and Synths', 'Acme upright piano', 'keyboards-and-synths/Acoustic Pianos/upright-pianos'],
  ['kb-stage-piano', 'Keyboards and Synths', 'Acme 88 key stage piano', 'keyboards-and-synths/Digital Pianos/digital-stage-pianos'],
  ['kb-analog-synth', 'Keyboards and Synths', 'Acme analog synthesizer', 'keyboards-and-synths/Synths/analog-synths'],
  ['kb-digital-synth', 'Keyboards and Synths', 'Acme digital synthesizer', 'keyboards-and-synths/Synths/digital-synths'],
  ['kb-desktop-synth', 'Keyboards and Synths', 'Acme desktop synth', 'keyboards-and-synths/Synths/desktop-synths'],
  ['kb-vocoder', 'Keyboards and Synths', 'Acme vocoder', 'keyboards-and-synths/Synths/vocoders'],
  ['kb-keytar', 'Keyboards and Synths', 'Acme keytar', 'keyboards-and-synths/MIDI Controllers/keytar-midi-controllers'],
  ['kb-midi-keyboard', 'Keyboards and Synths', 'Acme 49 key MIDI keyboard controller', 'keyboards-and-synths/MIDI Controllers/keyboard-midi-controllers'],
  ['kb-midi-pad', 'Keyboards and Synths', 'Acme pad MIDI controller', 'keyboards-and-synths/MIDI Controllers/pad-midi-controllers'],
  ['kb-midi-foot', 'Keyboards and Synths', 'Acme MIDI foot controller', 'keyboards-and-synths/MIDI Controllers/foot-pedal-midi-controllers'],
  ['folk-ukulele', 'Folk Instruments', 'Acme soprano ukulele with carrying case', 'folk-instruments/ukuleles'],
  ['folk-banjo', 'Folk Instruments', 'Acme 5 string banjo', 'folk-instruments/banjos'],
  ['folk-mandolin', 'Folk Instruments', 'Acme A-style mandolin', 'folk-instruments/mandolins'],
  ['folk-harmonica', 'Folk Instruments', 'Acme blues harmonica key of C', 'folk-instruments/harmonicas'],
  ['folk-accordion', 'Folk Instruments', 'Acme piano accordion', 'folk-instruments/accordions'],
  ['folk-sitar', 'Folk Instruments', 'Acme sitar', 'folk-instruments/sitars'],
  ['folk-oud', 'Folk Instruments', 'Acme oud', 'folk-instruments/ouds'],
  ['folk-harmonium', 'Folk Instruments', 'Acme harmonium', 'folk-instruments/harmoniums'],
  ['band-trumpet', 'Band and Orchestra', 'Acme Bb trumpet', 'band-and-orchestra/Brass/trumpets'],
  ['band-trombone', 'Band and Orchestra', 'Acme tenor trombone', 'band-and-orchestra/Brass/trombones'],
  ['band-tuba', 'Band and Orchestra', 'Acme BBb tuba', 'band-and-orchestra/Brass/tubas'],
  ['band-french-horn', 'Band and Orchestra', 'Acme double french horn', 'band-and-orchestra/Brass/french-horns'],
  ['band-baritone-euphonium', 'Band and Orchestra', 'Acme euphonium', 'band-and-orchestra/Brass/baritone'],
  ['band-saxophone', 'Band and Orchestra', 'Acme alto saxophone', 'band-and-orchestra/Woodwind/saxophones'],
  ['band-clarinet', 'Band and Orchestra', 'Acme Bb clarinet', 'band-and-orchestra/Woodwind/clarinets'],
  ['band-flute', 'Band and Orchestra', 'Acme concert flute', 'band-and-orchestra/Woodwind/flutes'],
  ['band-oboe', 'Band and Orchestra', 'Acme oboe', 'band-and-orchestra/Woodwind/oboes'],
  ['band-bassoon', 'Band and Orchestra', 'Acme bassoon', 'band-and-orchestra/Woodwind/bassoons'],
  ['band-violin', 'Band and Orchestra', 'Acme 4/4 violin', 'band-and-orchestra/String/violins'],
  ['band-viola', 'Band and Orchestra', 'Acme 16 inch viola', 'band-and-orchestra/String/violas'],
  ['band-cello', 'Band and Orchestra', 'Acme 4/4 cello', 'band-and-orchestra/String/cellos'],
  ['band-upright-bass', 'Band and Orchestra', 'Acme upright bass', 'band-and-orchestra/String/upright-bass'],
  ['drum-full-acoustic-kit', 'Drums and Percussion', 'Acme 5 piece drum kit', 'drums-and-percussion/Acoustic Drums/full-acoustic-kits'],
  ['drum-electronic-kit', 'Drums and Percussion', 'Acme electronic drum kit', 'drums-and-percussion/Electronic Drums/full-electronic-kits'],
  ['drum-snare', 'Drums and Percussion', 'Acme 14 inch snare drum', 'drums-and-percussion/Acoustic Drums/snare'],
  ['drum-marching-snare', 'Drums and Percussion', 'Acme marching snare drum', 'drums-and-percussion/Marching Percussion/marching-snare-drums'],
  ['drum-concert-snare', 'Drums and Percussion', 'Acme concert snare drum', 'drums-and-percussion/Concert Percussion/concert-snare-drums'],
  ['drum-tom', 'Drums and Percussion', 'Acme 12 inch rack tom', 'drums-and-percussion/Acoustic Drums/tom'],
  ['drum-bass-drum', 'Drums and Percussion', 'Acme 22 inch bass drum', 'drums-and-percussion/Acoustic Drums/bass-drum'],
  ['drum-crash', 'Drums and Percussion', 'Acme 16 inch crash cymbal', 'drums-and-percussion/Cymbals/crash'],
  ['drum-ride', 'Drums and Percussion', 'Acme 20 inch ride cymbal', 'drums-and-percussion/Cymbals/ride'],
  ['drum-hi-hat', 'Drums and Percussion', 'Acme 14 inch hi-hat cymbals', 'drums-and-percussion/Cymbals/hi-hats'],
  ['drum-splash-china', 'Drums and Percussion', 'Acme 10 inch splash cymbal', 'drums-and-percussion/Cymbals/other-splash-china-etc'],
  ['drum-cymbal-pack', 'Drums and Percussion', 'Acme cymbal pack', 'drums-and-percussion/Cymbals/cymbal-packs'],
  ['drum-cajon', 'Drums and Percussion', 'Acme cajon', 'drums-and-percussion/Hand Drums/cajons'],
  ['drum-djembe', 'Drums and Percussion', 'Acme djembe', 'drums-and-percussion/Hand Drums/djembes'],
  ['drum-conga-bongo', 'Drums and Percussion', 'Acme conga drum', 'drums-and-percussion/Hand Drums/congas-and-bongos'],
  ['drum-practice-pad', 'Drums and Percussion', 'Acme practice pad', 'drums-and-percussion/practice-pads'],
  ['drum-sticks', 'Drums and Percussion', 'Acme drumsticks 5A', 'drums-and-percussion/Parts and Accessories/drum-sticks-and-mallets'],
  ['drum-throne', 'Drums and Percussion', 'Acme drum throne', 'drums-and-percussion/Parts and Accessories/thrones'],
  ['drum-key', 'Drums and Percussion', 'Acme drum key', 'drums-and-percussion/Parts and Accessories/drum-keys-and-tuners'],
  ['drum-heads', 'Drums and Percussion', 'Acme 14 inch drum head', 'drums-and-percussion/Parts and Accessories/heads'],
  ['drum-pedal', 'Drums and Percussion', 'Acme double bass drum pedal', 'drums-and-percussion/Parts and Accessories/pedals'],
  ['drum-cases-bags', 'Drums and Percussion', 'Acme drum case', 'drums-and-percussion/Parts and Accessories/cases-and-bags'],
  ['drum-timpani', 'Drums and Percussion', 'Acme timpani', 'drums-and-percussion/Concert Percussion/timpani'],
  ['drum-xylophone', 'Drums and Percussion', 'Acme xylophone', 'drums-and-percussion/Mallet Percussion/xylophones'],
  ['drum-marimba', 'Drums and Percussion', 'Acme marimba', 'drums-and-percussion/Mallet Percussion/marimbas'],
  ['drum-vibraphone', 'Drums and Percussion', 'Acme vibraphone', 'drums-and-percussion/Mallet Percussion/vibraphones'],
  ['drum-glockenspiel', 'Drums and Percussion', 'Acme glockenspiel', 'drums-and-percussion/Mallet Percussion/bells-and-glockenspiels'],
  ['pro-studio-monitor', 'Pro Audio', 'Acme active studio monitor', 'pro-audio/Speakers/studio-monitors'],
  ['pro-mic-preamp', 'Pro Audio', 'Acme microphone preamp', 'pro-audio/Outboard Gear/microphone-preamps'],
  ['pro-microphone', 'Pro Audio', 'Acme dynamic microphone', 'pro-audio/microphones'],
  ['pro-audio-interface', 'Pro Audio', 'Acme USB audio interface', 'pro-audio/interfaces'],
  ['pro-powered-mixer', 'Pro Audio', 'Acme powered mixer', 'pro-audio/powered-mixers'],
  ['pro-mixer', 'Pro Audio', 'Acme 8 channel mixer', 'pro-audio/mixers'],
  ['pro-portable-pa', 'Pro Audio', 'Acme portable PA system', 'pro-audio/portable-pa-systems'],
  ['pro-di-box', 'Pro Audio', 'Acme DI box', 'pro-audio/di-boxes'],
  ['pro-portable-recorder', 'Pro Audio', 'Acme portable recorder', 'pro-audio/portable-recorders'],
  ['pro-patchbay', 'Pro Audio', 'Acme patchbay', 'pro-audio/patchbays'],
  ['pro-500-series', 'Pro Audio', 'Acme 500 series lunchbox', 'pro-audio/500-series'],
  ['pro-channel-strip', 'Pro Audio', 'Acme channel strip', 'pro-audio/Outboard Gear/channel-strips'],
  ['pro-compressor', 'Pro Audio', 'Acme rack compressor', 'pro-audio/Outboard Gear/compressors-and-limiters'],
  ['pro-power-amp', 'Pro Audio', 'Acme power amplifier', 'pro-audio/power-amps'],
  ['pro-wireless-instrument', 'Pro Audio', 'Acme wireless guitar system', 'pro-audio/Accessories/wireless-instrument-systems'],
  ['home-receiver', 'Home Audio', 'Acme stereo receiver', 'home-audio/receivers'],
  ['home-complete-stereo', 'Home Audio', 'Acme home stereo system', 'home-audio/complete-stereo-systems'],
  ['home-bookshelf-speaker', 'Home Audio', 'Acme bookshelf speakers pair', 'home-audio/Speakers/bookshelf-speakers'],
  ['home-floor-speaker', 'Home Audio', 'Acme floor standing speakers', 'home-audio/Speakers/floor-speakers'],
  ['home-subwoofer', 'Home Audio', 'Acme subwoofer', 'home-audio/Speakers/subwoofers'],
  ['home-cd-player', 'Home Audio', 'Acme CD player', 'home-audio/Digital Players/cd-players'],
  ['home-tape-deck', 'Home Audio', 'Acme tape deck', 'home-audio/tape-decks'],
  ['dj-controller', 'DJ and Lighting Gear', 'Acme DJ controller', 'dj-and-lighting-gear/dj-controllers'],
  ['dj-mixer', 'DJ and Lighting Gear', 'Acme DJ mixer', 'dj-and-lighting-gear/mixers'],
  ['dj-turntable', 'DJ and Lighting Gear', 'Acme direct drive turntable', 'dj-and-lighting-gear/turntables'],
  ['dj-lighting', 'DJ and Lighting Gear', 'Acme LED PAR stage lights', 'dj-and-lighting-gear/lighting'],
  ['parts-acoustic-pickup', 'Parts', 'Acme clip-on acoustic guitar pickup', 'parts/acoustic-pickups'],
  ['parts-bass-pickup', 'Parts', 'Acme bass pickup set', 'parts/bass-pickups'],
  ['parts-guitar-pickup', 'Parts', 'Acme humbucker pickup', 'parts/guitar-pickups'],
  ['parts-tubes', 'Parts', 'Acme 12AX7 preamp tubes matched pair', 'parts/tubes'],
  ['parts-pickguard', 'Parts', 'Acme 3 ply pickguard', 'parts/pickguards'],
  ['parts-tuning-heads', 'Parts', 'Acme tuning machines set of six', 'parts/tuning-heads'],
  ['parts-bridge', 'Parts', 'Acme tune-o-matic bridge', 'parts/Guitar Parts/bridges'],
  ['parts-bridge-pins', 'Parts', 'Acme bridge pins ebony', 'parts/Guitar Parts/bridge-pins'],
  ['parts-tailpiece', 'Parts', 'Acme stop tailpiece', 'parts/Guitar Parts/tailpieces'],
  ['acc-capo', 'Accessories', 'Acme capo', 'accessories/capos'],
  ['acc-picks', 'Accessories', 'Acme pick assortment', 'accessories/picks'],
  ['acc-strap', 'Accessories', 'Acme woven strap', 'accessories/straps'],
  ['acc-tuner', 'Accessories', 'Acme clip-on tuner', 'accessories/tuners'],
  ['acc-cable-adapter', 'Accessories', 'Acme splitter cable', 'accessories/cable-adapters-and-splitters'],
  ['acc-cable', 'Accessories', 'Acme instrument cable 10 ft', 'accessories/cables'],
  ['acc-humidifier', 'Accessories', 'Acme soundhole humidifier', 'accessories/humidifiers'],
  ['acc-metronome', 'Accessories', 'Acme metronome', 'accessories/metronome'],
  ['acc-power-supply', 'Accessories', 'Acme 9V power supply', 'accessories/power-supplies'],
  ['acc-stand', 'Accessories', 'Acme folding music stand', 'accessories/stands'],
  ['acc-slide', 'Accessories', 'Acme glass slide', 'accessories/slides'],
  ['acc-headphones', 'Accessories', 'Acme studio headphones', 'accessories/headphones'],
  ['acc-bass-case', 'Accessories', 'Acme bass hardshell case', 'accessories/Cases and Gig Bags/bass-cases'],
  ['acc-bass-gig-bag', 'Accessories', 'Acme bass gig bag', 'accessories/Cases and Gig Bags/bass-gig-bags'],
  ['acc-guitar-case', 'Accessories', 'Acme electric guitar hard case', 'accessories/Cases and Gig Bags/guitar-cases'],
  ['acc-guitar-gig-bag', 'Accessories', 'Acme acoustic gig bag', 'accessories/Cases and Gig Bags/guitar-gig-bags'],
  ['acc-guitar-strings', 'Accessories', 'Acme guitar strings light gauge', 'accessories/Strings/guitar-strings'],
  ['acc-bass-strings', 'Accessories', 'Acme bass strings', 'accessories/Strings/bass-strings'],
  ['acc-banjo-strings', 'Accessories', 'Acme banjo strings', 'accessories/Strings/banjo-strings'],
  ['acc-mandolin-strings', 'Accessories', 'Acme mandolin strings', 'accessories/Strings/mandolin-strings'],
  ['acc-ukulele-strings', 'Accessories', 'Acme ukulele strings', 'accessories/Strings/ukulele-strings'],
];

describe('reverbCategoryResolver: one synthetic fixture per rule', () => {
  it('every non-blank rule has a fixture and every fixture resolves through that rule', () => {
    const covered = new Set(FIXTURES.map((f) => f[0]));
    for (const rule of REVERB_RULES) {
      if (rule.target === null) continue;
      expect(covered.has(rule.id)).toBe(true);
    }
    expect(FIXTURES.length).toBeGreaterThan(150);
  });

  it.each(FIXTURES)('%s: "%s" -> %s', (ruleId, top, title, expected) => {
    const x = explainReverbSubcategory({ topLevelName: top, title });
    expect(x.reason).toBe('');
    expect(x.result).not.toBeNull();
    expect(x.result!.slug).toBe(expected);
    expect(x.result!.source).toBe('RULE');
    expect(x.detail.split(',')).toContain(ruleId);
    expect(isReverbLeaf(x.result!.slug)).toBe(true);
  });
});

describe('reverbCategoryResolver: headline cases', () => {
  it('a guitar combo amp resolves from the eBay category text plus the title', () => {
    expect(slugOf('Amps', 'Acme LA15R Combo Amplifier', { ebayCategoryName: 'Guitar Amplifiers' })).toBe('amps/Guitar Amps/guitar-combos');
  });

  it('a bass combo and a guitar combo are different leaves', () => {
    expect(slugOf('Amps', 'Acme BA100 Bass Combo Amplifier')).toBe('amps/Bass Amps/bass-combos');
    expect(slugOf('Amps', 'Acme GA100 Guitar Combo Amplifier')).toBe('amps/Guitar Amps/guitar-combos');
  });

  it('an acoustic-electric guitar goes to built-in-electronics, a plain dreadnought to dreadnought', () => {
    expect(slugOf('Acoustic Guitars', 'Acme acoustic/electric guitar, natural')).toBe('acoustic-guitars/built-in-electronics');
    expect(slugOf('Acoustic Guitars', 'Acme dreadnought acoustic guitar, natural')).toBe('acoustic-guitars/dreadnought');
  });

  it('a fretless bass and a semi-hollow electric are found through hyphenated and plural wording', () => {
    expect(slugOf('Bass Guitars', 'Acme Fretless Bass')).toBe('bass-guitars/fretless');
    expect(slugOf('Electric Guitars', 'Acme ES-style Semi-Hollow Body Guitar')).toBe('electric-guitars/semi-hollow');
  });

  it('a bundled case does not turn an instrument into a case', () => {
    expect(slugOf('Folk Instruments', 'Acme ukulele soprano with a padded carrying case')).toBe('folk-instruments/ukuleles');
    expect(slugOf('Folk Instruments', 'Acme ukulele soprano, includes gig bag')).toBe('folk-instruments/ukuleles');
  });

  it('normalizes accents, entities and punctuation', () => {
    expect(normalizeReverbText('Hi-Hat &amp; Ride (14")')).toBe('hi hat and ride 14');
    expect(normalizeReverbText(null)).toBe('');
  });
});

describe('reverbCategoryResolver: null on ambiguity (never a guess)', () => {
  it('two different facets of a guitar name two leaves, so null', () => {
    expect(slugOf('Electric Guitars', 'Acme left-handed 12-string electric guitar')).toBeNull();
    expect(slugOf('Electric Guitars', 'Acme left-handed Stratocaster')).toBeNull();
    expect(slugOf('Acoustic Guitars', 'Acme left-handed dreadnought acoustic guitar')).toBeNull();
    expect(slugOf('Acoustic Guitars', 'Acme dreadnought acoustic-electric guitar')).toBeNull();
    expect(slugOf('Bass Guitars', 'Acme 5-string fretless bass')).toBeNull();
    expect(slugOf('Electric Guitars', 'Acme archtop hollow body guitar')).toBeNull();
  });

  it('acoustic-electric vs acoustic: electronics named only in the description never pick a leaf', () => {
    const t = 'Acme dreadnought acoustic guitar';
    expect(slugOf('Acoustic Guitars', t)).toBe('acoustic-guitars/dreadnought');
    expect(slugOf('Acoustic Guitars', t, { description: 'Great player with a built in electronics preamp and tuner' })).toBeNull();
    expect(slugOf('Acoustic Guitars', t, { description: 'Solid spruce top, no electronics' })).toBe('acoustic-guitars/dreadnought');
  });

  it('a plain unqualified guitar has no sub-category: the type is not named, so it is not guessed', () => {
    expect(slugOf('Acoustic Guitars', 'Acme F-325 Acoustic Guitar, Natural Spruce')).toBeNull();
    expect(slugOf('Electric Guitars', 'Acme headless electric guitar teal')).toBeNull();
    expect(slugOf('Bass Guitars', 'Acme Ashbory Bass Guitar, Red with Case')).toBeNull();
  });

  it('bass vs electric vs guitar/bass naming both', () => {
    expect(slugOf('Amps', 'Acme guitar/bass combo amplifier')).toBeNull();
    expect(slugOf('Amps', 'Acme guitar bass combo amp')).toBeNull();
    expect(slugOf('Amps', 'Acme bass guitar amplifier')).toBeNull(); // no combo/head/cabinet named
    expect(slugOf('Amps', 'Acme Guitar Amplifier')).toBeNull();
  });

  it('amp vs combo: a combo that is also a practice/modeling/acoustic amp is not the generic combo leaf', () => {
    expect(slugOf('Amps', 'Acme Guitar Modeling Combo Amp')).toBe('amps/Guitar Amps/guitar-modeling-amps');
    expect(slugOf('Amps', 'Acme practice guitar combo amp')).toBe('amps/small-amps');
    expect(slugOf('Amps', 'Acme Guitar Amp 1x12')).toBeNull(); // a speaker layout alone does not say combo or cabinet
    expect(slugOf('Amps', 'Acme Guitar Combo Amp with tube preamp')).toBeNull();
    expect(slugOf('Amps', 'Acme Guitar Power Amp combo')).toBeNull();
    expect(slugOf('Amps', 'Acme Guitar Preamp')).toBe('amps/Guitar Amps/guitar-preamps');
    expect(slugOf('Amps', 'Acme acoustic guitar combo amp')).toBe('amps/Guitar Amps/acoustic-guitar-amps');
    expect(slugOf('Amps', 'Acme Guitar Amp Head with 4x12 Cabinet')).toBeNull();
  });

  it('a speaker cabinet sold with an amplifier is a bundle, so null', () => {
    expect(slugOf('Amps', 'Acme G12 Vintage Guitar Speaker Cabinet with Stage Right Amplifier')).toBeNull();
    expect(slugOf('Amps', 'Acme Guitar Speaker Cabinet 2x12')).toBe('amps/Guitar Amps/guitar-cabinets');
  });

  it('pedal types: two types named is null; a bass pedal that is also a distortion is null', () => {
    expect(slugOf('Effects and Pedals', 'Acme delay and reverb pedal')).toBeNull();
    expect(slugOf('Effects and Pedals', 'Acme chorus flanger pedal')).toBeNull();
    expect(slugOf('Effects and Pedals', 'Acme bass distortion effects pedal')).toBeNull();
    expect(slugOf('Effects and Pedals', 'Acme pedalboard with 4 pedals: delay, fuzz')).toBeNull();
    expect(slugOf('Effects and Pedals', 'Acme guitar effects pedal')).toBeNull();
  });

  it('cymbals: crash/ride names two leaves, so null; a kit that includes a snare is still the kit', () => {
    expect(slugOf('Drums and Percussion', 'Acme 18 inch crash ride cymbal')).toBeNull();
    expect(slugOf('Drums and Percussion', 'Acme 5 piece drum kit with 14 inch snare')).toBe('drums-and-percussion/Acoustic Drums/full-acoustic-kits'); // a kit that includes a snare is still a kit
    expect(slugOf('Drums and Percussion', 'Acme 14 inch snare drum and rack tom')).toBeNull();
  });
});

describe('reverbCategoryResolver: accessories and parts never become the instrument leaf', () => {
  it.each([
    ['Electric Guitars', 'Acme Guitar Strap, Blue Woven'],
    ['Electric Guitars', 'Acme Chromatic Guitar Tuner'],
    ['Electric Guitars', 'Acme Stratocaster Pickguard'],
    ['Electric Guitars', 'Acme Stratocaster with Seymour pickups'],
    ['Electric Guitars', 'Acme Les Paul guitar and amp package'],
    ['Electric Guitars', 'Acme pedal board for electric guitar'],
    ['Acoustic Guitars', 'Acme dreadnought guitar case'],
    ['Acoustic Guitars', 'Acme acoustic guitar strings 12 string set'],
    ['Acoustic Guitars', 'Acme acoustic guitar humidifier'],
    ['Bass Guitars', 'Acme bass guitar strap'],
    ['Bass Guitars', 'Acme 4-string bass guitar cable'],
  ])('%s: "%s" -> null', (top, title) => {
    expect(slugOf(top, title)).toBeNull();
    expect(explainReverbSubcategory({ topLevelName: top, title }).stage).toBe('blank');
  });

  it('a pedal steel is not blocked by the "pedal" accessory word', () => {
    expect(slugOf('Electric Guitars', 'Acme pedal steel guitar')).toBe('electric-guitars/pedal-steel');
  });

  it('instrument rules ignore accessories: ukulele strings are not a ukulele, a saxophone mouthpiece is not a saxophone', () => {
    expect(slugOf('Folk Instruments', 'Acme ukulele strings')).toBeNull();
    expect(slugOf('Folk Instruments', 'Acme ukulele case')).toBeNull();
    expect(slugOf('Band and Orchestra', 'Acme alto saxophone mouthpiece')).toBeNull();
    expect(slugOf('Band and Orchestra', 'Acme trumpet mute')).toBeNull();
    expect(slugOf('Pro Audio', 'Acme microphone cable XLR')).toBeNull();
    expect(slugOf('Pro Audio', 'Acme microphone stand')).toBeNull();
    expect(slugOf('Pro Audio', 'Acme wireless microphone system')).toBeNull();
  });

  it('a whole guitar that mentions pickups is not a pickup (Parts)', () => {
    expect(slugOf('Parts', 'Acme Stratocaster with Seymour pickups')).toBeNull();
    expect(slugOf('Parts', 'Acme electric guitar with new humbucker pickups')).toBeNull();
  });
});

describe('reverbCategoryResolver: the top-level category is never changed', () => {
  it('the same title resolves under its own top-level category and to null under any other', () => {
    const title = 'Acme Guitar Combo Amplifier';
    expect(slugOf('Amps', title)).toBe('amps/Guitar Amps/guitar-combos');
    for (const name of Object.keys(REVERB_TOP_LEVEL_NAMES).map((k) => REVERB_TOP_LEVEL_NAMES[k])) {
      if (name === 'Amps') continue;
      expect(slugOf(name, title)).toBeNull();
    }
  });

  it('an unknown or missing top-level category is null', () => {
    expect(slugOf('Guitars', 'Acme Guitar Combo Amplifier')).toBeNull();
    expect(resolveReverbSubcategory({ title: 'Acme Guitar Combo Amplifier' })).toBeNull();
    expect(resolveReverbSubcategory({ topLevelName: null, title: 'Acme Guitar Combo Amplifier' })).toBeNull();
  });
});

describe('reverbCategoryResolver: curated eBay category ids', () => {
  it('Ukuleles (16224) resolves with source CURATED_ID', () => {
    const r = resolveReverbSubcategory({ topLevelName: 'Folk Instruments', ebayCategoryId: '16224', ebayCategoryName: 'Ukuleles', title: 'Acme Soprano Ukulele' });
    expect(r!.slug).toBe('folk-instruments/ukuleles');
    expect(r!.source).toBe('CURATED_ID');
    expect(resolveReverbSubcategory({ topLevelName: 'Folk Instruments', ebayCategoryId: 16224, title: 'Acme Soprano' })!.source).toBe('CURATED_ID');
  });

  it('Pickups (22670) is split by type and needs a type word', () => {
    const base = { topLevelName: 'Parts', ebayCategoryId: '22670', ebayCategoryName: 'Pickups' };
    expect(resolveReverbSubcategory({ ...base, title: 'Acme clip-on acoustic guitar pickup' })!.slug).toBe('parts/acoustic-pickups');
    expect(resolveReverbSubcategory({ ...base, title: 'Acme P-Bass pickup' })!.slug).toBe('parts/bass-pickups');
    expect(resolveReverbSubcategory({ ...base, title: 'Acme single coil pickup set' })!.slug).toBe('parts/guitar-pickups');
    expect(resolveReverbSubcategory({ ...base, title: 'Acme pickup' })).toBeNull();
    expect(resolveReverbSubcategory({ ...base, title: 'Acme acoustic bass pickup' })).toBeNull(); // two leaves match
  });

  it('a curated leaf under a different top-level category than the connector chose is ignored (item stays where it was)', () => {
    // Guitar strap titled with "guitar": the connector's keyword rules sort it into Electric Guitars.
    expect(resolveReverbSubcategory({ topLevelName: 'Electric Guitars', ebayCategoryId: '46677', ebayCategoryName: 'Straps', title: 'Acme Guitar Strap' })).toBeNull();
    // The same eBay id under Accessories resolves.
    expect(resolveReverbSubcategory({ topLevelName: 'Accessories', ebayCategoryId: '46677', ebayCategoryName: 'Straps', title: 'Acme Woven Strap' })!.slug).toBe('accessories/straps');
  });

  it('cables (41459): adapters and splitters are a deliberate blank, everything else is Cables', () => {
    const base = { topLevelName: 'Accessories', ebayCategoryId: '41459', ebayCategoryName: 'Cables, Snakes & Interconnects' };
    expect(resolveReverbSubcategory({ ...base, title: 'Acme TRS Patch Cable, Yellow, 10 ft' })!.slug).toBe('accessories/cables');
    expect(resolveReverbSubcategory({ ...base, title: 'Acme Y Cable splitter' })).toBeNull();
    expect(resolveReverbSubcategory({ ...base, title: 'Acme 8 channel snake' })).toBeNull();
  });

  it('cases (41408): guitar/bass naming both is ambiguous, soft bags are a blank', () => {
    const base = { topLevelName: 'Accessories', ebayCategoryId: '41408', ebayCategoryName: 'Cases' };
    expect(resolveReverbSubcategory({ ...base, title: 'Acme bass hardshell case' })!.slug).toBe('accessories/Cases and Gig Bags/bass-cases');
    expect(resolveReverbSubcategory({ ...base, title: 'Acme guitar hardshell case' })!.slug).toBe('accessories/Cases and Gig Bags/guitar-cases');
    expect(resolveReverbSubcategory({ ...base, title: 'Acme guitar/bass hardshell case' })).toBeNull();
    expect(resolveReverbSubcategory({ ...base, title: 'Acme guitar soft case' })).toBeNull();
  });

  it('families with no curated leaf (Acoustic Guitars 33021, Guitar Amplifiers 38072) fall through to the rules', () => {
    expect(resolveReverbSubcategory({ topLevelName: 'Acoustic Guitars', ebayCategoryId: '33021', ebayCategoryName: 'Acoustic Guitars', title: 'Acme F-325 Acoustic Guitar' })).toBeNull();
    const x = explainReverbSubcategory({ topLevelName: 'Amps', ebayCategoryId: '38072', ebayCategoryName: 'Guitar Amplifiers', title: 'Acme Combo Amp' });
    expect(x.result!.slug).toBe('amps/Guitar Amps/guitar-combos');
    expect(x.result!.source).toBe('RULE');
  });

  it('an unknown eBay id changes nothing', () => {
    expect(slugOf('Amps', 'Acme Guitar Combo Amplifier', { ebayCategoryId: '999999999' })).toBe('amps/Guitar Amps/guitar-combos');
    expect(slugOf('Amps', 'Acme Guitar Combo Amplifier', { ebayCategoryId: '' })).toBe('amps/Guitar Amps/guitar-combos');
    expect(slugOf('Amps', 'Acme Guitar Combo Amplifier', { ebayCategoryId: 'constructor' })).toBe('amps/Guitar Amps/guitar-combos');
  });
});

describe('reverbCategoryResolver: never throws', () => {
  it('garbage input is null', () => {
    expect(resolveReverbSubcategory({} as any)).toBeNull();
    expect(resolveReverbSubcategory(null as any)).toBeNull();
    expect(resolveReverbSubcategory(undefined as any)).toBeNull();
    expect(resolveReverbSubcategory({ topLevelName: 'Amps', title: 12345 as any, description: {} as any, brand: [] as any })).toBeNull();
    expect(resolveReverbSubcategory({ topLevelName: 'Amps', title: 'x'.repeat(100000) })).toBeNull();
  });
});
