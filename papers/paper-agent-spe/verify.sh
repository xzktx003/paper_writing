#!/bin/bash
# Verification script for SPE paper
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

SUBMISSION_MODE=0
if [ "${1:-}" = "--submission" ]; then
  SUBMISSION_MODE=1
elif [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  echo "Usage: bash verify.sh [--submission]"
  exit 0
elif [ "$#" -gt 0 ]; then
  echo "Unknown option: $1" >&2; exit 2
fi

echo "=== SPE Paper Verification ==="
echo ""

# 1. Citation keys
echo "--- Citation Keys ---"
CITED=$(cat sec/*.tex | tr -d '\n' | grep -ohP '\\cite\{[^}]+\}' | sed 's/\\cite{//;s/}//' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort -u)
BIBKEYS=$(grep -oP '@\w+\{([^,]+),' references.bib | sed 's/@[^{]*{//;s/,//' | sort -u)
MISSING_CITE=$(comm -23 <(echo "$CITED") <(echo "$BIBKEYS"))
UNCITED=$(comm -13 <(echo "$CITED") <(echo "$BIBKEYS"))
[ -z "$MISSING_CITE" ] && echo "  ✅ All cited keys have bib entries" || echo "  ❌ Missing bib entries: $MISSING_CITE"
[ -z "$UNCITED" ] && echo "  ✅ All bib entries are cited" || echo "  ⚠️  Uncited bib entries: $UNCITED"

# 2. Cross-references
echo "--- Cross-References ---"
LABELS=$(grep -ohP '\\label\{[^}]+\}' sec/*.tex | sed 's/\\label{//;s/}//' | sort -u)
REFS=$(grep -ohP '\\ref\{[^}]+\}' sec/*.tex | sed 's/\\ref{//;s/}//' | sort -u)
MISSING_LABEL=$(comm -23 <(echo "$REFS") <(echo "$LABELS"))
[ -z "$MISSING_LABEL" ] && echo "  ✅ All cross-references resolve" || echo "  ❌ Missing labels: $MISSING_LABEL"

echo "--- Bibliography Build Inputs ---"
grep -q '\\bibliographystyle{' main.tex && echo "  ✅ Bibliography style declared" || echo "  ❌ Missing \\bibliographystyle in main.tex"
grep -q '\\bibliography{' main.tex && echo "  ✅ Bibliography database declared" || echo "  ❌ Missing \\bibliography in main.tex"

# 3. Figures (now in figures/)
echo "--- Figures ---"
for fig in fig-architecture.pdf fig-ai-modes.pdf fig-pipeline.pdf fig-citation-strategy.pdf fig-workspace-screenshot.pdf; do
  if [ -f "figures/$fig" ]; then echo "  ✅ $fig present"; else echo "  ❌ $fig MISSING"; fi
done

# 3b. PDF freshness
echo "--- PDF Artifact ---"
if [ ! -f main.pdf ]; then
  echo "  ❌ main.pdf MISSING"
else
  STALE_INPUTS=$(find main.tex references.bib sec/*.tex figures/fig-*.pdf -newer main.pdf -print 2>/dev/null)
  [ -z "$STALE_INPUTS" ] && echo "  ✅ main.pdf is newer than manuscript sources" || echo "  ⚠️  main.pdf is older than: $STALE_INPUTS"
  if python3 - "$PWD/main.pdf" <<'PY'
import sys
import re
try:
    import fitz
except Exception:
    sys.exit(2)
doc = fitz.open(sys.argv[1])
text = "\n".join(page.get_text() for page in doc)
if "[?]" in text or "REFERENCES" not in text.upper():
    sys.exit(1)
if re.search(r"\[[A-Z][A-Za-z .,&'-]{1,80}\(20\d{2}", text):
    sys.exit(3)
PY
  then
    echo "  ✅ main.pdf contains resolved citations and references"
  else
    status=$?
    if [ "$status" -eq 2 ]; then
      echo "  ⚠️  PyMuPDF unavailable; skipped PDF citation text check"
    elif [ "$status" -eq 3 ]; then
      echo "  ❌ main.pdf contains leaked author-year citation labels"
    else
      echo "  ❌ main.pdf has unresolved citations or missing references"
    fi
  fi
fi

# 4. Balanced braces
echo "--- Brace Balance ---"
for f in sec/*.tex; do
  OPEN=$(tr -cd '{' < "$f" | wc -c)
  CLOSE=$(tr -cd '}' < "$f" | wc -c)
  [ "$OPEN" -eq "$CLOSE" ] && echo "  ✅ $(basename $f): balanced ($OPEN pairs)" || echo "  ❌ $(basename $f): OPEN=$OPEN CLOSE=$CLOSE"
done

# 5. Word count
echo "--- Word Count ---"
WORDS=$(cat sec/*.tex | perl -0777 -pe 's/%[^\n]*//g; s/\\[A-Za-z]+\*?(?:\[[^\]]*\])?\{[^{}]*\}//g; s/\\[A-Za-z]+\*?(?:\[[^\]]*\])?//g; s/[{}]//g' | wc -w)
echo "  Approximate word count: $WORDS"

# 6. Hallucinated refs
echo "--- Hallucinated References ---"
for bad in walters2024llmacademic latona2024aiassisted; do
  grep -q "$bad" references.bib sec/*.tex && echo "  ❌ $bad still present!" || echo "  ✅ $bad removed"
done

# 7. No stale references
echo "--- Stale References ---"
for stale in "83 git commit" "Travis CI" "Pipeline V2"; do
  grep -qi "$stale" sec/*.tex && echo "  ❌ '$stale' still present!" || echo "  ✅ No '$stale'"
done

# 8. Template placeholders and stale implementation claims
echo "--- Manuscript Consistency ---"
for placeholder in "XX Month" "202X" "10.1002/spe.0000"; do
  grep -qi "$placeholder" main.tex sec/*.tex references.bib && echo "  ❌ Placeholder '$placeholder' still present" || echo "  ✅ No '$placeholder'"
done
for stale_claim in "PDF.js" "Turborepo"; do
  grep -qi "$stale_claim" sec/*.tex references.bib && echo "  ❌ Stale implementation claim '$stale_claim' still present" || echo "  ✅ No '$stale_claim'"
done

if [ "$SUBMISSION_MODE" -eq 1 ]; then
  echo "--- Submission Package Readiness ---"

  grep -Eq 'xuzheng\.kang@example\.com|0000-0000-0000-0000' main.tex && \
    echo "  ❌ Placeholder author metadata present" || echo "  ✅ No placeholder author email/ORCID detected"

  grep -Eq '\\documentclass(\[[^]]*\])?\{article\}' main.tex && \
    echo "  ⚠️  Current PDF is article-class" || echo "  ✅ Document class is no longer article"

  BACKUP_FILES=$(find . \( -name '*.bak' -o -name '*.bak[0-9]*' \) -print 2>/dev/null | sort)
  [ -z "$BACKUP_FILES" ] && echo "  ✅ No local backup artifacts detected" || { echo "  ❌ Backup artifacts present:"; echo "$BACKUP_FILES" | sed 's/^/     /'; }

  cat main.tex sec/*.tex | grep -qiE 'data availability|data-accessibility' && \
    echo "  ✅ Data availability statement detected" || echo "  ⚠️  Data availability statement not detected"

  cat main.tex sec/*.tex | grep -qiE 'funding|financial support|grant' && \
    echo "  ✅ Funding-related text detected" || echo "  ⚠️  Funding declaration not detected"

  cat main.tex sec/*.tex | grep -qiE 'conflict(s)? of interest|competing interest(s)?|competing-interest' && \
    echo "  ✅ Competing-interest statement detected" || echo "  ⚠️  Competing-interest declaration not detected"
fi

echo ""
echo "=== Verification Complete ==="
