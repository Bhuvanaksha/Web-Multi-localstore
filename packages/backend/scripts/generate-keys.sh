#!/usr/bin/env bash
# Generates the RSA keypair used for JWT access-token signing.
# Run from the repo root: bash packages/backend/scripts/generate-keys.sh
set -euo pipefail

KEYS_DIR="packages/backend/keys"
mkdir -p "$KEYS_DIR"

if [ ! -f "$KEYS_DIR/jwt-access-private.pem" ]; then
  openssl genrsa -out "$KEYS_DIR/jwt-access-private.pem" 2048
  openssl rsa -in "$KEYS_DIR/jwt-access-private.pem" -pubout -out "$KEYS_DIR/jwt-access-public.pem"
  chmod 600 "$KEYS_DIR/jwt-access-private.pem"
  echo "Generated JWT keypair in $KEYS_DIR"
else
  echo "Keys already exist in $KEYS_DIR"
fi
