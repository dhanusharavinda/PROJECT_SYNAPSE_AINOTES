import { useState } from "react";
import {
  ShieldCheck,
  FolderOpen,
  Check,
  RefreshCw,
  KeyRound,
  Layers,
} from "lucide-react";
import { api, hosted } from "./api";
import { Busy } from "./ui";
import type { Bootstrap, Note } from "./types";
import {
  usePreferences,
  savePreferences,
  shortcutDefaults,
  shortcutLabels,
  keyCombination,
} from "./preferences";
export default function Settings({
  data,
  refresh,
  notify,
}: {
  data: Bootstrap;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [form, setForm] = useState({
    ...data.config,
    openaiKey: "",
    telegramToken: "",
    telegramChat: "",
  });
  const [busy, setBusy] = useState(false);
  const [archived, setArchived] = useState<Note[]>([]);
  const [trashed, setTrashed] = useState<Note[]>([]);
  const preferences = usePreferences();
  const [shortcutQuery, setShortcutQuery] = useState("");
  const [pairOrigin, setPairOrigin] = useState("");
  const [pairing, setPairing] = useState<{
    origin: string;
    code: string;
    expires: string;
  }>();
  function update(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function save() {
    setBusy(true);
    try {
      await api("/settings", form, "PUT");
      await refresh();
      setForm((f) => ({
        ...f,
        openaiKey: "",
        telegramToken: "",
        telegramChat: "",
      }));
      notify("Settings saved. Secrets encrypted for this Windows account.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace-page settings-page">
      <header className="page-heading">
        <div>
          <h1>
            Settings<span className="title-dot">.</span>
          </h1>
          <p>Local by default. External services only when you choose them.</p>
        </div>
        <ShieldCheck size={32} strokeWidth={1} />
      </header>
      <div className="settings-grid">
        <section className="settings-card notebook-preferences">
          <h3>Writing & shortcuts</h3>
          <p className="small muted">
            Choose a feature and press your keys. Backspace clears a shortcut.
            Single keys work outside writing. Use Ctrl or Alt while typing.
          </p>
          <div className="shortcut-list">
            <input
              aria-label="Find shortcut feature"
              placeholder="Find a feature"
              value={shortcutQuery}
              onChange={(e) => setShortcutQuery(e.target.value)}
            />
            {Object.keys(shortcutDefaults)
              .filter((key) =>
                shortcutLabels[key]
                  .toLowerCase()
                  .includes(shortcutQuery.toLowerCase()),
              )
              .map((key) => (
                <label key={key}>
                  {shortcutLabels[key]}
                  <input
                    aria-label={shortcutLabels[key] + " shortcut"}
                    readOnly
                    value={preferences.shortcuts[key] || ""}
                    placeholder="Assign keys"
                    onKeyDown={(e) => {
                      if (e.key === "Tab") return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (["Backspace", "Delete"].includes(e.key)) {
                        savePreferences({
                          ...preferences,
                          shortcuts: { ...preferences.shortcuts, [key]: "" },
                        });
                        return;
                      }
                      const shortcut = keyCombination(e);
                      if (!shortcut) return;
                      const reserved = Object.entries(shortcutDefaults).find(
                        ([id, value]) =>
                          [
                            "undo",
                            "redo",
                            "copy",
                            "cut",
                            "paste",
                            "select-all",
                          ].includes(id) &&
                          value === shortcut &&
                          id !== key,
                      );
                      if (reserved) {
                        notify(
                          "That key keeps its usual editing action. Choose another key.",
                        );
                        return;
                      }
                      if (
                        Object.entries(preferences.shortcuts).some(
                          ([id, value]) => id !== key && value === shortcut,
                        )
                      ) {
                        notify(
                          "That shortcut is already used. Choose another.",
                        );
                        return;
                      }
                      savePreferences({
                        ...preferences,
                        shortcuts: {
                          ...preferences.shortcuts,
                          [key]: shortcut,
                        },
                      });
                    }}
                  />
                </label>
              ))}
          </div>
          <button
            onClick={() =>
              savePreferences({
                ...preferences,
                shortcuts: { ...shortcutDefaults },
              })
            }
          >
            Reset shortcuts
          </button>
        </section>
        <section className="settings-card">
          <h3>
            <FolderOpen size={18} />
            Your local notebook
          </h3>
          <p>
            Markdown files are the source of truth. Copy the whole folder for a
            complete backup.
          </p>
          <code className="path-display">{data.config.vaultPath}</code>
          <p className="muted small">
            Notes, attachments, drawings, audio, and review history stay here.
            Keep this folder on a backed-up drive. Browser storage is not your
            notebook.
          </p>
          <span className="pill">
            {data.config.lan ? "LAN mode enabled" : "Loopback only"}
          </span>
          <h4>Web companion</h4>
          <p className="small muted">
            Connect your Vercel interface on this computer. Your vault stays
            local. Pair only your own Synapse deployment.
          </p>
          {!hosted && (
            <>
              <label>
                Synapse site address
                <input
                  type="url"
                  aria-label="Synapse site address"
                  placeholder="https://your-synapse.vercel.app"
                  value={pairOrigin}
                  onChange={(e) => setPairOrigin(e.target.value)}
                />
              </label>
              <button
                disabled={!pairOrigin.trim() || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setPairing(
                      await api("/pairing", { origin: pairOrigin.trim() }),
                    );
                  } catch (e) {
                    notify((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Generate pairing code
              </button>
              {pairing && (
                <p role="status">
                  Code for {pairing.origin}:{" "}
                  <strong className="pairing-code">{pairing.code}</strong>
                  <br />
                  Expires at {new Date(pairing.expires).toLocaleTimeString()}.
                  Enter it only on that site.
                </p>
              )}
            </>
          )}
          <button
            onClick={async () => {
              try {
                await api("/pairing", undefined, "DELETE");
                setPairing(undefined);
                notify("Web companion access revoked.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Revoke web companion access
          </button>
          <h4>Sharing beyond this computer</h4>
          <p className="small muted">
            Start with --lan and set SYNAPSE_ALLOWED_HOSTS to the computer’s LAN
            IP to allow local network access. Only scoped share links work
            remotely. Do not expose the server directly to the internet. A
            secure remote host or VPN needs separate setup.
          </p>
        </section>
        <section className="settings-card">
          <h3>
            <Layers size={18} />
            AI provider
          </h3>
          <label>
            Text AI
            <select
              value={form.provider}
              onChange={(e) => update("provider", e.target.value)}
            >
              <option value="none">Disabled, manual notebook</option>
              <option value="openai">OpenAI, cloud API</option>
              <option value="ollama">Ollama, local model</option>
            </select>
          </label>
          <label>
            OpenAI model
            <input
              value={form.model}
              onChange={(e) => update("model", e.target.value)}
            />
          </label>
          <label>
            Replacement OpenAI API key
            <input
              type="password"
              autoComplete="new-password"
              value={form.openaiKey}
              onChange={(e) => update("openaiKey", e.target.value)}
              placeholder={
                data.config.keySet
                  ? "Configured. Leave blank to keep."
                  : "Paste a new key locally"
              }
            />
          </label>
          <p className="muted small">
            The key pasted into the conversation was not stored. Revoke that
            key. This setting is encrypted with Windows DPAPI and is never
            returned to the browser.
          </p>
          <label>
            Ollama URL
            <input
              value={form.ollamaUrl}
              onChange={(e) => update("ollamaUrl", e.target.value)}
            />
          </label>
          <label>
            Installed Ollama model
            <input
              value={form.ollamaModel}
              onChange={(e) => update("ollamaModel", e.target.value)}
            />
          </label>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await save();
                const r = await api("/settings/test", {});
                notify(
                  r.message +
                    (r.models ? " Models: " + r.models.join(", ") : ""),
                );
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={14} />
            Save and test connection
          </button>
        </section>
        <section className="settings-card">
          <h3>
            <KeyRound size={18} />
            Telegram delivery
          </h3>
          <p className="small muted">
            Optional direct adapter. For Hermes, use the delivery helper
            documented in docs/USER_GUIDE.md. Sending always requires approval.
          </p>
          <label>
            Bot token
            <input
              type="password"
              autoComplete="new-password"
              value={form.telegramToken}
              onChange={(e) => update("telegramToken", e.target.value)}
              placeholder={
                data.config.telegramSet
                  ? "Configured. Leave blank to keep."
                  : "Optional bot token"
              }
            />
          </label>
          <label>
            Destination chat ID
            <input
              value={form.telegramChat}
              onChange={(e) => update("telegramChat", e.target.value)}
              placeholder={
                data.config.chatSet
                  ? "Configured. Leave blank to keep."
                  : "Your private chat ID"
              }
            />
          </label>
          <p className="small muted">
            Delivery uses Telegram’s network. Local storage does not make
            delivered audio private to this computer.
          </p>
        </section>
        <section className="settings-card">
          <h3>Archived notes</h3>
          <p className="muted small">
            Archiving preserves the original Markdown and version history.
          </p>
          <button
            onClick={() =>
              api<Note[]>("/archive")
                .then(setArchived)
                .catch((e) => notify(e.message))
            }
          >
            Show archived notes
          </button>
          {archived.map((n) => (
            <div className="archive-row" key={n.id}>
              <span>{n.title}</span>
              <button
                onClick={async () => {
                  try {
                    await api("/notes/" + n.id + "/restore", {});
                    setArchived((a) => a.filter((x) => x.id !== n.id));
                    await refresh();
                    notify("Note restored.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Restore
              </button>
            </div>
          ))}
        </section>
        <section className="settings-card">
          <h3>Trash</h3>
          <p className="small muted">
            Deleted notes stay here until you restore them. Attachments and
            history are kept.
          </p>
          <button
            onClick={() =>
              api<Note[]>("/trash")
                .then(setTrashed)
                .catch((e) => notify(e.message))
            }
          >
            Show deleted notes
          </button>
          {trashed.map((n) => (
            <div className="archive-row" key={n.id}>
              <span>{n.title}</span>
              <button
                onClick={async () => {
                  try {
                    await api("/trash/" + n.id + "/restore", {});
                    setTrashed((notes) => notes.filter((x) => x.id !== n.id));
                    await refresh();
                    notify("Note restored.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Restore
              </button>
            </div>
          ))}
        </section>
      </div>
      <footer className="settings-save">
        <button className="primary" disabled={busy} onClick={save}>
          {busy ? <Busy /> : <Check size={15} />}Save settings
        </button>
        <span className="muted small">
          External requests never start just because you opened a note.
        </span>
      </footer>
    </div>
  );
}
