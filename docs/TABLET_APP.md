# Synapse on iPad and Android

Synapse 1.5 provides an installable tablet notebook at `/tablet/`. The Windows app remains the full workspace. Both use editable text, canvas objects and pen strokes.

## Install

Open the published Synapse site followed by `/tablet/` in Safari on iPad or Chrome on Android. Wait for the offline-ready message. On iPad choose Share, then Add to Home Screen. On Android choose Install app in the browser menu. Open the installed icon once online, since browser and installed-app storage can be separate on iPad.

Write normally, choose Pen for handwriting, or Text to place writing on the sheet. Pencil ink uses pen input and leaves fingers for scrolling. Choose Finger ink for a stylus that behaves like a finger. Select mode permits finger selection and movement. Pinch zoom is browser zoom; the sheet can also scroll horizontally. A toolbar button cycles Light, Dark, Paper and Dotted. Pen colour is preserved in saved strokes. Undo and redo remain in the notebook toolbar.

## Connect Windows once

1. Update Windows Synapse to 1.5 or later and keep it open.
2. In Windows Settings, find **Connect a device** and choose **Show pairing QR code**.
3. On the tablet open **Connect & backup**, choose **Scan PC QR code**, and point the camera at the screen.
4. Choose **Approve and connect** on the tablet. Synapse remembers the connection.

The QR code expires after five minutes and can be used once. If camera access is unavailable, choose **Use a pairing link instead** on Windows and paste the link into the tablet's matching option. You can revoke a device in Windows Settings. Existing 1.4 direct connections still work under Advanced direct connection; scan a QR code to switch.

No VPN, IP address or router configuration is needed. QR sync uses an internet relay on both local Wi-Fi and remote networks, so both devices need internet and the PC must be awake with Synapse open. Offline writing and drawing still work without it.

Notes are encrypted on the sending device with keys derived using P-256 ECDH and HKDF-SHA-256, then AES-256-GCM. Only the paired devices hold the private keys. The relay forwards encrypted chunks without storing note content. It stores connection metadata and hashed access credentials. Metadata is not anonymous: the service sees network addresses, room/device identifiers and transfer timing. Treat the vault's .synapse configuration folder as private, since it contains the PC connection identity.

## What sync means

While the app is open, queued changes upload and new PC versions download approximately every two seconds. Slow networks, large attachments or an unreachable PC increase the delay. Changes continue saving locally without a connection and retry when it returns. This is revision-based sync, not simultaneous collaborative editing. Conflicting edits create a separate device conflict copy instead of overwriting the PC page.

A late response cannot erase writing made during that request. Repeated requests do not duplicate a saved page. Clean pages removed on the PC disappear from the active tablet page list, but their local recovery content remains in backups. An edited offline copy of a removed page returns as a conflict copy.

## Files and recovery

On Windows, notes remain Markdown files in the selected vault, with editable canvas metadata and separate attachments. On tablets, the browser stores pages and attachments locally in IndexedDB and Cache Storage. This does not give a website unrestricted access to an iPad folder.

Use **Export backup** regularly and before clearing browser data. **Import backup** creates new restored pages and preserves existing pages. The JSON backup includes editable stroke coordinates, notes and cached attachments. It does not contain PC API keys, provider configuration or the device token. Image/PDF uploads are limited to 5 MB each. PC attachments up to 20 MB are cached for offline viewing. A full browser backup is limited to 90 MB of attachment data.

Imported backup pages get new IDs. Existing embedded diagram assets can be viewed offline; editable Excalidraw diagram authoring and AI functions remain in Windows. Pen strokes drawn on the tablet are fully editable canvas objects on both sides. Backups containing diagram assets originally from another PC do not currently upload those diagram files to a different vault.

## Practical limits

- Browser storage persistence is requested, but the OS can still clear app data. Keep backups and sync.
- iPadOS and Android can suspend an app in the background. Reopen it to resume sync.
- An Apple Pencil or Android pen can report hardware pressure. A finger or basic capacitive stylus uses subtle speed-based stroke variation instead.
- Drawing batches previews per animation frame, uses coalesced pen samples, and saves completed gestures locally. Physical-device latency and palm rejection still need testing with the exact stylus.
- The public website hosts application files. Personal notes sync through your paired private PC connection.
