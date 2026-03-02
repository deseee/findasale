# AI Image Tagger — Design & Architecture

## Overview

The image tagger is a FastAPI microservice that analyzes estate sale item photos and returns estate-specific category tags with confidence scores. It runs alongside the main backend and is called automatically when an organizer uploads photos to a new item.

## Architecture

```
Organizer uploads photo
        │
        ▼
Backend (itemController.ts)
  POST /api/tag  →  image-tagger:5000/api/tag
        │                    │
        │              EstateSaleTagger
        │              (wd-vit model)
        │                    │
        │              [ tag, confidence ] pairs
        │                    │
        ◄────── suggestedTags ─────────
        │
        ▼
Frontend shows tag banner
Organizer accepts / skips
Category saved on item
```

## Service Stack

| Component | Technology |
|-----------|------------|
| API framework | FastAPI |
| Web server | Uvicorn |
| UI (debug) | Gradio 4.44+ |
| ML backbone | HuggingFace Transformers (ViT) |
| Image processing | Pillow, torchvision |
| Container | Docker (via docker-compose) |

## Model Choice: wd-vit (Google ViT)

The service uses a Vision Transformer (ViT) model tuned for visual tagging. Key reasons for this choice:

- **Speed**: ViT models run inference in ~1–2s on CPU, acceptable for a non-blocking UX
- **General visual understanding**: Trained on large image datasets, transfers well to estate sale items
- **Tag vocabulary**: Produces descriptive natural-language tags rather than coarse class labels

The `MODEL_TYPE` environment variable can switch between `wd-vit` (default) and `clip` variants.

## Estate-Specific Categories

The tagger maps raw model output to 8 estate-sale categories using prefix matching:

| Prefix | Form category | Examples |
|--------|---------------|---------|
| `furniture` | furniture | sofa, dresser, dining table |
| `styles` | vintage | mid-century modern, victorian |
| `materials` | other | mahogany, marble, brass |
| `jewelry` | jewelry | necklace, ring, brooch |
| `art` | art | painting, sculpture, vase |
| `collectibles` | collectibles | coin, doll, memorabilia |
| `lighting` | decor | lamp, chandelier, sconce |
| `textiles` | textiles | rug, quilt, curtain |

## Confidence Threshold

Default threshold: **0.35**

Tags with confidence below this value are filtered out before returning results. At 0.35:
- Common estate items (furniture, large art) typically return 3–6 tags
- Specialty items (jewelry, collectibles) may return 1–3 tags
- Background noise / irrelevant tags are suppressed

Threshold can be customized per request via the `threshold` form parameter.

## Simulation Fallback

If the model fails to load (missing GPU drivers, OOM, missing weights), the service stays up and falls back to `_simulate_tags()`. Simulation uses keyword matching on the image filename rather than actual visual inference. This ensures:
- The tagger endpoint always responds (no 503 cascade to backend)
- Organizers see *some* suggestion, even if less accurate
- Simulated tags are clearly not from the ML model (lower confidence scores)

## Integration Points

### Backend → Tagger
- Called in `itemController.ts` → `createItem` (on first image upload)
- Called in `itemController.ts` → `analyzeItemTags` (on-demand re-analysis from edit page)
- Auth: `X-API-Key` header (value from `TAGGER_API_KEY` env var)
- Timeout: 5s (single retry on timeout, skip on service-down)

### Frontend → Backend
- `add-items.tsx`: receives `suggestedTags` in `POST /items` response, shows banner
- `edit-item/[id].tsx`: button triggers `POST /items/:id/analyze`, shows banner
- Accept → maps first matched prefix to form category value
- Skip → dismisses banner, organizer picks category manually

## GPU vs CPU

The service runs on CPU by default (compatible with any host). With a CUDA-capable GPU:
- Set `device=cuda` in `tagger.py` model initialization
- Expect 5–10× speedup (inference drops from ~1.5s to ~200ms)
- Memory: ~2GB VRAM for ViT base model

The docker-compose configuration does not map GPU devices by default.
