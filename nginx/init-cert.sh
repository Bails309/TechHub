#!/bin/sh
set -e

# Init script for Nginx to ensure TLS certs exist at /etc/nginx/certs/fullchain.pem and /etc/nginx/certs/privkey.pem
# Behavior:
# - If TLS_CERT_PATH and TLS_KEY_PATH are set and point to files inside the container, copy them into the cert dir.
# - If certs already exist in /etc/nginx/certs, leave them.
# - Otherwise, generate a temporary self-signed certificate for localhost.

CERT_DIR="/etc/nginx/certs"
mkdir -p "$CERT_DIR"

echo "[nginx-init] cert dir: $CERT_DIR"

if [ -n "$TLS_CERT_PATH" ] && [ -n "$TLS_KEY_PATH" ] && [ -f "$TLS_CERT_PATH" ] && [ -f "$TLS_KEY_PATH" ]; then
  echo "[nginx-init] Using provided TLS_CERT_PATH and TLS_KEY_PATH"
  cp "$TLS_CERT_PATH" "$CERT_DIR/fullchain.pem"
  cp "$TLS_KEY_PATH" "$CERT_DIR/privkey.pem"
  chmod 644 "$CERT_DIR/fullchain.pem" || true
  chmod 600 "$CERT_DIR/privkey.pem" || true
  exit 0
fi

if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
  echo "[nginx-init] Existing certs found, using them"
  exit 0
fi

echo "[nginx-init] No certs found — generating self-signed certificate"
# Generate a self-signed cert valid for localhost and 127.0.0.1, valid 10 years
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -subj "/CN=localhost" \
  -addext "subjectAltName = DNS:localhost,IP:127.0.0.1"

chmod 644 "$CERT_DIR/fullchain.pem" || true
chmod 600 "$CERT_DIR/privkey.pem" || true

echo "[nginx-init] Self-signed certificate created at $CERT_DIR/fullchain.pem"

exit 0
