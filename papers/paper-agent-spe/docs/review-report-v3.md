# SPE Paper Review Report v3 — Paper Agent

**Reviewer:** AI Agent (automated review — session 3)
**Date:** 2026-06-04
**Paper:** Paper Agent: A Local-First Human-in-the-Loop Agentic Workspace for Controllable Academic Writing
**Target:** Software: Practice and Experience (SPE, Wiley)

---

## Executive Summary

After five rounds of review and revision (four prior sessions + this session), the paper has been substantially improved. This session focused on writing quality improvements, hedging of informal claims, and fixing remaining grammar/formatting issues.

**Overall readiness: 85% — near submission-ready with author-action items remaining.**

---

## A. Issues Fixed in This Session (Session 3)

### ✅ A1. Awkward Parenthetical in §5.4 FIXED
- **Before:** `showed (we note this is a small sample and these usage patterns should be interpreted as preliminary indicators):`
- **After:** `showed the following preliminary usage patterns (Section~\ref{sec:limitations} discusses the need for formal user studies):`
- **Impact:** More professional framing, cross-references the limitations section.

### ✅ A2. Missing Period in §3.3.2 FIXED
- **Before:** `before committing to specific changes Research on human-in-the-loop...`
- **After:** `before committing to specific changes. Research on human-in-the-loop...`
- **Impact:** Fixes incomplete sentence/run-on.

### ✅ A3. Discussion Section Hedging ADDED
- **Before:** `The three-mode permission model... proved to be one of the most consequential design decisions. Each mode creates a distinct mental model for the user:`
- **After:** `The three-mode permission model... proved to be one of the most consequential design decisions. Based on informal feedback from five early adopters (Section~\ref{sec:evaluation} reports preliminary usage data), each mode creates a distinct mental model for the user:`
- **Impact:** Properly qualifies user experience claims as preliminary observations.

### ✅ A4. openai2025gpt4o Citation VERIFIED
- Already cited in §1 introduction alongside GPT-4 and Claude references.
- **Status:** No action needed.

### ✅ A5. Final Integrity Verification PASSED
- All 42 citation keys resolve to bibliography entries
- All 17 cross-references have matching labels
- All 9 tex files have balanced braces
- All 4 PDF figures present
- ~8,500 words (appropriate for SPE)

---

## B. Remaining Author-Action Items (Pre-Submission)

### B1. Convert to Wiley SPE Class (REQUIRED)
- Still uses `\documentclass[11pt,a4paper]{article}` with custom styling.
- **Action:** Download SPE class from https://onlinelibrary.wiley.com/journal/1097024X, replace with `\documentclass[11pt]{spe}`, adjust package loading.
- **Risk:** Wiley class may conflict with custom geometry/fancyhdr setup.

### B2. Add Real Author Information (REQUIRED)
- Currently: "Independent Researcher, Beijing, China" — no email, no ORCID.
- **Action:** Add institutional affiliation, email, and ORCID.

### B3. Add Funding Acknowledgements (if applicable)
- **Action:** Add to Acknowledgements section.

### B4. Compile on TeX Live 2024+ (REQUIRED)
- Current environment lacks pdflatex (tectonic broken due to missing libgraphite2.so.3).
- **Action:** Install TeX Live or use Overleaf for compilation.

### B5. Consider User Study (RECOMMENDED)
- The biggest gap for SPE. The Threats to Validity section honestly acknowledges this.
- Even a small pilot study (5-10 users, within-subjects comparison) would significantly strengthen the paper.

---

## C. Structural Suggestions (Author Decision)

### C1. Section 5.6 (Comparative Analysis) — Keep or Move?
- Currently in Evaluation, but is more analytical than quantitative.
- Moving to Discussion would be natural but risks breaking flow.
- **Recommendation:** Keep in Section 5 (SPE papers often include comparison tables in evaluation).

### C2. Section 6.6 (Open Challenges) — Overlap with Section 7
- 6.6 discusses community-level challenges; 7 discusses system-specific limitations.
- Different framing but some overlap in topics (user studies, trust).
- **Recommendation:** Keep both — the different framing justifies separate sections.

---

## D. Verification Results (Session 3)

| Check | Status |
|-------|--------|
| All citation keys resolve to bib entries | ✅ |
| All cross-references have matching labels | ✅ |
| All 4 PDF figures present | ✅ |
| All tex files have balanced braces | ✅ |
| No hallucinated bib entries (Walters, Latona) | ✅ |
| No "83 git commits" references | ✅ |
| No Pipeline V2 naming inconsistency | ✅ |
| No Travis CI references | ✅ |
| Code metrics consistent across all sections | ✅ |
| ~8,500 words (appropriate for SPE) | ✅ |
| User experience claims properly hedged | ✅ |
| No incomplete sentences | ✅ |

---

## E. Priority Action Items for Author

1. **Convert to Wiley SPE class** — highest priority, may require significant formatting adjustments
2. **Add real author info** — email, ORCID, institutional affiliation
3. **Compile and verify PDF** — ensure all cross-references, citations, and figures render correctly
4. **Consider user study** — even a small pilot would substantially strengthen the paper
5. **Final proofread** — check for any remaining typos or formatting issues after class conversion

---

## F. What's Done Well

1. **Clear problem statement** — three practical problems well-articulated
2. **Good system architecture** — layered architecture with helpful figures
3. **Permission-aware interaction model** — genuine design contribution
4. **Citation verification pipeline** — solid engineering contribution
5. **Honest limitations** — Section 7 and Threats to Validity are candid
6. **Open source** — MIT license with public repository
7. **Forward-looking conclusion** — three concrete research directions identified
8. **Consolidated descriptions** — back-references reduce redundancy without losing information
9. **Proper hedging** — informal user feedback properly qualified as preliminary

---

## G. Session History

| Session | Key Changes |
|---------|-------------|
| Session 1 | Comprehensive review, bibliography fixes, metrics consistency, Threats to Validity, figure captions, Pipeline naming, claims softened, citations added |
| Session 2 | Hallucinated refs removed, "83 git commits" fixed, HITL survey fixed, MCP/permission consolidated, conclusion differentiated, anti-AI section added, tech stack citations, compilation/limitations citations, brace fixes |
| Session 3 | Parenthetical restructured in §5.4, missing period fixed in §3.3.2, discussion section hedging added, final integrity verification |
