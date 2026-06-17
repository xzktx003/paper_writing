# Wiley SPE Class Conversion Guide

## Overview
The paper currently uses `\documentclass[11pt,a4paper]{article}` with custom
styling. For submission to Software: Practice and Experience (SPE, Wiley),
you must switch to the official Wiley SPE LaTeX class.

## Step 1: Download the SPE Class

Download the SPE LaTeX template from:
- https://onlinelibrary.wiley.com/journal/1097024X
- Look for "Author Guidelines" → "LaTeX template" or "TeX template"
- The zip typically contains `spe.cls`, `spe.bst`, and a sample `.tex` file

Place `spe.cls` and `spe.bst` in this directory.

## Step 2: Modify main.tex

Replace the document class and preamble. The key changes are:

### Replace document class (line 2)
```latex
% OLD:
\documentclass[11pt,a4paper]{article}

% NEW:
\documentclass[11pt]{spe}
```

### Remove conflicting packages
The SPE class typically includes its own page layout, headers, and spacing.
Remove or comment out these lines from main.tex:

```latex
% REMOVE these lines (approximately lines 40-52):
\usepackage[margin=2.5cm,headsep=10pt]{geometry}
\usepackage{setspace}
\onehalfspacing
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small \textit{Software: Practice and Experience}}
\fancyhead[R]{\small \thepage}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0pt}
```

### Keep these packages (SPE class should not conflict):
```latex
\usepackage{amsmath,amssymb,amsthm}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{caption}
\usepackage{subcaption}
\usepackage{booktabs}
\usepackage{longtable}
\usepackage{array}
\usepackage{tabularx}
\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue,urlcolor=blue]{hyperref}
\usepackage{url}
\usepackage{doi}
\usepackage[numbers,sort&compress]{natbib}
\usepackage{listings}
```

### Check bibliography style
```latex
% If spe.bst is provided, replace:
\bibliographystyle{plainnat}
% With:
\bibliographystyle{spe}
% Otherwise keep plainnat — check SPE author guidelines for preferred style.
```

### Author format
SPE typically requires:
```latex
\author{
  Xuzheng Kang\\
  Independent Researcher, Beijing, China\\
  Email: xuzheng.kang@example.com
}
```
Check the SPE template sample for exact author format.

## Step 3: Remove `\thispagestyle{fancy}`
After `\maketitle`, remove `\thispagestyle{fancy}` (line ~155 of main.tex).
The SPE class handles page styles automatically.

## Step 4: Compile
```bash
pdflatex main && bibtex main && pdflatex main && pdflatex main
```

After applying the Wiley class changes, rebuild `main.pdf` before submission.
The current checked-in `main.pdf` is an article-class draft and should not be
submitted as the final Wiley-formatted PDF.

## Step 5: Verify
- Check that all cross-references resolve
- Check that figures render correctly
- Check that bibliography compiles
- Check page count and margins match SPE requirements
- Run the verification script: `bash verify.sh`

## Step 6: Prepare a Clean Upload Package

Before uploading sources, create a clean archive containing only files requested
by the submission portal. A typical source package includes `main.tex`,
`references.bib`, the referenced `fig-*.pdf` files, and any Wiley class/style
files needed to compile the manuscript. Do not include local backup files such
as `*.bak`, development notes under `docs/`, or draft-only artifacts unless the
portal explicitly asks for them.

After replacing the placeholder author metadata, you can generate a clean
whitelist-based archive with:

```bash
bash prepare-submission-archive.sh
```

## Notes
- SPE typically accepts papers up to 30 pages (including references)
- The current paper is approximately 7,216 body words according to `verify.sh`,
  which is appropriate for SPE
- If `spe.cls` is not available, some authors use `WileySPETeX2024.cls`
  — the class file name may vary by year
