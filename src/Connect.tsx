import { useState } from "react";
import { api, companion } from "./api";
import { Busy } from "./ui";
import { BookOpen } from "lucide-react";

export default function Connect({ onConnected }: { onConnected: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="connect-page">
      <BookOpen size={32} />
      <span>Synapse</span>
      <h1>Your notebook lives with you.</h1>
      <p>
        Connect this web interface to the notebook running on this computer.
        Your Markdown files stay on your drive.
      </p>
      <ol>
        <li>
          Start Synapse using <strong>Start Synapse.cmd</strong> in your project
          folder.
        </li>
        <li>
          Open{" "}
          <a
            href={companion + "/?view=settings"}
            target="_blank"
            rel="noreferrer"
          >
            local Settings
          </a>
          . Under Web companion, enter <code>{location.origin}</code> and
          generate a code.
        </li>
        <li>
          Paste that code here. Approve local network access if your browser
          asks.
        </li>
      </ol>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api("/connect", { code });
            sessionStorage.setItem("synapse-pairing", result.token);
            onConnected();
          } catch (e) {
            setError(
              (e as Error).message.includes("fetch")
                ? "Cannot reach your local notebook. Start it, generate a new code, and check browser local network permissions."
                : (e as Error).message,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          One-time pairing code
          <input
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? <Busy /> : "Connect notebook"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <small>
        Access lasts up to 12 hours in this tab and ends when your local server
        restarts. This site needs the local app running. To use your notebook on
        another device, use your own secure network connection.
      </small>
    </main>
  );
}
