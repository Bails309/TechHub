#!/bin/sh
set -e

# Simple healthcheck for the nginx proxy
# - Prefer checking that the TLS cert files exist
# - Then attempt an HTTP probe using wget (busybox wget is commonly present)
# - If wget isn't available, consider the presence of certs as the health indicator

CERT_DIR="/etc/nginx/certs"
CERT_PEM="$CERT_DIR/fullchain.pem"
KEY_PEM="$CERT_DIR/privkey.pem"

echo "[proxy-healthcheck] checking certs and HTTP availability"

# Ensure at least cert files exist (either both or one)
if [ ! -f "$CERT_PEM" ] && [ ! -f "$KEY_PEM" ]; then
  echo "[proxy-healthcheck] no cert files found in $CERT_DIR"
  exit 1
fi

# Try to probe HTTP on localhost using wget if available
if command -v wget >/dev/null 2>&1; then
  if wget -q --spider --timeout=2 http://127.0.0.1/; then
    echo "[proxy-healthcheck] HTTP probe successful"
    exit 0
  else
    echo "[proxy-healthcheck] HTTP probe failed"
    exit 1
  fi
fi

# If wget not present, fall back to cert existence as a basic check
echo "[proxy-healthcheck] wget not available; certs present -> healthy"
exit 0
