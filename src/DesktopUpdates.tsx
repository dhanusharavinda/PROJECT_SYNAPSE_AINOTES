import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import type { UpdateBridge, UpdateState } from "../desktop/updates";
declare global {
  interface Window {
    synapseEditing?: {
      native: (command: string) => void;
      readClipboard?: () => Promise<string>;
      writeClipboard?: (text: string) => Promise<void>;
      subscribe: (listener: (command: string) => void) => () => void;
    };
    synapseUpdates?: UpdateBridge;
  }
}
export default function DesktopUpdates({
  beforeRestart,
}: {
  beforeRestart: () => Promise<void>;
}) {
  const [state, setState] = useState<UpdateState>();
  const [dismissed, setDismissed] = useState("");
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const bridge = window.synapseUpdates;
    if (!bridge) return;
    let active = true;
    const update = (value: UpdateState) => {
      if (active) {
        setState(value);
        setError("");
        if (value.stage === "checking") setDismissed("");
      }
    };
    const stop = bridge.subscribe(update);
    void bridge
      .state()
      .then(update)
      .catch(() => {});
    return () => {
      active = false;
      stop();
    };
  }, []);
  if (!state?.visible) return null;
  const key = state.stage + ":" + (state.version || "");
  if (dismissed === key) return null;
  async function action(kind: "check" | "download" | "install") {
    try {
      if (kind === "install") {
        setRestarting(true);
        await beforeRestart();
        await window.synapseUpdates!.install();
      } else setState(await window.synapseUpdates![kind]());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestarting(false);
    }
  }
  const message =
    state.stage === "available"
      ? `Synapse ${state.version} is available.`
      : state.stage === "downloading"
        ? `Downloading update: ${Math.round(state.percent || 0)}%`
        : state.stage === "ready"
          ? `Synapse ${state.version} is ready. Your notes stay in place.`
          : state.stage === "checking"
            ? "Checking for updates..."
            : state.stage === "current"
              ? `You're up to date. Synapse ${state.currentVersion}`
              : state.message;
  return (
    <section className="desktop-update" aria-label="App update">
      <div className="desktop-update-copy" role="status" aria-live="polite">
        <strong>{message}</strong>
        {error && <span role="alert">{error}</span>}
        {state.stage === "downloading" && (
          <progress
            value={state.percent || 0}
            max={100}
            aria-label="Update download"
          />
        )}
      </div>
      <div className="desktop-update-actions">
        {state.stage === "available" && (
          <button onClick={() => void action("download")}>
            <Download size={15} />
            Download update
          </button>
        )}
        {state.stage === "ready" && (
          <button disabled={restarting} onClick={() => void action("install")}>
            <RefreshCw size={15} />
            {restarting ? "Saving your note..." : "Restart and update"}
          </button>
        )}
        {state.stage === "error" && (
          <button onClick={() => void action("check")}>Try again</button>
        )}
        <button
          className="icon"
          disabled={restarting}
          aria-label="Dismiss update message"
          title="Later"
          onClick={() => setDismissed(key)}
        >
          <X size={16} />
        </button>
      </div>
    </section>
  );
}
