# Synapse desktop app and updates

## The simple version

Synapse is installed once. Your notes are not stored inside the app. They are stored in a vault folder that you choose, normally `Documents\Synapse`.

When a new version is published, Synapse checks GitHub Releases, downloads it, and asks you to restart. You do not need to send every user a new installer manually. Sending the release link is still useful for people who have not installed Synapse yet.

## First launch

The app offers two choices:

1. Create a new vault in `Documents\Synapse`.
2. Choose an existing vault, including a vault copied from another computer.

The selection is saved for the current Windows account. Use **File > Switch vault** later. Use **File > Open vault folder** to see and back up the files.

## What an update changes

An update replaces application files only. It does not replace the vault. The vault contains:

- Markdown notes in `notes\`
- uploaded files in `attachments\`
- drawings in `drawings\`
- audio in `audio\`
- local app state and history in `.synapse\`

Uninstalling Synapse also leaves the vault in place. The installer is configured to keep the app settings directory during uninstall, but the vault should still be backed up independently.

## Publishing an update

1. Change the version in `package.json`, for example from `1.0.0` to `1.0.1`.
2. Commit and push the tested change.
3. Build with `npm run desktop:installer`.
4. Create the matching GitHub Release, for example `v1.0.1`, and attach `Synapse-Setup-1.0.1.exe`, its block map, and `latest.yml` from `release\`.
5. Installed apps discover the release automatically. A user can also choose **Help > Check for updates**.

For automatic release creation, copy `docs/desktop-release-workflow.example.yml` to `.github/workflows/desktop-release.yml`. Pushing workflow files requires a GitHub login with the `workflow` permission. The current repository login can push code but does not have that permission, so the template is deliberately inactive.

The app downloads public releases without an API key. GitHub Actions uses its repository release permission to upload artifacts.

## Windows code signing

Auto-update support is implemented, but public distribution should use a Windows code-signing certificate. Signing proves that updates come from the same publisher and reduces Windows SmartScreen warnings.

Add these encrypted GitHub repository secrets before a public release:

- `WINDOWS_CERTIFICATE`: the Base64-encoded PFX certificate
- `WINDOWS_CERTIFICATE_PASSWORD`: its password

Never commit the certificate or password. If the secrets are absent, the workflow can build an unsigned installer, but users may see a Windows warning and should verify the release source carefully.

## Developer commands

- `npm run check`: strict TypeScript check
- `npm test`: automated tests
- `npm run build`: production web assets
- `npm run desktop:compile`: desktop main process
- `npm run desktop:unpacked`: unpacked Windows app for local inspection
- `npm run desktop:installer`: distributable Windows installer

The desktop process starts the existing Express service on a loopback port and remembers it for the next launch so local appearance preferences survive restarts. If that port is busy, it chooses a new one. It does not expose the notebook on the network. The BrowserWindow has Node integration disabled, context isolation and sandboxing enabled, and external navigation blocked. Clipboard access is restricted to the notebook's own origin; other browser permissions are denied.
