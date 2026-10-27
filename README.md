# Synapse

A desktop-first, local study notebook with intentional links, an organized Knowledge Graph, editable drawings, source capture, recall practice, and revision audio.

The current editor includes contextual formatting, optional definition variants, inline transparent drawings, selected-text diagrams, flexible tables, image insertion, subpages, breadcrumbs, and light/dark themes. See [Current editor and graph](docs/EDITOR_V2.md).

Version 1.1 adds a full-width notebook sheet, direct pen and arrow tools, movable writing and tables, compact images and diagrams, Paper mode, a handwritten font option, customizable shortcuts, automatic file refresh, and bulk Trash. See [Notebook sheet](docs/NOTEBOOK_SHEET.md).

The Windows app is the main Synapse product. It runs the notebook service inside the app and keeps the vault in a separate folder, normally `Documents\Synapse`. The optional Vercel companion can still connect to a running local service, but it is not required for ordinary use. The vault is never packaged into the installer.

## iPad and Android notebook

Version 1.4 adds an installable PWA at `/tablet/`: offline writing and drawing, local backups, and paired private sync with Windows. See [Tablet installation and sync](docs/TABLET_APP.md).

## Install the Windows app

Download `Synapse-Setup-<version>.exe` from GitHub Releases and run it. On first launch, choose one of these options:

1. Create a new vault in `Documents\Synapse`.
2. Choose an existing Synapse vault.

Install the app once. Published GitHub updates appear inside Synapse; choose Download, then Restart and update. Notes remain in the vault during an update. Until the Windows installer is code signed, Windows may show a SmartScreen warning. See [Desktop app and updates](docs/DESKTOP_APP.md) and [Send Synapse to someone](docs/SHARE_THE_APP.md).

## Start

For contributors:

1. Install Node.js 22 or later.
2. Run `npm install` in this folder.
3. Run `npm run dev` and open `http://127.0.0.1:4317`.
4. For production, run `npm run build`, then `npm start`.

In the installed app, your notes live in `<your vault>\notes`. In contributor mode they default to `vault\notes`. Keep backups of the entire vault folder. Use Settings for a replacement OpenAI key or a local Ollama model. No API key is needed for notes, manual links, drawings, graph, source text/PDF capture, practice, or local Windows speech.

## Build the Windows installer

Run `powershell -ExecutionPolicy Bypass -File scripts\create-desktop-icon.ps1`, then `npm run desktop:installer`. The installer, update manifest, and block map are written to `release\`. Upload all three to a GitHub Release whose tag matches the `package.json` version. A ready-to-enable GitHub Actions template is stored at `docs/desktop-release-workflow.example.yml`.

See `docs/PROJECT_SPECIFICATION.md` for the full agreement, implementation boundaries, and acceptance criteria. See `docs/USER_GUIDE.md` for workflows and limitations.
