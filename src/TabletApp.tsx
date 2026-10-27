import { useEffect, useRef, useState } from "react";
import NotebookSheet, { type SheetHandle } from "./NotebookSheet";
import RichEditor from "./RichEditor";
import {
  allPages,
  putPage,
  newTabletNote,
  editRecord,
  acknowledge,
  assets,
  putAsset,
  blobBase64,
  tabletBackupSchema,
  type TabletRecord,
  type TabletAsset,
} from "./tabletStore";
import type { Note } from "./types";
import "./tablet.css";
import { nextTheme } from "./themes";
type Connection = { url: string; token: string; identity: string };
const mediaCache = "synapse-media-v1";
class SyncError extends Error {}
export default function TabletApp() {
  const [pages, setPages] = useState<TabletRecord[]>([]),
    ref = useRef<TabletRecord[]>([]),
    tail = useRef(Promise.resolve()),
    syncing = useRef(false),
    gesture = useRef(false);
  const [selected, setSelected] = useState(""),
    [status, setStatus] = useState("Opening local notebook…"),
    [settings, setSettings] = useState(false),
    [url, setUrl] = useState(""),
    [code, setCode] = useState(""),
    [finger, setFinger] = useState(false),
    [error, setError] = useState(""),
    [offlineReady, setOfflineReady] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const connection = useRef<Connection | undefined>(undefined),
    sheet = useRef<SheetHandle>(null),
    upload = useRef<HTMLInputElement>(null),
    restore = useRef<HTMLInputElement>(null),
    revision = useRef("");
  const [writer, setWriter] = useState(false);
  useEffect(() => {
    let live = true,
      release: (() => void) | undefined;
    if (!navigator.locks) {
      setWriter(true);
      return;
    }
    const controller = new AbortController(),
      timer = setTimeout(
        () =>
          setError(
            "This notebook is open in another window. Close that window to edit here.",
          ),
        1200,
      );
    void navigator.locks
      .request(
        "synapse-tablet-editor",
        { signal: controller.signal },
        async (lock) => {
          if (!live) return;
          clearTimeout(timer);
          setError("");
          const rows = await allPages();
          if (!live) return;
          update(rows);
          setSelected((id) =>
            rows.some((p) => p.note.id === id) ? id : rows[0]?.note.id || "",
          );
          setWriter(true);
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        },
      )
      .catch((e) => {
        if (e.name !== "AbortError") fail(e);
      });
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
      release?.();
    };
  }, []);
  function update(records: TabletRecord[]) {
    ref.current = records;
    setPages(records);
  }
  function persist(record: TabletRecord, oldId?: string) {
    const write = tail.current
      .catch(() => {})
      .then(() => putPage(record, oldId));
    tail.current = write;
    void write.then(
      () =>
        setStatus(
          ref.current.some((p) => p.dirty)
            ? "Saved on this device, waiting to sync"
            : connection.current
              ? "Synced"
              : "Saved on this device",
        ),
      (e) => setError("Local saving failed. Export a backup now. " + e.message),
    );
    return write;
  }
  function fail(e: unknown) {
    setError(
      e instanceof Error
        ? e.message
        : "The operation could not finish. Your existing pages are preserved.",
    );
  }
  useEffect(() => {
    document.documentElement.dataset.theme =
      localStorage.getItem("synapse-tablet-theme") || "dotted";
    document.body.classList.add("tablet-mode");
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/tablet/" })
        .then(() => navigator.serviceWorker.ready)
        .then(() => setOfflineReady(true))
        .catch((e) =>
          setError(
            "Offline installation failed. Reconnect and reopen this page. " +
              e.message,
          ),
        );
    try {
      connection.current =
        JSON.parse(
          localStorage.getItem("synapse-tablet-connection") || "null",
        ) || undefined;
      setUrl(connection.current?.url || "");
    } catch {}
    let mounted = true;
    allPages()
      .then((rows) => {
        if (!mounted) return;
        update(rows);
        setSelected(rows[0]?.note.id || "");
        setReady(true);
        setStatus("Saved on this device");
      })
      .catch(fail);
    void navigator.storage?.persist?.().catch(() => false);
    void assets()
      .then(async (stored) => {
        for (const asset of stored) await cacheAsset(asset);
      })
      .catch(fail);
    const theme = () => {
      const next = nextTheme(
        document.documentElement.dataset.theme || "dotted",
      );
      document.documentElement.dataset.theme = next;
      localStorage.setItem("synapse-tablet-theme", next);
      window.dispatchEvent(new Event("synapse:theme"));
    };
    window.addEventListener("synapse:cycle-theme", theme);
    const active = (e: Event) => {
      gesture.current = Boolean((e as CustomEvent).detail);
    };
    window.addEventListener("synapse:pen-active", active);
    return () => {
      mounted = false;
      document.body.classList.remove("tablet-mode");
      window.removeEventListener("synapse:pen-active", active);
      window.removeEventListener("synapse:cycle-theme", theme);
    };
  }, []);
  async function remote(path: string, body?: unknown) {
    const c = connection.current;
    if (!c) throw Error("Pair this notebook first.");
    const r = await fetch(c.url + "/api/device/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + c.token,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json();
    if (!r.ok) throw new SyncError(data.error || "Connection failed");
    return data;
  }
  async function cacheAsset(asset: TabletAsset) {
    const ext = asset.name.split(".").pop()!;
    const type =
      (
        {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
          pdf: "application/pdf",
          svg: "image/svg+xml",
          json: "application/json",
        } as Record<string, string>
      )[ext] || "application/octet-stream";
    const cache = await caches.open(mediaCache);
    await cache.put(
      "/tablet/files/" + asset.name,
      new Response(asset.blob, {
        headers: {
          "Content-Type": type,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        },
      }),
    );
  }
  async function downloadMedia(note: Note) {
    const files = new Set<string>();
    for (const match of (note.body || "").matchAll(
      /(?:\.\.\/|\/files\/|\/tablet\/files\/)(attachments|drawings)\/([a-f0-9-]{36}\.(?:png|jpe?g|webp|svg|pdf|json))/gi,
    ))
      files.add(match[1] + "/" + match[2]);
    for (const item of note.canvas?.items || []) {
      if (item.kind === "drawing")
        files.add("drawings/" + item.drawingId + ".svg");
      const m = item.src?.match(
        /(?:\.\.\/|\/files\/)(attachments|drawings)\/([a-f0-9-]{36}\.(?:png|jpe?g|webp|svg|pdf|json))/i,
      );
      if (m) files.add(m[1] + "/" + m[2]);
    }
    const cache = await caches.open(mediaCache);
    for (const path of files) {
      const key = "/tablet/files/" + path;
      if (await cache.match(key)) {
        const local = ref.current.find((p) => p.note.id === note.id);
        if (!path.startsWith("drawings/") || local?.base === note.etag)
          continue;
      }
      const [folder, name] = path.split("/"),
        c = connection.current!;
      const r = await fetch(
        c.url + "/api/device/file?folder=" + folder + "&name=" + name,
        {
          headers: { Authorization: "Bearer " + c.token },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!r.ok) continue;
      if (Number(r.headers.get("content-length")) > 20 * 1024 * 1024) continue;
      const blob = await r.blob();
      if (blob.size > 20 * 1024 * 1024) continue;
      const asset = {
        name: path,
        type: blob.type || "application/octet-stream",
        blob,
        dirty: false,
      };
      await putAsset(asset);
      await cacheAsset(asset);
    }
  }
  async function sync() {
    if (!writer) return;
    if (
      syncing.current ||
      gesture.current ||
      !connection.current ||
      !navigator.onLine
    )
      return;
    syncing.current = true;
    try {
      await tail.current;
      setStatus("Syncing…");
      for (const asset of (await assets()).filter((a) => a.dirty)) {
        await remote("file", {
          name: asset.name.split("/")[1],
          data: await blobBase64(asset.blob),
        });
        await putAsset({ ...asset, dirty: false });
      }
      for (const sent of [...ref.current].filter((p) => p.dirty)) {
        const scaffold =
          sent.base === null &&
          Boolean(sent.note.parentId || sent.note.links.length);
        const draft = scaffold
          ? { ...sent.note, parentId: null, links: [] }
          : sent.note;
        const result = await remote("note", {
          note: draft,
          base: sent.base,
          operation: sent.operation,
        });
        const current = ref.current.find((p) => p.note.id === sent.note.id);
        if (!current) continue;
        const next = acknowledge(
          scaffold ? editRecord(current, current.note) : current,
          sent,
          result,
        );
        update(
          ref.current.map((p) => (p.note.id === current.note.id ? next : p)),
        );
        if (result.note.id !== current.note.id)
          setSelected((id) => (id === current.note.id ? result.note.id : id));
        await persist(next, current.note.id);
        if (result.conflict)
          setError(
            "Both versions were preserved. Your changes are in a device conflict copy.",
          );
      }
      const result = await remote(
        "notes?since=" + encodeURIComponent(revision.current),
      );
      for (const note of (result.notes || []) as Note[]) {
        if (gesture.current) return;
        let local = ref.current.find((p) => p.note.id === note.id);
        if (local?.dirty) continue;
        await downloadMedia(note);
        local = ref.current.find((p) => p.note.id === note.id);
        if (local?.dirty || gesture.current) continue;
        if (local?.base === note.etag) continue;
        const row = {
          note,
          base: note.etag || null,
          dirty: false,
          version: (local?.version || 0) + 1,
          operation: crypto.randomUUID(),
        };
        update([...ref.current.filter((p) => p.note.id !== note.id), row]);
        await persist(row);
      }
      if (result.notes) {
        const ids = new Set((result.notes as Note[]).map((n) => n.id));
        for (const p of [...ref.current])
          if (!p.dirty && !ids.has(p.note.id) && !p.note.archived) {
            const removed = { ...p, note: { ...p.note, archived: true } };
            update(
              ref.current.map((x) => (x.note.id === p.note.id ? removed : x)),
            );
            await persist(removed);
          }
        revision.current = result.revision || "";
      }
      setStatus(
        ref.current.some((p) => p.dirty)
          ? "Saved locally, changes queued"
          : "Synced",
      );
    } catch (e) {
      setStatus("Saved locally, PC unavailable");
      if (e instanceof SyncError) fail(e);
    } finally {
      syncing.current = false;
    }
  }
  useEffect(() => {
    if (!ready || !writer) return;
    void sync();
    const timer = setInterval(() => {
      if (!document.hidden) void sync();
    }, 2000);
    const online = () => void sync();
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
    };
  }, [ready, writer]);
  function edit(patch: Partial<Note>) {
    if (!writer) return;
    const row = ref.current.find((p) => p.note.id === selected);
    if (!row) return;
    const next = editRecord(row, { ...row.note, ...patch });
    update(ref.current.map((p) => (p.note.id === selected ? next : p)));
    setStatus("Saving on this device…");
    void persist(next).catch(() => {});
  }
  async function create() {
    if (!writer) return;
    const row = {
      note: newTabletNote(),
      base: null,
      dirty: true,
      version: 1,
      operation: crypto.randomUUID(),
    };
    await persist(row);
    update([...ref.current, row]);
    setSelected(row.note.id);
  }
  async function backup() {
    setBusy(true);
    try {
      await tail.current;
      const stored = await assets();
      if (stored.reduce((sum, a) => sum + a.blob.size, 0) > 90 * 1024 * 1024)
        throw Error(
          "Sync to your PC before backing up more than 90 MB of attachments.",
        );
      const media = [];
      for (const a of stored)
        media.push({
          name: a.name,
          type: a.type,
          data: await blobBase64(a.blob),
        });
      const blob = new Blob(
        [
          JSON.stringify({
            format: "synapse-tablet-1",
            pages: ref.current,
            assets: media,
          }),
        ],
        { type: "application/json" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "Synapse-tablet-backup.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function importBackup(file: File) {
    if (!writer) return;
    setBusy(true);
    try {
      if (file.size > 125 * 1024 * 1024)
        throw Error("Choose a Synapse backup smaller than 125 MB.");
      const data = tabletBackupSchema.parse(JSON.parse(await file.text())),
        existing = await assets();
      for (const a of data.assets) {
        if (existing.some((x) => x.name === a.name)) continue;
        const binary = atob(a.data),
          blob = new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], {
            type: a.type,
          });
        const asset = {
          name: a.name,
          type: a.type,
          blob,
          dirty:
            a.name.startsWith("attachments/") &&
            /\.(png|jpg|webp|pdf)$/.test(a.name),
        };
        await putAsset(asset);
        await cacheAsset(asset);
      }
      const remap = new Map(
        data.pages.map((p) => [p.note.id, crypto.randomUUID()]),
      );
      let first = "";
      for (const p of data.pages) {
        const note: Note = {
          ...p.note,
          id: remap.get(p.note.id)!,
          title: p.note.title.slice(0, 140) + " (restored)",
          parentId: p.note.parentId ? remap.get(p.note.parentId) || null : null,
          links: p.note.links
            .filter((l) => remap.has(l.target))
            .map((l) => ({ ...l, target: remap.get(l.target)! })),
          sources: [],
          drawings: [],
          revision: 0,
          etag: undefined,
        };
        for (const [oldId, newId] of remap)
          note.body = note.body?.replaceAll(oldId, newId);
        const row = {
          note,
          base: null,
          dirty: true,
          version: 1,
          operation: crypto.randomUUID(),
        };
        await persist(row);
        update([...ref.current, row]);
        first ||= note.id;
      }
      setSelected(first);
      setStatus("Backup restored as new pages");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function attach(file: File) {
    if (!writer) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw Error("Choose an image or PDF smaller than 5 MB.");
      const ext = (
        {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/webp": "webp",
          "application/pdf": "pdf",
        } as Record<string, string>
      )[file.type];
      if (!ext) throw Error("Choose a PNG, JPEG, WebP image or PDF.");
      const name = "attachments/" + crypto.randomUUID() + "." + ext,
        asset = { name, type: file.type, blob: file, dirty: true };
      await putAsset(asset);
      await cacheAsset(asset);
      const src = "../" + name;
      if (ext === "pdf") {
        const row = ref.current.find((p) => p.note.id === selected);
        edit({
          body:
            (row?.note.body || "") +
            "\n\n[" +
            file.name.replace(/[\[\]]/g, "") +
            "](" +
            src +
            ")\n",
        });
      } else sheet.current?.image(src, file.name);
    } catch (e) {
      fail(e);
    }
  }
  async function pair() {
    setBusy(true);
    try {
      const endpoint = new URL(url.trim());
      if (
        endpoint.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(endpoint.hostname)
      )
        throw Error(
          "Use the private HTTPS PC address. Plain HTTP cannot connect from the installed app.",
        );
      const r = await fetch(endpoint.origin + "/api/device/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name: "Tablet notebook",
          identity: connection.current?.identity,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const c = await r.json();
      if (!r.ok) throw Error(c.error);
      connection.current = {
        url: endpoint.origin,
        token: c.token,
        identity: c.identity,
      };
      localStorage.setItem(
        "synapse-tablet-connection",
        JSON.stringify(connection.current),
      );
      revision.current = "";
      setSettings(false);
      setError("");
      await sync();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function command(cmd: string) {
    if (cmd.startsWith("note:")) {
      const id = cmd.slice(5);
      if (ref.current.some((p) => p.note.id === id)) {
        setSelected(id);
        return;
      }
    }
    if (cmd === "image") {
      upload.current?.click();
      return;
    }
    setError("Use Windows for AI and note-link commands.");
  }
  const row = pages.find((p) => p.note.id === selected && !p.note.archived);
  return (
    <main className={`tablet-app${writer ? "" : " tablet-readonly"}`}>
      <header>
        <strong>Synapse</strong>
        <span role="status">{status}</span>
        <button
          onClick={() => void create().catch(fail)}
          disabled={!ready || !writer || busy}
        >
          New page
        </button>
        <button onClick={() => setSettings(!settings)} aria-expanded={settings}>
          Connect & backup
        </button>
        <button onClick={() => setFinger(!finger)} aria-pressed={finger}>
          {finger ? "Finger ink" : "Pencil ink"}
        </button>
      </header>
      {error && (
        <div className="tablet-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {settings && (
        <section className="tablet-settings">
          <h2>Your notebook, connected.</h2>
          <p>
            Pages save here first. While open, this app syncs about every two
            seconds when your PC is reachable.
          </p>
          <ol>
            <li>
              Install Tailscale on your PC and tablet. Sign in to the same
              private network.
            </li>
            <li>
              In Windows Synapse Settings, open “Pair iPad or Android”. Enable
              private sync and follow the HTTPS command there.
            </li>
            <li>
              Generate a code for <code>{location.origin}</code>, then enter it
              below.
            </li>
          </ol>
          <label>
            Private PC address
            <input
              aria-label="PC endpoint"
              autoCapitalize="none"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-pc.your-network.ts.net"
            />
          </label>
          <label>
            One-time pairing code
            <input
              aria-label="Device pairing code"
              autoCapitalize="none"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button disabled={busy || !code || !url} onClick={() => void pair()}>
            Pair and sync
          </button>
          <button
            disabled={!connection.current || busy}
            onClick={() => void sync()}
          >
            Sync now
          </button>
          <button disabled={busy} onClick={() => void backup()}>
            Export backup
          </button>
          <button disabled={busy} onClick={() => restore.current?.click()}>
            Import backup
          </button>
          <p>
            {offlineReady
              ? "Ready to reopen offline."
              : "Keep this page online until offline installation finishes."}{" "}
            On iPad, use Safari → Share → Add to Home Screen. On Android, use
            Chrome → menu → Install app.
          </p>
          <p>
            Keep backups before clearing browser data. Your PC must be on for
            sync. Offline writing and drawing do not need it. Conflicting edits
            become separate copies.
          </p>
        </section>
      )}
      <input
        hidden
        ref={upload}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void attach(f);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={restore}
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importBackup(f);
          e.target.value = "";
        }}
      />
      <nav className="tablet-pages" aria-label="Notebook pages">
        {pages
          .filter((p) => !p.note.archived)
          .map((p) => (
            <button
              key={p.note.id}
              aria-pressed={selected === p.note.id}
              onClick={() => setSelected(p.note.id)}
            >
              {p.note.title}
              {p.dirty ? " •" : ""}
            </button>
          ))}
      </nav>
      {row ? (
        <section className="tablet-note">
          <input
            className="tablet-title"
            aria-label="Page title"
            maxLength={160}
            value={row.note.title}
            onChange={(e) => edit({ title: e.target.value || "Untitled page" })}
          />
          <div className={finger ? "tablet-finger" : "tablet-pencil"}>
            <NotebookSheet
              ref={sheet}
              key={row.note.id}
              value={row.note.canvas}
              onChange={(canvas) => edit({ canvas })}
              onDrawing={() =>
                setError(
                  "Embedded diagrams can be viewed here. Edit their shapes in the Windows workspace.",
                )
              }
              onImage={() => upload.current?.click()}
              onUpload={(file) => void attach(file)}
              onCommand={(cmd) => {
                if (cmd === "table") return;
                setError("Use Windows for AI and note-link commands.");
              }}
            >
              <RichEditor
                value={row.note.body || ""}
                onChange={(body) => edit({ body })}
                onCommand={command}
              />
            </NotebookSheet>
          </div>
        </section>
      ) : (
        <section className="tablet-empty">
          <h1>A page for your next idea.</h1>
          <p>
            Write, sketch and keep going offline. Connect Windows when you want
            everything together.
          </p>
          <button
            onClick={() => void create().catch(fail)}
            disabled={!ready || !writer}
          >
            Create first page
          </button>
          <p className="tablet-install">
            {offlineReady
              ? "Offline notebook ready. Add Synapse to your Home Screen."
              : "Preparing offline notebook…"}
          </p>
        </section>
      )}
    </main>
  );
}
