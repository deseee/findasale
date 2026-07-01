# Third-Party Data Attribution — Google Open Images Dataset

This product includes data from the **Google Open Images Dataset** — used to build
the reverse-image product-reference corpus for the Reverse-Image Product Index
(catalog-match evidence feature, ADR 2026-07-01):

- `scripts/open-images/extract_open_images.py` (Stage A — filter, download, embed)
- `packages/backend/src/scripts/ingestOpenImagesCorpus.ts` (Stage B — ingest into `ProductReferenceEmbedding`)

## License

Open Images' class annotations are licensed under **Creative Commons Attribution 4.0
International (CC BY 4.0)** by Google.

Full license text: https://creativecommons.org/licenses/by/4.0/

The underlying source images are sourced from **Flickr** and are licensed under
**Creative Commons Attribution 2.0 Generic (CC BY 2.0)** by their original
photographers.

Full license text: https://creativecommons.org/licenses/by/2.0/

Both licenses permit commercial use and redistribution, provided attribution is
given. FindA.Sale uses Open Images solely to build a reference embedding corpus for
internal similarity search (reverse-image product matching) — no Open Images source
images are displayed to organizers or shoppers; only a machine-readable embedding
vector plus the class label and a debugging-only source URL are stored.

## Attribution statement

> Contains data from the Google Open Images Dataset
> (https://storage.googleapis.com/openimages/web/index.html), class annotations
> licensed CC BY 4.0 by Google. Source images licensed CC BY 2.0 by their original
> Flickr photographers.

## Per-image attribution

Per CC BY 2.0's attribution requirement, the original Flickr source URL for every
ingested reference image is retained in `ProductReferenceEmbedding.imageUrl`. This
field exists specifically to satisfy per-image attribution traceability — it is not
used at query time (see `packages/backend/src/services/imageMatchService.ts`) and is
not displayed in any user-facing surface, but must not be dropped from the schema or
the ingestion pipeline.

## Explicitly rejected sources (do not reconsider without new licensing data)

The following corpora were evaluated and rejected on licensing grounds during the
ADR research phase (2026-07-01) — do not re-add them to the ingestion pipeline:

- **Products-10K** (JD.com) — non-commercial-use-only license.
- **DeepFashion / DeepFashion2** (CUHK) — commercial use prohibited.
- **Amazon Berkeley Objects (ABO)** — CC BY-NC 4.0 (non-commercial).

## Source

- Metadata: `https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv`
- Image index: `https://storage.googleapis.com/openimages/v7/oidv6-train-images-with-labels-with-rotation.csv`
- Access: public, anonymous HTTPS download (no credentials required)
- Dataset home: https://storage.googleapis.com/openimages/web/index.html
