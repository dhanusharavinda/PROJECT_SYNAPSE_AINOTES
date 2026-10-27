# Build review

## Dotted notebook and study tools, version 1.3.0

Added a fourth theme with a 16-pixel dot grid, proportional group scaling, placed-text/emoji scaling, default drag/resize handles, and a selection-delete icon beside Eraser. Shape fill and fluorescent marker strokes persist in Markdown metadata. Saved pen colour is no longer inverted by dark theme CSS. Text colour backgrounds were removed. Paragraph alignment round-trips through Markdown using a sanitized attribute, and edited ordered lists normalize numbering. Slash ordering puts page links and page creation first.

Images now have a contextual extraction workflow with explicit analysis choice and editable approval draft. Visual analysis supports an installed local Ollama vision model with cloud-model rejection, or OpenAI when selected. Disabled AI cannot silently send images to a saved cloud key. OCR remains text only. A draft can feed diagram generation, whose labels and connection endpoints are editable before acceptance. Schema validation rejects invalid references and disconnected diagrams. These checks do not prove semantic correctness; user review remains necessary.

AI teacher uses only explicitly selected notes and separates the question, hint, and reference explanation. Instagram preview cards use validated public post/reel URLs; server retrieval retains pinned-public-DNS guards, and only HTTPS Instagram/Facebook CDN image URLs are returned. Blocked/private posts fall back without login or cookie collection. Clear-data is local-app-only, requires exact typed confirmation, serializes against writes, and moves notebook content to a recovery directory while preserving settings.

130 tests, strict TypeScript, production and NSIS builds passed. Tests cover reset confirmation/recovery/settings retention, selected-note scoping, disabled-provider protection, group scaling, Instagram host validation, connected diagrams, alignment persistence, and list renumbering. Browser checks cover Dotted, group/emoji scaling, marker opacity, original ink across themes, default resize, slash order, saving, and zero console errors. Packaged checks cover clipboard, code paste/copy, full selection delete/undo, autosave, and fresh notebooks. Live local Ollama tests returned a transcription/diagram description from a synthetic screenshot, a grounded recall question, and a valid three-node/two-edge flowchart. No cloud inference or user-vault reset was performed.

Production responsive inspection reports zero failures and two advisories for compact controls and ink SVGs classified as charts. All six captures and the separate Dotted capture were opened. Mobile remains the stacked companion layout. Image colours/structure are estimates; Instagram previews depend on public availability; physical OS menu accelerators are covered by routing unit tests rather than CDP. Release receipts are in the handoff.

## Writing and clipboard fixes, version 1.2.1

Removed the repeated empty-editor placeholder and all bundled subject-specific starter data and defaults. A fresh notebook is empty. Existing user files remain intact. A new note has one short slash-link cue that fades and unmounts after five seconds, including under React Strict Mode. Theme and Book/Handwritten controls are in the sheet toolbar. Selected objects expose Copy and Delete; selection context capture takes precedence over the text menu in Select mode.

The desktop clipboard bridge reads/writes plain text through a main-window, top-frame-only IPC endpoint. Text context menus include Copy, Cut, and Paste. Normal same-page paste, code copying, multiline code paste, selection deletion and undo, and autosave have browser or packaged interaction coverage. Physical operating-system menu accelerators are not driven by CDP; their routing retains the separate unit coverage. The hidden packaged window cannot reliably provide a screenshot, so production-browser captures provide the visual evidence.

Pen outlines use quadratic smoothing with modest filtered speed-based widths. Empty coalesced pointer-event lists fall back to the original event. Width ratios survive saving and partial erasure, while stationary clicks remain visible dots. YouTube paste offers an original link, a named link, or a movable/resizable thumbnail, preserves URL timestamps, focuses and selects the name field, and supports Enter and Escape. Thumbnail loading is an online image request, not video transcription or analysis.

Readable study text removes formatting tags and notebook directives from recall cues and scripts, while preserving literal fenced and inline code for model context. Existing scripts are cleaned for display and speech. An independent read-only agent reviewed distribution and the clipboard, selection, pen, and video changes. Its actionable findings were corrected before release.

121 automated tests pass. Strict TypeScript, production client build, desktop compilation, and Windows NSIS build pass. Browser receipts cover same-page clipboard, visible selection deletion, smooth saved ink, theme/font switching, YouTube options and keyboard focus, timestamp preservation, thumbnail movement/resizing, transient onboarding, autosave, clean hints, and clean narration. Production inspection at 1440, 768, and 390 pixels reports zero failures and two documented advisories for compact controls and a pen SVG classified as a chart. All twelve initial/production captures were opened. Release assets, hashes, and final update-channel checks are recorded in the handoff after publication.

## Free notebook revision, version 1.2.0

This revision replaces the shifting object toolbar with right-click actions and a small selection grip. Geometry is stored in pixel coordinates with a saved page width; older relative layouts convert when edited. Pointer capture uses page coordinates, coalesced pen input, and animation-frame rendering. Pen dots, a partial-stroke eraser, additional shapes, marquee and group movement, whole-note copy/delete with undo, precise blank-space writing, and two-axis table sizing are implemented. Text formatting and table operations stay in context menus. Paper measures the writing baseline. One button cycles the three themes. All notes adds search, grouping, sorting, optional dates, and multi-delete. Shortcut assignments cover drawing, formatting, files, navigation, and saving.

Two independent graph defects were corrected: periodic bootstrap refreshes replaced active drag positions, and the API accepted UUID keys while the graph sent view-scoped keys. Live positions now remain local until acknowledged, writes are queued, and the API accepts validated focus and roadmap keys. Canvas export uses actual note identifiers. A browser test held a drag across a refresh and verified its position after reopening.

The variant serializer now separates code, paragraphs, and drawings. A conservative display repair handles the known older glued-separator case. Reading and sharing render the variants without exposing those control markers. Shared canvas images require an explicit reference in that note, with a regression test denying unrelated files. Clipboard paste no longer falls back to stale objects when reading the system clipboard fails. A native paste target supplies trusted clipboard events for blank canvas areas. Normal text and input editing remain separate from drawing undo. PDF windows retain native clipboard actions.

Strict TypeScript and 108 automated tests pass. Browser interaction receipts cover dots, undo/redo, precise movement, persistence, erasing, blank-space writing beside existing text, Enter, shapes, table rows/columns and resizing, selecting/deleting the entire note and undoing it, copy/paste, external clipboard text, graph movement across polling, and public shared-note rendering. Packaged-app CDP key events cover drawing undo/redo, text and title undo, custom pen binding, and color binding. CDP does not exercise the operating-system menu accelerator itself; menu routing, native input fallback, and focused-PDF copying have separate unit coverage.

Responsive inspection reports zero failures for both All notes and the notebook. All notes has no advisory warnings; the notebook retains compact-control text, intentional blank writing space, and a diagram being classified as a data chart. Desktop, tablet, and phone captures were opened. This retains the existing sage/ink identity. It is a working notebook rather than an infinite whiteboard; object clipboard layout lasts within a running session, and imported diagrams are edited separately from pen erasing. Complete files and history remain in the local vault. The user's installed application and real vault were not replaced during QA. Release publication and installer checksums are recorded in the handoff after they succeed.

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
