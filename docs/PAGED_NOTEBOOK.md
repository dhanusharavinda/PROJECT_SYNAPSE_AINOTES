# Paged notebook and AI notes

This feature is part of the Windows Synapse app, version 1.10.1. With spacedesk, move the Synapse window to the iPad display and enable Canvas focus. Use the PC keyboard for typing and the stylus for drawing. A separate browser notebook is not needed for this workflow.

## Paper within one note

Existing content remains Page 1. The page picker and corner move between sheets within that same note. Next page creates a sheet only when there is no following sheet. New note still creates a separate note.

Extend paper grows only the active sheet. The top-right paper swatch selects Plain, Ruled, Dotted or Grid for that sheet. The corner turns to the next sheet, and Previous sheet returns. A corner drag is separate from drawing, Hand panning and Select.

The curl overlays the actual sheet viewport below the tools and page controls. Small pages prepare an optional preview while idle. Turning a page commits captured input and switches immediately, without waiting for screenshots or image decoding. A fresh cached preview can add a short curl over the already editable next sheet. Heavy sheets and reduced-motion users switch directly. Each sheet remembers its scroll position for the current device session.

Controls use SVG icons. They scale with interface zoom and display density. Canvas focus hides the surrounding document scrollbar and keeps the paper viewport inside the application window.

Emoji-only text objects resize like stickers: their glyphs scale with the resize handle. Ordinary text boxes continue to reflow at their existing font size.

## AI notes beneath handwriting

Scroll below the paper and open AI notes. Convert handwriting sends the sheet's editable ink and placed text to the AI provider configured on the PC. Choose a vision-capable OpenAI model or a locally installed Ollama vision model in Settings. OpenAI usage follows the account's API billing. Conversion is manual, and no provider runs while drawing or turning pages.

Review the conversion before choosing Keep AI notes. Typed and Neat handwriting are editable views of the same text. Neat handwriting uses a preset font or a personal handwriting font imported on this device. It does not reconstruct a font from one photo. Original ink, images and links remain above. Unreadable writing should appear as [unclear]. Check formulas and terminology. See PERSONAL_HANDWRITING.md for local font setup.

Conversion runs asynchronously. The panel can collapse during processing, error recovery or review. A conversion tied to an earlier version of the sheet shows Handwriting changed, including a first unaccepted preview. Keeping an older conversion leaves that warning visible until the writing is converted again.

## Hand-drawn diagrams

Original sketch is the default. Its vector strokes and their rotations are retained. Edit a copy opens a separate editable canvas with the same drawing layout and preserves the source sheet.

Create tidy diagram asks AI to reconstruct visible labels and connections. Review and edit the labels, arrow endpoints and arrow labels before keeping it. The result is a separate canvas of editable shapes, lines and text. Show original sketch switches back to the retained source crop. Tidy layout is an explicit choice, it does not replace the original handwriting.

## Saving, sharing and export

All sheets and accepted AI notes are stored in the original note's Markdown metadata. Page 1 retains its original body and canvas fields. Older client saves preserve additional sheets. Local history and vault backups contain them.

Shared notebooks use distinct sheet text and object cells, plus a leased AI notes cell per sheet. Paired device sync and tablet backups preserve the complete note. Read-only views and slide export include every sheet and accepted AI notes.

Limits are 101 sheets per note, 20,000 canvas objects per sheet and a maximum sheet height of 100,000 logical pixels. At 1,000 objects or 80,000 ink samples, a small Next page prompt recommends a lighter sheet. Existing drawings above the old 1,500-object limit are kept intact. Notes have a 24 MiB transport budget. Imported drawing files remain available through Resources rather than direct ink conversion.

Desktop and shared editors keep recoverable drafts in IndexedDB and clear only acknowledged versions. Background saving does not interrupt a held pen stroke. Failed saves retain the draft and retry recoverable network errors. Storage failures are shown, not reported as saved. Keep the app open or export a draft when storage cannot complete.

## Compact controls

The toolbar provides quick arrows, zoom out, zoom in and reset. Two fingers pan and zoom the sheet. Brush settings includes a Tool wheel switch; turning it off keeps the same actions in a compact All tools menu. Canvas focus retains All notes and parent-note navigation alongside the tools. Pen and highlighter previews render separately from saved page objects. Interrupted strokes keep their captured ink, and Undo removes a completed stroke.

## Verification and practical limits

Automated checks cover note round trips, separate-sheet editing, collaboration, typed and handwriting AI views, stale previews, collapse states, rotated capture geometry and invalid input. Browser checks use isolated sample notes. Mocked AI verifies review and saving without sending personal writing to an external provider.

Recognition quality, physical stylus pressure and spacedesk latency depend on the selected model, pen and connection. The application does not claim Procreate performance parity. Keep the PC awake and the spacedesk connection stable while writing.
