"""
Simplified unit tests for EstateSaleTagger - Focus on logic without heavy dependencies.

These tests validate:
- Tag filtering logic
- Simulation mode
- Category recognition
- Edge case handling
"""

import pytest
import os
import tempfile
from pathlib import Path
from PIL import Image
from unittest.mock import MagicMock, patch


class TestEstateCategories:
    """Test estate-specific categories are defined correctly."""

    def test_categories_exist(self):
        """Estate categories should be defined."""
        expected_categories = {
            "furniture", "styles", "materials", "jewelry",
            "art", "collectibles", "lighting", "textiles"
        }
        # Import after mocking
        from tagger import EstateSaleTagger

        with patch.object(EstateSaleTagger, '_load_model'):
            tagger = EstateSaleTagger()
            actual_categories = set(tagger.estate_categories.keys())

            assert expected_categories.issubset(actual_categories)

    def test_furniture_category_complete(self):
        """Furniture category should have relevant items."""
        from tagger import EstateSaleTagger

        with patch.object(EstateSaleTagger, '_load_model'):
            tagger = EstateSaleTagger()
            furniture_items = tagger.estate_categories['furniture']

            assert 'sofa' in furniture_items
            # Check for 'chair' items (e.g., 'dining chair', 'armchair')
            chair_items = [item for item in furniture_items if 'chair' in item]
            assert len(chair_items) > 0
            assert len(furniture_items) > 5

    def test_jewelry_category_complete(self):
        """Jewelry category should have relevant items."""
        from tagger import EstateSaleTagger

        with patch.object(EstateSaleTagger, '_load_model'):
            tagger = EstateSaleTagger()
            jewelry_items = tagger.estate_categories['jewelry']

            assert 'ring' in jewelry_items
            assert 'necklace' in jewelry_items
            assert len(jewelry_items) > 3


class TestSimulation:
    """Test fallback simulation mode."""

    def test_simulate_tags_returns_list(self):
        """_simulate_tags should return a list."""
        from tagger import EstateSaleTagger

        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = os.path.join(tmpdir, 'sofa.jpg')
            Image.new('RGB', (224, 224)).save(img_path)

            with patch.object(EstateSaleTagger, '_load_model'):
                tagger = EstateSaleTagger()
                tags = tagger._simulate_tags(img_path)

                assert isinstance(tags, list)
                assert len(tags) > 0

    def test_simulate_tags_match_pattern(self):
        """Simulated tags should match pattern (category: item, confidence)."""
        from tagger import EstateSaleTagger

        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = os.path.join(tmpdir, 'sofa.jpg')
            Image.new('RGB', (224, 224)).save(img_path)

            with patch.object(EstateSaleTagger, '_load_model'):
                tagger = EstateSaleTagger()
                tags = tagger._simulate_tags(img_path)

                for tag in tags:
                    assert isinstance(tag, tuple)
                    assert len(tag) == 2
                    tag_str, confidence = tag
                    assert isinstance(tag_str, str)
                    assert isinstance(confidence, float)
                    assert 0.0 <= confidence <= 1.0

    def test_simulate_tags_recognizes_filename(self):
        """Simulated tags should recognize keywords in filename."""
        from tagger import EstateSaleTagger

        test_cases = {
            'sofa.jpg': ['sofa', 'furniture'],
            'jewelry_ring.jpg': ['ring', 'jewelry'],
            'painting_landscape.jpg': ['painting', 'art'],
            'oriental_rug.jpg': ['rug', 'textiles']
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.object(EstateSaleTagger, '_load_model'):
                tagger = EstateSaleTagger()

                for filename, expected_keywords in test_cases.items():
                    img_path = os.path.join(tmpdir, filename)
                    Image.new('RGB', (224, 224)).save(img_path)

                    tags = tagger._simulate_tags(img_path)
                    tag_strings = [t[0].lower() for t in tags]

                    # At least one keyword should be in tags
                    found_keyword = False
                    for keyword in expected_keywords:
                        if any(keyword.lower() in tag.lower() for tag in tag_strings):
                            found_keyword = True
                            break

                    assert found_keyword, f"Expected {expected_keywords} in {tag_strings}"


class TestConfiguration:
    """Test configuration and initialization."""

    def test_confidence_threshold_default(self):
        """Default confidence threshold should be 0.35."""
        from tagger import EstateSaleTagger

        with patch.object(EstateSaleTagger, '_load_model'):
            tagger = EstateSaleTagger()
            assert tagger.confidence_threshold == 0.35

    def test_confidence_threshold_custom(self):
        """Should accept custom confidence threshold."""
        from tagger import EstateSaleTagger

        with patch.object(EstateSaleTagger, '_load_model'):
            tagger = EstateSaleTagger(confidence_threshold=0.5)
            assert tagger.confidence_threshold == 0.5

            tagger2 = EstateSaleTagger(confidence_threshold=0.75)
            assert tagger2.confidence_threshold == 0.75

    def test_model_type_default(self):
        """Default model type should be wd-vit."""
        from tagger import EstateSaleTagger

        with patch.object(EstateSaleTagger, '_load_model'):
            tagger = EstateSaleTagger()
            assert tagger.model_type == 'wd-vit'

    def test_model_type_custom(self):
        """Should accept custom model type."""
        from tagger import EstateSaleTagger

        with patch.object(EstateSaleTagger, '_load_model'):
            tagger = EstateSaleTagger(model_type='clip')
            assert tagger.model_type == 'clip'


class TestBatchProcessingLogic:
    """Test batch processing directory discovery."""

    def test_discovers_image_files(self):
        """Should discover common image file formats."""
        from tagger import EstateSaleTagger
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test images
            for ext in ['jpg', 'jpeg', 'png', 'webp']:
                Image.new('RGB', (224, 224)).save(os.path.join(tmpdir, f'test.{ext}'))

            with patch.object(EstateSaleTagger, '_load_model'), \
                 patch.object(EstateSaleTagger, 'generate_tags', return_value=[('tag', 0.8)]):
                tagger = EstateSaleTagger()
                results = tagger.batch_process(tmpdir, recursive=False)

                # Should find 4 images
                assert len(results) == 4

    def test_respects_recursive_flag(self):
        """Should respect recursive flag for nested directories."""
        from tagger import EstateSaleTagger

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create nested structure
            subdir = os.path.join(tmpdir, 'subdir')
            os.makedirs(subdir)

            # Create images in root
            Image.new('RGB', (224, 224)).save(os.path.join(tmpdir, 'root.jpg'))
            Image.new('RGB', (224, 224)).save(os.path.join(subdir, 'nested.jpg'))

            with patch.object(EstateSaleTagger, '_load_model'), \
                 patch.object(EstateSaleTagger, 'generate_tags', return_value=[('tag', 0.8)]):
                tagger = EstateSaleTagger()

                results_recursive = tagger.batch_process(tmpdir, recursive=True)
                results_non_recursive = tagger.batch_process(tmpdir, recursive=False)

                # Recursive should find both, non-recursive only root
                assert len(results_recursive) == 2
                assert len(results_non_recursive) == 1

    def test_empty_directory_handled(self):
        """Empty directory should return empty results."""
        from tagger import EstateSaleTagger

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.object(EstateSaleTagger, '_load_model'):
                tagger = EstateSaleTagger()
                results = tagger.batch_process(tmpdir)

                assert isinstance(results, dict)
                assert len(results) == 0


class TestFilteringLogic:
    """Test tag filtering by confidence threshold."""

    def test_tag_filtering_basic(self):
        """Tags below threshold should be filtered out."""
        from tagger import EstateSaleTagger

        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = os.path.join(tmpdir, 'test.jpg')
            Image.new('RGB', (224, 224)).save(img_path)

            with patch.object(EstateSaleTagger, '_load_model'):
                tagger = EstateSaleTagger(confidence_threshold=0.5)

                # Mock _predict_tags to return various confidence levels
                with patch.object(tagger, '_predict_tags') as mock_predict:
                    mock_predict.return_value = [
                        ('furniture: sofa', 0.95),
                        ('furniture: couch', 0.75),
                        ('textiles: fabric', 0.45),  # Below threshold
                        ('decor: ornament', 0.20)  # Below threshold
                    ]

                    tags = tagger.generate_tags(img_path)

                    # Should have only tags >= 0.5
                    assert all(t[1] >= 0.5 for t in tags)
                    assert len(tags) == 2

    def test_tag_filtering_with_boundary_values(self):
        """Boundary values should be handled correctly."""
        from tagger import EstateSaleTagger

        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = os.path.join(tmpdir, 'test.jpg')
            Image.new('RGB', (224, 224)).save(img_path)

            with patch.object(EstateSaleTagger, '_load_model'):
                tagger = EstateSaleTagger(confidence_threshold=0.5)

                with patch.object(tagger, '_predict_tags') as mock_predict:
                    # Test exact boundary
                    mock_predict.return_value = [
                        ('tag1', 0.5),  # Equal to threshold (should be included)
                        ('tag2', 0.49)  # Just below threshold (should be excluded)
                    ]

                    tags = tagger.generate_tags(img_path)

                    assert len(tags) == 1
                    assert tags[0][1] == 0.5


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_invalid_threshold_values(self):
        """Should handle invalid threshold values gracefully."""
        from tagger import EstateSaleTagger

        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = os.path.join(tmpdir, 'test.jpg')
            Image.new('RGB', (224, 224)).save(img_path)

            with patch.object(EstateSaleTagger, '_load_model'):
                # Negative threshold - should allow all
                tagger = EstateSaleTagger(confidence_threshold=-0.1)
                with patch.object(tagger, '_predict_tags') as mock_predict:
                    mock_predict.return_value = [('tag', 0.5)]
                    tags = tagger.generate_tags(img_path)
                    assert len(tags) == 1

                # Threshold > 1.0 - should filter everything
                tagger2 = EstateSaleTagger(confidence_threshold=1.5)
                with patch.object(tagger2, '_predict_tags') as mock_predict:
                    mock_predict.return_value = [('tag', 0.99)]
                    tags = tagger2.generate_tags(img_path)
                    assert len(tags) == 0

    def test_missing_file_handling(self):
        """Should handle missing files gracefully."""
        from tagger import EstateSaleTagger

        with patch.object(EstateSaleTagger, '_load_model'):
            tagger = EstateSaleTagger()

            # generate_tags should handle exceptions gracefully
            tags = tagger.generate_tags('/nonexistent/path.jpg')

            # Should return empty list, not crash
            assert isinstance(tags, list)

    def test_corrupted_image_handling(self):
        """Should handle corrupted image files gracefully."""
        from tagger import EstateSaleTagger

        with tempfile.TemporaryDirectory() as tmpdir:
            corrupted_path = os.path.join(tmpdir, 'corrupted.jpg')

            # Create a corrupted file
            with open(corrupted_path, 'wb') as f:
                f.write(b'This is not a valid image')

            with patch.object(EstateSaleTagger, '_load_model'):
                tagger = EstateSaleTagger()

                # Should handle gracefully and return empty or fallback
                tags = tagger.generate_tags(corrupted_path)
                assert isinstance(tags, list)
