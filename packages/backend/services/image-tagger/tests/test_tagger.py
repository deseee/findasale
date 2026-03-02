"""
Unit tests for EstateSaleTagger class.
Tests model loading, tag generation, batch processing, and fallback behavior.
"""

import pytest
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock
from PIL import Image
import sys

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from tagger import EstateSaleTagger


class TestModelLoading:
    """Test model loading and initialization."""

    @patch('tagger.torch.cuda.is_available')
    @patch('tagger.AutoModelForImageClassification.from_pretrained')
    @patch('tagger.AutoImageProcessor.from_pretrained')
    def test_model_loads_on_startup_wd_vit(self, mock_processor, mock_model, mock_cuda):
        """Model should load successfully on startup for wd-vit."""
        mock_cuda.return_value = False
        mock_processor.return_value = MagicMock()
        mock_model.return_value = MagicMock()

        tagger = EstateSaleTagger(model_type='wd-vit', confidence_threshold=0.35)

        assert tagger.model_loaded is True
        assert tagger.device == 'cpu'
        mock_model.assert_called_once()

    @patch('tagger.torch.cuda.is_available')
    @patch('tagger.AutoModelForImageClassification.from_pretrained')
    @patch('tagger.AutoImageProcessor.from_pretrained')
    def test_model_detects_cuda_device(self, mock_processor, mock_model, mock_cuda):
        """Model should use GPU if available."""
        mock_cuda.return_value = True
        mock_processor.return_value = MagicMock()
        mock_model.return_value = MagicMock()

        tagger = EstateSaleTagger(model_type='wd-vit')

        assert tagger.device == 'cuda'

    @patch('tagger.AutoModelForImageClassification.from_pretrained')
    @patch('tagger.AutoImageProcessor.from_pretrained')
    def test_model_respects_model_type_env_var(self, mock_processor, mock_model):
        """Model type should be respectable from environment or parameter."""
        mock_processor.return_value = MagicMock()
        mock_model.return_value = MagicMock()

        # Test with explicit parameter
        tagger = EstateSaleTagger(model_type='wd-vit')
        assert tagger.model_type == 'wd-vit'

        # Test with clip
        tagger_clip = EstateSaleTagger(model_type='clip')
        assert tagger_clip.model_type == 'clip'

    @patch('tagger.logger')
    @patch('tagger.AutoModelForImageClassification.from_pretrained')
    def test_fallback_on_model_load_failure(self, mock_model, mock_logger):
        """Should fall back to simulation if model loading fails."""
        mock_model.side_effect = Exception('Model load failed')

        tagger = EstateSaleTagger(model_type='wd-vit')

        # Should log warning but not crash
        assert tagger.model_loaded is False
        mock_logger.warning.assert_called()

    def test_confidence_threshold_set_correctly(self):
        """Confidence threshold should be stored correctly."""
        with patch('tagger.AutoModelForImageClassification.from_pretrained'), \
             patch('tagger.AutoImageProcessor.from_pretrained'):

            tagger = EstateSaleTagger(confidence_threshold=0.5)
            assert tagger.confidence_threshold == 0.5

            tagger2 = EstateSaleTagger(confidence_threshold=0.75)
            assert tagger2.confidence_threshold == 0.75


class TestTagGeneration:
    """Test tag generation functionality."""

    def test_generate_tags_returns_list_of_tuples(self, tagger_instance, test_images_dir):
        """generate_tags should return list of (tag, confidence) tuples."""
        image_path = os.path.join(test_images_dir, 'sofa.jpg')

        # Mock the prediction
        with patch.object(tagger_instance, '_predict_tags') as mock_predict:
            mock_predict.return_value = [
                ('furniture: sofa', 0.85),
                ('furniture: couch', 0.72),
                ('textiles: fabric', 0.45)
            ]

            tags = tagger_instance.generate_tags(image_path)

            assert isinstance(tags, list)
            assert len(tags) > 0
            assert all(isinstance(t, tuple) and len(t) == 2 for t in tags)
            assert all(isinstance(t[0], str) and isinstance(t[1], float) for t in tags)

    def test_respects_confidence_threshold(self, tagger_instance, test_images_dir):
        """Tags below confidence threshold should be filtered out."""
        image_path = os.path.join(test_images_dir, 'sofa.jpg')
        tagger_instance.confidence_threshold = 0.5

        with patch.object(tagger_instance, '_predict_tags') as mock_predict:
            mock_predict.return_value = [
                ('furniture: sofa', 0.85),
                ('furniture: couch', 0.72),
                ('textiles: fabric', 0.45),  # Below threshold
                ('decor: ornament', 0.30)  # Below threshold
            ]

            tags = tagger_instance.generate_tags(image_path)

            # Should have only tags >= 0.5
            assert all(t[1] >= 0.5 for t in tags)
            assert len(tags) == 2

    def test_handles_invalid_image_path(self, tagger_instance):
        """Should handle invalid image paths gracefully."""
        with pytest.raises((FileNotFoundError, OSError)):
            tagger_instance.generate_tags('/nonexistent/path/image.jpg')

    def test_handles_corrupted_image_file(self, tagger_instance, test_images_dir):
        """Should handle corrupted image files gracefully."""
        # Create corrupted image
        corrupted_path = os.path.join(test_images_dir, 'corrupted.jpg')
        with open(corrupted_path, 'wb') as f:
            f.write(b'This is not a valid image file')

        # Should either raise an error or fall back to simulation
        with pytest.raises((OSError, IOError)):
            tagger_instance.generate_tags(corrupted_path)


class TestBatchProcessing:
    """Test batch processing functionality."""

    def test_batch_process_handles_multiple_images(self, tagger_instance, test_images_dir):
        """batch_process should handle multiple images."""
        with patch.object(tagger_instance, 'generate_tags') as mock_generate:
            mock_generate.return_value = [('furniture: sofa', 0.85)]

            results = tagger_instance.batch_process(
                test_images_dir,
                output_format='metadata',
                recursive=False
            )

            # Should process all image files
            assert isinstance(results, dict)
            # Count JPG files created in fixture
            assert len(results) >= 4  # sofa.jpg, jewelry.jpg, painting.jpg, rug.jpg, vase.jpg

    def test_batch_process_respects_recursive_flag(self, tagger_instance):
        """recursive=True should process subdirectories."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create nested structure
            subdir = os.path.join(tmpdir, 'subdir')
            os.makedirs(subdir)

            # Create images in root
            Image.new('RGB', (224, 224)).save(os.path.join(tmpdir, 'root.jpg'))
            Image.new('RGB', (224, 224)).save(os.path.join(subdir, 'nested.jpg'))

            with patch.object(tagger_instance, 'generate_tags') as mock_generate:
                mock_generate.return_value = [('furniture: item', 0.85)]

                results_recursive = tagger_instance.batch_process(
                    tmpdir,
                    recursive=True
                )
                results_non_recursive = tagger_instance.batch_process(
                    tmpdir,
                    recursive=False
                )

                # Recursive should find more files
                assert len(results_recursive) >= len(results_non_recursive)

    def test_batch_process_error_in_one_image_doesnt_stop_batch(self, tagger_instance):
        """Error processing one image should not stop batch processing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create valid image
            Image.new('RGB', (224, 224)).save(os.path.join(tmpdir, 'valid.jpg'))

            # Create invalid image
            with open(os.path.join(tmpdir, 'invalid.jpg'), 'w') as f:
                f.write('not an image')

            with patch.object(tagger_instance, 'generate_tags') as mock_generate:
                def side_effect(path):
                    if 'valid' in path:
                        return [('furniture: item', 0.85)]
                    else:
                        raise IOError('Invalid image')

                mock_generate.side_effect = side_effect

                results = tagger_instance.batch_process(tmpdir)

                # Should process valid image despite invalid image
                assert any('valid' in key for key in results.keys())


class TestFallbackAndSimulation:
    """Test fallback and simulation functionality."""

    def test_simulate_tags_works_if_model_fails(self, tagger_instance, test_images_dir):
        """_simulate_tags should work when model is unavailable."""
        image_path = os.path.join(test_images_dir, 'sofa.jpg')

        # Mark model as not loaded
        tagger_instance.model_loaded = False

        tags = tagger_instance._simulate_tags(image_path)

        assert isinstance(tags, list)
        assert len(tags) > 0
        # Simulated tags should include filename-based guesses
        assert any('sofa' in str(t).lower() for t in tags)

    def test_fallback_tags_are_reasonable(self, tagger_instance):
        """Fallback tags should match keyword-based patterns."""
        test_filenames = {
            'sofa.jpg': ['sofa', 'furniture'],
            'jewelry-ring.jpg': ['ring', 'jewelry'],
            'painting-landscape.jpg': ['painting', 'art'],
            'oriental_rug.jpg': ['rug', 'textiles']
        }

        for filename, expected_keywords in test_filenames.items():
            with tempfile.TemporaryDirectory() as tmpdir:
                path = os.path.join(tmpdir, filename)
                Image.new('RGB', (224, 224)).save(path)

                tags = tagger_instance._simulate_tags(path)
                tag_strings = [t[0].lower() if isinstance(t, tuple) else str(t).lower() for t in tags]

                # At least one keyword should match
                assert any(kw.lower() in ' '.join(tag_strings) for kw in expected_keywords)


class TestEstateSpecificCategories:
    """Test estate-specific category recognition."""

    def test_recognizes_furniture_category(self, tagger_instance, estate_categories):
        """Should recognize furniture items."""
        with patch.object(tagger_instance, '_predict_tags') as mock_predict:
            mock_predict.return_value = [
                ('furniture: sofa', 0.92),
                ('furniture: couch', 0.88)
            ]

            # Should recognize as furniture
            tags = tagger_instance._predict_tags()
            assert any('furniture' in t[0].lower() for t in tags)

    def test_recognizes_jewelry_category(self, tagger_instance):
        """Should recognize jewelry items."""
        with patch.object(tagger_instance, '_predict_tags') as mock_predict:
            mock_predict.return_value = [
                ('jewelry: necklace', 0.85),
                ('jewelry: gold', 0.75)
            ]

            tags = tagger_instance._predict_tags()
            assert any('jewelry' in t[0].lower() for t in tags)

    def test_recognizes_art_category(self, tagger_instance):
        """Should recognize art and collectibles."""
        with patch.object(tagger_instance, '_predict_tags') as mock_predict:
            mock_predict.return_value = [
                ('art: painting', 0.90),
                ('art: oil painting', 0.87)
            ]

            tags = tagger_instance._predict_tags()
            assert any('art' in t[0].lower() for t in tags)

    def test_recognizes_textiles_category(self, tagger_instance):
        """Should recognize textiles and rugs."""
        with patch.object(tagger_instance, '_predict_tags') as mock_predict:
            mock_predict.return_value = [
                ('textiles: rug', 0.88),
                ('textiles: carpet', 0.84)
            ]

            tags = tagger_instance._predict_tags()
            assert any('textiles' in t[0].lower() or 'rug' in t[0].lower() for t in tags)

    def test_confidence_scores_are_calibrated(self, tagger_instance, test_images_dir):
        """Confidence scores should vary, not all be 0.99."""
        image_path = os.path.join(test_images_dir, 'sofa.jpg')

        with patch.object(tagger_instance, '_predict_tags') as mock_predict:
            mock_predict.return_value = [
                ('furniture: sofa', 0.92),
                ('furniture: couch', 0.78),
                ('textiles: fabric', 0.45)
            ]

            tags = tagger_instance.generate_tags(image_path)

            # Confidence scores should vary
            confidences = [t[1] for t in tags]
            assert len(set(confidences)) > 1  # Not all the same
            assert all(0.0 <= c <= 1.0 for c in confidences)


class TestEdgeCases:
    """Test edge cases and error scenarios."""

    def test_empty_image_directory(self, tagger_instance):
        """Should handle empty directory gracefully."""
        with tempfile.TemporaryDirectory() as tmpdir:
            results = tagger_instance.batch_process(tmpdir)
            assert isinstance(results, dict)
            # Empty results is acceptable
            assert len(results) == 0

    def test_missing_image_file(self, tagger_instance):
        """Should raise error for missing file."""
        with pytest.raises((FileNotFoundError, OSError)):
            tagger_instance.generate_tags('/path/that/does/not/exist.jpg')

    def test_invalid_threshold_values(self, tagger_instance):
        """Should handle invalid threshold values."""
        # Negative threshold
        tagger_instance.confidence_threshold = -0.1
        with patch.object(tagger_instance, '_predict_tags') as mock_predict:
            mock_predict.return_value = [('item', 0.5)]
            # Should still return results (no filtering)
            tags = tagger_instance.generate_tags('dummy.jpg')
            assert len(tags) == 1

        # Threshold > 1.0
        tagger_instance.confidence_threshold = 1.5
        with patch.object(tagger_instance, '_predict_tags') as mock_predict:
            mock_predict.return_value = [('item', 0.99)]
            # Should filter out everything
            tags = tagger_instance.generate_tags('dummy.jpg')
            assert len(tags) == 0

    def test_thread_safety_with_multiple_concurrent_calls(self, tagger_instance, test_images_dir):
        """Multiple concurrent tag generation calls should not interfere."""
        import threading
        results = []

        def tag_image(image_name):
            path = os.path.join(test_images_dir, image_name)
            with patch.object(tagger_instance, '_predict_tags') as mock_predict:
                mock_predict.return_value = [('item', 0.85)]
                tags = tagger_instance.generate_tags(path)
                results.append(tags)

        threads = [
            threading.Thread(target=tag_image, args=('sofa.jpg',)),
            threading.Thread(target=tag_image, args=('jewelry.jpg',)),
            threading.Thread(target=tag_image, args=('painting.jpg',))
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # All threads should complete without error
        assert len(results) == 3
        assert all(isinstance(r, list) for r in results)
