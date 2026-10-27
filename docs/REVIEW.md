# Build review

## Update delivery, version 1.1.1

The desktop now checks for updates shortly after opening and every six hours while running. A quiet in-app bar offers Download update, progress, and Restart and update. The current note and pending uploads are saved before restart; failed saves leave the draft open. Downloads require a click, and closing the app does not silently install a downloaded update. Help > Check for updates uses the same interface. Background connection failures stay quiet, and manual checks show a useful retry message.

Strict TypeScript, 97 tests, production assets, desktop preload compilation, and Windows packaging pass. Update tests cover duplicate checks, explicit download, progress, ready-only installation, download failure recovery, save-before-restart, save failure, dismissal, and absence from the web companion. Packaged IPC was checked with an isolated profile and vault. Responsive production UI fixtures cover available, downloading, and ready states in Light, Dark, and Paper without horizontal overflow or JavaScript errors. Public update discovery and download receipts are recorded in the dated handoff after publication. Actual replacement of the user's installed app requires the user's Restart and update click and was not forced during QA.

The release command validates the version and installer checksum, requires a clean pushed commit, uploads all three updater assets to a draft release, verifies their sizes and target, and then publishes. Windows signing remains unconfigured. The previous review entries below describe their respective builds and publication state at those times.

## Notebook sheet, version 1.1.0

Verified on 27 October 2026. The notebook now supports drawing directly on the page, freely placed text, tables, arrows, shapes, images, and flowcharts. Objects can be resized, moved, overlapped, duplicated, reordered, deleted, and restored through canvas undo/redo. Normal prose retains its text undo history. Older inline content can be moved into placed objects. Paper joins Light and Dark, with glass navigation, optional handwritten typography, configurable shortcuts, and a full-width writing area when side panels close. See [Notebook sheet](NOTEBOOK_SHEET.md).

External Markdown deletion is reflected by polling and window focus. Deleted notes cannot be recreated by a stale autosave, and an unsaved deleted draft is offered separately for recovery. Multi-delete moves notes to recoverable Trash. Existing empty vaults no longer regain starter notes. Canvas content remains in the note's Markdown frontmatter, and readable writing remains in its body. Full layout fidelity requires Synapse.

The installed package decreased from 865.3 MiB to 519.2 MiB, a 40.0% reduction. Runtime staging removes development and duplicate OCR assets while preserving offline OCR, PDF extraction, FFmpeg, and bundled diagram fonts. Electron remains the largest component. The Windows installer is approximately 176 MiB. The installer, update metadata, and block map built successfully. This installer is unsigned and has not been published as a GitHub Release.

Strict TypeScript, 89 automated tests, and the production build pass. The production dependency audit reports zero known vulnerabilities. Tests cover external deletion, stale autosave refusal, bulk Trash and restore, surviving dangling links, canvas persistence, variants, and existing editor behavior. Browser interaction checks cover direct drawing, movement, undo/redo, duplication, deletion, floating writing persistence, right-click scrolling, and external deletion. The actual packaged desktop app passes offline OCR, PDF extraction, embedded-font diagram export, compact image insertion and resizing, table row/column controls, literal code paste, code copying, and opening uploaded PDFs. No cloud inference or Telegram delivery was exercised for this revision.

Visual review covers Light, Dark, and Paper, including 1440, 768, and 390 pixel views. Narrow companion views stack objects for reading while retaining their saved desktop positions. The desktop notebook keeps free placement. Small toolbar labels remain compact, and a tall diagram may need enlargement to read its labels. The notebook is a bounded page that grows downward, not an infinite whiteboard. Each pen stroke is independently movable; group selection is not implemented. These are current limits, not claims of professional drawing-suite parity.

Appearance and handwriting preferences persist through a clean packaged-app restart on the same saved local origin. Code clipboard contents were compared after normalizing Windows line endings. The final visual inspector reports zero failures and three advisory warnings for compact control text, navigation spacing, and a diagram being classified as a numeric chart.

The previous review below records earlier revisions and their separate integration checks.

## Current revision: 27 October 2026

Desktop packaging is now the primary distribution direction. The Electron shell runs the existing local server on loopback, stores the selected vault outside the installation, offers vault switching and folder access, and checks GitHub Releases for updates. The installer leaves vault data untouched. Public distribution still needs a Windows code-signing certificate to establish publisher trust and reduce SmartScreen warnings.

The Windows installer, update manifest, and block map built successfully with Electron 45. A packaged-app smoke run used a disposable external vault, loaded the compiled interface with HTTP 200, established the owner session, loaded `/api/bootstrap` with HTTP 200, found the eight seeded notes, and exited cleanly. The packaged Hermes helper and unpacked FFmpeg executable were present. TypeScript, 83 tests, the production build, desktop compilation, and the full dependency audit passed with zero known vulnerabilities after replacing the initially selected vulnerable Electron line. The generated installer is unsigned, as expected, and was not published as a public release. Auto-update discovery is implemented and the release manifest was generated, but an end-to-end update from an older signed public release cannot be verified until signing credentials and two release versions exist.

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
