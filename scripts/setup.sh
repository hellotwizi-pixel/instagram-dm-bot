#!/bin/bash

# Instagram DM Bot Setup Script

echo "🚀 Setting up Instagram DM Bot..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "📝 Creating .env file from .env.example..."
  cp .env.example .env
  echo "✅ .env file created. Please edit it with your credentials."
else
  echo "✅ .env file already exists."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your Instagram and Google Sheets credentials"
echo "2. Run 'npm run dev' to start the development server"
echo "3. Run 'npm test' to run tests"
echo ""
echo "📖 For more details, see docs/SETUP.md"
