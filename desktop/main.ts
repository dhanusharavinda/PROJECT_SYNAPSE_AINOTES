import {
  app as electronApp,
  BrowserWindow,
  dialog,
  ipcMain,
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
import { createUpdates } from "./updates.js";

const { autoUpdater } = electronUpdater;
if (process.env.SYNAPSE_DESKTOP_PROFILE)
  electronApp.setPath(
    "userData",
    path.resolve(process.env.SYNAPSE_DESKTOP_PROFILE),
  );
let mainWindow: BrowserWindow | null = null;
let httpServer: Server | null = null;
let vaultLock: NetServer | null = null;
let currentVault = "";
let updates: ReturnType<typeof createUpdates> | undefined;

type DesktopConfig = { vaultPath?: string; port?: number };

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
  await saveConfig({ ...(await readConfig()), vaultPath: selected });
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
  const config = await readConfig();
  const preferredPort =
    Number.isInteger(config.port) && config.port! > 1024 && config.port! < 65536
      ? config.port!
      : 0;
  return new Promise<{ url: string }>((resolve, reject) => {
    const listen = (port: number) => {
      httpServer = app.listen(port, "127.0.0.1", async () => {
        const address = httpServer!.address();
        if (!address || typeof address === "string") {
          reject(new Error("Synapse could not determine its local port."));
          return;
        }
        try {
          await saveConfig({ ...(await readConfig()), port: address.port });
          resolve({ url: `http://127.0.0.1:${address.port}` });
        } catch (error) {
          reject(error);
        }
      });
      httpServer.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE" && port !== 0) listen(0);
        else reject(error);
      });
    };
    listen(preferredPort);
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
      preload: path.join(
        electronApp.getAppPath(),
        "desktop-dist",
        "preload.cjs",
      ),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    try {
      const attachment = new URL(target);
      if (
        attachment.origin === localOrigin &&
        /^\/files\/(attachments|audio)\/[-a-zA-Z0-9]+\.[a-z0-9]+$/.test(
          attachment.pathname,
        )
      )
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 1100,
            height: 800,
            autoHideMenuBar: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
    } catch {}
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-create-window", (window) => {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, target) => {
      if (new URL(target).origin !== localOrigin) event.preventDefault();
    });
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    try {
      if (new URL(target).origin !== localOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.once("ready-to-show", () => {
    if (process.env.SYNAPSE_DESKTOP_HIDDEN !== "1") mainWindow?.show();
  });
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
      "openDirectory" | "createDirectory"
    )[],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return;
  await saveConfig({ ...(await readConfig()), vaultPath: result.filePaths[0] });
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
              if (!electronApp.isPackaged) {
                void dialog.showMessageBox({
                  type: "info",
                  message: "Updates are checked in the installed Synapse app.",
                });
                return;
              }
              void updates?.check(true);
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
  updates = createUpdates(autoUpdater, electronApp.getVersion(), (state) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("synapse:update-state", state);
  });
  ipcMain.handle("synapse:updates", (event, action: string) => {
    if (
      event.sender !== mainWindow?.webContents ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error(
        "Updates are available only in the main notebook window.",
      );
    if (action === "state") return updates!.state();
    if (action === "check") return updates!.check(true);
    if (action === "download") return updates!.download();
    if (action === "install") {
      // Let the IPC reply reach the renderer before the updater closes it.
      if (updates!.state().stage !== "ready")
        throw new Error("Download the update first.");
      setTimeout(() => updates!.install(), 100);
      return;
    }
    throw new Error("Unknown update action.");
  });
  setTimeout(() => void updates?.check(), 5000);
  setInterval(() => void updates?.check(), 6 * 60 * 60 * 1000).unref();
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
  electronApp.on("will-quit", () => {
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
      if (process.env.SYNAPSE_DESKTOP_READY_FILE)
        await fs.writeFile(
          process.env.SYNAPSE_DESKTOP_READY_FILE,
          JSON.stringify({ url, vault: currentVault }),
        );
      const origin = new URL(url).origin;
      const clipboardPermission = (
        permission: string,
        requestingUrl: string,
      ) => {
        try {
          return (
            ["clipboard-read", "clipboard-sanitized-write"].includes(
              permission,
            ) && new URL(requestingUrl).origin === origin
          );
        } catch {
          return false;
        }
      };
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) => {
          callback(
            contents === mainWindow?.webContents &&
              clipboardPermission(permission, details.requestingUrl),
          );
        },
      );
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission, requestingOrigin) =>
          contents === mainWindow?.webContents &&
          clipboardPermission(permission, requestingOrigin),
      );
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
