#!/bin/zsh
cd "$(dirname "$0")" || exit 1
exec "$HOME/.hermes/hermes-agent/venv/bin/python" server.py
