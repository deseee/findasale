# AI Image Tagger — Accuracy & Evaluation

## Decision Gate Result (2026-03-02): Replace model → RAM++

**Decision:** Skip formal audit on WD-ViT; swap to RAM++ via HuggingFace Inference API.

**Rationale:** Code review of `tagger.py` revealed the "WD-ViT" implementation was actually loading
`google/vit-base-patch16-224` — a generic ImageNet-1000 model, not WD14 and not fine-tuned for
estate sales. Accuracy on estate sale photos is structurally poor (ImageNet covers ~5 furniture
classes; jewelry, collectibles, vintage styles are effectively absent). Domain mismatch is
architectural — a 50-photo audit is unnecessary.

**Implementation:** RAM++ activated by setting `HF_TOKEN` in `.env`. The service auto-detects
the token and switches from `wd-vit` to `ram-plus-api` (HuggingFace Inference API), with graceful
fallback to simulation if the token is absent or the API fails.

**To activate:**
```powershell
# 1. Get free token at https://huggingface.co/settings/tokens
# 2. Add to .env:
HF_TOKEN=hf_your_token_here
# 3. Rebuild image-tagger container (requirements.txt changed):
docker compose build --no-cache image-tagger
docker compose up -d image-tagger
```

---

> The sections below document the audit methodology for future reference or if a self-hosted RAM++ deployment is evaluated.

> Note: A formal accuracy audit requires 50+ labeled estate sale photos. This document defines the evaluation methodology, expected baseline metrics, and the process for conducting a full audit once photos are collected.

## Evaluation Methodology

### Ground Truth Collection

To formally evaluate accuracy:
1. Collect 50–100 real estate sale photos from existing Cloudinary uploads
2. Manually label each photo with the correct category (one per photo)
3. Run the tagger on each photo and record the top-3 predicted categories
4. Compare predictions vs ground truth

### Key Metrics

**Precision** (of predicted tags, how many are correct):
```
precision = TP / (TP + FP)
```

**Recall** (of actual categories, how many are detected):
```
recall = TP / (TP + FN)
```

**Top-3 accuracy**: Correct category appears in any of the top-3 predicted tags.

**Threshold calibration**: Fraction of correct predictions vs confidence score band.

---

## Expected Baseline by Category

Based on ViT model performance on household/consumer item datasets:

| Category | Expected Recall | Expected Precision | Notes |
|----------|----------------|-------------------|-------|
| furniture | 85–90% | 80–85% | Common, well-represented in training data |
| art | 70–80% | 65–75% | Varies widely by art type |
| textiles | 75–85% | 70–80% | Rugs, quilts usually distinctive |
| lighting | 80–85% | 75–80% | Lamps/chandeliers visually distinct |
| jewelry | 60–75% | 55–70% | Small items, needs clear close-up photo |
| collectibles | 50–65% | 45–60% | High variance — coins vs toys vs memorabilia |
| vintage (styles) | 65–75% | 60–70% | Stylistic cues rather than object type |
| other (materials) | 55–70% | 50–65% | Material detection (wood, marble) is indirect |

---

## Confidence Threshold Analysis

The default threshold of **0.35** is a starting point. Based on ViT model calibration:

- **< 0.25**: Very noisy — many false positives; not recommended
- **0.25–0.35**: Liberal — shows more tags, organizer should verify
- **0.35–0.50**: Balanced — recommended default
- **0.50–0.65**: Conservative — high-confidence tags only, may miss real categories
- **> 0.65**: Very strict — only use if false positives are a problem in production

### Threshold Adjustment Decision Tree

```
False positives high? (wrong tags accepted by organizers)
  → Raise threshold to 0.50

Missing too many categories? (organizers manually re-tagging frequently)
  → Lower threshold to 0.25–0.30

Tags generally correct?
  → Keep at 0.35 (default)
```

---

## Known Limitations

1. **Small items**: Jewelry, coins, and stamps photograph poorly at low resolution. Close-up macro photos improve accuracy significantly.

2. **Cluttered scenes**: Photos with multiple items produce mixed tags from multiple categories. The tagger returns the strongest signal, which may not be the intended item.

3. **Unusual angles**: Items photographed at extreme angles or in poor lighting reduce model confidence significantly.

4. **Simulation mode**: If the model failed to load (check `/info` endpoint), all "tags" come from filename keyword matching — not vision-based inference.

---

## Running the Accuracy Audit

Once 50+ labeled photos are available:

```bash
cd packages/backend/services/image-tagger

python3 - <<'EOF'
import requests
import json
import os

API_URL = os.getenv("TAGGER_URL", "http://localhost:5001")
API_KEY = os.getenv("TAGGER_API_KEY", "change-this-in-production")
HEADERS = {"X-API-Key": API_KEY}

# Format: {"photo_path": "...", "true_category": "furniture"}
LABELED_PHOTOS = [
    # ... add your labeled photos here
]

CATEGORY_MAP = {
    "furniture": "furniture", "styles": "vintage",
    "jewelry": "jewelry", "art": "art",
    "collectibles": "collectibles", "lighting": "decor",
    "textiles": "textiles", "materials": "other",
}

results = {"correct": 0, "total": 0, "by_category": {}}

for item in LABELED_PHOTOS:
    with open(item["photo_path"], "rb") as f:
        r = requests.post(
            f"{API_URL}/api/tag",
            headers=HEADERS,
            files={"image": (os.path.basename(item["photo_path"]), f, "image/jpeg")},
            data={"threshold": "0.35"},
        )
    tags = r.json().get("tags", [])
    predicted_categories = set()
    for t in tags:
        prefix = t["tag"].split(":")[0].strip().lower()
        if prefix in CATEGORY_MAP:
            predicted_categories.add(CATEGORY_MAP[prefix])

    true_cat = item["true_category"]
    correct = true_cat in predicted_categories
    results["total"] += 1
    if correct:
        results["correct"] += 1
    results["by_category"].setdefault(true_cat, {"correct": 0, "total": 0})
    results["by_category"][true_cat]["total"] += 1
    if correct:
        results["by_category"][true_cat]["correct"] += 1

print(f"\nOverall accuracy: {results['correct']}/{results['total']} = {results['correct']/results['total']*100:.1f}%\n")
for cat, r in results["by_category"].items():
    pct = r["correct"] / r["total"] * 100
    print(f"  {cat}: {r['correct']}/{r['total']} = {pct:.1f}%")
EOF
```

---

## Decision Gate

After completing a full accuracy audit, choose one of three paths:

**Keep tagger (default path)**
- Overall accuracy ≥ 75%
- No category below 40% recall
- Proceed to Phase 9 (creator dashboard)

**Replace model**
- Accuracy < 65% overall
- Try Florence-2 or CLIP ViT-L/14 variants
- Re-run benchmarks and audit

**Make tagging optional**
- Accuracy borderline (65–75%) but organizers can correct easily
- Keep feature, add "Suggested — verify before saving" label
- Raise threshold to 0.50 to reduce false positives
