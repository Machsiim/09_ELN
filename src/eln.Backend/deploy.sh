#!/bin/bash
# ===========================================
# ELN Deployment Script
# ===========================================

set -e

echo "=== ELN Deployment ==="

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "ERROR: .env not found!"
    echo "Copy .env.example to .env and fill in values"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Validate required variables
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "<GENERATE_NEW_SECRET>" ]; then
    echo "ERROR: JWT_SECRET not set in .env"
    echo "Generate one with: openssl rand -base64 64"
    exit 1
fi

if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "<SECURE_PASSWORD_HERE>" ]; then
    echo "ERROR: DB_PASSWORD not set in .env"
    exit 1
fi

echo "✓ Environment variables loaded"

# Build and start
echo "Building and starting containers..."
docker-compose -f docker-compose.production.yml up -d --build

echo ""
echo "=== Deployment Complete ==="
echo "Frontend: http://localhost"
echo "Backend:  http://localhost:5100"
echo "Health:   http://localhost/health"
echo ""
echo "Logs: docker-compose -f docker-compose.production.yml logs -f"
