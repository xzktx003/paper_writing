# Architecture Diagrams for SPE Manuscript

These Mermaid diagrams are source material for SPE figures. The current
submission figure files live in the manuscript root as `fig-*.pdf`; editable
SVG counterparts live beside them as `fig-*.svg`.

## Figure 1: System Architecture

```mermaid
flowchart LR
  User[Researcher] --> UI[React/Vite Frontend]
  UI --> API[Fastify Backend]
  API --> FS[(Local papers/ directory)]
  API --> CFG[(Repository .env)]
  API --> LLM[LLM Provider<br/>OpenAI/Anthropic-compatible]
  API --> CITE[Scholarly Databases<br/>CrossRef / Semantic Scholar / OpenAlex]
  API --> TEX[LaTeX Engines<br/>pdflatex / xelatex / lualatex / latexmk / tectonic]
  API --> TMUX[tmux Terminal]

  MCP[MCP Clients<br/>Claude Desktop / Cursor / Copilot] --> API
```

## Figure 2: Permission-Aware AI Interaction Modes

```mermaid
flowchart TD
  Prompt[User Prompt] --> Mode{Conversation Mode}
  Mode -->|Chat| ChatRO[Read-Only Discussion]
  ChatRO --> ChatResp[Text Response Only]
  Mode -->|Agent| AgentProp[Edit Proposal Generation]
  AgentProp --> Diff[Inline Diff Display]
  Diff --> Decision{User Decision}
  Decision -->|Accept| Apply[Apply to File]
  Decision -->|Reject| Discard[Discard Changes]
  Mode -->|Tools| ToolsExec[Multi-Step Tool Execution]
  ToolsExec --> Boundary[Project Boundary:
  code/ directory scope]
  Boundary --> Audit[Auditable Tool Call Log]
```

## Figure 3: Pipeline 2.0 Stage Types

```mermaid
flowchart LR
  subgraph Stages[Pipeline Stages]
    AI[AI Stage<br/>LLM-powered skills]
    Compute[Compute Stage<br/>Shell commands]
    Human[Human Stage<br/>Review checkpoint]
    Citation[Citation Stage<br/>Verify / deduplicate / discover]
    Compile[Compile Stage<br/>LaTeX build]
  end

  AI --> Human
  Human -->|Approve| Citation
  Human -->|Reject| AI
  Citation --> Compile
  Compile -->|Pass| Done[Artifact: PDF]
  Compile -->|Fail| AI
```

## Figure 4: Citation Verification Strategy

```mermaid
flowchart TD
  Entry[BibTeX Entry] --> HasDOI{Has DOI?}
  HasDOI -->|Yes| DOIVerify[DOI Verification<br/>CrossRef + Semantic Scholar]
  HasDOI -->|No| TitleSearch[Title Fuzzy Match<br/>CrossRef + OpenAlex]
  DOIVerify --> Confidence{Confidence}
  TitleSearch --> Confidence
  Confidence -->|2+ APIs confirm| High[High Confidence]
  Confidence -->|1 API confirms| Medium[Medium Confidence]
  Confidence -->|Title match only| Low[Low Confidence]
  Confidence -->|No match| None[No Confidence: Flagged]
```
