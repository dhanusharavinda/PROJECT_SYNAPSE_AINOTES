# Synapse user guide

## What it does

Synapse is a local notebook for understanding AI concepts and practicing interview explanations. Notes are the main workspace. Knowledge Graph arranges the same notes into topic groups with approved connections. Inbox holds sources before they become note changes. Review asks you to recall before revealing. Audio Studio creates revision scripts and real audio files.

## Open the app

Double-click `Start Synapse.cmd` in the project folder, or run `npm start` after `npm run build`. Open http://127.0.0.1:4317. The launcher starts a hidden local server and reuses an existing Synapse server. It does not install an always-on Windows task.

## Create and edit

Choose New concept. Give it a title, meaning, and topic group. Switch the explanation-depth slider among Intuition, Technical, and Implementation. Each is stored Markdown, not a fresh AI answer on every movement. Use the editor toolbar for headings, lists, tables, images, and undo. The source button exposes raw Markdown. Notes save after a short pause; Save now and Ctrl+S save immediately. Check the saved indicator before closing.

Two different meanings deserve separate notes, even when their titles match. Different explanation depths belong inside the same note. The eight initial AI concepts are illustrative starter notes, not a complete or certified curriculum.

## Connect ideas

Type `/` and select Link, or use Connect a concept. Choose the existing note, relationship, and your reason. A Markdown hyperlink and a typed relationship are saved. The target note displays the backlink. Related links are not silently upgraded to prerequisites. AI can propose links, but acceptance is required.

## Knowledge Graph

Open Knowledge Graph. Topic groups come from the notes. Refresh rereads local files. Click a concept to preview it, double-click to edit, or focus around one note. Collapse groups to reduce clutter. Drag cards to arrange them. Pin a selected card to preserve its position. Arrange layout clears unpinned positions and preserves pinned ones. Fit View shows the whole map; zoom in for reading. A concept can appear in several views without duplicate note files.

## Capture sources

Paste text or a public URL, or upload PDF, PNG, JPEG, WebP, Markdown, text, MP3, WAV, M4A, MP4, WebM, or OGG. Files are capped at 40 MB. PDF extraction reads at most 150 pages and 150,000 characters; scanned text, diagrams, and formulas can be missed. Local English OCR is bundled, including its language data. Correct extraction text before analysis when needed. The original file is retained.

Instagram links are bookmarks, not automatic downloads or proof that a reel was watched. Upload the video or paste a transcript. Audio transcription sends a file under 24 MB to OpenAI after approval. Visual analysis sends an image or up to 24 video samples, approximately five seconds apart within the first 120 seconds. It does not inspect all frames. Audio is included in visual analysis only when already transcribed. Model mistakes and missed visual details remain possible.

Archive a source after processing it to clear the Inbox. Its original file and attached citations remain available; the Archived tab can restore it.

Review with AI compares up to 24,000 source characters with excerpts from up to 12 locally matched notes. This bounded comparison can miss material outside those excerpts. It can propose details, examples, contradictions, or already-covered material. Review source excerpts and the target note before accepting. Already-covered items attach the source without duplicating text. Changed target notes invalidate older proposals.

## Draw and make tables

Add a drawing to open the embedded Excalidraw canvas. Draw with a mouse or stylus, add shapes and text, attach arrows, and move selected objects with arrow keys. Save explicitly before closing. A local JSON scene and SVG preview are preserved. Drawings are separate from semantic note links. An AI flowchart button creates an approval draft; accepting it adds editable diagram objects. Review generated relationships before using them to study.

Tables are editable inside the note. Select a cell to add a row or column or remove a row/table. Markdown tables preserve content but do not preserve custom cell widths or every visual editor attribute.

## Practice

Open Review or Practice this concept. Explain from memory, use a hint if needed, then reveal your note. Rate the attempt honestly. Again schedules about ten minutes later; Hard schedules one day; Good and Easy progressively increase intervals up to a cap. Attempts and hint use are stored locally. Collected, Explained, and Practiced describe recorded activity, not measured mastery. Optional AI feedback can be challenged and does not set your self-rating.

## Audio and Hermes

Choose concepts in Audio Studio. Create a local script without AI, or approve an AI script draft. Edit the script before rendering. Generate local audio uses installed Windows System.Speech and saves a WAV. OpenAI voice sends the approved script to the paid speech API and saves MP3. Both remain local files after generation. Pauses are instructions to pause playback, not an interactive quiz inside the audio file. Listening does not mark notes practiced.

Send via Hermes asks for approval, records an outbox item, and invokes the installed WSL Hermes CLI with a MEDIA attachment to its configured Telegram home chat. It does not invoke an LLM. Delivery is recorded as confirmed only after the CLI succeeds. A failed or interrupted delivery is marked failed-or-unknown. Check Telegram before retrying to avoid duplicates. No Telegram messages were sent during development. Direct Telegram delivery is an optional alternative using a bot token and chat ID saved in Settings.

## AI and credentials

Manual notebook features work with AI disabled. This installation is configured to use the existing local Qwen3-VL model through Ollama for text AI. Its custom raw prompt template is supported. Cloud-tagged or remote Ollama models are blocked in local mode. Configure a replacement OpenAI API key in Settings, select OpenAI, and use Save and test connection. The key exposed in the conversation was not saved. Revoke it. Secrets are encrypted for the current Windows account using DPAPI and are never returned to the browser. A different Windows account may not be able to decrypt copied settings. Environment variable OPENAI_API_KEY is also supported.

Ollama text AI uses a locally running service at a loopback HTTP URL and an installed model. No Ollama model is downloaded automatically. Cloud image analysis, audio transcription, and OpenAI voice need a valid OpenAI key even when local text AI is selected. Provider-generated output is validated before becoming an approval draft. Provider outages and incorrect generated content cannot be eliminated by app tests.

## Share

Share one note using Viewer, Commenter, Suggest additions, or Editor. Access is enforced by the server. Editors change explanation layers. Suggest additions requires the owner to accept text before it enters the note. Sharing does not expose other notes or private backlink lists. The note's explicitly attached sources are shared. Bearer links grant access to anyone who has them; revoke a link to end future access. This is scoped link collaboration, not an email-account invitation system or simultaneous cursor-based editing. Concurrent edits are rejected rather than silently merged.

Localhost links work on this computer. For a trusted LAN, set SYNAPSE_ALLOWED_HOSTS to the machine's LAN IP and run `npm run dev -- --lan` or `npm start -- --lan`. The owner editor remains restricted to loopback. Share links can then use the LAN address. The app does not change the Windows firewall or expose an internet endpoint. Remote internet collaboration requires separately configured secure hosting or a VPN. Downloaded copies cannot be revoked.

## Files, backups, and recovery

Back up the entire vault folder while the app is idle. Notes are `vault/notes/<stable-id>.md`, with YAML metadata and three Markdown explanation sections. Stable IDs avoid collisions between meanings and broken links after title changes. This format is readable by other editors, but app-specific sliders, typed relationships, and review states need Synapse. Full Obsidian plugin interoperability and arbitrary wiki-link import are not implemented.

Attachments, drawings, maps, and audio live beside notes. `.synapse/state.json` holds sources, approved-proposal state, sharing links, reviews, and episode scripts. `.synapse/history` preserves note versions before replacement. `.synapse/settings.json` contains encrypted credentials and should remain private. `.synapse/outbox` records audio delivery state. Graph positions also export to JSON Canvas format. Browser storage is not authoritative.

External Markdown changes are reread on graph refresh or when reopening. Keep the metadata and the three main section headings intact. Content hashes and revisions detect conflicting edits. Invalid note metadata produces a visible error rather than silently dropping the note. Archive preserves note files and can be reversed in Settings. History lets you copy previous content into the editor.

## Verification limits

Read docs/REVIEW.md for the actual tests and current integration status. Do not infer that cloud AI, Telegram receipt delivery, internet sharing, or a specific local model was verified merely because its implementation is present.
