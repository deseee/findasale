"""
Simplified FastAPI integration tests - test endpoints without heavy Gradio/ML dependencies.

Strategy: Create a minimal FastAPI app with the same endpoints as app.py,
then test the API contract, authentication, and error handling.
"""

import pytest
import tempfile
import os
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi import FastAPI, File, UploadFile, Form, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from PIL import Image
from datetime import datetime


@pytest.fixture
def test_image_bytes():
    """Create test image bytes."""
    img = Image.new('RGB', (224, 224), color=(73, 109, 137))
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        img.save(f.name)
        with open(f.name, 'rb') as img_file:
            img_bytes = img_file.read()
        os.unlink(f.name)
    return img_bytes


@pytest.fixture
def mock_tagger():
    """Create a mock tagger."""
    mock = MagicMock()
    mock.confidence_threshold = 0.35
    mock.generate_tags.return_value = [
        ('furniture: sofa', 0.92),
        ('furniture: couch', 0.78)
    ]
    mock.batch_process.return_value = {
        'file1.jpg': {'tags': ['furniture: table (0.85)'], 'count': 1}
    }
    return mock


@pytest.fixture
def api_app(mock_tagger):
    """Create a minimal FastAPI app matching app.py's endpoints."""
    # Simulate app.py's configuration
    API_KEY = "change-this-in-production"
    api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

    async def verify_api_key(api_key: str = Security(api_key_header)):
        if api_key != API_KEY:
            raise HTTPException(status_code=403, detail="Invalid API Key")
        return api_key

    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok", "timestamp": datetime.now().isoformat()}

    @app.post("/api/tag", dependencies=[Depends(verify_api_key)])
    async def api_tag(
        image: UploadFile = File(...),
        threshold: float = Form(0.35)
    ):
        """Single image tagging API (requires API key)"""
        content = await image.read()

        # Call mocked tagger
        mock_tagger.confidence_threshold = threshold
        tags = mock_tagger.generate_tags("dummy_path")

        return JSONResponse(content={
            "filename": image.filename,
            "tags": [{"tag": t, "confidence": c} for t, c in tags],
            "count": len(tags)
        })

    @app.post("/api/batch", dependencies=[Depends(verify_api_key)])
    async def api_batch(
        files: list[UploadFile] = File(...),
        recursive: bool = Form(True),
        output_format: str = Form("metadata"),
        threshold: float = Form(0.35)
    ):
        """Batch processing API (requires API key)"""
        # Consume uploaded files
        for file in files:
            await file.read()

        # Call mocked tagger
        mock_tagger.confidence_threshold = threshold
        results = mock_tagger.batch_process("dummy_dir")

        return JSONResponse(content=results)

    return TestClient(app)


class TestHealthEndpoint:
    """Test public /health endpoint."""

    def test_health_endpoint_returns_ok(self, api_app):
        """GET /health should return status ok."""
        response = api_app.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "timestamp" in data

    def test_health_endpoint_is_public(self, api_app):
        """GET /health should not require API key."""
        response = api_app.get("/health")
        assert response.status_code == 200
        assert "status" in response.json()


class TestSingleImageTagging:
    """Test POST /api/tag endpoint."""

    def test_tag_endpoint_with_valid_image_and_api_key(self, api_app, test_image_bytes):
        """Should tag image when API key is provided."""
        response = api_app.post(
            "/api/tag",
            files={"image": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"threshold": "0.35"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "filename" in data
        assert "tags" in data
        assert "count" in data
        assert data["count"] == 2
        assert len(data["tags"]) == 2

    def test_tag_endpoint_returns_correct_format(self, api_app, test_image_bytes):
        """Response should have correct format."""
        response = api_app.post(
            "/api/tag",
            files={"image": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"threshold": "0.5"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        data = response.json()
        assert data["filename"] == "test.jpg"
        assert isinstance(data["tags"], list)
        for tag in data["tags"]:
            assert "tag" in tag
            assert "confidence" in tag
            assert isinstance(tag["confidence"], float)

    def test_tag_endpoint_requires_api_key(self, api_app, test_image_bytes):
        """Should reject request without API key."""
        response = api_app.post(
            "/api/tag",
            files={"image": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"threshold": "0.35"}
            # No X-API-Key header
        )

        assert response.status_code == 403

    def test_tag_endpoint_requires_valid_api_key(self, api_app, test_image_bytes):
        """Should reject request with invalid API key."""
        response = api_app.post(
            "/api/tag",
            files={"image": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"threshold": "0.35"},
            headers={"X-API-Key": "invalid-key"}
        )

        assert response.status_code == 403

    def test_tag_endpoint_accepts_custom_threshold(self, api_app, test_image_bytes):
        """Should accept and use custom threshold."""
        response = api_app.post(
            "/api/tag",
            files={"image": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"threshold": "0.75"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        assert response.status_code == 200
        assert response.json()["count"] == 2

    def test_tag_endpoint_handles_missing_image(self, api_app):
        """Should handle missing image file."""
        response = api_app.post(
            "/api/tag",
            data={"threshold": "0.35"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        # Should return 422 (validation error) for missing required field
        assert response.status_code == 422

    def test_tag_endpoint_default_threshold(self, api_app, test_image_bytes):
        """Should use default threshold (0.35) if not provided."""
        response = api_app.post(
            "/api/tag",
            files={"image": ("test.jpg", test_image_bytes, "image/jpeg")},
            # No threshold parameter - should use default
            headers={"X-API-Key": "change-this-in-production"}
        )

        assert response.status_code == 200


class TestBatchProcessing:
    """Test POST /api/batch endpoint."""

    def test_batch_endpoint_requires_api_key(self, api_app, test_image_bytes):
        """Should reject request without API key."""
        response = api_app.post(
            "/api/batch",
            files={"files": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"recursive": "true", "output_format": "metadata", "threshold": "0.35"}
            # No X-API-Key header
        )

        assert response.status_code == 403

    def test_batch_endpoint_with_valid_files(self, api_app, test_image_bytes):
        """Should process multiple files."""
        response = api_app.post(
            "/api/batch",
            files={"files": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"recursive": "false", "output_format": "metadata", "threshold": "0.35"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        assert response.status_code == 200
        data = response.json()
        # Should have results from batch_process mock
        assert isinstance(data, dict)

    def test_batch_endpoint_accepts_recursive_flag(self, api_app, test_image_bytes):
        """Should accept recursive parameter."""
        response = api_app.post(
            "/api/batch",
            files={"files": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"recursive": "true", "output_format": "metadata", "threshold": "0.35"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        assert response.status_code == 200

    def test_batch_endpoint_accepts_output_format(self, api_app, test_image_bytes):
        """Should accept different output formats."""
        for output_format in ["metadata", "txt"]:
            response = api_app.post(
                "/api/batch",
                files={"files": ("test.jpg", test_image_bytes, "image/jpeg")},
                data={"recursive": "false", "output_format": output_format, "threshold": "0.35"},
                headers={"X-API-Key": "change-this-in-production"}
            )

            assert response.status_code == 200

    def test_batch_endpoint_default_parameters(self, api_app, test_image_bytes):
        """Should use default parameters if not provided."""
        response = api_app.post(
            "/api/batch",
            files={"files": ("test.jpg", test_image_bytes, "image/jpeg")},
            headers={"X-API-Key": "change-this-in-production"}
        )

        # Should use defaults and succeed
        assert response.status_code == 200


class TestAPIContract:
    """Test API contract consistency."""

    def test_tag_response_structure(self, api_app, test_image_bytes):
        """Response should always have consistent structure."""
        response = api_app.post(
            "/api/tag",
            files={"image": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"threshold": "0.35"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        data = response.json()
        # Required fields
        assert "filename" in data
        assert "tags" in data
        assert "count" in data

        # Type checks
        assert isinstance(data["filename"], str)
        assert isinstance(data["tags"], list)
        assert isinstance(data["count"], int)

        # Tags should be list of objects with tag and confidence
        for tag in data["tags"]:
            assert isinstance(tag, dict)
            assert "tag" in tag
            assert "confidence" in tag

    def test_batch_response_structure(self, api_app, test_image_bytes):
        """Batch response should have consistent structure."""
        response = api_app.post(
            "/api/batch",
            files={"files": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"recursive": "false", "output_format": "metadata", "threshold": "0.35"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        data = response.json()
        # Should be dictionary of results
        assert isinstance(data, dict)

    def test_health_response_structure(self, api_app):
        """Health response should have consistent structure."""
        response = api_app.get("/health")
        data = response.json()

        # Required fields
        assert "status" in data
        assert "timestamp" in data

        # Type checks
        assert isinstance(data["status"], str)
        assert isinstance(data["timestamp"], str)
        assert data["status"] == "ok"


class TestContentTypes:
    """Test content type handling."""

    def test_accepts_jpeg_images(self, api_app, test_image_bytes):
        """Should accept JPEG images."""
        response = api_app.post(
            "/api/tag",
            files={"image": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"threshold": "0.35"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        assert response.status_code == 200

    def test_returns_json_content_type(self, api_app, test_image_bytes):
        """Responses should have application/json content type."""
        response = api_app.post(
            "/api/tag",
            files={"image": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"threshold": "0.35"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        assert "application/json" in response.headers.get("content-type", "")
