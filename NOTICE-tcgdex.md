# Third-Party Data Attribution - TCGdex cards-database (Pokemon card identity)

This product includes data derived from the **TCGdex cards-database**
(https://github.com/tcgdex/cards-database), used by the optional Pokemon card
catalog ingestion job:

- `packages/backend/src/services/cardCatalog/tcgdexIngest.ts` (ingest job)
- `packages/backend/src/services/cardCatalog/tcgdexMap.ts` (field allowlist and mapping)
- `packages/backend/src/services/cardCatalog/tcgdexAttribution.ts` (this notice, as served by the status endpoint)

The job is OFF by default and runs only when `CARD_CATALOG_TCGDEX_ENABLED=true`.

## Scope of use

The catalog keeps card names, set names, collector numbers, rarity and print
variants only. It does not store images, prices, or third-party product ids
(TCGplayer, Cardmarket or otherwise). The hosted TCGdex API is never called; the
job reads the repository source files at a pinned commit.

## License

The TCGdex cards-database is licensed under the MIT License. The license text
below is copied verbatim from the repository LICENSE file at the pinned commit.

```
MIT License

Copyright (c) 2021 TCGdex

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Disclaimer

This database is not produced, endorsed, supported or affiliated with Nintendo or The Pokemon Company.

Pokemon and related names are trademarks of their respective owners. FindA.Sale
is not affiliated with Nintendo, Creatures Inc., GAME FREAK inc., or The Pokemon
Company.

## Source

- Repository: https://github.com/tcgdex/cards-database
- Pinned commit: 4199850a6af49665db0080fa2bb9ef751750a406
- Access: one public gzip tarball from codeload.github.com, no credentials
- Refresh: the job downloads again only when the pinned ref or the language list changes
