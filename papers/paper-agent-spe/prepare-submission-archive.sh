#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

OUTPUT="${1:-paper-agent-spe-submission.tar.gz}"
PACKAGE_NAME="paper-agent-spe-submission"

if grep -Eq 'xuzheng\.kang@example\.com|0000-0000-0000-0000' main.tex; then
  echo "ERROR: placeholder author metadata in main.tex" >&2; exit 2
fi

bash verify.sh

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

PKG="$TMP_DIR/$PACKAGE_NAME"
mkdir -p "$PKG/sec" "$PKG/figures" "$PKG/wiley/images"

# Paper sources
cp main.tex references.bib main.pdf "$PKG/"
cp sec/*.tex "$PKG/sec/"

# Paper figures
cp figures/fig-*.pdf "$PKG/figures/"

# Wiley template
cp wiley/USG.cls wiley/NJDnatbib.sty wiley/lettersp.sty "$PKG/"
cp wiley/wileyNJD-Chicago*.bst "$PKG/"
cp wiley/images/*.pdf "$PKG/wiley/images/"

# Symlinks for compilation
cd "$PKG"
ln -sf wiley/images images
ln -sf wiley/USG.cls USG.cls
ln -sf wiley/NJDnatbib.sty NJDnatbib.sty
ln -sf wiley/lettersp.sty lettersp.sty
ln -sf wiley/wileyNJD-Chicago.bst wileyNJD-Chicago.bst
ln -sf wiley/wileyNJD-Chicago-lastoo.bst wileyNJD-Chicago-lastoo.bst
cd "$DIR"

tar -czf "$OUTPUT" -C "$TMP_DIR" "$PACKAGE_NAME"
echo "Created: $OUTPUT"
tar -tzf "$OUTPUT" | sed 's/^/  /'
