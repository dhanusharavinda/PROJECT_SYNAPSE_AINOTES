import { useEffect, useState } from "react";
import { api } from "./api";
import { LogIn, RefreshCw, ArrowUpRight, Users, LogOut } from "lucide-react";
import type { Note } from "./types";
export type SharedPage = {
  id: string;
  room: string;
  title: string;
  ownerEmail: string;
  role: "owner" | "editor" | "viewer";
  hostPublic: string;
};
export default function AccountPanel({
  onOpen,
  onLocal,
  notify,
}: {
  onOpen: (connection: string, page: SharedPage) => void;
  onLocal: (id: string) => void;
  notify: (text: string) => void;
}) {
  const [data, setData] = useState<any>(),
    [pages, setPages] = useState<SharedPage[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [login, setLogin] = useState("");
  async function load() {
    try {
      const d = await api("/account");
      setData(d);
      if (d.identity) setPages(await api("/account/pages"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, []);
  async function start() {
    setBusy(true);
    try {
      const r = await api("/account/start", {});
      setLogin(r.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace-page account-page">
      <header className="page-heading">
        <div>
          <h1>Shared with you</h1>
          <p>Work together on the same page, inside Synapse.</p>
        </div>
        <button onClick={load}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {!data?.identity ? (
        <section className="account-signin">
          <LogIn size={22} />
          <h2>Your notebook, with company</h2>
          <p>
            Sign in, then invite someone by email from a note's Collaborators
            button. Only the pages you choose are shared.
          </p>
          <button
            className="primary"
            disabled={busy || data?.configured === false}
            onClick={start}
          >
            Sign in with Google
          </button>
          {data?.configured === false && (
            <p className="muted small">
              Google sign-in needs its client ID set up before this release.
            </p>
          )}
          {login && (
            <p>
              <a href={login} target="_blank" rel="noreferrer">
                Continue sign-in in your browser
                <ArrowUpRight size={13} />
              </a>
              <br />
              <small>Return here when you're signed in.</small>
            </p>
          )}
        </section>
      ) : (
        <>
          <div className="account-identity">
            <span>
              Signed in as <strong>{data.identity.email}</strong>
            </span>
            <button
              onClick={async () => {
                await api("/account/logout", {});
                setData(undefined);
                setPages([]);
                setLogin("");
                void load();
              }}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
          <p className="muted small">
            Shared pages connect to their owner's PC. Synapse must be open
            there. Changes appear live while both people are online.
          </p>
          {pages.length ? (
            <div className="shared-page-list">
              {pages.map((p) => (
                <button
                  key={p.room + p.id}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      if (p.role === "owner") onLocal(p.id);
                      else {
                        const r = await api("/account/open", {
                          id: p.id,
                          room: p.room,
                        });
                        onOpen(r.connection, p);
                      }
                    } catch (e) {
                      notify((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Users size={18} />
                  <span>
                    <strong>{p.title}</strong>
                    <small>
                      {p.ownerEmail} / {p.role}
                    </small>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <p>
              No shared pages yet. An invitation appears here when someone adds
              your email.
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function Collaborators({
  note,
  onOpenShared,
  notify,
  onChanged,
}: {
  note: Note;
  onChanged?: () => Promise<void>;
  onOpenShared: () => void;
  notify: (text: string) => void;
}) {
  const [members, setMembers] = useState<{ email: string; role: string }[]>([]),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("editor"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      const d = await api("/collaboration/" + note.id + "/members");
      setMembers(d.members || []);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [note.id]);
  async function change(address: string, access: string, remove = false) {
    setBusy(true);
    try {
      await api("/collaboration/" + note.id + "/members", {
        email: address,
        role: access,
        remove,
      });
      setEmail("");
      await load();
      await onChanged?.();
      notify(
        remove
          ? "Access removed."
          : "Invitation saved. They can find this page in Shared with you.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        Add someone's Google account email. They open the page from Shared with
        you, without an access link.
      </p>
      <p className="muted small">
        Your PC must stay awake with Synapse open. This shares this page and its
        attached files, and replaces older access links for this page.
      </p>
      {error && (
        <p role="alert" className="error-banner">
          {error} Open Shared with you to sign in.
        </p>
      )}
      <div className="invite-controls">
        <input
          aria-label="Collaborator email"
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          aria-label="Collaborator permission"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        <button
          className="primary"
          disabled={busy || !email.trim() || !!error}
          onClick={() => change(email.trim(), role)}
        >
          Add
        </button>
      </div>
      <div className="collaborator-list">
        {members.map((m) => (
          <div key={m.email}>
            <span>{m.email}</span>
            <select
              aria-label={"Access for " + m.email}
              value={m.role}
              disabled={busy}
              onChange={(e) => change(m.email, e.target.value)}
            >
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button
              disabled={busy}
              onClick={() => change(m.email, m.role, true)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {members.length > 0 && (
        <button onClick={onOpenShared}>Open live editing</button>
      )}
    </>
  );
}
