#!/bin/bash

# package-skill.sh
# Packages a skill directory as a .skill (zip) file for sharing.
#
# Usage: bash scripts/package-skill.sh <skill-name>
#        bash scripts/package-skill.sh dev-environment
#
# Source: /sessions/quirky-ecstatic-mayer/<skill-name>/ (edited version)
#         or /sessions/quirky-ecstatic-mayer/mnt/.skills/skills/<skill-name>/ (fallback)
# Output: /sessions/quirky-ecstatic-mayer/mnt/FindaSale/<skill-name>.skill

SKILL_NAME="${1:?Error: skill name required. Usage: package-skill.sh <skill-name>}"

# Setup trap to ensure cleanup on error
cleanup_on_exit() {
    if [ -d "/tmp/skill-package" ]; then
        chmod -R u+w "/tmp/skill-package" 2>/dev/null || true
        rm -rf "/tmp/skill-package" 2>/dev/null || true
    fi
}
trap cleanup_on_exit EXIT

set -e

# Paths
WORK_DIR="/tmp/skill-package"
SRC_DIR_EDITED="/sessions/quirky-ecstatic-mayer/${SKILL_NAME}"
SRC_DIR_READONLY="/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/${SKILL_NAME}"
PACKAGE_DIR="${WORK_DIR}/${SKILL_NAME}"
ZIP_FILE="/tmp/${SKILL_NAME}.skill"
OUT_FILE="/sessions/quirky-ecstatic-mayer/mnt/FindaSale/${SKILL_NAME}.skill"

# Determine source: prefer edited version, fallback to read-only
SRC_DIR="$SRC_DIR_READONLY"
if [ -d "$SRC_DIR_EDITED" ]; then
    SRC_DIR="$SRC_DIR_EDITED"
    echo "[INFO] Using edited skill dir: $SRC_DIR_EDITED"
else
    echo "[INFO] Using read-only skill dir: $SRC_DIR_READONLY"
fi

# Verify source exists
if [ ! -d "$SRC_DIR" ]; then
    echo "[ERROR] Skill directory not found: $SRC_DIR"
    exit 1
fi

# Clean and setup work directory
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

echo "[INFO] Copying skill to work directory..."
cp -r "$SRC_DIR" "$PACKAGE_DIR"
# Make copied files writable (source may be read-only)
chmod -R u+w "$PACKAGE_DIR"

if [ ! -f "$PACKAGE_DIR/SKILL.md" ]; then
    echo "[ERROR] SKILL.md not found in $PACKAGE_DIR"
    rm -rf "$WORK_DIR"
    exit 1
fi

# Remove any existing zip
rm -f "$ZIP_FILE"

echo "[INFO] Creating zip archive..."
cd "$WORK_DIR"
zip -r "$ZIP_FILE" "$SKILL_NAME" > /dev/null 2>&1

if [ ! -f "$ZIP_FILE" ]; then
    echo "[ERROR] Failed to create zip file"
    rm -rf "$WORK_DIR"
    exit 1
fi

echo "[INFO] Copying .skill file to workspace..."
cp "$ZIP_FILE" "$OUT_FILE"

if [ ! -f "$OUT_FILE" ]; then
    echo "[ERROR] Failed to copy .skill file to output location"
    rm -rf "$WORK_DIR"
    exit 1
fi

# Verify zip is valid
echo "[INFO] Verifying zip integrity..."
if ! unzip -t "$OUT_FILE" > /dev/null 2>&1; then
    echo "[ERROR] Zip file validation failed"
    rm -f "$OUT_FILE"
    rm -rf "$WORK_DIR"
    exit 1
fi

echo "[SUCCESS] Skill packaged successfully."
echo "[OUTPUT] $OUT_FILE"
ls -lh "$OUT_FILE"
