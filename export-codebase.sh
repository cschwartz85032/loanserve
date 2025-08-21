#!/bin/bash

# Create timestamp for unique filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="loanserve_export_${TIMESTAMP}.tar.gz"
LISTING_FILE="loanserve_files_${TIMESTAMP}.txt"

echo "🚀 Starting LoanServe Pro codebase export..."
echo "================================================"

# Create file listing first
echo "📋 Creating file listing..."
{
    echo "LOANSERVE PRO - COMPLETE FILE LISTING"
    echo "Generated: $(date)"
    echo "================================================"
    echo ""
    
    echo "CLIENT FILES"
    echo "------------"
    find client/src -type f -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.json" | sort
    
    echo ""
    echo "SERVER FILES"
    echo "------------"
    find server -type f -name "*.ts" -o -name "*.js" -o -name "*.json" | grep -v uploads | sort
    
    echo ""
    echo "SHARED FILES"
    echo "------------"
    find shared -type f | sort
    
    echo ""
    echo "CONFIGURATION FILES"
    echo "-------------------"
    ls -la *.json *.ts *.js *.md 2>/dev/null | grep -v export
    
} > "$LISTING_FILE"

echo "✅ File listing saved to: $LISTING_FILE"

# Create the tar.gz archive
echo "📦 Creating compressed archive..."
tar -czf "$OUTPUT_FILE" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='build' \
    --exclude='*.log' \
    --exclude='server/uploads/*' \
    --exclude='*.sqlite' \
    --exclude='*.db' \
    --exclude='.env' \
    --exclude='export-codebase*' \
    --exclude='loanserve_export_*' \
    client/src \
    server \
    shared \
    migrations \
    *.json \
    *.config.ts \
    *.config.js \
    replit.md \
    2>/dev/null

# Get file size
SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

echo "✅ Archive created successfully!"
echo ""
echo "📊 EXPORT SUMMARY"
echo "================================================"
echo "📦 Archive: $OUTPUT_FILE"
echo "📏 Size: $SIZE"
echo "📋 File listing: $LISTING_FILE"
echo ""
echo "📁 Included:"
echo "  ✓ Client application (React/TypeScript)"
echo "  ✓ Server application (Express/Node.js)"
echo "  ✓ Shared schemas and types"
echo "  ✓ Database migrations"
echo "  ✓ Configuration files"
echo "  ✓ Documentation (replit.md)"
echo ""
echo "❌ Excluded:"
echo "  - node_modules"
echo "  - uploaded files"
echo "  - environment variables"
echo "  - build artifacts"
echo "  - logs"
echo ""
echo "💡 To download: Click on the file '$OUTPUT_FILE' in the file explorer"
echo "💡 To extract: tar -xzf $OUTPUT_FILE"
