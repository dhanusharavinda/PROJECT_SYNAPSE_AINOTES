# Current editor and graph

## Simple explanation

Write naturally in a notebook on your computer. Put drawings, images, tables, and code between paragraphs. Connect words to other pages when you can explain the relationship. The graph shows those same pages. Collected, explained, and practiced remain separate states.

## Writing and definitions

The sticky toolbar and right-click menu provide formatting anywhere in a note. Select a definition and choose Add another variant. The selection remains the default explanation; alternatives expand or collapse. Labels are optional and the number of variants is not fixed. Existing three-layer notes retain their original text as variants when saved, with prior files in history.

Commands: `/text`, `/h1`, `/h2`, `/h3`, `/bold`, `/italic`, `/underline`, `/bullet`, `/numbered`, `/todo`, `/code`, `/inline-code`, `/table`, `/variant`, `/link`, `/page`, `/image`, `/file`, `/draw`, `/diagram`, `/flowchart`, `/quote`, `/divider`. Filter by typing, then use arrow keys and Enter.

Code blocks have an optional language and Copy code. Tasks persist as Markdown checkboxes. Select a table cell to add or remove rows and columns; drag boundaries to resize columns. Use the sidebar theme switch for light or dark mode.

## Links, pages, and files

Select a word and choose Link a page. That word becomes the hyperlink, with a relationship and your explanation. Plain Markdown note links create related edges and backlinks. Removing a hyperlink removes its derived edge. Separately authored relationships remain until explicitly removed.

Use `/page` or Subpage to create a page inside another page. Inside changes its parent. Breadcrumbs show lineage; cycles are rejected. Page containment does not imply a learning prerequisite.

Upload, paste, or drop an image at the insertion point, then resize it. PDFs and other supported files become links to their originals. Reference material simply means the original article or file behind an explanation. It is optional; writing never requires an attachment.

## Diagrams

`/draw` opens a canvas for shapes, arrows, and freehand marks. Saving places a transparent SVG inside the note. Write below inserts a following paragraph. Edit drawing or double-click reopens the editable scene. Drag the corner to resize.

`/diagram`, `/flowchart`, Generate flowchart, and right-click create AI drafts. Use selected text, the current note, or include up to four other notes. Choose flowchart, hierarchy, or concept map. The dialog names the provider. The result opens for review immediately and remains pending until accepted.

Stock Diagram Design guidance supplies editorial colors, semantic shapes, orthogonal routes, short labels, and a nine-node/twelve-edge budget. Acceptance inserts the SVG and editable scene. Drawing arrows does not create knowledge-graph links. Check the relationships and split complex content into several diagrams.

## Knowledge Graph

Focus opens a bounded neighborhood. One step further expands it. The relationship ledger explains incoming and outgoing connections as sentences. Focus here follows an idea; Open note returns to writing. Roadmap shows the broader notebook. Search, topics, dragging, pinning, refresh, and rearrangement remain available.

Follow prerequisites builds a reading path from explicit prerequisite links. Cycles stop the ordered-path feature. No curriculum or mastery claim is inferred. On phones the graph becomes a concept list with the same relationship details.

## Podcast

Draft conversational podcast uses the selected text model to write a single-host script with a hook, examples, misconceptions, recall questions, and recap. Review and edit it before generating audio.

Generate Hermes voice invokes Hermes's actual speech function and configured voice. The verified Edge voice is `en-US-AriaNeural`. Edge speech sends script text to Microsoft's online service; text AI can remain local. Run `Setup Hermes voice.cmd` once on a fresh install. Its released compatibility dependency is isolated from Hermes's global installation. Windows offline speech remains an explicit alternative. Voice quality and factual accuracy still need your judgment.

Audio generation and Telegram delivery are separate actions. Delivery requires explicit approval and records a receipt. Listening never counts as recall practice.

## Markdown and Vercel

New files use YAML metadata, `format: 2`, a body marker, and Markdown. Variants/drawings use readable fenced directives. Pastel marks use safe HTML spans. Image resize hints use the image title. Other editors need directive support for identical interactive rendering. Hosted pairing tokens are stripped from stored attachment URLs.

Vercel hosts only the frontend. Start the local app, generate an origin-specific code in local Settings, and pair the deployed site on that computer. Browser local network permission may be required. Access expires after 12 hours or a server restart and can be revoked. The vault stays on your drive. This does not provide cloud storage or cross-device synchronization. Back up the whole vault, including state, history, attachments, drawings, and audio.
