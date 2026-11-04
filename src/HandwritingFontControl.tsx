import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { handwritingFont } from "./handwritingFont";
import "./handwriting-font.css";

export default function HandwritingFontControl({
  onImported,
}: {
  onImported?: () => void;
}) {
  const state = useSyncExternalStore(
    handwritingFont.subscribe,
    handwritingFont.getSnapshot,
  );
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void handwritingFont.initialize();
  }, []);
  return (
    <details className="handwriting-font-control">
      <summary>My handwriting font</summary>
      <div className="handwriting-font-options">
        <p>
          Import a font made from your handwriting. It stays on this device. A
          photo alone does not contain a complete alphabet.
        </p>
        <span className="handwriting-font-name">
          {state.name || "Default handwriting"}
        </span>
        <input
          ref={input}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          aria-label="Import handwriting font"
          hidden
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              await handwritingFont.importFont(file);
              onImported?.();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <div className="handwriting-font-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy
              ? "Loading font…"
              : state.name
                ? "Replace font"
                : "Import font"}
          </button>
          {(state.name || state.error) && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await handwritingFont.remove();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Use default
            </button>
          )}
        </div>
        {(error || state.error) && <p role="alert">{error || state.error}</p>}
      </div>
    </details>
  );
}
