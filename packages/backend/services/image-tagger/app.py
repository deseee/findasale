"""
FastAPI + Gradio application with API key authentication
"""

from fastapi import FastAPI, File, UploadFile, Form, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from fastapi.responses import JSONResponse
from tagger import EstateSaleTagger
import os
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

# Load API key from environment variable
API_KEY = os.environ.get("API_KEY", "change-this-in-production")
if API_KEY == "change-this-in-production":
    print("WARNING: Using default API key. Set API_KEY environment variable in production.")

# Security scheme
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return api_key

# Auto-select model: RAM++ if HF_TOKEN is available, otherwise use configured model
_configured_model = os.environ.get("MODEL_TYPE", "wd-vit")
_model_type = "ram-plus-api" if (os.environ.get("HF_TOKEN") and _configured_model == "wd-vit") else _configured_model
_confidence = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.35"))
if _model_type == "ram-plus-api":
    print("INFO: HF_TOKEN detected — using RAM++ via HuggingFace Inference API")

# Initialize tagger (graceful — service stays up even if model fails to load)
try:
    tagger = EstateSaleTagger(model_type=_model_type, confidence_threshold=_confidence)
except Exception as e:
    print(f"WARNING: Could not initialize tagger model: {e}. Falling back to simulation mode.")
    tagger = EstateSaleTagger.__new__(EstateSaleTagger)
    tagger.model_type = _model_type
    tagger.confidence_threshold = _confidence
    tagger.model = None
    tagger.model_loaded = False
    tagger.estate_categories = {
        "furniture": ["dining chair", "armchair", "sofa", "dresser", "nightstand", "dining table", "desk", "bookshelf", "cabinet", "wardrobe"],
        "styles": ["mid-century modern", "victorian", "art deco", "art nouveau", "colonial"],
        "materials": ["wood", "mahogany", "oak", "walnut", "marble", "glass", "brass"],
        "jewelry": ["necklace", "bracelet", "ring", "earrings", "brooch", "watch"],
        "art": ["painting", "print", "sculpture", "vase", "pottery", "porcelain"],
        "collectibles": ["coin", "stamp", "toy", "doll", "model", "memorabilia"],
        "lighting": ["lamp", "chandelier", "sconce", "floor lamp", "table lamp"],
        "textiles": ["rug", "carpet", "curtain", "blanket", "quilt", "linen"],
    }

# Create FastAPI app
app = FastAPI()

# Protected API endpoints
@app.post("/api/tag", dependencies=[Depends(verify_api_key)])
async def api_tag(
    image: UploadFile = File(...),
    threshold: float = Form(0.35)
):
    """Single image tagging API (requires API key)"""
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(image.filename).suffix) as tmp:
        shutil.copyfileobj(image.file, tmp)
        tmp_path = tmp.name
    
    try:
        tagger.confidence_threshold = threshold
        tags = tagger.generate_tags(tmp_path)
        return JSONResponse(content={
            "filename": image.filename,
            "tags": [{"tag": t, "confidence": c} for t, c in tags],
            "count": len(tags)
        })
    finally:
        os.unlink(tmp_path)

@app.post("/api/batch", dependencies=[Depends(verify_api_key)])
async def api_batch(
    files: list[UploadFile] = File(...),
    recursive: bool = Form(True),
    output_format: str = Form("metadata"),
    threshold: float = Form(0.35)
):
    """Batch processing API (requires API key)"""
    with tempfile.TemporaryDirectory() as tmpdir:
        for file in files:
            dest = Path(tmpdir) / file.filename
            with open(dest, "wb") as f:
                shutil.copyfileobj(file.file, f)
        
        tagger.confidence_threshold = threshold
        results = tagger.batch_process(tmpdir, output_format=output_format, recursive=recursive)
        return JSONResponse(content=results)

# Health check endpoint (public)
@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

# Info endpoint (Gradio calls this to discover the API — must return 200)
@app.get("/info")
async def info():
    return {
        "version": "1.0.0",
        "model_type": tagger.model_type,
        "model_loaded": getattr(tagger, "model_loaded", tagger.model is not None),
        "confidence_threshold": tagger.confidence_threshold,
        "categories": list(tagger.estate_categories.keys()),
        "endpoints": {
            "tag": "POST /api/tag (requires X-API-Key)",
            "batch": "POST /api/batch (requires X-API-Key)",
            "health": "GET /health",
        },
    }

# To run: uvicorn app:app --host 0.0.0.0 --port $PORT