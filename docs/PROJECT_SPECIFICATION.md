# Synapse: local study notebook

Current revision, 27 October 2026: [Current editor and graph](EDITOR_V2.md) supersedes fixed explanation layers and offline-only speech descriptions below. Notes now have a normal Markdown body, optional expandable variants, inline drawings, and a paired Vercel frontend. The original agreement remains as implementation history.

## Plain-language explanation

Synapse is a notebook for learning AI and preparing for interviews. Write an explanation, connect it to another note, sketch a flow, then practice recalling it. Your notes are ordinary Markdown files in a local folder. The Knowledge Graph is another view of those same files. AI suggestions are drafts that you choose to accept or reject.

## Product agreement

- Keep a quiet notebook editor as the default screen. Add Knowledge Graph as a separate roadmap-style view, with expandable groups and a selected-note panel.
- Provide manual slash commands for linking, concepts, tables, images, drawing, and flowcharts.
- Separate meanings with a context field. Store intuition, technical explanation, and implementation as editable layers within a single concept.
- Store one canonical concept note, with incoming and outgoing links. Display backlinks automatically. Never infer a prerequisite merely from a hyperlink.
- Refresh rereads notes and updates the graph layout without silently changing content or relationships. Preserve manually pinned positions.
- Capture text, public URLs, images, PDFs, and video/audio uploads into an inbox. Expose extraction limits, sources, and errors. Instagram links are bookmarks unless content is supplied or publicly accessible. Never claim a link was watched.
- Compare extracted claims with current notes. Show proposed changes and supporting excerpts. Accept or dismiss explicitly. Similarity is only a search aid, not a correctness score.
- Provide editable drawing canvases, text, shapes, arrows, and tables. AI diagram suggestions remain previews until inserted.
- Review hides explanations before recall. Record the learner's attempt, hints, self-assessment, and next due date. Collected, explained, and practiced describe evidence, not certified mastery.
- Generate editable audio scripts from selected notes, with recall pauses and source references. Support local Windows speech and optional OpenAI speech. Save actual audio locally. Queue approved episodes for Hermes Telegram delivery or send through an explicitly configured Telegram adapter.
- Share scoped note access through revocable bearer links with viewer, commenter, suggestion-only, and editor permissions. Read-only and suggestion-only access must be enforced by the server. Local URLs are not remotely reachable without an explicitly configured network path. Never expose private notes through shared backlinks.
- Default to local storage. Cloud AI is opt-in per action. Local Ollama can provide text AI when installed. Do not silently upload an entire vault.

## Storage contract

`vault/notes/*.md` are canonical notes with YAML metadata, stable IDs, revision numbers, context, group, approved typed links, and three Markdown sections. Attachments, drawings, maps, audio, and practice history live beside the notes. Graph positions and history are explicit portable JSON, not hidden browser-only state. Search and graph indexes are rebuilt from notes. Browser data is not authoritative.

Writes use temporary files followed by rename. Revisions detect conflicting writes. Before replacing an existing note, preserve a history snapshot. Archive instead of permanently deleting notes. Paths and upload types are validated. Provider secrets are held server-side and encrypted locally on Windows using DPAPI. Do not store the exposed conversation API key.

## Implementation and review

Build a TypeScript local HTTP server and a React web interface. Bind to loopback by default. LAN access is explicit. Owner actions require a local owner session, same-origin mutation checks, and scoped sharing checks. Fetching URLs rejects private/internal addresses and revalidates redirects. Uploaded content is treated as untrusted source material. Render Markdown without raw HTML execution.

Tests must exercise persistence/restart, conflicting saves, scoped sharing, graph rebuild, source proposal acceptance, review scheduling, drawing persistence, path traversal, and provider error behavior. Browser QA must cover the actual editor, graph, inbox, drawing, revision, and settings flows. Record checks and unresolved limitations honestly, including external services that cannot be verified without replacement credentials.

## Initial integration boundaries

An exposed OpenAI key was supplied in the conversation and must be replaced by the user through local settings. No supplied secret is copied into project files or logs. Do not send Telegram messages during development unless explicitly requested. Hermes integration must be checked against its live installed interface; an outbox receipt is not proof of Telegram delivery.
