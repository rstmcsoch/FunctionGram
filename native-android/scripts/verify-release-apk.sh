#!/usr/bin/env bash
# Checksum and signer fingerprint for an existing APK.
# Does not sign, does not read a keystore, and does not print passwords.
# productionSigned=true only when FUNCTIONGRAM_PRODUCTION_CERT_SHA256 matches a signer.
set -euo pipefail

APK="${1:-}"
OUT="${2:-}"

if [[ -z "${APK}" || ! -f "${APK}" ]]; then
  printf '%s\n' "No signed APK at ${APK:-<path omitted>}."
  printf '%s\n' "Release signing is wired, but there is no artifact to checksum or fingerprint."
  printf '%s\n' "A missing file is not a production signature."
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -z "${SDK_DIR}" && -f "${ROOT}/local.properties" ]]; then
  SDK_DIR="$(sed -n 's/^sdk\.dir=//p' "${ROOT}/local.properties" | head -n 1)"
fi
if [[ -z "${SDK_DIR}" || ! -d "${SDK_DIR}" ]]; then
  printf '%s\n' "Android SDK not found. Set ANDROID_SDK_ROOT or sdk.dir in native-android/local.properties."
  exit 1
fi

APKSIGNER="$(find "${SDK_DIR}/build-tools" -type f -name apksigner | sort | tail -n 1)"
if [[ -z "${APKSIGNER}" ]]; then
  printf '%s\n' "apksigner not found under ${SDK_DIR}/build-tools."
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT
if ! "${APKSIGNER}" verify --print-certs "${APK}" >"${TMP}" 2>&1; then
  printf '%s\n' "apksigner could not verify ${APK}. Not writing a fingerprint."
  cat "${TMP}"
  exit 1
fi

APK_SHA="$(sha256sum "${APK}" | awk '{print $1}')"
CERTS="$(awk -F': ' '/certificate SHA-256 digest:/ { gsub(/[^0-9a-fA-F]/, "", $2); print tolower($2) }' "${TMP}")"
SUBJECTS="$(awk -F': ' '/certificate DN:/ { print $2 }' "${TMP}")"

PRODUCTION="false"
REASON="signature verifies, but no production certificate fingerprint is configured. A keystore used to build this APK is not a production key by itself."
if printf '%s\n' "${SUBJECTS}" | grep -q "CN=Android Debug"; then
  REASON="signed with the Android debug certificate, not a release keystore."
fi

EXPECTED="${FUNCTIONGRAM_PRODUCTION_CERT_SHA256:-}"
EXPECTED="$(printf '%s' "${EXPECTED}" | tr -d ' :' | tr '[:upper:]' '[:lower:]')"
if [[ -n "${EXPECTED}" ]]; then
  if printf '%s\n' "${CERTS}" | grep -qx "${EXPECTED}"; then
    PRODUCTION="true"
    REASON="signer SHA-256 matches FUNCTIONGRAM_PRODUCTION_CERT_SHA256."
  else
    PRODUCTION="false"
    REASON="signer SHA-256 does not match FUNCTIONGRAM_PRODUCTION_CERT_SHA256."
  fi
fi

REPORT="$(mktemp)"
{
  printf 'apk=%s\n' "${APK}"
  printf 'apkSha256=%s\n' "${APK_SHA}"
  printf 'productionSigned=%s\n' "${PRODUCTION}"
  printf 'reason=%s\n' "${REASON}"
  printf '%s\n' "signers:"
  cat "${TMP}"
} >"${REPORT}"

cat "${REPORT}"
if [[ -n "${OUT}" ]]; then
  mkdir -p "$(dirname "${OUT}")"
  mv "${REPORT}" "${OUT}"
else
  rm -f "${REPORT}"
fi
