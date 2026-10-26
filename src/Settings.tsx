import { useState } from "react";
import {
  ShieldCheck,
  FolderOpen,
  Check,
  RefreshCw,
  KeyRound,
} from "lucide-react";
import { api } from "./api";
import { Busy } from "./ui";
import type { Bootstrap, Note } from "./types";
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
          <div className="eyebrow">YOUR NOTEBOOK, YOUR CHOICES</div>
          <h1>
            Settings<span className="title-dot">.</span>
          </h1>
          <p>Local by default. External services only when you choose them.</p>
        </div>
        <ShieldCheck size={32} strokeWidth={1} />
      </header>
      <div className="settings-grid">
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
            <SparkIcon />
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
function SparkIcon() {
  return <span>✦</span>;
}
