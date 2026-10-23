#!/usr/bin/env bash
# Fireball Agent Host Setup Script for Ubuntu 24.04 / WSL2
set -e

echo "=== Fireball Linux Agent Setup ==="
echo "Checking Python environment..."

if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed. Please install Python 3.10+ (sudo apt update && sudo apt install -y python3)."
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Detected Python version: $PYTHON_VERSION"

# Optional virtualenv setup
if command -v pip3 &> /dev/null || command -v pip &> /dev/null; then
    echo "Installing optional psutil dependency..."
    pip install -r requirements.txt || echo "Notice: Continuing with native procfs parser (no external packages required)."
else
    echo "pip not detected; using native /proc and /sys telemetry collector (zero-dependency mode)."
fi

chmod +x fireball_agent.py

echo ""
echo "Testing agent self-diagnostics..."
./fireball_agent.py --health

echo ""
echo "=== Setup Complete! ==="
echo "To start monitoring:"
echo "  1. Copy agent_config.example.json to agent_config.json"
echo "  2. Fill in backendUrl, machineId, and enrollmentToken from your Fireball Dashboard"
echo "  3. Run: ./fireball_agent.py --run"
