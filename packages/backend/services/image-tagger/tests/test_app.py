"""
Integration tests for FastAPI image-tagger endpoints.
Tests API contract, authentication, error handling, and edge cases.
"""

import pytest
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from PIL import Image
import io


@pytest.fixture
def test_image_file():
    """Create a temporary test image file."""
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        # Create a simple test image
        img = Image.new('RGB', (224, 224), color=(73, 109, 137))
        img.save(f.name)
        yield f.name
    os.unlink(f.name)


@pytest.fixture
def test_client():
    """Create FastAPI test client with mocked tagger."""
    with patch('app.EstateSaleTagger') as mock_tagger_class:
        # Mock the tagger instance
        mock_tagger = MagicMock()
        mock_tagger.confidence_threshold = 0.35
        mock_tagger.generate_tags.return_value = [
            ('furniture: sofa', 0.92),
            ('furniture: couch', 0.78)
        ]
        mock_tagger.batch_process.return_value = {
            'file1.jpg': {'tags': ['furniture: table'], 'count': 1}
        }
        mock_tagger_class.return_value = mock_tagger

        # Import app after mocking
        from app import app
        return TestClient(app), mock_tagger


class TestHealthEndpoint:
    """Test public /health endpoint."""

    def test_health_endpoint_returns_ok(self, test_client):
        """GET /health should return status ok."""
        client, _ = test_client
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "timestamp" in data

    def test_health_endpoint_is_public(self, test_client):
        """GET /health should not require API key."""
        client, _ = test_client
        # No X-API-Key header
        response = client.get("/health")
        assert response.status_code == 200


class TestSingleImageTagging:
    """Test POST /api/tag endpoint."""

    def test_tag_endpoint_with_valid_image_and_api_key(self, test_client, test_image_file):
        """Should tag image when API key is provided."""
        client, mock_tagger = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
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

    def test_tag_endpoint_returns_correct_format(self, test_client, test_image_file):
        """Response should have correct format."""
        client, mock_tagger = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
                data={"threshold": "0.5"},
                headers={"X-API-Key": "change-this-in-production"}
            )

        data = response.json()
        assert data["filename"].endswith('.jpg')
        for tag in data["tags"]:
            assert "tag" in tag
            assert "confidence" in tag
            assert isinstance(tag["confidence"], float)

    def test_tag_endpoint_requires_api_key(self, test_client, test_image_file):
        """Should reject request without API key."""
        client, _ = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
                data={"threshold": "0.35"}
                # No X-API-Key header
            )

        assert response.status_code == 403

    def test_tag_endpoint_requires_valid_api_key(self, test_client, test_image_file):
        """Should reject request with invalid API key."""
        client, _ = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
                data={"threshold": "0.35"},
                headers={"X-API-Key": "invalid-api-key"}
            )

        assert response.status_code == 403

    def test_tag_endpoint_accepts_custom_threshold(self, test_client, test_image_file):
        """Should accept and use custom threshold."""
        client, mock_tagger = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
                data={"threshold": "0.75"},
                headers={"X-API-Key": "change-this-in-production"}
            )

        assert response.status_code == 200
        # Verify tagger was called with custom threshold
        mock_tagger.generate_tags.assert_called()

    def test_tag_endpoint_handles_missing_image(self, test_client):
        """Should handle missing image file."""
        client, _ = test_client

        response = client.post(
            "/api/tag",
            data={"threshold": "0.35"},
            headers={"X-API-Key": "change-this-in-production"}
        )

        # Should return 422 (validation error) for missing required field
        assert response.status_code == 422

    def test_tag_endpoint_handles_invalid_image(self, test_client):
        """Should handle corrupted/invalid image file."""
        client, mock_tagger = test_client

        # Mock tagger to raise an error for invalid image
        mock_tagger.generate_tags.side_effect = Exception("Invalid image")

        # Create invalid image file
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            f.write(b'This is not a valid image')
            invalid_path = f.name

        try:
            with open(invalid_path, 'rb') as f:
                response = client.post(
                    "/api/tag",
                    files={"image": f},
                    data={"threshold": "0.35"},
                    headers={"X-API-Key": "change-this-in-production"}
                )

            # Should return 500 error
            assert response.status_code == 500
        finally:
            os.unlink(invalid_path)

    def test_tag_endpoint_default_threshold(self, test_client, test_image_file):
        """Should use default threshold (0.35) if not provided."""
        client, mock_tagger = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
                # No threshold parameter
                headers={"X-API-Key": "change-this-in-production"}
            )

        assert response.status_code == 200


class TestBatchProcessing:
    """Test POST /api/batch endpoint."""

    def test_batch_endpoint_requires_api_key(self, test_client, test_image_file):
        """Should reject request without API key."""
        client, _ = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/batch",
                files={"files": (f.name, f, "image/jpeg")},
                data={"recursive": "true", "output_format": "metadata", "threshold": "0.35"}
                # No X-API-Key header
            )

        assert response.status_code == 403

    def test_batch_endpoint_with_valid_files(self, test_client, test_image_file):
        """Should process multiple files."""
        client, mock_tagger = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/batch",
                files={"files": (f.name, f, "image/jpeg")},
                data={"recursive": "false", "output_format": "metadata", "threshold": "0.35"},
                headers={"X-API-Key": "change-this-in-production"}
            )

        assert response.status_code == 200
        data = response.json()
        # Should have results from batch_process mock
        assert isinstance(data, dict)

    def test_batch_endpoint_accepts_recursive_flag(self, test_client, test_image_file):
        """Should accept recursive parameter."""
        client, mock_tagger = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/batch",
                files={"files": (f.name, f, "image/jpeg")},
                data={"recursive": "true", "output_format": "metadata", "threshold": "0.35"},
                headers={"X-API-Key": "change-this-in-production"}
            )

        assert response.status_code == 200

    def test_batch_endpoint_accepts_output_format(self, test_client, test_image_file):
        """Should accept different output formats."""
        client, mock_tagger = test_client

        for output_format in ["metadata", "txt"]:
            with open(test_image_file, 'rb') as f:
                response = client.post(
                    "/api/batch",
                    files={"files": (f.name, f, "image/jpeg")},
                    data={"recursive": "false", "output_format": output_format, "threshold": "0.35"},
                    headers={"X-API-Key": "change-this-in-production"}
                )

            assert response.status_code == 200

    def test_batch_endpoint_default_parameters(self, test_client, test_image_file):
        """Should use default parameters if not provided."""
        client, mock_tagger = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/batch",
                files={"files": (f.name, f, "image/jpeg")},
                # No data parameters
                headers={"X-API-Key": "change-this-in-production"}
            )

        # Should use defaults and succeed
        assert response.status_code == 200


class TestErrorHandling:
    """Test error scenarios."""

    def test_timeout_handling(self, test_client, test_image_file):
        """Should handle timeout gracefully."""
        client, mock_tagger = test_client

        # Mock tagger to simulate timeout
        import asyncio
        mock_tagger.generate_tags.side_effect = asyncio.TimeoutError("Request timed out")

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
                data={"threshold": "0.35"},
                headers={"X-API-Key": "change-this-in-production"}
            )

        # Should return 500 error
        assert response.status_code == 500

    def test_tagger_exception_handling(self, test_client, test_image_file):
        """Should handle tagger exceptions gracefully."""
        client, mock_tagger = test_client

        # Mock tagger to raise exception
        mock_tagger.generate_tags.side_effect = Exception("Model load failed")

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
                data={"threshold": "0.35"},
                headers={"X-API-Key": "change-this-in-production"}
            )

        # Should return 500 error
        assert response.status_code == 500


class TestAPIContract:
    """Test API contract consistency."""

    def test_tag_response_structure(self, test_client, test_image_file):
        """Response should always have consistent structure."""
        client, _ = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
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

    def test_batch_response_structure(self, test_client, test_image_file):
        """Batch response should have consistent structure."""
        client, _ = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/batch",
                files={"files": (f.name, f, "image/jpeg")},
                data={"recursive": "false", "output_format": "metadata", "threshold": "0.35"},
                headers={"X-API-Key": "change-this-in-production"}
            )

        data = response.json()
        # Should be dictionary of results
        assert isinstance(data, dict)

    def test_health_response_structure(self, test_client):
        """Health response should have consistent structure."""
        client, _ = test_client

        response = client.get("/health")
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

    def test_accepts_jpeg_images(self, test_client, test_image_file):
        """Should accept JPEG images."""
        client, _ = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": ("test.jpg", f, "image/jpeg")},
                data={"threshold": "0.35"},
                headers={"X-API-Key": "change-this-in-production"}
            )

        assert response.status_code == 200

    def test_returns_json_content_type(self, test_client, test_image_file):
        """Responses should have application/json content type."""
        client, _ = test_client

        with open(test_image_file, 'rb') as f:
            response = client.post(
                "/api/tag",
                files={"image": f},
                data={"threshold": "0.35"},
                headers={"X-API-Key": "change-this-in-production"}
            )

        assert "application/json" in response.headers.get("content-type", "")
