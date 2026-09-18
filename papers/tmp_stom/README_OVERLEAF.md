# ICLR submission source

Upload the repository contents while preserving `sec/`, `tab/`, and `appendix/`.
Set `main.tex` as the main document and compile with pdfLaTeX + BibTeX:

```text
pdflatex main
bibtex main
pdflatex main
pdflatex main
```

The submission is anonymous by default. Uncomment `\iclrfinalcopy` and replace
`Anonymous Authors` only after acceptance.
