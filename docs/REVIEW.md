# Build review

## Current revision: 27 October 2026

The editor now supports freeform writing, optional definition variants, contextual formatting, inline transparent drawings, selected-text diagram approval, flexible tables, images, subpages, and lineage. The graph adds focused exploration, a directional relationship ledger, and explicit prerequisite paths. See [Current editor and graph](EDITOR_V2.md) for usage and current boundaries.

83 automated tests, strict TypeScript, and the production build passed. Regression coverage includes saved empty paragraphs after drawings, stale refreshes, inline link removal, variants, table operations, portable attachment URLs, origin-specific pairing, scoped permissions, and diagram approval. The nonfatal drawing-library chunk warning remains.

Live checks verified local Ollama diagram generation, approval before insertion, real transparent SVG plus editable scenes, conversational script generation, Hermes's actual speech function and configured Edge voice, and seekable Opus audio. Browser checks verified image insertion, generated diagram review and acceptance, editing a saved canvas, expandable variants, a table growing to 4 by 4, and writing after a drawing across autosave. Responsive graph captures cover desktop, tablet, phone, and dark mode. Code copying displayed success feedback; browser clipboard inspection did not expose the native clipboard contents.

Vercel serves a static companion interface. Notes and AI services remain on the local computer. Pairing is limited to an exact HTTPS origin, expires within 12 hours, and is revoked by server restart. Hosting does not add cross-device synchronization. Edge speech uses Microsoft's online service, while the text model remains local. Cloud inference with OpenAI was not exercised. Deployment and Telegram delivery are recorded separately after their actual receipts.

The dated review below describes the initial build and is retained as history. Its fixed-layer and Windows-only speech descriptions are superseded by this revision.

Design process limitation: this refinement preserved the user's confirmed identity but skipped Impeccable's separate concept-roll gate and did not solicit its QUALITY BAR card. Taste's recorded direction seed does not replace that missing provenance. Independent finish review found contrast defects in dark graph labels and definition-variant controls; these were corrected and recaptured for a verdict pass.

Verified on 26 October 2026 by desktop Codex. This is a record of checks, not a guarantee that software cannot fail.

## Delivered

Synapse runs locally at http://127.0.0.1:4317. The project is C:\SecondBrain\PROJECTS\PROJECT_SYNAPSE. The main notebook, optional Knowledge Graph, manual typed links and backlinks, three explanation depths, Markdown source editing, editable tables, embedded drawing canvases, source capture and extraction, approval drafts, recall practice, audio scripts and playback, scoped sharing, settings, history, archiving, and a Windows launcher are implemented.

Two project notes explain the product in plain language and preserve the detailed specification. Eight starter AI concepts illustrate the workflow. They are examples, not a complete interview curriculum. Disposable QA notes were archived with their histories preserved. An illustrative normalized-vector source and a local embeddings revision episode remain as usable examples.

## Automated checks

- TypeScript strict compilation passed.
- Production client build passed. The drawing dependency produces a non-failing large-chunk warning. Drawing tools are loaded separately from the initial notebook, and fonts are bundled locally.
- 59 tests passed across API/persistence and rendered-interface suites.
- Dependency audit reported zero known vulnerabilities, including the production dependency audit.
- Persistence and reopening, prior-version snapshots, stale saves, external Markdown changes with unchanged revision numbers, note archive/restore, archived link targets, graph positions, portable Canvas output, and reserved headings within explanations were checked.
- Owner access, mutation origin checks, viewer/commenter/suggestion/editor restrictions, scoped attachments, share revocation, secret redaction, path traversal, unsupported uploads, public URL filtering, and remote Ollama model rejection were checked.
- AI approval boundaries, stale proposal rejection, matching source excerpts, source provenance, one-time acceptance, editable diagram drafts, recall scheduling and hint records, review opt-out, source archive/restore, audio approval requirements, speech text cleanup, and portable image links were checked.
- Rendered-interface regressions verified that opening a note does not falsely mark it edited, switching explanation layers does not rewrite content, and navigation opens Knowledge Graph.

## Live local checks

- Production page and compiled assets returned successful HTTP responses.
- Audio HTTP range requests returned 206, supporting playback seeking.
- Local English OCR recognized a generated text fixture using bundled language data.
- PDF text extraction recognized a generated PDF fixture.
- Windows System.Speech generated a valid WAV file; the browser displayed a generated episode with playback and download controls.
- DPAPI settings encrypted a test-only value and successfully decrypted it in a fresh provider instance. The conversation API key was never saved.
- FFmpeg sampled frames from a generated video fixture. No frames were sent to a cloud service.
- The installed local model `voytas26/openclaw-qwen3vl-8b-opt:latest` generated validated explanation layers. Its custom raw prompt template required a Qwen-compatible adapter, which is implemented. Standard chat models still use the chat endpoint.
- A real local AI workflow created an explanation draft, left the synthetic note unchanged before approval, committed accepted Markdown, created a pending diagram draft, and saved its editable diagram data only after approval. Zero cloud calls were made. Text AI is configured to use this local model.
- The installed Hermes CLI supports MEDIA attachments and a configured Telegram destination; its gateway was active when checked. No Telegram messages were sent during development.
- The launcher started the production server hidden. A Windows named-pipe guard prevents two Synapse servers from opening the same notebook simultaneously.

## Visual and interaction review

Browser checks exercised creating a concept, inserting a Markdown table, saving, adding a connection with a reason, opening a drawing canvas, drawing and saving a shape and SVG preview, recalling before reveal, recording a practice attempt, creating a script, generating local audio, and capturing a text source.

A live external-edit test displayed both saved and unsaved versions, then saved the reviewed draft while preserving the external version in history. The graph was revised after an initially unreadable zoom level. The final production graph loaded and filtered around Embeddings. Screenshots of the actual notebook and focused graph are included with the user-facing outputs.

Late in QA, the embedded browser stopped reliably dispatching mouse and keyboard clicks. Direct navigation, screenshots, and the graph's select control remained operational. Earlier interaction checks passed, and rendered-interface navigation tests passed after the final changes. This limits the final repeat of click-based browser checks; it is not recorded as a successful repeat.

## Remaining integration limits

- OpenAI inference, cloud image/video analysis, cloud transcription, and OpenAI speech were not live-tested because the supplied conversation key was exposed and deliberately not used. Enter a replacement key locally in Settings, then test those actions. Provider errors preserve existing notes.
- Hermes and direct Telegram delivery are implemented but no real send was performed. A confirmed receipt must come from a successful delivery, not this build report.
- Sharing uses revocable scoped links, not email accounts or simultaneous cursor-based collaboration. Permissions and edit conflicts are enforced by the server. Internet access, LAN firewall rules, VPNs, and remote HTTPS hosting were not configured.
- Ollama models marked as cloud or reporting a remote backend are blocked in local mode. A local HTTP endpoint by itself does not prove that its model runs locally.
- Video analysis samples at most 24 frames from the first 120 seconds. It cannot claim continuous viewing. Instagram login or download restrictions are not bypassed.
- Scanned PDFs, handwritten notes, formulas, and diagrams can require correction. OCR confidence is not factual confidence. AI-generated explanations still need review.
- Basic Markdown content is portable, while full Obsidian plugin compatibility and automatic import of arbitrary wiki-link vaults are not implemented. Preserve note metadata and the layer markers. Keep backups of the entire vault.
- Local speech currently uses Windows voices. The application is built and tested on this Windows machine; other operating systems need their own local speech and secret-storage adapters.

## Useful commands

`npm run check`, `npm test`, and `npm run build` verify the code. `npx tsx scripts/production-check.ts` checks the running app without changing notes. `npx tsx scripts/local-smoke.ts` checks extraction, encrypted settings, video sampling, and local audio using work fixtures. `npx tsx scripts/local-ai-check.ts` checks the installed local model with synthetic content. `npx tsx scripts/live-ai-workflow.ts` exercises the approval workflow with a synthetic note and archives that note afterward.
