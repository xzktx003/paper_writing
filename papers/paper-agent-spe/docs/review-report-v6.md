# SPE Paper Review Report v6 — Paper Agent

**Reviewer:** AI Agent (automated review — session 6)
**Date:** 2026-06-04
**Paper:** Paper Agent: A Local-First Human-in-the-Loop Agentic Workspace for Controllable Academic Writing
**Target:** Software: Practice and Experience (SPE, Wiley)

---

## Executive Summary

Session 6 applied 6 additional fixes targeting content gaps, structural issues,
and §7 limitations strengthening. Two new limitation paragraphs address
evaluation scope and LLM provider dependency — critical gaps for SPE reviewers.

**Overall readiness: 95% — submission-ready once author completes Wiley class conversion and adds real author info.**

---

## A. Issues Fixed in This Session (Session 6)

### ✅ A1. Varied sentence-initial "However" in §1
- **Issue:** Two sentence-initial "However" in §1 (lines 14, 40)
- **Fix:** Changed second instance to "Yet" (line 40)
- **Impact:** Improved prose variety; §1 now has only one sentence-initial "However"

### ✅ A2. Fixed §6.2 misleading cross-reference
- **Issue:** Parenthetical said "see Section~\ref{sec:evaluation} for preliminary usage data" but §5 had no dedicated usage data subsection
- **Fix:** Changed to "Section~\ref{sec:evaluation} reports functional verification and practical experience"
- **Impact:** Cross-reference now accurately describes §5's content

### ✅ A3. Restructured §5 Coding Kanban paragraph
- **Issue:** `\textbf{Coding Kanban context.}` paragraph floated after comparison table without being a proper subsection
- **Fix:** Converted to `\subsection{Companion Platform Context}`
- **Impact:** Consistent section structure throughout §5

### ✅ A4. Tightened abstract phrasing
- **Issue:** "across 31 test files" was ambiguous — could modify "21,800 lines" or be a separate fact
- **Fix:** Changed to "validated by a 31-file test suite" — clearly indicates testing, not line distribution
- **Impact:** Unambiguous abstract phrasing

### ✅ A5. Added "Evaluation scope" limitation to §7
- **Issue:** §7 did not acknowledge that all evaluation was by the development team, or that testing was CS/English-only
- **Fix:** Added new `\paragraph{Evaluation scope.}` covering confirmation bias, external validity, and discipline scope
- **Impact:** Pre-empts a predictable SPE reviewer criticism

### ✅ A6. Added "LLM provider dependency" limitation to §7
- **Issue:** §7 did not address API cost, provider lock-in, or offline model requirements
- **Fix:** Added new `\paragraph{LLM provider dependency.}` covering pricing volatility, rate limits, multi-provider mitigation, and local model barriers
- **Impact:** Honest acknowledgment of a fundamental architectural dependency

---

## B. Verification Results

| Check | Status |
|-------|--------|
| All citation keys resolve to bib entries | ✅ |
| All bib entries are cited | ✅ |
| All cross-references resolve | ✅ |
| All 4 PDF figures present | ✅ |
| All 8 tex files have balanced braces | ✅ |
| No hallucinated bib entries | ✅ |
| No stale references | ✅ |
| No TODO/FIXME/TBD markers | ✅ |
| No unsupported superlatives | ✅ |
| Sentence-initial "However" varied | ✅ |
| §1 has 1 "However", §2 has 2 (1 mid-sentence) | ✅ |
| @misc entries: 0 | ✅ |
| @online entries: 33 | ✅ |
| ~7,216 body words (stable verifier count after source wrapping) | ✅ |
| Abstract uses "argue" not "demonstrate" | ✅ |
| `main.tex`/`sec/*.tex` source lines >120 chars | ✅ 0 remaining |
| Article-class PDF rebuild with Tectonic | ✅ succeeds with layout warnings |
| `main.pdf` freshness against TeX sources | ✅ newer than manuscript sources |

### Post-Audit Hygiene Updates

- Corrected the submission checklist so placeholder author metadata is not
  marked complete.
- Updated `verify.sh` word-count logic so source line wrapping does not change
  the approximate word-count evidence.
- Updated submission-facing docs to distinguish the current article-class
  `main.pdf` from the final Wiley-formatted PDF that still needs a
  post-conversion rebuild.
- Wrapped long TeX source lines for maintainability without changing manuscript
  semantics.
- Added a minimal JavaScript `listings` language definition so the source
  listing compiles under Tectonic.
- Removed unused `algorithm`/`algpseudocode` packages that caused a package
  encoding warning.
- Rebuilt `main.pdf` from the current article-class source using Tectonic.

---

## C. Session 6 Changes Summary

| # | Fix | Section | Lines Changed |
|---|-----|---------|---------------|
| A1 | "However" → "Yet" | §1 introduction | 1 line |
| A2 | Cross-reference accuracy | §6.2 discussion | 1 line |
| A3 | Bold paragraph → subsection | §5 evaluation | 1 line |
| A4 | Abstract clarity | main.tex abstract | 2 lines |
| A5 | Evaluation scope limitation | §7 limitations | +10 lines |
| A6 | LLM provider limitation | §7 limitations | +10 lines |

---

## D. Remaining Author-Action Items

### Must-Do Before Submission
1. **Convert to Wiley SPE class** — Download `spe.cls` from Wiley, follow `docs/wiley-spe-conversion-guide.md`
2. **Add real author info** — Replace `xuzheng.kang@example.com` and `0000-0000-0000-0000`
3. **Complete author declarations** — Add funding and competing-interest declarations according to the submission portal; do not infer these from the manuscript
4. **Recompile after Wiley class conversion** — the current article-class draft compiles with Tectonic, but final Wiley formatting still needs a post-conversion build
5. **Final proofread after class conversion** — Wiley class may introduce formatting changes
6. **Package clean sources only** — Exclude `*.bak`, review notes, and other local artifacts from the upload archive unless requested
7. **Run submission-package gate** — `bash verify.sh --submission` should pass only after real author metadata is present and the upload source tree is clean
8. **Generate clean archive** — After replacing author metadata, run `bash prepare-submission-archive.sh` to build a whitelist-based source archive

### Should-Do (Quality)
9. **User study** — The biggest remaining gap for SPE. Even 5-10 pilot users would significantly strengthen. §7 now explicitly acknowledges this.

### Already Addressed (from prior sessions)
- ✅ @misc → @online conversion (33 entries)
- ✅ N=5 precise percentages removed
- ✅ Obsidian citation added
- ✅ Comparison table "binary" → "on/off"
- ✅ All superlatives removed or softened
- ✅ §2.5 SPE editorial tradition framing
- ✅ Wiley conversion guide written
- ✅ Verification script operational

---

## E. Session History

| Session | Key Changes | Readiness |
|---------|-------------|-----------|
| 1 | Comprehensive review, bib fixes, metrics, Threats to Validity, figures, Pipeline naming, claims | 65% |
| 2 | Hallucinated refs removed, HITL survey fixed, anti-AI section, tech stack citations | 82% |
| 3 | Parenthetical restructured, hedging, §2.5 strengthened | 85% |
| 4 | Superlatives removed, abstract tightened, bib key fixed, Wiley guide | 88% |
| 5 | "However" varied, N=5 removed, Obsidian cited, comparison table, @misc→@online | 93% |
| 6 | §1 "Yet", §6.2 cross-ref, §5 subsection, abstract clarity, §7 limitations expanded | **95%** |

---

## F. File Map (Current State)

```
papers/paper-agent-spe/
├── main.tex                    (modified: abstract "validated by a 31-file test suite")
├── references.bib              (43 entries: 33 @online, 6 @article, 2 @inproceedings, 1 @techreport, 1 @book)
├── verify.sh                   (automated verification script)
├── docs/
│   ├── review-report-v1.md     (original)
│   ├── review-report-v2.md     (session 2)
│   ├── review-report-v3.md     (session 3)
│   ├── review-report-v4.md     (session 4)
│   ├── review-report-v5.md     (session 5)
│   ├── review-report-v6.md     (session 6, 95% readiness)
│   ├── wiley-spe-conversion-guide.md
│   └── ...
├── sec/
│   ├── 1.introduction.tex      (modified: "Yet" replaces second "However")
│   ├── 2.related-work.tex      (unchanged this session)
│   ├── 3.design.tex            (unchanged)
│   ├── 4.implementation.tex    (unchanged)
│   ├── 5.evaluation.tex        (modified: "Companion Platform Context" subsection)
│   ├── 6.discussion.tex        (modified: cross-reference accuracy)
│   ├── 7.limitations.tex       (modified: +2 paragraphs, now 9 total)
│   ├── 8.conclusion.tex        (unchanged)
│   └── *.bak5                  (backups from session 5)
└── fig-*.pdf                   (4 figures)
```

---

## G. Deep Content Analysis (Session 6)

### Strengths Confirmed
1. **SPE §2.5 framing** — Strong connection to journal tradition of reporting practical tools
2. **Honest hedging** — "argue" not "demonstrate", informal feedback properly qualified
3. **Complete bibliography** — 43 entries, no @misc, all cited and verified
4. **9 limitation paragraphs** — Covers rendering, citations, user studies, collaboration, scalability, compile repair, anti-AI, evaluation scope, and LLM dependency
5. **Comprehensive Threats to Validity** — §5 addresses construct, internal, external, and conclusion validity

### Remaining Weaknesses (Cannot Be Fixed by LLM)
1. **No formal user study** — §7 now explicitly acknowledges this as the most important future work
2. **Single-developer evaluation** — §7 now acknowledges confirmation bias
3. **Wiley class not applied** — Mechanical step with guide provided
4. **Placeholder author info** — Simple replacement needed

### Risk Assessment for SPE Reviewers
- **Low risk:** Claims are well-hedged, limitations honest, evaluation transparent
- **Medium risk:** Reviewer may want user study data — Threats to Validity and §7 both address this proactively
- **Mitigated:** LLM dependency, evaluation scope, and discipline limitations now explicitly documented

---

## H. Recommendation

**The paper is ready for submission after completing the two mechanical steps:**
1. Wiley SPE class conversion (guide at `docs/wiley-spe-conversion-guide.md`)
2. Real author information replacement

All automated improvements have been applied across 6 sessions.
The remaining 5% requires author manual action that cannot be automated.
