/**
 * reverbCategoryTree.ts -- Reverb's category tree below the 14 top-level categories, as compact data plus
 * small lookup helpers. Dependency-free on purpose: no imports, no env, no I/O, safe to import from any
 * BACKEND file (never from the frontend or @findasale/shared).
 *
 * SOURCE: Reverb's public category structure, read from the saved tree file
 * .tmp-scratch/category-trees/reverb-tree-2026-10-04.txt (captured 2026-10-04) and committed here on
 * 2026-10-05. No Reverb API call was made to build or verify this file. The tree carries titles and slugs
 * only, NO UUIDs: UUIDs are resolved at call time from the live GET /categories/flat response that
 * reverbConnector.ts already fetches (see pickReverbSubcategoryUuid there).
 *
 * SHAPE: one line per node, the node id, which is its slash path from the top-level slug
 * ("amps/Guitar Amps/guitar-combos"). The last segment is the node's own title: a slug for every leaf and
 * for the top-level categories, and a display name for the grouping nodes ("Guitar Amps"). A node's parent
 * is its id minus the last segment. Parents are listed before children.
 * TOTALS (asserted by __tests__/reverbCategoryResolver.test.ts): 350 nodes = 14 top-level categories,
 * 30 grouping nodes, 306 leaves; max depth 4 (a top-level category has depth 1).
 *
 * Leaf slugs are NOT unique across top-level categories (13 repeat, e.g. "12-string", "delay", "cables"),
 * so always address a leaf by its full id and compare a live /categories/flat entry on slug AND root slug.
 * Reverb can change this tree at any time; refresh this file and re-run the tests when it does.
 */

export interface ReverbNode {
  /** Full slash path, unique. */
  id: string;
  /** Parent id, '' for a top-level category. */
  parentId: string;
  /** Last path segment. */
  title: string;
  /** 1 for a top-level category. */
  depth: number;
  childIds: string[];
}

export const REVERB_CATEGORY_TREE_RAW = `
accessories
accessories/amp-covers
accessories/books-and-dvds
accessories/cable-adapters-and-splitters
accessories/cables
accessories/capos
accessories/case-candy
accessories/headphones
accessories/humidifiers
accessories/merchandise
accessories/metronome
accessories/picks
accessories/power-supplies
accessories/slides
accessories/stands
accessories/straps
accessories/tools
accessories/tuners
accessories/Cases and Gig Bags
accessories/Cases and Gig Bags/bass-cases
accessories/Cases and Gig Bags/bass-gig-bags
accessories/Cases and Gig Bags/guitar-cases
accessories/Cases and Gig Bags/guitar-gig-bags
accessories/Strings
accessories/Strings/banjo-strings
accessories/Strings/bass-strings
accessories/Strings/guitar-strings
accessories/Strings/mandolin-strings
accessories/Strings/other-strings
accessories/Strings/ukulele-strings
acoustic-guitars
acoustic-guitars/12-string
acoustic-guitars/archtop
acoustic-guitars/baritone
acoustic-guitars/built-in-electronics
acoustic-guitars/classical
acoustic-guitars/concert
acoustic-guitars/dreadnought
acoustic-guitars/jumbo
acoustic-guitars/left-handed
acoustic-guitars/mini-slash-travel
acoustic-guitars/om-and-auditorium
acoustic-guitars/parlor
acoustic-guitars/resonator
acoustic-guitars/tenor
amps
amps/amp-attenuators
amps/boutique-amps
amps/electronic-drum-amps
amps/keyboard-amps
amps/small-amps
amps/Bass Amps
amps/Bass Amps/bass-amp-stacks
amps/Bass Amps/bass-cabinets
amps/Bass Amps/bass-combos
amps/Bass Amps/bass-headphone-amps
amps/Bass Amps/bass-heads
amps/Bass Amps/bass-modeling-amps
amps/Bass Amps/bass-preamps
amps/Bass Amps/pedalboard-bass-amps
amps/Guitar Amps
amps/Guitar Amps/acoustic-guitar-amps
amps/Guitar Amps/guitar-amp-stacks
amps/Guitar Amps/guitar-cabinets
amps/Guitar Amps/guitar-combos
amps/Guitar Amps/guitar-headphone-amps
amps/Guitar Amps/guitar-heads
amps/Guitar Amps/guitar-modeling-amps
amps/Guitar Amps/guitar-power-amps
amps/Guitar Amps/guitar-preamps
amps/Guitar Amps/pedalboard-guitar-amps
band-and-orchestra
band-and-orchestra/Brass
band-and-orchestra/Brass/baritone
band-and-orchestra/Brass/brass-accessories
band-and-orchestra/Brass/french-horns
band-and-orchestra/Brass/trombones
band-and-orchestra/Brass/trumpets
band-and-orchestra/Brass/tubas
band-and-orchestra/String
band-and-orchestra/String/cellos
band-and-orchestra/String/harps
band-and-orchestra/String/string-accessories
band-and-orchestra/String/upright-bass
band-and-orchestra/String/violas
band-and-orchestra/String/violins
band-and-orchestra/Woodwind
band-and-orchestra/Woodwind/bassoons
band-and-orchestra/Woodwind/clarinets
band-and-orchestra/Woodwind/flutes
band-and-orchestra/Woodwind/oboes
band-and-orchestra/Woodwind/saxophones
band-and-orchestra/Woodwind/woodwind-accessories
bass-guitars
bass-guitars/4-string
bass-guitars/5-string-or-more
bass-guitars/acoustic-bass-guitars
bass-guitars/active-electronics
bass-guitars/fretless
bass-guitars/left-handed
bass-guitars/short-scale
dj-and-lighting-gear
dj-and-lighting-gear/all-in-one-dj-systems
dj-and-lighting-gear/dj-controllers
dj-and-lighting-gear/dj-interfaces
dj-and-lighting-gear/lighting
dj-and-lighting-gear/mixers
dj-and-lighting-gear/turntables
drums-and-percussion
drums-and-percussion/auxiliary-percussion
drums-and-percussion/pad-controllers
drums-and-percussion/practice-pads
drums-and-percussion/Acoustic Drums
drums-and-percussion/Acoustic Drums/bass-drum
drums-and-percussion/Acoustic Drums/full-acoustic-kits
drums-and-percussion/Acoustic Drums/snare
drums-and-percussion/Acoustic Drums/tom
drums-and-percussion/Concert Percussion
drums-and-percussion/Concert Percussion/concert-bass-drums
drums-and-percussion/Concert Percussion/concert-cymbals
drums-and-percussion/Concert Percussion/concert-snare-drums
drums-and-percussion/Concert Percussion/concert-toms
drums-and-percussion/Concert Percussion/gongs
drums-and-percussion/Concert Percussion/timpani
drums-and-percussion/Cymbals
drums-and-percussion/Cymbals/crash
drums-and-percussion/Cymbals/cymbal-packs
drums-and-percussion/Cymbals/hi-hats
drums-and-percussion/Cymbals/other-splash-china-etc
drums-and-percussion/Cymbals/ride
drums-and-percussion/Electronic Drums
drums-and-percussion/Electronic Drums/full-electronic-kits
drums-and-percussion/Electronic Drums/modules
drums-and-percussion/Hand Drums
drums-and-percussion/Hand Drums/cajons
drums-and-percussion/Hand Drums/congas-and-bongos
drums-and-percussion/Hand Drums/djembes
drums-and-percussion/Hand Drums/shakers
drums-and-percussion/Mallet Percussion
drums-and-percussion/Mallet Percussion/bells-and-glockenspiels
drums-and-percussion/Mallet Percussion/marimbas
drums-and-percussion/Mallet Percussion/vibraphones
drums-and-percussion/Mallet Percussion/xylophones
drums-and-percussion/Marching Percussion
drums-and-percussion/Marching Percussion/marching-bass-drums
drums-and-percussion/Marching Percussion/marching-cymbals
drums-and-percussion/Marching Percussion/marching-snare-drums
drums-and-percussion/Marching Percussion/marching-toms-and-tenors
drums-and-percussion/Parts and Accessories
drums-and-percussion/Parts and Accessories/cases-and-bags
drums-and-percussion/Parts and Accessories/drum-keys-and-tuners
drums-and-percussion/Parts and Accessories/drum-parts
drums-and-percussion/Parts and Accessories/drum-sticks-and-mallets
drums-and-percussion/Parts and Accessories/heads
drums-and-percussion/Parts and Accessories/mounts
drums-and-percussion/Parts and Accessories/pedals
drums-and-percussion/Parts and Accessories/stands
drums-and-percussion/Parts and Accessories/thrones
effects-and-pedals
effects-and-pedals/amp-simulators
effects-and-pedals/bass-pedals
effects-and-pedals/buffer
effects-and-pedals/cabinet-simulators
effects-and-pedals/chorus-and-vibrato
effects-and-pedals/compression-and-sustain
effects-and-pedals/controllers-volume-and-expression
effects-and-pedals/delay
effects-and-pedals/distortion
effects-and-pedals/eq
effects-and-pedals/flanger
effects-and-pedals/fuzz
effects-and-pedals/guitar-synths
effects-and-pedals/loop-pedals-and-samplers
effects-and-pedals/multi-effect-unit
effects-and-pedals/noise-generators
effects-and-pedals/noise-and-reduction-gates
effects-and-pedals/octave-and-pitch
effects-and-pedals/overdrive-and-boost
effects-and-pedals/pedalboards-and-power-supplies
effects-and-pedals/phase-shifters
effects-and-pedals/preamps
effects-and-pedals/reverb
effects-and-pedals/ring-modulators
effects-and-pedals/tremolo
effects-and-pedals/tuning-pedals
effects-and-pedals/vocal
effects-and-pedals/wahs-and-filters
electric-guitars
electric-guitars/12-string
electric-guitars/archtop
electric-guitars/baritone
electric-guitars/hollow-body
electric-guitars/lap-steel
electric-guitars/left-handed
electric-guitars/pedal-steel
electric-guitars/semi-hollow
electric-guitars/solid-body
electric-guitars/tenor
electric-guitars/travel-slash-mini
folk-instruments
folk-instruments/accordions
folk-instruments/bajo-quintos
folk-instruments/bajo-sextos
folk-instruments/banjos
folk-instruments/guitarrones
folk-instruments/harmonicas
folk-instruments/harmoniums
folk-instruments/mandolins
folk-instruments/ouds
folk-instruments/shrutis
folk-instruments/sitars
folk-instruments/ukuleles
folk-instruments/vihuelas
home-audio
home-audio/amplifiers
home-audio/cables
home-audio/complete-stereo-systems
home-audio/equalizers
home-audio/power-distribution-and-conditioning
home-audio/preamps
home-audio/receivers
home-audio/tape-decks
home-audio/tuners-and-radios
home-audio/turntables
home-audio/Digital Players
home-audio/Digital Players/cd-players
home-audio/Digital Players/dacs
home-audio/Digital Players/media-servers
home-audio/Digital Players/portable-digital-players
home-audio/Digital Players/streamers
home-audio/Headphones
home-audio/Headphones/closed-back-headphones
home-audio/Headphones/in-ear-headphones
home-audio/Headphones/noise-canceling-headphones
home-audio/Headphones/on-ear-headphones
home-audio/Headphones/open-back-headphones
home-audio/Headphones/over-ear-headphones
home-audio/Headphones/wireless-headphones
home-audio/Parts and Accessories
home-audio/Parts and Accessories/headphone-parts-and-accessories
home-audio/Parts and Accessories/speaker-parts-and-accessories
home-audio/Parts and Accessories/turntable-parts-and-accessories
home-audio/Speakers
home-audio/Speakers/bookshelf-speakers
home-audio/Speakers/floor-speakers
home-audio/Speakers/in-wall-speakers
home-audio/Speakers/outdoor-speakers
home-audio/Speakers/portable-speaker-systems
home-audio/Speakers/subwoofers
home-audio/Speakers/surround-and-satellite-speakers
home-audio/Speakers/wireless-speakers
keyboards-and-synths
keyboards-and-synths/arranger-keyboards
keyboards-and-synths/drum-machines
keyboards-and-synths/electric-pianos
keyboards-and-synths/grooveboxes
keyboards-and-synths/keyboard-and-synth-parts
keyboards-and-synths/organs
keyboards-and-synths/portable-keyboards
keyboards-and-synths/samplers
keyboards-and-synths/sequencers
keyboards-and-synths/workstation-keyboards
keyboards-and-synths/Acoustic Pianos
keyboards-and-synths/Acoustic Pianos/grand-pianos
keyboards-and-synths/Acoustic Pianos/upright-pianos
keyboards-and-synths/Digital Pianos
keyboards-and-synths/Digital Pianos/digital-home-pianos
keyboards-and-synths/Digital Pianos/digital-stage-pianos
keyboards-and-synths/Keyboard and Synth Accessories
keyboards-and-synths/Keyboard and Synth Accessories/keyboard-sustain-pedals
keyboards-and-synths/Keyboard and Synth Accessories/keyboard-and-piano-benches
keyboards-and-synths/Keyboard and Synth Accessories/keyboard-and-synth-cases
keyboards-and-synths/Keyboard and Synth Accessories/keyboard-and-synth-covers
keyboards-and-synths/Keyboard and Synth Accessories/keyboard-and-synth-gig-bags
keyboards-and-synths/Keyboard and Synth Accessories/keyboard-and-synth-stands
keyboards-and-synths/Keyboard and Synth Accessories/Modular Synth Accessories
keyboards-and-synths/Keyboard and Synth Accessories/Modular Synth Accessories/blank-modular-synth-panels
keyboards-and-synths/Keyboard and Synth Accessories/Modular Synth Accessories/modular-synth-dsp-cards
keyboards-and-synths/Keyboard and Synth Accessories/Modular Synth Accessories/modular-synth-power-supplies
keyboards-and-synths/Keyboard and Synth Accessories/Modular Synth Accessories/modular-synth-splitters-slash-hubs
keyboards-and-synths/MIDI Controllers
keyboards-and-synths/MIDI Controllers/foot-pedal-midi-controllers
keyboards-and-synths/MIDI Controllers/keyboard-midi-controllers
keyboards-and-synths/MIDI Controllers/keytar-midi-controllers
keyboards-and-synths/MIDI Controllers/pad-midi-controllers
keyboards-and-synths/MIDI Controllers/wind-midi-controllers
keyboards-and-synths/Synths
keyboards-and-synths/Synths/analog-synths
keyboards-and-synths/Synths/desktop-synths
keyboards-and-synths/Synths/digital-synths
keyboards-and-synths/Synths/eurorack
keyboards-and-synths/Synths/keyboard-synths
keyboards-and-synths/Synths/rackmount-synths
keyboards-and-synths/Synths/vocoders
keyboards-and-synths/Synths/Modular Synths
keyboards-and-synths/Synths/Modular Synths/complete-modular-synth-systems
keyboards-and-synths/Synths/Modular Synths/modular-synth-cases
keyboards-and-synths/Synths/Modular Synths/synth-modules
parts
parts/acoustic-pickups
parts/amp-parts
parts/bass-guitar-parts
parts/bass-pickups
parts/guitar-bodies
parts/guitar-pickups
parts/knobs
parts/pedal-parts
parts/pickguards
parts/replacement-speakers
parts/tubes
parts/tuning-heads
parts/Guitar Parts
parts/Guitar Parts/bridge-pins
parts/Guitar Parts/bridges
parts/Guitar Parts/necks
parts/Guitar Parts/tailpieces
pro-audio
pro-audio/500-series
pro-audio/software
pro-audio/di-boxes
pro-audio/interfaces
pro-audio/microphones
pro-audio/mixers
pro-audio/patchbays
pro-audio/portable-pa-systems
pro-audio/portable-recorders
pro-audio/power-amps
pro-audio/powered-mixers
pro-audio/recording
pro-audio/studio-furniture
pro-audio/Accessories
pro-audio/Accessories/wireless-instrument-systems
pro-audio/Accessories/wireless-receivers
pro-audio/Accessories/wireless-transmitters
pro-audio/Outboard Gear
pro-audio/Outboard Gear/ad-da-converters
pro-audio/Outboard Gear/channel-strips
pro-audio/Outboard Gear/compressors-and-limiters
pro-audio/Outboard Gear/delay
pro-audio/Outboard Gear/equalizers
pro-audio/Outboard Gear/gates-and-expanders
pro-audio/Outboard Gear/microphone-preamps
pro-audio/Outboard Gear/multi-effect
pro-audio/Outboard Gear/reverb
pro-audio/Outboard Gear/summing
pro-audio/Outboard Gear/utility
pro-audio/Speakers
pro-audio/Speakers/passive-speakers
pro-audio/Speakers/powered-speakers
pro-audio/Speakers/studio-monitors
`;

/** Top-level slug -> the display name reverbConnector.ts uses (the keys of its top-level UUID table). */
export const REVERB_TOP_LEVEL_NAMES: Record<string, string> = {
  accessories: 'Accessories',
  'acoustic-guitars': 'Acoustic Guitars',
  amps: 'Amps',
  'band-and-orchestra': 'Band and Orchestra',
  'bass-guitars': 'Bass Guitars',
  'dj-and-lighting-gear': 'DJ and Lighting Gear',
  'drums-and-percussion': 'Drums and Percussion',
  'effects-and-pedals': 'Effects and Pedals',
  'electric-guitars': 'Electric Guitars',
  'folk-instruments': 'Folk Instruments',
  'home-audio': 'Home Audio',
  'keyboards-and-synths': 'Keyboards and Synths',
  parts: 'Parts',
  'pro-audio': 'Pro Audio',
};

function buildNodes(): { nodes: ReverbNode[]; byId: Map<string, ReverbNode> } {
  const nodes: ReverbNode[] = [];
  const byId = new Map<string, ReverbNode>();
  for (const line of REVERB_CATEGORY_TREE_RAW.split('\n')) {
    const id = line.trim();
    if (!id) continue;
    const cut = id.lastIndexOf('/');
    const node: ReverbNode = {
      id,
      parentId: cut === -1 ? '' : id.slice(0, cut),
      title: cut === -1 ? id : id.slice(cut + 1),
      depth: id.split('/').length,
      childIds: [],
    };
    nodes.push(node);
    byId.set(id, node);
  }
  for (const n of nodes) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) parent.childIds.push(n.id);
  }
  return { nodes, byId };
}

const BUILT = buildNodes();

export const REVERB_NODES: ReverbNode[] = BUILT.nodes;

export function getReverbNode(id: string): ReverbNode | undefined {
  return BUILT.byId.get(id);
}

export function isReverbLeaf(id: string): boolean {
  const n = BUILT.byId.get(id);
  return !!n && n.childIds.length === 0 && n.parentId !== '';
}

/** First path segment: the top-level category slug. */
export function reverbTopSlug(id: string): string {
  const cut = id.indexOf('/');
  return cut === -1 ? id : id.slice(0, cut);
}

/** Last path segment: the leaf's own Reverb slug. */
export function reverbLeafSlug(id: string): string {
  const cut = id.lastIndexOf('/');
  return cut === -1 ? id : id.slice(cut + 1);
}

/** Titles from the top-level category down to the node (the top-level entry is its display name). */
export function reverbPathTitles(id: string): string[] {
  const parts = id.split('/');
  return parts.map((p, i) => (i === 0 ? REVERB_TOP_LEVEL_NAMES[p] || p : p));
}

/** Top-level slug for a display name such as "Electric Guitars" (case-insensitive), or null. */
export function reverbTopSlugForName(name: string | null | undefined): string | null {
  if (!name) return null;
  const want = String(name).trim().toLowerCase();
  for (const slug of Object.keys(REVERB_TOP_LEVEL_NAMES)) {
    if (REVERB_TOP_LEVEL_NAMES[slug].toLowerCase() === want) return slug;
  }
  return null;
}
