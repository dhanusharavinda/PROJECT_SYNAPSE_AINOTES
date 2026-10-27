# Write, draw, and arrange on one page

Synapse 1.1 adds a notebook sheet to the normal Markdown editor. Install the new version to use these changes in the desktop app.

## Writing and drawing

Write normally in the main note. Choose **Pen** to draw directly on the sheet, **Arrow** for a connector, or **Shape** for a rectangle. Choose **Text box** and click anywhere to write beside a picture or drawing. **Table** places an editable table. No drawing window opens for these tools.

Choose **Move**, or grab an image or drawing, to reposition an object. A selected object shows a grip and a resize corner. Its small toolbar can duplicate it, bring it forward, send it backward, delete it, or add writing beside it. Objects may overlap. Arrow keys move a selected object; Shift moves it farther. Delete removes it. Undo and Redo in the sheet toolbar reverse object changes. Normal writing retains its own text undo history.

The page grows as needed. **More paper** adds space deliberately. New pen strokes keep only their drawn bounds with a small edge. Images start within a 260 by 200 layout box; drawings and flowcharts start within a 300 by 220 layout box. Drag a corner to enlarge them. The image keeps its proportions.

Older inline pictures, drawings, and tables have a **Move freely** action. Selected paragraphs can use **Move writing freely** from the right-click menu. This moves the writing into a placed text box while preserving its Markdown. Text inside boxes can use normal formatting, lists, code, and tables. On the narrow web companion, placed objects stack for reading. Their saved desktop positions are retained.

## Flowcharts

Use `/flowchart`, `/diagram`, the right-click menu, or **Generate flowchart**. Review the AI draft and accept it before insertion. A flowchart starts compact. Select it and choose **Edit** to customize its shapes and labels inside the note. Save the drawing to return to the page. Exported previews have transparent backgrounds and a tight eight-pixel edge.

## Appearance

The sidebar has Light, Dark, and Paper choices. Paper adds faint notebook ruling. Settings includes Book and Handwritten fonts. Handwritten uses the Windows Segoe Print font. Hiding navigation or connections gives the note the available width, and the choice is remembered.

Optional explanation labels have an underline and no separate fill. Right-click menus keep scrolling inside the menu. File links open their original attachment; PDFs open in a separate document window inside the desktop app so local access stays valid.

## Shortcuts

In Settings, open **Writing & shortcuts**, click a shortcut, and press a new combination. Defaults are Alt+1 through Alt+4 for the first four text colors, Alt+5 for Pen, Alt+6 for Move, Alt+7 for Text box, Alt+8 for Arrow, and Alt+9 for Table. Modifier keys keep ordinary number typing available. Duplicate shortcuts are rejected. A color shortcut applies to selected text.

## Deleting and recovering notes

Choose **Select notes** beside the sidebar's Notes heading. Check notes, or select all visible notes, then choose Delete. The notes move to **Settings > Trash** and can be restored. The original Markdown and attachments are retained. The note footer can delete one note the same way.

External file changes appear automatically while the app is visible, normally within 2.5 seconds, and when the window regains focus. A stale autosave cannot recreate a deleted note. If an externally deleted note has an unsaved draft, the row disappears and the app offers to save that draft as a new note. Starter notes are created only for a fresh vault, so deleting every note does not recreate the starter set on the next launch.

## Local files

Normal writing stays in the Markdown body. Placed text, tables, geometry, and pen points are stored in the same file's `canvas` metadata. Attachments and editable drawing scenes remain in the vault's attachments and drawings folders. A basic Markdown editor can read the writing and metadata, but Synapse is needed to reconstruct the free layout. Back up the entire vault.

## Smaller desktop package

The package stages only the server dependencies alongside the compiled interface. It excludes source maps, development packages, unused locale packs, duplicate embedded OCR binaries, and an unused language-data variant. Required native OCR, PDF, and video resources remain bundled. Electron is still the largest part of the Windows app.
