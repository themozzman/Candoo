#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"

CERT_PATH="$($PYTHON_BIN - <<'PY'
import certifi
print(certifi.where())
PY
)"

export SSL_CERT_FILE="$CERT_PATH"

$PYTHON_BIN -m pip install --upgrade pip
$PYTHON_BIN -m pip install -r backend/requirements.txt
