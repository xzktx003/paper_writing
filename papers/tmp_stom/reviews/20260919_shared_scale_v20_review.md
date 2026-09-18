# Shared-Scale VQ V20 Review

## Summary

V20 turns the supplied Feishu manuscript into a complete ICLR 2027-style paper. The central distinction between base-codeword dimension and joint decision range is clear, and the residual-aware majorizer plus lower-envelope solver forms a coherent technical contribution.

## Strengths

- The method has a precise objective, explicit legal-scale domain, candidate-pool boundary, and true-objective acceptance rule.
- The theory separates surrogate optimality from true-objective optimality and states failure modes of a loose upper bound.
- Results cover common-start ablations, several model sizes, reasoning tasks, dimensionality, offline cost, and one deployment measurement.
- Claims are scoped to the observed models and tasks; inconsistent BoolQ, MMLU, and Llama results are not hidden.

## Remaining risks

- The source record lacks uniform seeds, calibration size, batch size, warm-up count, repetitions, and uncertainty estimates.
- Cross-paper baseline tables should not be described as fully controlled reproduction without provenance metadata.
- Three figures remain placeholders and must be replaced before submission.
- The local environment lacks a TeX engine, so the source received structural rather than PDF-level verification.

## Verdict

Writing 9.0/10; novelty 7.0/10; experiments 7.5/10; theory 8.0/10; reproducibility 7.0/10; overall 7.5/10. Promising submission draft, conditional on provenance cleanup, repeated evaluation, and final figures.
