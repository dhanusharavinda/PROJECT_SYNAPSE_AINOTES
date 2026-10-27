# Write, draw, and arrange on one page

Synapse 1.2 adds a quieter notebook sheet, more reliable movement and keyboard editing, and an All notes page. Use the desktop update controls to install it.

## Writing and drawing

Write normally on existing text. Click blank space, including beside an existing line, to start writing exactly there. Enter moves to the next line. In Paper mode, new writing starts on the nearest ruled row. Choose **Pen** to draw directly on the sheet, **Eraser** to remove parts of pen strokes, or **Arrow** for a connector. The Shapes menu includes rectangle, ellipse, diamond, triangle, and line. **Table** places an editable table. No drawing window opens for these tools. A pen click makes a dot.

Choose **Select** to move objects or drag a box around several. Shift-click adds or removes an object from the selection. Selecting shows a small grip. Right-click for Resize, Duplicate, Delete, stacking order, and other actions. Text formatting and table row/column actions are also in the right-click menu, with no formatting toolbar opening above the writing. Tables resize in both directions, subject to readable cell sizes. Objects may overlap. Arrow keys move selected objects; Shift moves them farther. Delete removes them.

**Ctrl+Z** undoes, **Ctrl+Shift+Z** or **Ctrl+Y** redoes. These work on the active drawing sheet, text, or input field. Drawing and erasing each form one undo step per gesture. While the sheet has focus, **Ctrl+A** selects the entire note, **Ctrl+C** copies, and **Ctrl+V** pastes. Deleting the entire selection can be undone, including the normal writing. The clipboard retains placed layouts within the current running Synapse session; other apps receive text and Markdown. Use vault files to transfer full layouts across sessions.

The page grows as needed. **More paper** adds space deliberately. New pen strokes keep only their drawn bounds with a small edge. Images start within a 240 by 200 layout box; drawings and flowcharts start within a 280 by 200 layout box. Choose Resize from the right-click menu, then drag the corner. Images retain their proportions. Pen input uses coalesced pointer samples and animation-frame rendering. Dragging does not add a toolbar or shift the page.

Older inline pictures, drawings, and tables have a **Move freely** action. Selected paragraphs can use **Move writing freely** from the right-click menu. This moves the writing into a placed text box while preserving its Markdown. Text inside boxes can use normal formatting, lists, code, and tables. On the narrow web companion, placed objects stack for reading. Their saved desktop positions are retained.

## Flowcharts

Use `/flowchart`, `/diagram`, the right-click menu, or **Generate flowchart**. Review the AI draft and accept it before insertion. A flowchart starts compact. Select it and choose **Edit** to customize its shapes and labels inside the note. Save the drawing to return to the page. Exported previews have transparent backgrounds and a tight eight-pixel edge.

## Appearance

The sidebar has one theme button. Click it to cycle Light, Dark, and Paper. Paper aligns its rules to the selected writing font's measured baseline. Settings includes Book and Handwritten fonts. Handwritten uses the Windows Segoe Print font. Hiding navigation or connections gives the note the available width. Existing placed objects retain their coordinates, and wide pages can scroll horizontally when side panels are open.

Optional explanation labels have an underline and no separate fill. Right-click menus keep scrolling inside the menu. File links open their original attachment; PDFs open in a separate document window inside the desktop app so local access stays valid.

## Shortcuts

In Settings, open **Writing & shortcuts**, find a feature, click its shortcut, and press new keys. Backspace clears an assignment. The catalog includes writing formats, drawing tools, shapes, colors, lists, files, flowcharts, page actions, navigation, and saving. Defaults include Alt+1 through Alt+4 for colors, Alt+5 for Pen, Alt+6 for Select, Alt+7 for writing anywhere, Alt+8 for Arrow, and Alt+9 for Table. Single-letter tools work outside text editing. Modified keys can work while writing. Standard undo and clipboard keys retain their normal action; extra bindings can be assigned. Duplicate assignments are rejected.

## Finding notes and adding dates

**All notes** shows the complete notebook in one page. Search by title, meaning, group, or date; filter by group; sort by recent edit, title, or note date. Check multiple notes to delete them together. The notebook breadcrumb returns to this page.

A note's **Page details** includes an optional date. A chosen date appears above the title and in All notes. Clearing it removes the date. New notes can also have a date from the creation dialog. The separate Edited column remains automatic.

## Deleting and recovering notes

Choose **Select notes** beside the sidebar's Notes heading. Check notes, or select all visible notes, then choose Delete. The notes move to **Settings > Trash** and can be restored. The original Markdown and attachments are retained. The note footer can delete one note the same way.

External file changes appear automatically while the app is visible, normally within 2.5 seconds, and when the window regains focus. A stale autosave cannot recreate a deleted note. If an externally deleted note has an unsaved draft, the row disappears and the app offers to save that draft as a new note. Starter notes are created only for a fresh vault, so deleting every note does not recreate the starter set on the next launch.

## Local files

Normal writing stays in the Markdown body. Placed text, tables, geometry, and pen points are stored in the same file's `canvas` metadata. Version 1.2 saves a pixel coordinate width and converts older relative layouts when edited. Attachments and editable drawing scenes remain in the vault. A basic Markdown editor can read the writing and metadata, but Synapse is needed to reconstruct the free layout. Back up the entire vault.

The old missing separators between code, paragraphs, and drawings are repaired for display without deleting the original files. Alternative explanations render as expandable blocks in shared notes. Saving preserves previous versions in history. Shared canvas files are limited to files explicitly referenced by that note. The Knowledge Graph keeps a dragged position during polling, saves positions separately for its views, and exports real Markdown note paths.

## Smaller desktop package

The package stages only the server dependencies alongside the compiled interface. It excludes source maps, development packages, unused locale packs, duplicate embedded OCR binaries, and an unused language-data variant. Required native OCR, PDF, and video resources remain bundled. Electron is still the largest part of the Windows app.
