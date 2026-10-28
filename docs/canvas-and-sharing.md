# Canvas and sharing

## Quick guide

- Hold Ctrl and scroll to zoom. Hold the middle mouse button and move to pan. Click the percentage to reset to 100%.
- Click an object to select it. Use its grip to move it, lower corner to resize it, and circular-arrow handle to rotate it. Choose Select for strokes and overlapping objects. The bin deletes the selection; Ctrl+Z undoes it.
- Highlighters are transparent ink objects underneath text. Choose Pink or Green, draw, then select the stroke to move it. The eraser also works after a stroke is rotated.
- The arrow dropdown chooses straight, curved, elbow or double arrows. It can change selected arrows too.
- Select text and right-click for text colour, background colour, links and list formatting. Background and font colour are independent. Right-click inside an accidental to-do list and choose Remove to-do list.
- Page details includes an existing-group selector as well as a field for new group names. New-page creation also suggests existing groups.

## Resources

Inbox is no longer a navigation destination. Old inbox URLs still open Resource dump. Nothing from the old collection is deleted. The desktop grid shows three columns and nine resources per page, adapting to narrower windows. Click a card to expand its contents and actions.

Uploads already enter the common source collection. The owner bootstrap also indexes web URLs and attachment references found in note bodies and placed objects. It fetches no remote content and runs no AI. Resources remain in the library even if a reference is later removed from a note. Bookmark and archive choices are preserved. Referenced resources show their note associations without silently granting collaborator attachment access. The standalone tablet PWA still uses its existing note/device workflow; it does not expose the desktop Resource dump screen.

On an editable canvas, a video thumbnail selects the object. The separate Play action loads the external player. Select, drag, resize, rotate and delete remain available around that object. In resource details or read-only pages, thumbnail clicks play directly. Some Instagram posts require the original website due to its embedding restrictions.

## Read-only links

Share keeps live account collaboration and read-only snapshots separate. Account collaborators retain the existing owner-PC and block-lock model. A snapshot is an explicitly created copy for anyone with its full link. It is not live collaboration. The cloud service stores ciphertext and owner/expiry metadata; the decryption key stays in the URL fragment and private local link list. The viewer decrypts in the browser. No whole-vault content is uploaded.

Snapshots expire after seven days. The owner can remove them in Share. The reader does not need a Synapse account, and the PC can be offline after publication. Limits are ten active snapshots per account, 2 MB of supported attachments and approximately 2.9 MB of JSON content. Attached images, generated SVG drawings, PDFs and text are supported. External video URLs stay as external media. View-link creation requires a signed-in Google account. Resetting notebook content first revokes recorded active snapshot links, then preserves the existing local reset backup. If revocation cannot reach the service, reset stops rather than claiming that remote copies disappeared.

Anyone with the full snapshot link can forward or save it. Removing the remote link prevents subsequent downloads, not access to copies already saved. Old bearer access links are still disabled once a page uses account collaboration.

## Slides

Choose Slides on a note, or select notes in All notes and choose Export slides. Prepare slides, inspect the previews, then download the PDF. Upload that file manually as a LinkedIn document post. The app does not sign in to LinkedIn or post for you.

The export is a visual capture of the notebook, with up to ten notes and thirty portrait slides. It trims unused trailing canvas height. It may split a long object at a page boundary, and remote images can be unavailable. Videos become previews. Text and links in the PDF are raster images, while the original local Markdown remains editable.

## Verification limits

178 automated checks pass across 24 suites. The live encrypted snapshot service was exercised with a disposable note, opened without sign-in and then revoked. No private user note was published during testing. The corrected single-page PDF was downloaded and rendered with Poppler. Native executable launch remains blocked by the earlier automatic approval decision; no successful installed-runtime startup is claimed. Physical multi-PC collaboration and stylus performance still need device-level acceptance.
