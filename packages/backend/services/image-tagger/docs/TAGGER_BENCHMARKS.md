# AI Image Tagger — Performance Benchmarks

> Note: Formal benchmarks require the full ML stack running (torch + transformers + GPU/CPU hardware). The numbers below are reference targets and estimates based on ViT model specifications. Run the benchmark script once the service is deployed on target hardware to get actual measurements.

## Target Performance Thresholds

| Metric | Target | Acceptable | Action if exceeded |
|--------|--------|------------|-------------------|
| Single image inference | < 1.5s (GPU), < 3s (CPU) | < 5s | Increase backend timeout |
| Backend e2e (upload → tags) | < 3s | < 6s | Add retry cap |
| Batch (5 images) | < 8s | < 15s | Increase batch timeout |
| Model load on startup | < 15s | < 30s | Pre-warm in Dockerfile |
| Memory (GPU) | < 2 GB VRAM | < 4 GB | Use CPU fallback |
| Memory (CPU) | < 2 GB RAM | < 4 GB RAM | Reduce model size |
| Concurrent requests (5) | 100% success | ≥ 90% | Add request queuing |

---

## Benchmark Script

Run this after deployment on target hardware:

```bash
cd packages/backend/services/image-tagger

python3 - <<'EOF'
import time
import statistics
import requests
import os

API_URL = os.getenv("TAGGER_URL", "http://localhost:5001")
API_KEY = os.getenv("TAGGER_API_KEY", "change-this-in-production")
HEADERS = {"X-API-Key": API_KEY}

# Create a sample test image
from PIL import Image
import io
img = Image.new("RGB", (512, 512), color=(100, 150, 200))
buf = io.BytesIO()
img.save(buf, format="JPEG")
img_bytes = buf.getvalue()

# Single image benchmark (10 runs)
times = []
for i in range(10):
    start = time.time()
    r = requests.post(
        f"{API_URL}/api/tag",
        headers=HEADERS,
        files={"image": ("test.jpg", img_bytes, "image/jpeg")},
        data={"threshold": "0.35"},
    )
    elapsed = time.time() - start
    times.append(elapsed)
    print(f"  Run {i+1}: {elapsed:.2f}s — {r.json().get('count', 0)} tags")

print(f"\nSingle image: min={min(times):.2f}s avg={statistics.mean(times):.2f}s max={max(times):.2f}s")
EOF
```

---

## Reference Estimates (ViT Base, CPU)

Based on published ViT model benchmarks on consumer CPU hardware (4–8 core, no GPU):

| Operation | Estimated time |
|-----------|---------------|
| Model load | 10–20s (one-time, at service startup) |
| Single 512×512 image | 1.5–3s |
| Single 1024×1024 image | 3–5s |
| 5-image batch | 7–15s |
| `/health` endpoint | < 10ms |
| `/info` endpoint | < 10ms |

---

## Scaling Recommendations

### Low traffic (< 10 items/hour)
- CPU-only Docker container is sufficient
- Default 5s backend timeout works

### Medium traffic (10–100 items/hour)
- Consider GPU instance (AWS g4dn.xlarge, ~$0.50/hr)
- Inference drops to ~200–400ms per image
- Backend timeout can remain at 5s

### High traffic (> 100 items/hour)
- Add request queue (Redis + worker pool)
- Multiple tagger replicas behind load balancer
- Consider batching: collect 5 images, send as batch, return all tags

### Memory Notes
- ViT base model: ~350MB on disk, ~800MB loaded in RAM
- Each concurrent inference request adds ~200MB peak
- 5 concurrent requests: ~2GB total RAM usage
- If OOM: fallback to simulation mode is automatic
