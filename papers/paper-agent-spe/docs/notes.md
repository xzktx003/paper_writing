# SPE Paper Planning Notes

## Target Journal

Software: Practice and Experience (SPE), Wiley, ISSN 0038-0644.

## Paper Structure

1. Abstract
2. Introduction — problem statement, three practical problems, contributions
3. Related Work — AI writing, collaborative LaTeX, agent-based systems, HITL, research tools
4. System Design and Architecture — 6 design goals (RG1-RG6), architecture layers, 4 key design decisions
5. Implementation — tech stack, project mgmt, editor, AI modes, pipeline engine, citation verification, MCP, testing
6. Evaluation and Experience — functional verification, design tradeoffs in practice, challenges encountered
7. Discussion and Lessons Learned — 5 lessons
8. Limitations and Future Work — 9 limitation and future-work directions
9. Conclusion
10. Data Availability
11. Acknowledgements
12. References

## Key Contributions

- Local-first platform for AI-assisted academic writing with project-level awareness
- Permission-aware interaction model (Chat/Agent/Tools) for controllable AI writing
- Typed pipeline engine with human checkpoints for auditable multi-stage workflows
- Practical experience and lessons from building the system

## TODO Before Submission

- [ ] Replace placeholder author email and ORCID with real submission metadata
- [ ] Add institutional support and funding acknowledgements
- [x] Insert architecture diagrams as root `fig-*.pdf` assets
- [ ] Convert to Wiley SPE official template
- [x] Verify all citations resolve correctly in the current BibTeX file
- [x] Compile current article-class draft with Tectonic
- [ ] Recompile after Wiley SPE class conversion
- [x] Address npm audit findings in the application dependency tree
