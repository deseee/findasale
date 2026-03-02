#!/bin/bash
# Setup script for Estate Sale AI Image Tagger

echo "🚀 Setting up Estate Sale AI Image Tagger"

# Create virtual environment
echo "📦 Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Optional: Install CLIP for advanced features [citation:3][citation:6]
echo "🔧 Would you like to install CLIP support? (y/n)"
read install_clip
if [ "$install_clip" = "y" ]; then
    echo "Installing CLIP..."
    pip install git+https://github.com/openai/CLIP.git
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p uploads
mkdir -p models
mkdir -p templates

# Move HTML template
cp templates/index.html templates/

echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "  source venv/bin/activate"
echo "  python app.py"
echo ""
echo "Then open http://localhost:5000 in your browser"