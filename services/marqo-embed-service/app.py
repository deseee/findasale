"""
app.py — Marqo-Ecommerce-B embedding service.

Self-hosted CPU inference service for the Reverse-Image Product Index
(ADR-reverse-image-product-index-2026-07-01.md). Loads
Marqo/marqo-ecommerce-embeddings-B once at process startup and exposes a
single POST /embed endpoint that accepts an image and returns its 768-dim
embedding vector.

IMPORTANT — Step 0 finding (dev session, 2026-07-07): the existing OLLAMA_URL
fallback in uploadController.ts / batchAnalyzeController.ts defaults to
http://host.docker.internal:11434, which only resolves on a local Docker
Desktop host. Confirmed via claude_docs/operations/model-routing.md ("Cloud
APIs only. No local Ollama/Docker overhead in production" / "Fallback |
Ollama (local, optional) | Local dev only") and packages/backend/.env.example
("Local AI fallback via Ollama (optional — omit to disable)") that NO Ollama
service is deployed on Railway today — Dockerfile.production has no Ollama
binary or sidecar, and railway.toml declares only the single `backend`
service. This means this embedding service CANNOT "live wherever Ollama
already lives" (the ADR's stated default) because Ollama doesn't live
anywhere in production. This service needs its own brand-new Railway service
— see NOTICE / deployment instructions in the dev report.

This service is deliberately independent of the Node backend and of Ollama
(per ADR §6 — different jobs, different failure domains, share a host only
for operational convenience, never the same process).

Run locally:
  pip install -r requirements.txt
  uvicorn app:app --host 0.0.0.0 --port 8000

Endpoints:
  GET  /health         → { status: "ok", model_loaded: bool }
  POST /embed           → multipart/form-data image file → { embedding: number[768], dim: 768 }
"""

import io
import logging
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marqo-embed-service")

MODEL_NAME = os.environ.get("MARQO_MODEL_NAME", "Marqo/marqo-ecommerce-embeddings-B")
EXPECTED_DIM = 768  # confirmed via the Marqo-Ecommerce-B HuggingFace model card

app = FastAPI(title="marqo-embed-service", version="1.0.0")

# Loaded lazily at startup (module-level globals, populated in the startup event).
_model = None
_processor = None
_load_error: str | None = None


@app.on_event("startup")
def load_model() -> None:
    """Load the Marqo-Ecommerce-B model + processor once at process startup.

    CPU inference only — no GPU tier available on Railway's current plan
    (ADR §3 locked decision: Marqo-B, not -L, specifically because -B is
    CPU-feasible at acceptable latency and -L is not without a GPU tier).
    """
    global _model, _processor, _load_error
    try:
        import torch  # noqa: F401  (import check — fails fast if torch missing)
        from transformers import AutoModel, AutoProcessor

        logger.info(f"[marqo-embed-service] Loading {MODEL_NAME} ...")
        _model = AutoModel.from_pretrained(MODEL_NAME, trust_remote_code=True)
        _processor = AutoProcessor.from_pretrained(MODEL_NAME, trust_remote_code=True)
        _model.eval()
        logger.info("[marqo-embed-service] Model loaded successfully.")
    except Exception as e:  # noqa: BLE001 — startup must not crash the process;
        # /embed will 503 with the recorded error instead, matching the graceful
        # degradation shape the ADR requires (embedding service down = skip
        # catalog-match evidence, everything else still works).
        _load_error = str(e)
        logger.error(f"[marqo-embed-service] Model load FAILED: {e}")


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok" if _model is not None else "degraded",
            "model_loaded": _model is not None,
            "model_name": MODEL_NAME,
            "load_error": _load_error,
        }
    )


@app.post("/embed")
async def embed(file: UploadFile = File(...)) -> JSONResponse:
    if _model is None or _processor is None:
        raise HTTPException(
            status_code=503,
            detail=f"Embedding model not loaded: {_load_error or 'unknown error'}",
        )

    try:
        raw = await file.read()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}") from e

    try:
        import torch

        processed = _processor(images=[img], padding="max_length", return_tensors="pt")
        # Marqo's processor does its own rescaling — matches the model card's usage example.
        _processor.image_processor.do_rescale = False
        with torch.no_grad():
            image_features = _model.get_image_features(processed["pixel_values"], normalize=True)
        vector = image_features[0].tolist()
    except Exception as e:  # noqa: BLE001
        logger.error(f"[marqo-embed-service] Inference failed: {e}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}") from e

    if len(vector) != EXPECTED_DIM:
        logger.warning(
            f"[marqo-embed-service] Unexpected embedding dim {len(vector)} (expected {EXPECTED_DIM})"
        )

    return JSONResponse({"embedding": vector, "dim": len(vector)})
