# SPE Paper Review Report v2 — Paper Agent

**Reviewer:** AI Agent (automated review)
**Date:** 2026-06-04
**Paper:** Paper Agent: A Local-First Human-in-the-Loop Agentic Workspace for Controllable Academic Writing
**Target:** Software: Practice and Experience (SPE, Wiley)

---

## Executive Summary

The paper describes Paper Agent, a local-first AI-assisted academic writing platform targeting SPE. After four rounds of review and revision, the paper has been substantially improved. Critical bibliography issues have been resolved, a Threats to Validity section has been added, redundancy has been consolidated, and the conclusion has been differentiated from the introduction.

**Overall readiness: 82% — near submission-ready with author-action items remaining.**

---

## A. Issues Fixed (Previously Critical/Significant)

### ✅ A1. Bibliography: Hallucinated DOIs REMOVED
- **Action taken:** Removed `walters2024llmacademic` and `latona2024aiassisted` entirely — both were AI-hallucinated references with no matching papers in arXiv, CrossRef, or OpenAlex.
- Citations removed from Section 2 (Related Work).
- **Status:** RESOLVED

### ✅ A2. Inconsistent Code Metrics STANDARDIZED
- Abstract: "approximately 10,100 lines of backend JavaScript and 11,700 lines of frontend TypeScript" ✓
- Table 1: 10,126 backend, 11,694 frontend ✓
- Introduction: "over 21,800 lines" ✓
- Conclusion: "over 21,800 lines" ✓
- **Status:** RESOLVED

### ✅ A4. Threats to Validity ADDED
- Section 5.7 now covers construct, internal, external, and conclusion validity.
- Cites Wohlin et al. methodology.
- **Status:** RESOLVED

### ✅ A5. Redundancy CONSOLIDATED
- MCP: Section 3.3.4 is primary; 4.6 and 6.5 now add back-references.
- Permission modes: Section 3.3.2 is primary; 6.2 now adds back-reference.
- Conclusion: Differentiated from introduction with new synthesis paragraph and forward-looking research agenda.
- **Status:** RESOLVED

### ✅ B1. Anti-AI Detection IMPLEMENTATION NOTE ADDED
- New Section 4.9 describes the writing pattern analysis feature.
- **Status:** RESOLVED

### ✅ B2. "83 Git Commits" REMOVED
- Introduction: "across multiple development iterations over several months"
- Evaluation: "Throughout the companion platform development"
- **Status:** RESOLVED

### ✅ B3. HITL Survey CHARACTERIZATION FIXED
- Changed from "2021 survey of AI-assisted writing tool users" to "Research on human-in-the-loop machine learning"
- **Status:** RESOLVED

### ✅ B4. Pipeline Naming STANDARDIZED
- All active files consistently use "Pipeline 2.0"
- **Status:** RESOLVED

### ✅ B5. Missing References ADDED
- CRDT (Shapiro et al.), Ollama, WebAssembly, SwiftLaTeX, GitHub Actions, Wohlin methodology
- **Status:** RESOLVED

### ✅ C2. Travis CI REMOVED
- Replaced with GitHub Actions reference
- **Status:** RESOLVED

### ✅ C4. "Demonstrably Reduces Anxiety" SOFTENED
- Changed to "designed to reduce anxiety"
- **Status:** RESOLVED

### ✅ C6. Figure Captions EXPANDED
- All 4 figures now have self-contained descriptions
- **Status:** RESOLVED

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

### C2. Section 5.7 (Companion Platform) — Keep or Remove?
- Tangential to Paper Agent's evaluation but provides engineering context.
- **Recommendation:** Keep but consider moving to an appendix if space is tight.

### C3. Section 6.6 (Open Challenges) — Overlap with Section 7
- 6.6 discusses community-level challenges; 7 discusses system-specific limitations.
- Different framing but some overlap in topics (user studies, trust).
- **Recommendation:** Keep both — the different framing justifies separate sections.

---

## D. Verification Results

| Check | Status |
|-------|--------|
| All citation keys resolve to bib entries | ✅ |
| All cross-references have matching labels | ✅ |
| All 4 PDF figures present | ✅ |
| No Pipeline V2 naming inconsistency | ✅ |
| No "83 git commits" references | ✅ |
| No hallucinated bib entries (Walters, Latona) | ✅ |
| No Travis CI references | ✅ |
| Code metrics consistent across all sections | ✅ |
| ~8,500 words (appropriate for SPE) | ✅ |

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
