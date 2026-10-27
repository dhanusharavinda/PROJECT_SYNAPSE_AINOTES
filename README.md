# Synapse

A local study notebook with intentional links, an organized Knowledge Graph, editable drawings, source capture, recall practice, and revision audio.

The current editor includes contextual formatting, optional definition variants, inline transparent drawings, selected-text diagrams, flexible tables, image insertion, subpages, breadcrumbs, and light/dark themes. See [Current editor and graph](docs/EDITOR_V2.md).

Vercel hosts the frontend companion. Your local service must be running and paired with the deployed site on the same computer. The vault is never deployed. Run `Setup Hermes voice.cmd` once to prepare the isolated compatibility dependency for Hermes's existing speech pipeline.

## Start

1. Install Node.js 22 or later.
2. Run `npm install` in this folder.
3. Run `npm run dev` and open `http://127.0.0.1:4317`.
4. For production, run `npm run build`, then `npm start`.

Your notes live in `vault/notes`. Keep backups of the entire `vault` folder. Use Settings for a replacement OpenAI key or a local Ollama model. No API key is needed for notes, manual links, drawings, graph, source text/PDF capture, practice, or local Windows speech.

See `docs/PROJECT_SPECIFICATION.md` for the full agreement, implementation boundaries, and acceptance criteria. See `docs/USER_GUIDE.md` for workflows and limitations.
