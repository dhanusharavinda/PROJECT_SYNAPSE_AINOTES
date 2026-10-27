import {
  app as electronApp,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  session,
  shell,
} from "electron";
import electronUpdater from "electron-updater";
import express from "express";
import fs from "node:fs/promises";
import net, { type Server as NetServer } from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../server/app.js";
import { seed } from "../server/seed.js";

const { autoUpdater } = electronUpdater;
let mainWindow: BrowserWindow | null = null;
let httpServer: Server | null = null;
let vaultLock: NetServer | null = null;
let currentVault = "";
let manualUpdateCheck = false;

type DesktopConfig = { vaultPath?: string };

function configFile() {
  return path.join(electronApp.getPath("userData"), "desktop.json");
}

async function readConfig(): Promise<DesktopConfig> {
  try {
    return JSON.parse(await fs.readFile(configFile(), "utf8"));
  } catch {
    return {};
  }
}

async function saveConfig(config: DesktopConfig) {
  await fs.mkdir(path.dirname(configFile()), { recursive: true });
  await fs.writeFile(configFile(), JSON.stringify(config, null, 2), "utf8");
}

async function chooseVault(): Promise<string | null> {
  const fromEnvironment = process.env.SYNAPSE_VAULT?.trim();
  if (fromEnvironment) return path.resolve(fromEnvironment);

  const saved = (await readConfig()).vaultPath;
  if (saved) return path.resolve(saved);

  const result = await dialog.showMessageBox({
    type: "question",
    title: "Choose your Synapse vault",
    message: "Where should Synapse store your notes?",
    detail:
      "The vault stays outside the app, so updates do not replace your notes. You can back it up or open the Markdown files in another editor.",
    buttons: ["Create in Documents", "Choose a folder", "Quit"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (result.response === 2) return null;
  let selected = path.join(electronApp.getPath("documents"), "Synapse");
  if (result.response === 1) {
    const folder = await dialog.showOpenDialog({
      title: "Choose a Synapse vault",
      properties: ["openDirectory", "createDirectory"],
    });
    if (folder.canceled || !folder.filePaths[0]) return null;
    selected = folder.filePaths[0];
  }
  await saveConfig({ vaultPath: selected });
  return selected;
}

async function acquireVaultLock(vault: string) {
  if (process.platform !== "win32") return;
  const canonical = await fs.realpath(vault);
  const pipe =
    "\\\\.\\pipe\\synapse-vault-" +
    crypto
      .createHash("sha256")
      .update(canonical.toLowerCase())
      .digest("hex")
      .slice(0, 24);
  vaultLock = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve, reject) => {
    vaultLock!.once("error", reject);
    vaultLock!.listen(pipe, () => {
      vaultLock!.removeListener("error", reject);
      resolve();
    });
  });
}

async function startNotebook(vault: string) {
  await fs.mkdir(vault, { recursive: true });
  await acquireVaultLock(vault);
  process.env.SYNAPSE_APP_ROOT = electronApp.getAppPath();
  process.env.SYNAPSE_RESOURCES_PATH = process.resourcesPath;
  const { app, vault: notebook, errors } = await createApp(vault);
  await seed(notebook);
  const staticRoot = path.join(electronApp.getAppPath(), "dist");
  await fs.access(path.join(staticRoot, "index.html"));
  app.use(express.static(staticRoot));
  app.get("/{*path}", (_request, response) =>
    response.sendFile(path.join(staticRoot, "index.html")),
  );
  app.use(errors);
  return new Promise<{ url: string }>((resolve, reject) => {
    httpServer = app.listen(0, "127.0.0.1", () => {
      const address = httpServer!.address();
      if (!address || typeof address === "string") {
        reject(new Error("Synapse could not determine its local port."));
        return;
      }
      resolve({ url: `http://127.0.0.1:${address.port}` });
    });
    httpServer.once("error", reject);
  });
}

function createWindow(url: string) {
  const localOrigin = new URL(url).origin;
  const iconPath = path.join(electronApp.getAppPath(), "build", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#f6f6f0",
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    try {
      if (new URL(target).origin !== localOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(url);
}

async function switchVault() {
  const options = {
    title: "Choose a Synapse vault",
    defaultPath: currentVault,
    properties: ["openDirectory", "createDirectory"] as (
      | "openDirectory"
      | "createDirectory"
    )[],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return;
  await saveConfig({ vaultPath: result.filePaths[0] });
  electronApp.relaunch();
  electronApp.exit(0);
}

function installMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          {
            label: "Open vault folder",
            accelerator: "CmdOrCtrl+Shift+O",
            click: () => void shell.openPath(currentVault),
          },
          { label: "Switch vault", click: () => void switchVault() },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "togglefullscreen" },
          { type: "separator" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "resetZoom" },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "Check for updates",
            click: () => {
              manualUpdateCheck = true;
              if (!electronApp.isPackaged) {
                void dialog.showMessageBox({
                  type: "info",
                  message: "Updates are checked in the installed Synapse app.",
                });
                return;
              }
              void autoUpdater.checkForUpdates();
            },
          },
          {
            label: "Synapse on GitHub",
            click: () =>
              void shell.openExternal(
                "https://github.com/dhanusharavinda/PROJECT_SYNAPSE_AINOTES",
              ),
          },
        ],
      },
    ]),
  );
}

function configureUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-not-available", () => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    void dialog.showMessageBox({
      type: "info",
      title: "Synapse is up to date",
      message: "You already have the newest available version.",
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    manualUpdateCheck = false;
    void dialog
      .showMessageBox({
        type: "info",
        title: "Synapse update ready",
        message: `Synapse ${info.version} is ready to install.`,
        detail: "Your vault will stay in place. Restart Synapse to finish.",
        buttons: ["Restart and update", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
  });
  autoUpdater.on("error", (error) => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    void dialog.showMessageBox({
      type: "error",
      title: "Update check failed",
      message: "Synapse could not check for an update.",
      detail: error.message,
    });
  });
  setTimeout(() => void autoUpdater.checkForUpdates(), 5000);
}

async function runSmokeCheck(url: string, target: string) {
  const home = await fetch(url);
  const cookie = home.headers.get("set-cookie")?.split(";")[0] || "";
  const bootstrap = await fetch(url + "/api/bootstrap", {
    headers: { cookie },
  });
  const data = await bootstrap.json();
  await fs.writeFile(
    target,
    JSON.stringify(
      {
        ok: home.ok && bootstrap.ok && Array.isArray(data.notes),
        homeStatus: home.status,
        apiStatus: bootstrap.status,
        noteCount: Array.isArray(data.notes) ? data.notes.length : 0,
        vault: currentVault,
      },
      null,
      2,
    ),
    "utf8",
  );
  electronApp.quit();
}

if (!electronApp.requestSingleInstanceLock()) {
  electronApp.quit();
} else {
  electronApp.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  electronApp.on("window-all-closed", () => electronApp.quit());
  electronApp.on("before-quit", () => {
    httpServer?.close();
    vaultLock?.close();
  });
  electronApp.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.dhanusharavinda.synapse");
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    try {
      const vault = await chooseVault();
      if (!vault) {
        electronApp.quit();
        return;
      }
      currentVault = path.resolve(vault);
      const { url } = await startNotebook(currentVault);
      const smokeTarget = process.env.SYNAPSE_DESKTOP_SMOKE_FILE;
      if (smokeTarget) {
        await runSmokeCheck(url, smokeTarget);
        return;
      }
      installMenu();
      createWindow(url);
      if (electronApp.isPackaged) configureUpdates();
    } catch (error) {
      await dialog.showMessageBox({
        type: "error",
        title: "Synapse could not open",
        message: "The selected vault could not be opened.",
        detail:
          error instanceof Error
            ? error.message
            : "Close another Synapse window and try again.",
      });
      electronApp.quit();
    }
  });
}
