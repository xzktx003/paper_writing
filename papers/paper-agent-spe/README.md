# Paper Agent SPE Manuscript Package

This directory is the source of truth for the repository paper targeting
Software: Practice and Experience (SPE, Wiley).

## Primary Manuscript

- `main.tex` is the current LaTeX manuscript.
- `sec/*.tex` contains all manuscript sections.
- `references.bib` contains the bibliography used by `main.tex`.
- `fig-*.pdf` are submission-ready figure files referenced by the manuscript.
- `fig-*.svg` are editable source files for schematic figures.
- `fig-workspace-screenshot.png` is the source screenshot for the workspace
  screenshot figure.
- `main.pdf` is the latest locally rebuilt article-class PDF artifact generated
  from `main.tex` with Tectonic.

## Supporting Material

- `docs/notes.md` records submission planning status.
- `docs/architecture-diagrams.md` records the source diagrams used to create
  the figure assets.
- `docs/markdown-draft.md` is retained as the Markdown planning draft; `main.tex`
  is authoritative for submission.
- `project.json` lets the Paper Agent application open this manuscript as a
  project.

## Current Readiness

- Citation keys: statically verified against `references.bib`.
- Cross-references: statically verified against labels in the manuscript.
- Figures: PDF figure assets exist in this directory and are referenced from
  the LaTeX source.
- Dependency audit for the application described by the paper: cleaned to
  `npm audit` reporting zero vulnerabilities in the current workspace.
- Run `bash verify.sh` for manuscript consistency checks.
- Run `bash verify.sh --submission` before creating a final upload archive; this
  mode intentionally fails while placeholder author metadata or local backup
  artifacts are still present.
- Run `bash prepare-submission-archive.sh` after replacing author metadata to
  create a whitelist-based source archive that excludes local backup files and
  review notes.

## Remaining Submission Tasks

- Rebuild `main.pdf` after Wiley SPE class conversion.
- Convert the current `article`-class draft to Wiley's official SPE class if
  the submission portal requires the class file.
- Add real institutional email, ORCID, funding, competing-interest statement,
  and acknowledgements where required by the submission system.
- Prepare a clean upload archive; do not include local backup files such as
  `*.bak`, source-review notes under `docs/`, or other non-submission artifacts
  unless the submission portal explicitly asks for them.

---
## Related Papers

A companion Markdown paper with a detailed evaluation framework design, anti-AI detection feature description, ethics discussion, and TORQ case study is available at `papers/paper-agent/`.
