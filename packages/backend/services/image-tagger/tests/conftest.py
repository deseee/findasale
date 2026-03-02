import os
import sys
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from PIL import Image
import tempfile

# Mock torch and transformers BEFORE importing tagger
sys.modules['torch'] = MagicMock()
sys.modules['torch.cuda'] = MagicMock()
sys.modules['torch.nn'] = MagicMock()
sys.modules['torch.nn.functional'] = MagicMock()
sys.modules['torchvision'] = MagicMock()
sys.modules['torchvision.transforms'] = MagicMock()
sys.modules['transformers'] = MagicMock()
sys.modules['piexif'] = MagicMock()
sys.modules['tqdm'] = MagicMock()
sys.modules['numpy'] = MagicMock()

# Add parent directory to path so we can import tagger
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture
def test_images_dir():
    """Create temporary directory with test images."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create furniture image (sofa-like)
        img = Image.new('RGB', (224, 224), color=(100, 100, 100))
        img.save(os.path.join(tmpdir, 'sofa.jpg'))

        # Create jewelry image (shiny, bright)
        img = Image.new('RGB', (224, 224), color=(255, 200, 100))
        img.save(os.path.join(tmpdir, 'jewelry.jpg'))

        # Create art/painting image (colored)
        img = Image.new('RGB', (224, 224), color=(200, 100, 100))
        img.save(os.path.join(tmpdir, 'painting.jpg'))

        # Create textiles/rug image (patterned-like)
        img = Image.new('RGB', (224, 224), color=(100, 50, 50))
        img.save(os.path.join(tmpdir, 'rug.jpg'))

        # Create decorative item (vase-like)
        img = Image.new('RGB', (224, 224), color=(150, 150, 200))
        img.save(os.path.join(tmpdir, 'vase.jpg'))

        # Create invalid (non-image) file
        with open(os.path.join(tmpdir, 'invalid.txt'), 'w') as f:
            f.write('This is not an image')

        yield tmpdir


@pytest.fixture
def mock_model():
    """Mock the transformer model and preprocessor."""
    with patch('tagger.AutoImageProcessor.from_pretrained') as mock_processor, \
         patch('tagger.AutoModelForImageClassification.from_pretrained') as mock_model_class:

        # Mock processor
        mock_processor_instance = MagicMock()
        mock_processor_instance.return_value = {
            'pixel_values': MagicMock()
        }
        mock_processor.return_value = mock_processor_instance

        # Mock model
        mock_model_instance = MagicMock()
        mock_model_instance.config.id2label = {
            0: 'furniture',
            1: 'jewelry',
            2: 'art',
            3: 'textiles',
            4: 'decor'
        }

        # Mock predictions
        mock_logits = MagicMock()
        mock_logits.logits.shape = (1, 5)
        mock_logits.logits = [[0.9, 0.1, 0.05, 0.03, 0.02]]  # High confidence on furniture
        mock_model_instance.return_value = mock_logits
        mock_model_class.return_value = mock_model_instance

        yield mock_processor_instance, mock_model_instance


@pytest.fixture
def tagger_instance(mock_model):
    """Create an EstateSaleTagger instance with mocked model."""
    from tagger import EstateSaleTagger

    tagger = EstateSaleTagger(model_type='wd-vit', confidence_threshold=0.35)
    tagger.device = 'cpu'
    tagger.model_loaded = True

    return tagger


@pytest.fixture
def estate_categories():
    """Fixture with expected estate sale categories."""
    return {
        "furniture": [
            "dining chair", "armchair", "sofa", "dresser", "nightstand",
            "dining table", "desk", "bookshelf", "cabinet"
        ],
        "styles": [
            "mid-century modern", "victorian", "art deco", "colonial"
        ],
        "materials": [
            "wood", "mahogany", "oak", "marble", "glass", "brass"
        ],
        "jewelry": [
            "necklace", "bracelet", "ring", "earrings", "brooch"
        ],
        "art": [
            "painting", "print", "sculpture", "vase", "pottery"
        ],
        "collectibles": [
            "coin", "stamp", "toy", "doll", "model"
        ],
        "lighting": [
            "lamp", "chandelier", "sconce", "floor lamp"
        ],
        "textiles": [
            "rug", "carpet", "curtain", "blanket", "quilt"
        ]
    }
