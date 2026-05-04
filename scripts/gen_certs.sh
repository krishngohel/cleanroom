#!/usr/bin/env bash
# Generate self-signed CA + server cert + demo org certs
set -e

CERT_DIR="certs"
mkdir -p "$CERT_DIR"

# ── Root CA ──────────────────────────────────────────────────────────────────
openssl genrsa -out "$CERT_DIR/ca.key" 4096
openssl req -new -x509 -days 3650 -key "$CERT_DIR/ca.key" \
  -subj "/C=US/O=Cleanroom/CN=Cleanroom CA" \
  -out "$CERT_DIR/ca.crt"

# ── Server cert ──────────────────────────────────────────────────────────────
openssl genrsa -out "$CERT_DIR/server.key" 2048
openssl req -new -key "$CERT_DIR/server.key" \
  -subj "/C=US/O=Cleanroom/CN=cleanroom-server" \
  -out "$CERT_DIR/server.csr"
openssl x509 -req -days 365 -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" -CAcreateserial \
  -extfile <(printf "subjectAltName=DNS:localhost,DNS:cleanroom-server,IP:127.0.0.1") \
  -out "$CERT_DIR/server.crt"

# ── Demo org certs ────────────────────────────────────────────────────────────
for ORG in acme-corp beta-inc gamma-labs; do
  openssl genrsa -out "$CERT_DIR/${ORG}.key" 2048
  openssl req -new -key "$CERT_DIR/${ORG}.key" \
    -subj "/C=US/O=${ORG}/CN=${ORG}" \
    -out "$CERT_DIR/${ORG}.csr"
  openssl x509 -req -days 365 -in "$CERT_DIR/${ORG}.csr" \
    -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" -CAcreateserial \
    -out "$CERT_DIR/${ORG}.crt"
  echo "Generated cert for $ORG"
done

echo "All certs written to $CERT_DIR/"
