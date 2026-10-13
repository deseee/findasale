/**
 * Fixtures for the TCGdex ingest tests. No network, no database.
 *
 * The data-file texts below follow the real files of github.com/tcgdex/cards-database at commit
 * 4199850a6af49665db0080fa2bb9ef751750a406 (read 2026-10-12): the Base Set set file, Base Set
 * Charizard (data/Base/Base Set/4.ts), the 151 set file and 151 Venusaur ex (003.ts), and the
 * Scarlet & Violet Pineco (001.ts). Long card text and accented letters were trimmed so this file
 * stays ASCII; the variants, rarity, set references and third-party blocks are unchanged. The
 * promo cards at the end are hand-written to cover a missing rarity, the older flag-object
 * variants, and a card that carries third-party ids, prices and an image.
 *
 * The tar helpers produce what codeload.github.com serves: a gzip stream of ustar entries with a
 * global PAX header first and PAX extended headers for long or non-ASCII paths.
 */
import * as zlib from 'zlib';
import { chunked } from './cardCatalogFixtures';
import { tcgdexArchiveUrl } from '../../services/cardCatalog/tcgdexIngest';
import { TCGDEX_PINNED_REF } from '../../services/cardCatalog/catalogConfig';

export const FIXTURE_ROOT = `cards-database-${TCGDEX_PINNED_REF}`;

// ---------------------------------------------------------------------------------------------
// Data files
// ---------------------------------------------------------------------------------------------

export const SERIES_BASE_TS = `import { Serie } from '../interfaces'

const base: Serie = {
	name: {
		en: "Base",
		fr: "Base"
	},
	id: "base"
}

export default base
`;

export const SET_BASE1_TS = `import { Set } from '../../interfaces'
import serie from '../Base'

const base1: Set = {
	id: "base1",

	name: {
		en: "Base Set",
		fr: "Set de Base",
		es: "Edicion Basica",
		it: "Set Base",
		de: "Grundset",
		pt: "Colecao Basica",
		nl: 'Basis Set'
	},

	serie: serie,
	tcgOnline: "BS",

	cardCount: {
		official: 102
	},

	releaseDate: "1999-01-09",

	abbreviations: {
		official: "BS",
		fr: "BAS"
	},

	thirdParty: {
		cardmarket: 1523,
		tcgplayer: 604
	}
}

export default base1
`;

export const CARD_BASE1_4_CHARIZARD_TS = `import { Card } from '../../../interfaces'
import Set from '../Base Set'

const card: Card = {
	name: {
		en: "Charizard",
		fr: "Dracaufeu",
		de: "Glurak",
		it: "Charizard"
	},

	illustrator: "Mitsuhiro Arita",
	rarity: "Rare",
	category: "Pokemon",
	set: Set,

	dexId: [
		6,
	],

	hp: 120,

	types: [
		"Fire",
	],

	evolveFrom: {
		en: "Charmeleon",
		fr: "Reptincel",
		it: "Charmeleon",
		de: "Glutexo"
	},

	stage: "Stage2",

	abilities: [
		{
			type: "Pokemon Power",
			name: {
				en: "Energy Burn",
				de: "Energie verbrennen"
			},
			effect: {
				en: "As often as you like during your turn (before your attack), you may turn all Energy attached to Charizard into Fire Energy for the rest of the turn. This power can't be used if Charizard is Asleep, Confused, or Paralyzed."
			},
		},
	],

	attacks: [
		{
			cost: [
				"Fire",
				"Fire",
				"Fire",
				"Fire",
			],
			name: {
				en: "Fire Spin",
				de: "Feuerwirbel"
			},
			effect: {
				en: "Discard 2 Energy cards attached to Charizard in order to use this attack."
			},
			damage: 100,

		},
	],

	weaknesses: [
		{
			type: "Water",
			value: "x2"
		},
	],

	resistances: [
		{
			type: "Fighting",
			value: "-30"
		},
	],

	retreat: 3,

	description: {
		en: "Spits fire that is hot enough to melt boulders. Known to unintentionally cause forest fires."
	},

	variants: [
		{
			type: "holo",
			subtype: "unlimited",
			thirdParty: {
				cardmarket: 273699,
				tcgplayer: 42382
			},
		},
		{
			type: "holo",
			subtype: "shadowless",
			stamp: ["1st-edition"],
			thirdParty: {
				tcgplayer: 106999,
				cardmarket: 660224
			},
		},
		{
			type: "holo",
			subtype: "shadowless",
			thirdParty: {
				tcgplayer: 106999,
				cardmarket: 660224
			},
		},
		{
			type: "holo",
			subtype: "1999-2000-copyright",
		}
	],

}

export default card
`;

export const SET_SV01_TS = `import { Set } from '../../interfaces'
import serie from '../Scarlet & Violet'

const set: Set = {
	id: "sv01",

	name: {
		en: "Scarlet & Violet",
		fr: "Ecarlate et Violet"
	},

	serie: serie,

	cardCount: {
		official: 198
	},

	releaseDate: "2023-03-31",

	thirdParty: {
		cardmarket: 5322,
		tcgplayer: 22873
	}
}

export default set
`;

/** Modern common: a normal and a reverse holo print, plus a card-level thirdParty block. */
export const CARD_SV01_001_PINECO_TS = `import { Card } from "../../../interfaces"
import Set from "../Scarlet & Violet"
const card: Card = {
	dexId: [204],
	set: Set,
	name: {
		en: "Pineco",
		fr: "Pomdepik",
		es: "Pineco",
		it: "Pineco",
		pt: "Pineco",
		de: "Tannza"
	},
	rarity: "Common",
	category: "Pokemon",
	hp: 60,
	types: ["Grass"],
	stage: "Basic",
	attacks: [{
		cost: ["Grass"],
		name: { en: "Ram", de: "Rammen" },
		damage: 20
	}],
	retreat: 2,
	regulationMark: "G",

	variants: [
		{
			type: "normal"
		},
		{
			type: "reverse"
		}
	],

	illustrator: "Shigenori Negishi",

	thirdParty: {
        cardmarket: 702298,
        tcgplayer: 487828
    }
}

export default card
`;

export const SET_SV035_TS = `import { Set } from '../../interfaces'
import serie from '../Scarlet & Violet'

const set: Set = {
	id: "sv03.5",

	name: {
		de: "151",
		en: "151",
		es: "151",
		fr: "151",
		it: "151",
		pt: "151"
	},

	serie: serie,

	cardCount: {
		official: 165
	},

	releaseDate: "2023-09-22",

	abbreviations: {
		official: "MEW",
		fr: "151"
	},

	thirdParty: {
		cardmarket: 5402,
		tcgplayer: 23237
	}
}

export default set
`;

/** Holo-only modern card (one variant), with the third-party block of the real file. */
export const CARD_SV035_003_VENUSAUR_TS = `import { Card } from "../../../interfaces"
import Set from "../151"

const card: Card = {
	dexId: [3],
	set: Set,

	name: {
		fr: "Florizarre-ex",
		en: "Venusaur ex",
		es: "Venusaur ex",
		it: "Venusaur-ex",
		pt: "Venusaur ex",
		de: "Bisaflor-ex"
	},

	rarity: "Double rare",
	category: "Pokemon",
	hp: 340,
	types: ["Grass"],
	stage: "Stage2",
	retreat: 4,
	regulationMark: "G",

	variants: [
		{
			type: 'holo',
			thirdParty: {
				cardmarket: 733598,
				tcgplayer: 502554,
				cardtrader: 261103
			}
		},
	],

	suffix: "ex",
	illustrator: "5ban Graphics",


}

export default card
`;

export const SET_SWSHP_TS = `import { Set } from '../../interfaces'
import serie from '../Sword & Shield'

const set: Set = {
	id: "swshp",
	name: { en: "SWSH Black Star Promos" },
	serie: serie,
	cardCount: { official: 307 },
	releaseDate: "2019-11-15",
}

export default set
`;

/** No rarity at all, and the older flag-object form of variants (normal plus the W stamp). */
export const CARD_SWSHP_SWSH001_TS = `import { Card } from "../../../interfaces"
import Set from "../SWSH Black Star Promos"

const card: Card = {
	name: { en: "Celebi V" },
	category: "Pokemon",
	set: Set,
	hp: 180,
	variants: {
		normal: true,
		reverse: false,
		holo: false,
		firstEdition: false,
		wPromo: true
	},
}

export default card
`;

/** Carries third-party ids, prices and an image: none of it may reach the catalog. */
export const CARD_SWSHP_SWSH002_PRICED_TS = `import { Card } from "../../../interfaces"
import Set from "../SWSH Black Star Promos"

const card: Card = {
	name: { en: "Priced Test Card" },
	rarity: "Rare",
	category: "Pokemon",
	set: Set,
	image: "https://assets.tcgdex.net/en/swsh/swshp/SWSH002",
	thirdParty: { tcgplayer: 888001, cardmarket: 888002, cardtrader: 888003 },
	pricing: {
		cardmarket: { avg: 1.23, trend: 2.34, low: 0.99 },
		tcgplayer: { normal: { marketPrice: 0.5, lowPrice: 0.25 } }
	},
	variants: [
		{ type: "normal", thirdParty: { tcgplayer: 888001, cardmarket: 888002 } },
		{ type: "holo", foil: "masterball", thirdParty: { tcgplayer: 888004 } },
	],
}

export default card
`;

/** Unreadable on purpose: a function call is not part of the literal subset. */
export const CARD_SWSHP_SWSH003_CALL_TS = `import { Card } from "../../../interfaces"
import Set from "../SWSH Black Star Promos"

const card: Card = {
	name: { en: makeName("Broken") },
	set: Set,
}

export default card
`;

/** Exists only in French. */
export const CARD_SWSHP_SWSH004_FR_ONLY_TS = `import { Card } from "../../../interfaces"
import Set from "../SWSH Black Star Promos"

const card: Card = {
	name: { fr: "Seulement francais" },
	rarity: "Rare",
	set: Set,
	variants: [{ type: "normal" }],
}

export default card
`;

/** A Japanese set and card (data-asia), built with code points so this file stays ASCII. */
export const JA_SET_NAME = String.fromCodePoint(0x30c6, 0x30b9, 0x30c8);
export const JA_CARD_NAME = String.fromCodePoint(0x30d4, 0x30ab, 0x30c1, 0x30e5, 0x30a6);

export const SET_JA_SV99_TS = `import { Set } from '../../interfaces'
import serie from '../SV'

const set: Set = {
	id: "SV99",
	name: { ja: "${JA_SET_NAME}" },
	serie: serie,
	cardCount: { official: 50 },
	releaseDate: "2024-01-26",
}

export default set
`;

export const CARD_JA_SV99_001_TS = `import { Card } from "../../../interfaces"
import Set from "../Test Set JA"

const card: Card = {
	name: { ja: "${JA_CARD_NAME}" },
	rarity: "Common",
	set: Set,
	variants: [{ type: "normal" }, { type: "reverse" }],
}

export default card
`;

// ---------------------------------------------------------------------------------------------
// Generated data
// ---------------------------------------------------------------------------------------------

export interface FixtureFile {
  /** Path inside the repository (no leading folder). */
  path: string;
  content: string;
  /** Force a PAX extended header for the path. */
  pax?: boolean;
}

/** One small English set: a set file and `count` plain cards named "<name> <n>". */
export function simpleSet(series: string, setFile: string, setId: string, count: number, name = 'Filler'): FixtureFile[] {
  const files: FixtureFile[] = [
    {
      path: `data/${series}/${setFile}.ts`,
      content: `const set: Set = {\n\tid: "${setId}",\n\tname: { en: "${setFile}" },\n\tcardCount: { official: ${count} },\n\treleaseDate: "2020-02-02"\n}\nexport default set\n`,
    },
  ];
  for (let i = 1; i <= count; i++) {
    files.push({
      path: `data/${series}/${setFile}/${i}.ts`,
      content: `const card: Card = {\n\tname: { en: "${name} ${i}" },\n\trarity: "Common",\n\tvariants: [{ type: "normal" }]\n}\nexport default card\n`,
    });
  }
  return files;
}

/** The standard archive content used by most ingest tests (English sets only, plus one Japanese set). */
export function standardFixtureFiles(): FixtureFile[] {
  return [
    { path: 'README.md', content: '# cards-database\n' },
    { path: 'server/compiler/index.ts', content: 'console.log("not data")\n' },
    { path: 'data/Base.ts', content: SERIES_BASE_TS },
    { path: 'data/Base/Base Set.ts', content: SET_BASE1_TS },
    { path: 'data/Base/Base Set/4.ts', content: CARD_BASE1_4_CHARIZARD_TS },
    { path: 'data/Scarlet & Violet/151.ts', content: SET_SV035_TS },
    { path: 'data/Scarlet & Violet/151/003.ts', content: CARD_SV035_003_VENUSAUR_TS },
    { path: 'data/Scarlet & Violet/Scarlet & Violet.ts', content: SET_SV01_TS },
    { path: 'data/Scarlet & Violet/Scarlet & Violet/001.ts', content: CARD_SV01_001_PINECO_TS },
    { path: 'data/Sword & Shield/SWSH Black Star Promos.ts', content: SET_SWSHP_TS },
    { path: 'data/Sword & Shield/SWSH Black Star Promos/SWSH001.ts', content: CARD_SWSHP_SWSH001_TS },
    { path: 'data/Sword & Shield/SWSH Black Star Promos/SWSH002.ts', content: CARD_SWSHP_SWSH002_PRICED_TS },
    { path: 'data/Sword & Shield/SWSH Black Star Promos/SWSH003.ts', content: CARD_SWSHP_SWSH003_CALL_TS },
    { path: 'data/Sword & Shield/SWSH Black Star Promos/SWSH004.ts', content: CARD_SWSHP_SWSH004_FR_ONLY_TS },
    ...simpleSet('Test', 'Filler Set', 'tst1', 40),
    { path: 'data-asia/SV.ts', content: 'const serie = { id: "sv" }\nexport default serie\n' },
    { path: 'data-asia/SV/Test Set JA.ts', content: SET_JA_SV99_TS },
    { path: 'data-asia/SV/Test Set JA/001.ts', content: CARD_JA_SV99_001_TS },
  ];
}

/**
 * Cards expected from standardFixtureFiles() for English only:
 *   base1-4 Charizard: 4 rows (unlimited, shadowless+1st-edition, shadowless, 1999-2000-copyright)
 *   sv01-001 Pineco: 1 row; sv03.5-003 Venusaur ex: 1 row
 *   swshp-SWSH001: 2 rows (plain, W stamp); swshp-SWSH002: 1 row; SWSH003 unreadable; SWSH004 French only
 *   tst1: 40 rows
 */
export const STANDARD_ENGLISH_ROW_COUNT = 4 + 1 + 1 + 2 + 1 + 40;
/** Card files read for English: 1 + 1 + 1 + 4 + 40. */
export const STANDARD_ENGLISH_CARD_FILES = 47;

// ---------------------------------------------------------------------------------------------
// Tar and gzip
// ---------------------------------------------------------------------------------------------

const NUL = String.fromCharCode(0);

function writeAscii(buf: Buffer, text: string, offset: number): void {
  buf.write(text, offset, text.length, 'latin1');
}

function tarHeader(name: string, size: number, typeflag: string): Buffer {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 100, 'utf8');
  writeAscii(h, '0000644' + NUL, 100);
  writeAscii(h, '0000000' + NUL, 108);
  writeAscii(h, '0000000' + NUL, 116);
  writeAscii(h, size.toString(8).padStart(11, '0') + NUL, 124);
  writeAscii(h, '00000000000' + NUL, 136);
  writeAscii(h, '        ', 148);
  writeAscii(h, typeflag, 156);
  writeAscii(h, 'ustar' + NUL + '00', 257);
  let sum = 0;
  for (const b of h) sum += b;
  writeAscii(h, sum.toString(8).padStart(6, '0') + NUL + ' ', 148);
  return h;
}

function padToBlock(data: Buffer): Buffer {
  const rem = data.length % 512;
  return rem === 0 ? data : Buffer.concat([data, Buffer.alloc(512 - rem, 0)]);
}

/** One PAX record: "<length> <key>=<value>\n" where length counts the whole record. */
export function paxRecord(key: string, value: string): Buffer {
  const content = ` ${key}=${value}\n`;
  const body = Buffer.byteLength(content);
  let len = body + 1;
  while (String(len).length + body !== len) len = String(len).length + body;
  return Buffer.from(`${len}${content}`, 'utf8');
}

export function tarEntry(path: string, content: string, pax = false): Buffer[] {
  const data = Buffer.from(content, 'utf8');
  const parts: Buffer[] = [];
  const needsPax = pax || Buffer.byteLength(path) > 100 || /[^\x20-\x7e]/.test(path);
  if (needsPax) {
    const rec = paxRecord('path', path);
    parts.push(tarHeader('PaxHeaders/entry', rec.length, 'x'), padToBlock(rec));
  }
  const shortName = needsPax ? 'long-name-placeholder' : path;
  parts.push(tarHeader(shortName, data.length, '0'), padToBlock(data));
  return parts;
}

/** A codeload-style archive: global PAX header, root folder entry, the files, and the two zero end blocks. */
export function buildTar(files: FixtureFile[], root: string = FIXTURE_ROOT): Buffer {
  const parts: Buffer[] = [];
  const global = paxRecord('comment', TCGDEX_PINNED_REF);
  parts.push(tarHeader('pax_global_header', global.length, 'g'), padToBlock(global));
  parts.push(tarHeader(`${root}/`, 0, '5'));
  for (const f of files) parts.push(...tarEntry(`${root}/${f.path}`, f.content, f.pax === true));
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

export function buildTarGz(files: FixtureFile[], root: string = FIXTURE_ROOT): Buffer {
  return zlib.gzipSync(buildTar(files, root));
}

/** Body that arrives in many small chunks, so entries and headers straddle chunk boundaries. */
export function archiveBody(gz: Buffer, chunkSize = 701) {
  return chunked(gz, chunkSize);
}

export const ARCHIVE_URL = tcgdexArchiveUrl(TCGDEX_PINNED_REF);
