# syntax=docker/dockerfile:1
# marqo-embed-service — self-hosted Marqo-Ecommerce-B image embedding service
# (ADR-reverse-image-product-index-2026-07-01.md §3)
#
# CPU-only inference — no GPU tier on Railway's current plan. This is a brand-new
# Railway service (see dev report Step 0 finding: Ollama does NOT run in production
# today, so this cannot piggyback on an existing Ollama deployment — it needs its
# own Railway service provisioned from this Dockerfile, root directory
# `services/marqo-embed-service`).
FROM python:3.11-slim

WORKDIR /app

# torch/transformers need build tools for some wheels + libgomp for CPU inference
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Model is downloaded from HuggingFace on first startup and cached in the image
# layer/volume — first boot will be slow (~1-2 min download); subsequent restarts
# reuse the Railway-persisted filesystem cache if the service has a volume attached,
# otherwise it re-downloads on every deploy (acceptable for MVP; revisit with a
# Railway volume mount if deploy-time model download becomes a cost/time issue).
ENV HF_HOME=/app/.cache/huggingface
ENV PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
