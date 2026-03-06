# AI Image Tagger — Troubleshooting Guide

## Quick Health Check

```bash
# Check service is running
curl http://localhost:5001/health

# Expected response
{"status": "ok", "timestamp": "2026-03-02T12:00:00.000000"}

# Check model info
curl http://localhost:5001/info
```

---

## Common Issues

### Service won't start

**Symptom**: `docker-compose up image-tagger` exits immediately or container restarts in a loop.

**Check logs**:
```bash
docker-compose logs image-tagger
```

**Causes and fixes**:

| Log message | Cause | Fix |
|-------------|-------|-----|
| `ModuleNotFoundError: No module named 'torch'` | Dependencies not installed | Rebuild: `docker-compose build image-tagger` |
| `OSError: [Errno 28] No space left on device` | Disk full (model weights) | Free disk space; model weights are ~2–4GB |
| `RuntimeError: CUDA out of memory` | GPU VRAM exhausted | Set `MODEL_TYPE=cpu` or reduce concurrent requests |
| `Address already in use` | Port 5001 already taken | Stop conflicting process: `lsof -i :5001` |

---

### Container restarts after `docker-compose restart`

`docker-compose restart` does NOT rebuild the image. It only restarts the running container with the existing image.

**If you updated `requirements.txt`**, you must rebuild:
```bash
docker-compose build image-tagger && docker-compose up -d image-tagger
```

---

### Gradio UI returns 500 errors at `http://localhost:5001/`

**Symptom**: Browser shows `500 Internal Server Error` or `TypeError: argument of type 'bool' is not iterable`.

**Cause**: This is a known Gradio bug in versions < 4.44.0.

**Fix**: Ensure `requirements.txt` specifies `gradio>=4.44.0`, then rebuild:
```bash
docker-compose build image-tagger && docker-compose up -d image-tagger
```

**Workaround** (if rebuild isn't possible): Use the API endpoint directly instead of the Gradio UI:
```bash
curl -X POST http://localhost:5001/api/tag \
  -H "X-API-Key: change-this-in-production" \
  -F "image=@/path/to/photo.jpg" \
  -F "threshold=0.35"
```

---

### Gradio "No API found" error

**Symptom**: Submitting via Gradio UI at `localhost:5001` shows `Submit function encountered an error: Error: No API found`.

**Cause**: The ML model failed to load (model weights not downloaded, GPU issue). The Gradio UI is running but inference crashes.

**Fix**: Check tagger model loading:
```bash
docker-compose logs image-tagger | grep -E "ERROR|WARNING|model"
```

If model couldn't load, the service falls back to simulation mode. The API endpoint still works:
```bash
curl -X POST http://localhost:5001/api/tag \
  -H "X-API-Key: change-this-in-production" \
  -F "image=@/path/to/photo.jpg"
```

---

### Tags always empty in backend

**Symptom**: Items are created but `suggestedTags` is always `[]`.

**Check 1 — Is TAGGER_URL set?**
```bash
# In packages/backend/.env
TAGGER_URL=http://localhost:5001   # local dev
# or
TAGGER_URL=http://image-tagger:5000  # docker-compose
```

**Check 2 — Is the API key matching?**
Backend sends `X-API-Key` from `TAGGER_API_KEY`. Service expects `API_KEY`. Both must match.

```bash
# In docker-compose.yml
image-tagger:
  environment:
    API_KEY: ${TAGGER_API_KEY:-change-this-in-production}

backend:
  environment:
    TAGGER_API_KEY: ${TAGGER_API_KEY:-change-this-in-production}
```

**Check 3 — Backend logs**
```bash
docker-compose logs backend | grep "\[tagger\]"
# Should show:
# [tagger] tagged "photo.jpg" in 1234ms — 3 tags
# [tagger] service unreachable (...)
# [tagger] timeout tagging "photo.jpg", retrying once...
```

---

### 403 Forbidden from tagger API

**Symptom**: `curl` or backend requests return `{"detail": "Invalid API Key"}`.

**Fix**: Ensure `X-API-Key` header matches the `API_KEY` set in the tagger container:
```bash
curl -H "X-API-Key: your-actual-key" http://localhost:5001/api/tag ...
```

---

### Inference too slow (>5s timeout)

**Symptom**: Backend logs show `[tagger] timeout tagging ... retrying once…` frequently.

**Options**:
1. Increase timeout in `itemController.ts` (`timeout: 5000` → `timeout: 10000`)
2. Add GPU support to docker-compose (see TAGGER_DESIGN.md)
3. Reduce image size before sending to tagger (resize to 512×512 max)
4. Switch to a smaller/faster model variant

---

### Low accuracy / wrong categories

**Symptom**: Tagger returns irrelevant tags or wrong category.

**Check 1 — Confidence threshold**: Default is 0.35. Lower threshold shows more (potentially noisy) tags; raise it to 0.5+ for fewer but more confident tags.

**Check 2 — Image quality**: The model performs best on:
- Clear, well-lit photos
- Single item centered in frame
- No heavy shadows or cluttered background

**Check 3 — Simulation mode**: If model failed to load, tags come from filename keyword matching (not vision). Check `/info` endpoint:
```bash
curl http://localhost:5001/info | python3 -m json.tool
# "model_loaded": false  → simulation mode active
```

---

## Monitoring Tagger Health

Key log patterns to watch in production:

```
[tagger] tagged "..." in Xms — N tags     ✅ Normal
[tagger] timeout tagging "..."             ⚠️  Slow inference
[tagger] retry also timed out              ⚠️  Persistent slowness
[tagger] service unreachable               ❌ Tagger is down
[tagger] unexpected error: ...             ❌ Bug or config issue
[tagger/analyze] tagged item "..."         ✅ Re-analysis (edit page)
```

---

## Running Tests

```bash
cd packages/backend/services/image-tagger

# Install test dependencies
pip install -r requirements-dev.txt --break-system-packages

# Run all tests
python -m pytest tests/ -v

# Run only unit tests (no FastAPI)
python -m pytest tests/test_tagger_simple.py -v

# Run only integration tests
python -m pytest tests/test_app_simple.py -v

# With coverage report
python -m pytest tests/ --cov=. --cov-report=term-missing
```
