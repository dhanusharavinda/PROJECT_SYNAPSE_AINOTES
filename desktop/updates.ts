export type UpdateState = {
  stage:
    | "idle"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "ready"
    | "error";
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
  visible: boolean;
};
export interface UpdateBridge {
  state(): Promise<UpdateState>;
  check(): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  install(): Promise<void>;
  subscribe(listener: (state: UpdateState) => void): () => void;
}
interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}
export function createUpdates(
  updater: Updater,
  currentVersion: string,
  publish: (state: UpdateState) => void,
) {
  let state: UpdateState = { stage: "idle", currentVersion, visible: false };
  let checking = false;
  let downloading = false;
  let manual = false;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  const set = (patch: Partial<UpdateState>) => {
    state = { ...state, message: undefined, ...patch };
    publish({ ...state });
  };
  const failed = (error: unknown) => {
    const missing = /No published versions|No releases|latest.*404/i.test(
      String(error),
    );
    set({
      stage: "error",
      percent: undefined,
      visible: manual || downloading,
      message: missing
        ? "No updates have been published yet. Try again later."
        : "Could not reach the update service. Check your connection and try again.",
    });
    checking = downloading = false;
    manual = false;
  };
  updater.on("error", failed);
  updater.on("update-available", (info: { version: string }) => {
    checking = false;
    set({
      stage: "available",
      version: info.version,
      percent: undefined,
      visible: true,
    });
  });
  updater.on("update-not-available", () => {
    checking = false;
    set({
      stage: "current",
      version: undefined,
      percent: undefined,
      visible: manual,
    });
    manual = false;
  });
  updater.on("download-progress", (progress: { percent: number }) => {
    if (downloading)
      set({
        stage: "downloading",
        percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
        visible: true,
      });
  });
  updater.on("update-downloaded", (info: { version: string }) => {
    downloading = false;
    manual = false;
    set({ stage: "ready", version: info.version, percent: 100, visible: true });
  });
  return {
    state: () => ({ ...state }),
    async check(userInitiated = false) {
      if (checking || downloading || state.stage === "ready")
        return { ...state };
      manual = userInitiated;
      checking = true;
      set({ stage: "checking", percent: undefined, visible: userInitiated });
      try {
        await updater.checkForUpdates();
      } catch (error) {
        if (checking) failed(error);
      }
      return { ...state };
    },
    async download() {
      if (state.stage !== "available" || downloading) return { ...state };
      downloading = true;
      set({ stage: "downloading", percent: 0, visible: true });
      // Return immediately so IPC stays responsive while the installer downloads.
      void updater.downloadUpdate().catch((error) => {
        if (downloading) failed(error);
      });
      return { ...state };
    },
    install() {
      if (state.stage !== "ready")
        throw new Error("Download the update before restarting.");
      updater.quitAndInstall();
    },
  };
}
