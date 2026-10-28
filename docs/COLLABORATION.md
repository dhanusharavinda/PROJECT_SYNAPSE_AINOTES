# Collaboration in Synapse

Status: version 1.6.0. Real Google sign-in, the localhost return callback and an encrypted account relay edit were verified on 2026-10-28. Physical multi-PC testing remains pending.

## Simple explanation

Open Shared with you and sign in. In a note, choose Collaborators, enter another person's Google email and choose Can view or Can edit. Their app lists the invitation in Shared with you. Shared pages use the notebook canvas inside Synapse.

The first account invitation replaces older access links for that page. Private notes stay private. Sharing includes that page and its attached files, so add people deliberately. Only the owner can change permissions.

Your PC remains the main copy. It must stay awake with Synapse open and connected to the internet. The connection service keeps account sessions and invitation metadata, including page title, owner and member emails. Page contents travel encrypted between devices and the owner PC. This version does not provide offline collaborative merging while the owner is unavailable.

## Editing together

Different text blocks or canvas objects can be edited at the same time. A name and coloured outline show the block or object another person is editing. Each block has a short editing lease, renewed while active. This is block presence, not a character-by-character shared caret.

Edits autosave after a short pause. Other users receive updates through a 1.5-second snapshot interval. A stale or conflicting edit is rejected and the local draft remains available. Drafts can be restored on reopening or downloaded as JSON before reloading the saved version. Undo changes the objects affected by your own action and preserves newer remote object edits.

Viewers cannot acquire editing leases, modify objects, upload files or invite others. File access is restricted to the page's trusted initial attachments and its source/drawing metadata. Inserting a private attachment path into editable text does not grant access to that file.

Shared image, PDF and text uploads currently have a 5 MB limit. Shared file downloads have a 20 MB limit. AI actions and creating pages remain in the owner notebook. Native canvas drawing, shapes, tables and media previews work in shared editing.

## Sign-in setup

Cloudflare Access checkout was abandoned after the user cancelled that route. The existing Cloudflare Workers relay is retained. Google Identity Services is the new sign-in implementation. No Google password, API secret or token belongs in source.

A Google Cloud project named Synapse Notes and a Web application OAuth client are configured. The user accepted the Google agreement and completed sign-in in a regular browser. The deployed relay uses the public client ID. No client secret is used.

The authorized JavaScript origin is:

https://project-synapse-ainotes.vercel.app

Only basic Google identity is used. This implementation currently accepts verified Gmail and Google Workspace addresses. Configure its public client ID as GOOGLE_CLIENT_ID on the relay Worker. No client secret is needed by the sign-in page. The public /signin/ route loads Google's official sign-in script, verifies the identity through the relay, and returns a one-use, nonce-bound sign-in result to the local app. The browser may ask for permission to connect to the local app.

Account sessions are random, stored as hashes in the relay and revocable at sign-out. The local app stores its session under the vault's private .synapse account settings. Account credentials are not included in note Markdown. Account-backed collaboration uses a separate permission path from full-vault device pairing.

## Validation

169 tests passed in 22 suites. TypeScript passed for the app and relay. The production build passed. Tests cover Google token signature/issuer/audience/expiry checks with synthetic signing keys, one-use nonce-bound sign-in callbacks, recipient filtering, viewer/editor enforcement, revocation, private-file path rejection, encrypted collaboration packet routing, stale-edit preservation, local draft recovery storage, concurrent resource attachments, filename rename/trash/restore and collaborative undo.

An isolated browser notebook with two synthetic identities demonstrated text changes arriving in the other view, object-level presence and editing locks. A paint-bucket fill was also verified visually. Separately, a real Google session completed the public sign-in and localhost callback. A disposable owner-only page passed invitation publication, encrypted snapshot retrieval, an editing lease and an encrypted edit persisted to Markdown through the deployed Cloudflare relay. This does not replace testing two physical PCs.

## Remaining validation

Test sharing between two physical PCs. The standalone tablet PWA does not yet expose the new account collaboration screens. Instagram playback still needs verification with a real user post. Invitation metadata cleanup after trash/reset and expiring transport renewal are implemented and covered by isolated tests. The Windows installer was built and its update manifest and runtime dependencies checked. Native executable startup testing was blocked by automatic approval review, so no successful native startup is claimed.
