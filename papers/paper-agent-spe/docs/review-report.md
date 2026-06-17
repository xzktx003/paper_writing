# SPE Paper Review Report — Paper Agent

**Reviewer:** AI Agent (automated review)
**Date:** 2026-06-04
**Paper:** Paper Agent: A Local-First Human-in-the-Loop Agentic Workspace for Controllable Academic Writing
**Target:** Software: Practice and Experience (SPE), Wiley

---

## Executive Summary

The paper describes Paper Agent, a local-first AI-assisted academic writing platform targeting SPE. The paper is well-organized with clear structure but has several issues that need addressing before submission. The most critical problems are: (1) bibliography entries with placeholder/colliding DOIs, (2) evaluation section lacks quantitative rigor expected by SPE, (3) significant redundancy across sections, and (4) missing threats-to-validity analysis.

**Overall readiness: 65% — needs substantial revision before submission.**

---

## A. Critical Issues (Must Fix)

### A1. Bibliography: Duplicate/Placeholder DOIs
- `walters2024llmacademic`: URL `https://arxiv.org/abs/2401.12345` is a placeholder.
- `latona2024aiassisted`: also uses `arXiv:2401.12345` — two different papers cannot share the same arXiv number. Entry type `@inproceedings` with `booktitle = {arXiv preprint}` is also wrong (arXiv is not a proceedings venue).
- **Action:** Verify and replace with real DOIs/URLs.

### A2. Inconsistent Code Metrics
| Location | Backend | Frontend | Total |
|----------|---------|----------|-------|
| Abstract | "over 10,000" | "11,600" | ~21,600 |
| Table 1 | 10,126 | 11,694 | 21,820 |
| Introduction | — | — | "over 21,000" |
| Conclusion | — | — | "over 21,000" |

- The abstract says "over 10,000 lines of backend JavaScript" but the exact count is 10,126 — "over 10,000" is technically true but misleading when exact numbers exist in Table 1.
- **Action:** Use consistent "approximately 21,800 lines" or quote exact Table 1 numbers everywhere.

### A3. Evaluation Lacks Quantitative Rigor
- "Functional verification" (Section 5.2) is a bullet list of scenarios, not a formal methodology.
- Performance tables (5.3) report single-run measurements on one machine with no error bars, no baseline comparison, and no statistical analysis.
- Comparative analysis (Table 5) is entirely qualitative with checkmarks — SPE reviewers expect quantitative comparison or at least a clear methodology statement.
- No user study, no A/B comparison, no task-completion metrics.
- **Action:** At minimum, add (1) a methodology subsection, (2) error bars/confidence intervals for performance data, (3) a "Threats to Validity" subsection.

### A4. Missing Threats to Validity
- SPE requires discussion of threats to validity for any empirical claims.
- The paper makes claims about user trust, anxiety reduction, and practical advantages without formal evidence.
- **Action:** Add a Threats to Validity subsection covering: construct validity, internal validity, external validity, and conclusion validity.

### A5. Redundancy Across Sections
- **MCP:** Described in Section 3.4, 4.6, 5.5, and 6.5 — four times.
- **Permission modes:** Described in Section 3.3.2, 4.4, 5.2, and 6.2 — four times.
- **Conclusion** repeats the introduction almost verbatim.
- **Action:** Consolidate. Each concept should be fully described once and cross-referenced elsewhere.

---

## B. Significant Issues (Should Fix)

### B1. Anti-AI Detection: Missing Implementation Description
- Mentioned in Section 3.2 (architecture overview: "Anti-AI detection" tab) and Section 7 (Limitations), but Section 4 (Implementation) has NO description of this feature.
- **Action:** Either add a brief implementation subsection in Section 4, or remove the mention from the architecture description if it's truly experimental/incomplete.

### B2. "83 Git Commits" Is Oddly Specific and Small
- Introduction claims lessons from "83 git commits" — this is a very small number for a 45K+ line codebase and seems like an internal development detail, not a contribution metric.
- **Action:** Remove the specific commit count or replace with development timeline ("over N months of active development").

### B3. Liang et al. "30% Hallucinated" Claim
- The claim that "up to 30% of AI-generated citations were hallucinated" is attributed to Liang et al. (2024). This specific number should be verified against the source paper.
- **Action:** Verify the exact claim from the Liang et al. paper or soften to "a significant fraction."

### B4. Pipeline Naming Inconsistency
- Section 3.2 uses "Pipeline V2" while all other sections use "Pipeline 2.0."
- **Action:** Standardize to "Pipeline 2.0" throughout.

### B5. Missing References
| Reference needed for | Context |
|---------------------|---------|
| CRDT/Operational Transform | Section 7 (collaboration) |
| Ollama | Section 6.4 (local models) |
| GitHub Actions | Replace outdated Travis CI reference |
| SwiftLaTeX / WebAssembly TeX | Section 7 (future work) |
| WebAssembly specification | Section 7 (future work) |

### B6. Section 5.6–5.7 Don't Belong in "Evaluation"
- Section 5.6 "Comparative Analysis" is more naturally part of Discussion.
- Section 5.7 "Lessons from Companion Platform Integration" is tangential to Paper Agent's evaluation.
- **Action:** Move 5.6 to Discussion, move 5.7 to an Appendix or remove.

### B7. Section 6.6 Overlaps with Section 7
- Section 6.6 "Open Challenges for the Community" overlaps significantly with Section 7 "Limitations and Future Work."
- **Action:** Merge 6.6 into Section 7 or remove it.

---

## C. Minor Issues (Nice to Fix)

### C1. Submission Checklist Incomplete
- `main.tex` still has unchecked items in the submission checklist comment.
- **Action:** Update checklist status.

### C2. Travis CI Reference Is Obsolete
- `travisci` reference points to travic-ci.org which is effectively deprecated.
- Most open-source projects use GitHub Actions.
- **Action:** Replace with GitHub Actions reference or remove.

### C3. Some @misc Entries Could Be @online
- Minor BibTeX hygiene issue.

### C4. "demonstrably reduces anxiety" (Introduction)
- This claim is made without quantitative evidence.
- **Action:** Soften to "designed to reduce" or add evidence.

### C5. Coding Kanban Metrics in Paper Agent Paper
- Table 1 includes Coding Kanban metrics (19,492 lines) which inflates the apparent size of Paper Agent.
- The paper correctly notes this but it could confuse readers.
- **Action:** Consider separating the metrics more clearly or moving Kanban metrics to an appendix.

### C6. Figure Captions Are Minimal
- Figure captions are very terse (e.g., "System architecture overview.").
- SPE reviewers expect self-contained figure descriptions.
- **Action:** Expand captions to describe what the reader should observe.

---

## D. Structural Recommendations

1. **Merge Section 5.6 (Comparative Analysis) into Discussion (Section 6)** — it's a discussion point, not an evaluation metric.
2. **Move or remove Section 5.7** — companion platform integration is tangential.
3. **Add "Threats to Validity" as Section 5.5** (or after 5.4) — critical for SPE.
4. **Expand Conclusion** with a forward-looking research agenda, not just system features.
5. **Consider adding a "Design Requirements" derivation section** — the paper claims 6 design requirements (RG1–RG6) but doesn't show how they were derived.

---

## E. What's Done Well

1. **Clear problem statement** — the three practical problems (context fragmentation, unaudited edits, unverifiable artifacts) are well-articulated.
2. **Good system architecture** — the layered architecture is well-described and the figures are helpful.
3. **Permission-aware interaction model** — Chat/Agent/Tools is a genuine design contribution.
4. **Citation verification pipeline** — the multi-API confidence scoring is a solid engineering contribution.
5. **Honest limitations** — Section 7 is candid about what's missing.
6. **Open source** — MIT license with public repository.

---

## F. Priority Action Items (Ordered)

1. Fix bibliography placeholder DOIs (A1)
2. Add Threats to Validity section (A4)
3. Consolidate redundant descriptions (A5)
4. Strengthen evaluation methodology (A3)
5. Add missing references (B5)
6. Fix Pipeline naming inconsistency (B4)
7. Move/remove misplaced sections (B6, B7)
8. Standardize code metrics (A2)
9. Expand figure captions (C6)
10. Remove/soften unsubstantiated claims (B2, B3, C4)
