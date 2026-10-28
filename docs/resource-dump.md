# Resource dump

Status: implemented in the working project, not released in the installed Windows app yet.

Resource dump keeps study material in one place. Open it from the sidebar, choose Add resource for a link or text, or Upload file for a PDF, image, document text, audio or video. YouTube, Instagram and LinkedIn URLs can be saved without extracting their content. A name is optional for links.

Use Bookmark to keep favourites, and search to find a resource. Choose a note under Attach to note, then Attach. One resource can belong to several notes. The In notes buttons return to those pages. In a note, expand Files & links to open the original, or insert a supported video preview onto the canvas.

Click a video thumbnail to open its embedded player. Open original remains available if playback is unavailable. Previews stretch with their canvas objects rather than cropping. Drag and resize using the object's small handles. Playback is loaded on demand.

Saving the exact same URL again opens its existing entry. Bookmarks and attachments are preserved. Archive hides a resource without removing its file or its references in notes; use Archived to restore it.

## Local storage

The library uses the existing sources collection in the vault's .synapse/state.json. Files remain in attachments/. Notes store source IDs in their Markdown metadata, so attaching a resource does not copy the original. Inbox and Resource dump refer to this same collection.

Library link capture does not run extraction or AI automatically. Existing extraction and comparison tools remain explicit actions. Uploads retain the existing supported-file allowlist and 40 MB limit. Private or restricted posts may need to be opened at their original site.

## Validation and current limits

154 automated tests passed, including URL reuse, bookmark persistence, duplicate-free attachment, concurrent attachment and thumbnail playback state. TypeScript and the production build passed. Browser review confirmed YouTube playback from both the library and a note canvas, saved attachment navigation, autosave, empty search feedback, and the layout at desktop and 600 px widths. No browser console errors were observed on that route.

Instagram embed playback has not been verified with a real user post. The standalone tablet PWA does not yet have the Resource dump screen or library sync. Resource dump is packaged in version 1.6.0 alongside Google account collaboration. The full current suite passes 169 tests.
