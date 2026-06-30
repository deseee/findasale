# Third-Party Data Attribution — Overture Maps (Places)

This product includes data from the **Overture Maps Foundation** — specifically the
**Places** theme — used by the Overture/BrightQuery secondhand-business enrichment
ingestion job (roadmap #556):

- `scripts/overture/extract_overture.py` (Stage A — DuckDB extract)
- `packages/backend/src/scripts/runOvertureEnrichment.ts` (Stage B — ingest)
- `.github/workflows/scrape-overture-enrichment.yml` (monthly runner)

## License

Overture Places data is licensed under the
**Community Data License Agreement – Permissive, Version 2.0 (CDLA-Permissive-2.0)**.

Full license text: https://cdla.dev/permissive-2-0/

Under CDLA-Permissive-2.0, commercial use and redistribution of the data and of
results derived from it are permitted, provided this attribution and the license
text accompany the distribution. FindA.Sale uses the Places theme only; it does
**not** use the Buildings or Transportation themes (those are ODbL-licensed).

## Attribution statement

> Contains data from the Overture Maps Foundation (https://overturemaps.org),
> Places theme, licensed under CDLA-Permissive-2.0.

## Source

- Bucket: `s3://overturemaps-us-west-2/release/<release>/theme=places/type=place/`
- Access: AWS Open Data, anonymous (no credentials, not requester-pays)
- Release cadence: monthly (https://docs.overturemaps.org/release/)
