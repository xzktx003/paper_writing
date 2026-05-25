# Project Overview

Paper Writer manages each paper as a filesystem-backed project under `papers/`.

The frontend includes a theme selector for both project management and editor screens. Basic Light and Basic Dark remain available as conservative defaults, while GitHub Dark, Catppuccin, Tokyo Night, and Dracula-inspired themes provide higher-contrast editor-style alternatives.

Each project contains the source paper files plus metadata in `project.json`. Projects may use LaTeX templates and structured paper assets, but the workspace is not limited to final manuscript files. Every project now also has a root-level `docs/` folder intended for supporting material such as research ideas, outlines, meeting notes, scratch drafts, and other free-form planning documents.

The preview layer resolves Markdown image links and LaTeX `\includegraphics{...}` references through the project blob API, so user-created folders such as `fig/`, `figures/`, `images/`, or `img/` can display inside the editor preview instead of resolving relative to the browser page URL. These image folders are supported when present, but `fig/` is no longer created automatically.

The backend exposes file-tree and file-editing APIs over the project root, so files placed under `docs/` and other user-created folders are handled by the same browse, create, upload, copy, move, rename, and delete flows as other project files. Text-like files in `docs/` can be edited directly; images in `fig/` can be selected for preview. In the editor file tree, users can right-click blank/root space or a folder to create new files/folders, and can right-click files or folders for copy paths, copy, cut, paste, and delete actions, or drag files and folders into another folder or the explicit project-root drop target to move them.



The integrated terminal is backed by tmux. Each project/cwd maps to a stable tmux session name, so reopening the terminal or refreshing the page reattaches to the same shell state; if that tmux session has been killed, the next connection creates it again.

Runtime LLM configuration is owned by the repository-root `.env` file. The backend loads provider, API key, base URL, and model values from `.env`, writes settings changes back to `.env`, and exposes only masked key status through `/api/config`, so the frontend can update settings without displaying or caching real API keys.

Chapter text editing now has Source, Split, and Rendered modes. Rendered mode switches from CodeMirror source editing to an Obsidian-like editable preview surface: valid Markdown/LaTeX blocks are compiled into normal document preview text, math, lists, and images, and edits to rendered text blocks are written back to the source. Syntax that cannot be rendered stays visible as editable source fallback so malformed sections do not block editing the rest of the document.

The AI assistant is organized around three conversation modes: Chat for read-only discussion, Agent for reviewable paper-edit proposals, and Tools for multi-step tool execution. Code-related AI operations are no longer exposed as a separate conversation scope; when needed, they are handled as controlled `code/` directory tools inside Tools mode.

The right panel now features five tabs: Chat (conversational AI), Skills (43+ writing/research/review skill plugins), Review (structured peer review with score rings and revision checklists), Anti-AI (writing pattern detection with flagged terms, sentence analysis, and actionable suggestions), and Pipeline (multi-stage automated workflows like Polish → Review → Revise → Finalize). AI chat uses SSE streaming for real-time token delivery, and new conversations automatically inject relevant context (chapter content, paper structure, references) based on the selected scope.
