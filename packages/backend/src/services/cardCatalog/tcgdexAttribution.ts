/**
 * Attribution carried with every copy of TCGdex-derived data (MIT license: "The above copyright
 * notice and this permission notice shall be included in all copies or substantial portions of the
 * Software"). The text below is the LICENSE file of github.com/tcgdex/cards-database, copied
 * verbatim on 2026-10-12. It is exposed by GET /api/cards/status while the TCGdex flag is on and
 * mirrored in NOTICE-tcgdex.md at the repository root. Keep the three in step.
 *
 * Pure constants: no imports, no environment reads, no network.
 */

export const TCGDEX_COPYRIGHT_LINE = 'Copyright (c) 2021 TCGdex';

export const TCGDEX_MIT_LICENSE_TEXT = [
  'MIT License',
  '',
  TCGDEX_COPYRIGHT_LINE,
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
].join('\n');

export const TCGDEX_DISCLAIMER =
  'This database is not produced, endorsed, supported or affiliated with Nintendo or The Pokemon Company.';

export interface DataAttribution {
  source: 'TCGDEX';
  name: string;
  url: string;
  licenseName: string;
  copyright: string;
  licenseText: string;
  disclaimer: string;
  /** What the catalog keeps from this source. */
  scope: string;
}

export const TCGDEX_ATTRIBUTION: DataAttribution = {
  source: 'TCGDEX',
  name: 'TCGdex cards-database',
  url: 'https://github.com/tcgdex/cards-database',
  licenseName: 'MIT License',
  copyright: TCGDEX_COPYRIGHT_LINE,
  licenseText: TCGDEX_MIT_LICENSE_TEXT,
  disclaimer: TCGDEX_DISCLAIMER,
  scope: 'Card names, set names, collector numbers, rarity and print variants only. No images, prices or third-party product ids are stored.',
};
