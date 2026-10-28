import ResourceThumbnail from "./ResourceThumbnail";
import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Upload,
  Link2,
  FileText,
  Image,
  Video,
  Sparkles,
  ArrowUpRight,
  Check,
  Eye,
  Headphones,
  Play,
  Send,
  RefreshCw,
  Mic,
  Search,
  Bookmark,
  X,
} from "lucide-react";
import { readableText } from "./studyText";
import VideoCard from "./VideoCard";
import { noteUsesResource } from "./resourceRefs";
import { youtubeLink } from "./youtube";
import type { Bootstrap, Note, Source, Episode } from "./types";
import { api, fileUrl } from "./api";
import { Modal, MD, Busy, Empty } from "./ui";
type Props = {
  data: Bootstrap;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  onOpen: (n: Note) => void;
};
export function Inbox({
  data,
  refresh,
  notify,
  onOpen,
  library = true,
}: Props & { library?: boolean }) {
  const [resourceQuery, setResourceQuery] = useState(""),
    [bookmarksOnly, setBookmarksOnly] = useState(false),
    [attachNote, setAttachNote] = useState("");
  const [selected, setSelected] = useState<string>();
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [consent, setConsent] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const [showArchived, setShowArchived] = useState(false);
  const visibleSources = data.sources.filter(
    (s) =>
      !!s.archived === showArchived &&
      (!bookmarksOnly || s.bookmarked) &&
      [s.title, s.url, s.text]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(resourceQuery.toLowerCase()),
  );
  const source = visibleSources.find((s) => s.id === selected);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resourceQuery, bookmarksOnly, showArchived]);
  const pageCount = Math.max(1, Math.ceil(visibleSources.length / 9));
  const pageIndex = Math.min(page, pageCount - 1);
  async function run(key: string, fn: () => Promise<any>) {
    setBusy(key);
    try {
      const r = await fn();
      await refresh();
      return r;
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function addFile(file: File) {
    const f = new FormData();
    f.append("file", file);
    const s = await run("upload", () => api<Source>("/upload", f));
    if (s) setSelected(s.id);
  }
  return (
    <div className="workspace-page inbox-page">
      <header className="page-heading">
        <div>
          <h1>
            {library ? "Resource dump" : "Your Inbox"}
            <span className="title-dot">.</span>
          </h1>
          <p>
            Keep the source. Find the useful part. Connect it when you’re ready.
          </p>
        </div>
        <div className="actions">
          <button onClick={() => upload.current?.click()} disabled={!!busy}>
            <Upload size={15} />
            {busy === "upload" ? "Importing..." : "Upload file"}
          </button>
          <button className="primary" onClick={() => setModal(true)}>
            <Plus size={16} />
            {library ? "Add resource" : "Capture"}
          </button>
        </div>
      </header>
      <input
        ref={upload}
        type="file"
        hidden
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.mp3,.wav,.m4a,.mp4,.webm,.ogg"
        onChange={(e) => {
          if (e.target.files?.[0]) addFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <div
        className="capture-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files[0]) addFile(e.dataTransfer.files[0]);
        }}
      >
        <Upload size={22} />
        <div>
          <strong>Drop something worth understanding</strong>
          <p>
            PDFs, screenshots, notes, audio, and video. Stored on your computer.
          </p>
        </div>
        <button onClick={() => setModal(true)}>
          Paste a link or text <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="actions resource-filters">
        <input
          aria-label="Search resources"
          placeholder="Search resources"
          value={resourceQuery}
          onChange={(e) => setResourceQuery(e.target.value)}
        />
        <button
          aria-pressed={bookmarksOnly}
          onClick={() => setBookmarksOnly(!bookmarksOnly)}
        >
          <Bookmark size={14} />
          Bookmarks
        </button>
      </div>
      <div className="actions" style={{ marginBottom: 20 }}>
        <button
          className={!showArchived ? "active" : ""}
          onClick={() => {
            setShowArchived(false);
            setSelected(undefined);
          }}
        >
          {library ? "All resources" : "Inbox"}{" "}
          {data.sources.filter((s) => !s.archived).length}
        </button>
        <button
          onClick={() => {
            setShowArchived(true);
            setSelected(undefined);
          }}
        >
          Archived {data.sources.filter((s) => s.archived).length}
        </button>
      </div>
      {visibleSources.length ? (
        <div className="resource-library">
          <div className="source-list">
            {visibleSources.slice(pageIndex * 9, pageIndex * 9 + 9).map((s) => (
              <button
                key={s.id}
                className={
                  "source-card " + (source?.id === s.id ? "selected" : "")
                }
                onClick={() => {
                  setSelected(s.id);
                  setEditing(false);
                }}
              >
                <ResourceThumbnail source={s} />
                <div>
                  <span className="section-label">
                    {s.kind} · {new Date(s.created).toLocaleDateString()}
                  </span>
                  <strong>{s.title}</strong>
                  <p>{s.text ? s.text.slice(0, 90) : s.coverage}</p>
                  <small>
                    {s.bookmarked
                      ? "Bookmarked"
                      : s.url
                        ? "Saved link"
                        : s.file
                          ? "Saved file"
                          : "Saved text"}
                  </small>
                </div>
              </button>
            ))}
          </div>
          {pageCount > 1 && (
            <div className="resource-pagination">
              <button
                disabled={pageIndex === 0}
                onClick={() => setPage(pageIndex - 1)}
              >
                Previous
              </button>
              <span>
                {pageIndex + 1} / {pageCount}
              </span>
              <button
                disabled={pageIndex + 1 >= pageCount}
                onClick={() => setPage(pageIndex + 1)}
              >
                Next
              </button>
            </div>
          )}
          {source && (
            <Modal
              title={source.title}
              wide
              onClose={() => setSelected(undefined)}
            >
              <article className="source-detail">
                <div className="actions wrap">
                  <button
                    disabled={!!busy}
                    aria-pressed={!!source.bookmarked}
                    onClick={() =>
                      run("bookmark", () =>
                        api(
                          "/sources/" + source.id,
                          { bookmarked: !source.bookmarked },
                          "PUT",
                        ),
                      )
                    }
                  >
                    <Bookmark size={14} />
                    {source.bookmarked ? "Bookmarked" : "Bookmark"}
                  </button>
                  <label>
                    Attach to note
                    <select
                      aria-label="Attach resource to note"
                      value={attachNote}
                      onChange={(e) => setAttachNote(e.target.value)}
                    >
                      <option value="">Choose a note</option>
                      {data.notes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={!attachNote || !!busy}
                    onClick={() =>
                      run("attach", async () => {
                        await api("/sources/" + source.id + "/attach", {
                          noteId: attachNote,
                        });
                        notify(
                          "Resource attached. The original stays in Resource dump.",
                        );
                      })
                    }
                  >
                    Attach
                  </button>
                </div>
                {source.url && youtubeLink(source.url) && (
                  <div className="resource-video" key={source.id}>
                    <VideoCard url={source.url} title={source.title} />
                  </div>
                )}
                {data.notes.some((n) => noteUsesResource(n, source)) && (
                  <div className="resource-attachments">
                    <span className="muted small">In notes</span>
                    {data.notes
                      .filter((n) => noteUsesResource(n, source))
                      .map((n) => (
                        <button key={n.id} onClick={() => onOpen(n)}>
                          {n.title}
                          <ArrowUpRight size={12} />
                        </button>
                      ))}
                  </div>
                )}
                <p className="coverage">{source.coverage}</p>
                <div className="actions wrap">
                  {source.file && (
                    <a
                      className="button"
                      href={fileUrl("attachments", source.file)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open original <ArrowUpRight size={13} />
                    </a>
                  )}
                  {source.url && (
                    <a
                      className="button"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Original link <ArrowUpRight size={13} />
                    </a>
                  )}
                  {source.kind === "image" && (
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        run("ocr", () =>
                          api("/sources/" + source.id + "/extract", {
                            mode: "ocr",
                          }),
                        )
                      }
                    >
                      {busy === "ocr" ? <Busy /> : <Search size={13} />}Local
                      OCR
                    </button>
                  )}
                  {(source.kind === "media" || source.kind === "image") && (
                    <button onClick={() => setConsent("vision")}>
                      <Eye size={13} />
                      Analyze visuals
                    </button>
                  )}
                  {source.kind === "media" && (
                    <button onClick={() => setConsent("transcribe")}>
                      <Mic size={13} />
                      Transcribe audio
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditText(source.text);
                      setEditing(!editing);
                    }}
                  >
                    Correct or paste text
                  </button>
                  <button
                    onClick={() =>
                      run("archive-source", async () => {
                        await api("/sources/" + source.id + "/archive", {
                          archived: !source.archived,
                        });
                        setSelected(undefined);
                        notify(
                          source.archived
                            ? "Resource restored."
                            : "Source archived. Notes and original files are preserved.",
                        );
                      })
                    }
                  >
                    {source.archived ? "Restore" : "Archive"}
                  </button>
                </div>
                {source.kind === "image" && source.file && (
                  <img
                    className="source-image"
                    src={fileUrl("attachments", source.file)}
                    alt={source.title}
                  />
                )}{" "}
                {editing ? (
                  <>
                    <textarea
                      className="source-transcript"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      aria-label="Source text"
                    />
                    <button
                      className="primary"
                      onClick={() =>
                        run("save", async () => {
                          await api(
                            "/sources/" + source.id,
                            { text: editText },
                            "PUT",
                          );
                          setEditing(false);
                        })
                      }
                    >
                      Save corrected text
                    </button>
                  </>
                ) : (
                  <div className="source-excerpt">
                    <MD
                      text={
                        source.text ||
                        "No text extracted yet. Paste a transcript or run an available extraction tool."
                      }
                    />
                  </div>
                )}
                <div className="source-next">
                  <h3>What does this add to your notes?</h3>
                  <p>
                    Compare passages with existing explanations. Useful examples
                    and contradictions deserve attention, too.
                  </p>
                  <button
                    className="primary"
                    disabled={!source.text || !!busy}
                    onClick={() => setConsent("analyze")}
                  >
                    {busy === "analyze" ? <Busy /> : <Sparkles size={15} />}
                    Review with AI
                  </button>
                </div>
                {data.proposals
                  .filter((p) => p.sourceId === source.id)
                  .map((p) => (
                    <div className="source-proposal" key={p.id}>
                      <span
                        className={
                          "pill " + (p.state === "pending" ? "violet" : "")
                        }
                      >
                        {p.state}
                      </span>
                      <h4>{p.title}</h4>
                      <p>{p.reason}</p>
                      {p.excerpt && <blockquote>{p.excerpt}</blockquote>}
                      <MD
                        text={
                          p.content ||
                          "Already covered. Accept to attach this source without adding duplicate text."
                        }
                      />
                      <div className="actions">
                        <button
                          onClick={() =>
                            onOpen(data.notes.find((n) => n.id === p.noteId)!)
                          }
                        >
                          Open target note
                        </button>
                        {p.state === "pending" && (
                          <>
                            <button
                              onClick={() =>
                                run("proposal", () =>
                                  api("/proposals/" + p.id, {
                                    action: "dismiss",
                                  }),
                                )
                              }
                            >
                              Skip
                            </button>
                            <button
                              className="primary"
                              disabled={!!busy}
                              onClick={() =>
                                run("proposal", () =>
                                  api("/proposals/" + p.id, {
                                    action: "accept",
                                  }),
                                )
                              }
                            >
                              Accept addition
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </article>
            </Modal>
          )}
        </div>
      ) : (
        <Empty
          title={
            resourceQuery || bookmarksOnly
              ? "No matching resources"
              : showArchived
                ? "Nothing archived"
                : library
                  ? "Your resources, together"
                  : "Your inbox is empty"
          }
          text={
            resourceQuery || bookmarksOnly
              ? "Try another search or turn off the bookmark filter."
              : library
                ? "Save a link, upload a file, or drop it here. Bookmark favourites and attach them to any note."
                : "Capture a resource, then decide what it contributes."
          }
        />
      )}
      {modal && (
        <Modal
          title={library ? "Add resource" : "Capture a source"}
          onClose={() => setModal(false)}
        >
          <label>
            Name (optional for links)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="An idea worth revisiting"
            />
          </label>
          <label>
            Public URL (optional)
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label>
            Text or transcript
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the useful passage, your thoughts, or a reel transcript..."
            />
          </label>
          <p className="muted small">
            Instagram links are saved as bookmarks. The app does not bypass
            logins or claim to watch inaccessible videos.
          </p>
          <button
            className="primary"
            disabled={(!text.trim() && !url.trim()) || !!busy}
            onClick={() =>
              run("capture", async () => {
                const s = await api<Source>("/sources", {
                  extract: !library,
                  title:
                    title.trim() || url.trim().slice(0, 300) || "Saved text",
                  text,
                  url: url.trim() || undefined,
                });
                setSelected(s.id);
                setShowArchived(!!s.archived);
                setTitle("");
                setText("");
                setUrl("");
                setModal(false);
              })
            }
          >
            {busy ? <Busy /> : <Plus size={15} />}
            {library ? "Save resource" : "Save to Inbox"}
          </button>
        </Modal>
      )}
      {consent && (
        <Modal
          title={
            consent === "analyze"
              ? "Compare with your notes?"
              : consent === "vision"
                ? "Analyze source images?"
                : "Transcribe this recording?"
          }
          onClose={() => setConsent("")}
        >
          <p>
            {consent === "analyze"
              ? `This sends up to 24,000 source characters and excerpts from up to 12 locally matched notes to ${data.config.provider === "ollama" ? "your local Ollama model" : "OpenAI (if selected in Settings)"}.`
              : consent === "vision"
                ? "This sends this image, or up to 24 video image samples from the first 120 seconds, to OpenAI. Video sampling is approximately every 5 seconds. Audio is included only if already transcribed."
                : "This sends the uploaded media file to OpenAI for audio transcription. Video frames are not analyzed."}
          </p>
          <p className="muted">
            Your approval applies to this action. Notes are changed only after
            you accept a proposal.
          </p>
          <button
            className="primary"
            onClick={() => {
              const mode = consent;
              setConsent("");
              run(mode, () =>
                api(
                  "/sources/" +
                    source!.id +
                    (mode === "analyze" ? "/analyze" : "/extract"),
                  mode === "analyze"
                    ? {}
                    : {
                        mode: mode === "vision" ? "vision" : "transcribe",
                        consent: true,
                      },
                ),
              );
            }}
          >
            Approve{" "}
            {consent === "analyze"
              ? "comparison"
              : consent === "vision"
                ? "visual analysis"
                : "transcription"}
          </button>
        </Modal>
      )}
    </div>
  );
}
export { default as Review } from "./Practice";
export function Audio({ data, refresh, notify }: Props) {
  const [voice, setVoice] = useState<any>();
  useEffect(() => {
    api("/voice/status")
      .then(setVoice)
      .catch(() => setVoice({ available: false }));
  }, []);
  const [selected, setSelected] = useState<string[]>([]);
  const [episodeId, setEpisodeId] = useState<string>();
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState("");
  const episode =
    data.episodes.find((e) => e.id === episodeId) || data.episodes[0];
  const [editing, setEditing] = useState(false);
  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function make(ai: boolean) {
    await run("script", async () => {
      const e = await api<Episode>("/episodes", { noteIds: selected, ai });
      setEpisodeId(e.id);
      setEditing(false);
      setModal("");
      notify("Revision script created. Review it before generating audio.");
    });
  }
  return (
    <div className="workspace-page audio-page">
      <header className="page-heading">
        <div>
          <h1>
            Revision studio<span className="title-dot">.</span>
          </h1>
          <p>Your notes, a few good questions, and room to think.</p>
        </div>
        <Headphones size={36} strokeWidth={1} />
      </header>
      <div className="audio-layout">
        <aside className="audio-selection">
          <h3>Choose your concepts</h3>
          <p className="muted small">
            Start small. Two or three connected ideas make a focused episode.
          </p>
          {data.notes.map((n) => (
            <label className="checkbox-row" key={n.id}>
              <input
                type="checkbox"
                checked={selected.includes(n.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, n.id]
                      : selected.filter((x) => x !== n.id),
                  )
                }
              />
              <span>{n.title}</span>
            </label>
          ))}
          <button
            className="primary"
            disabled={!selected.length || !!busy}
            onClick={() => make(false)}
          >
            <Plus size={14} />
            Create narration
          </button>
          <button
            disabled={!selected.length || !!busy}
            onClick={() => setModal("script")}
          >
            <Sparkles size={14} />
            Draft conversational podcast
          </button>
          <div className="quiet-note">
            <p>
              Podcast scripts can use local AI. Hermes voice uses the same
              configured voice as Telegram replies. Listening alone does not
              mark a concept practiced.
            </p>
          </div>
          <h4>Saved episodes</h4>
          {data.episodes.map((e) => (
            <button
              className={
                "episode-item " + (episode?.id === e.id ? "selected" : "")
              }
              key={e.id}
              onClick={() => {
                setEpisodeId(e.id);
                setEditing(false);
              }}
            >
              <Headphones size={14} />
              {e.title}
            </button>
          ))}
        </aside>
        {episode ? (
          <article className="episode-detail">
            <span className="pill">
              {episode.file ? "Audio ready" : "Script draft"}
            </span>
            <h2>{episode.title}</h2>
            <p className="muted">
              {episode.noteIds.length} concepts ·{" "}
              {episode.script.split(/\s+/).length} words ·{" "}
              {episode.file
                ? "AI-generated or synthesized voice"
                : "Review before rendering"}
            </p>
            {episode.file && (
              <div className="audio-player">
                <Headphones size={24} />
                <audio controls src={fileUrl("audio", episode.file)} />
                <a href={fileUrl("audio", episode.file)} download>
                  Download
                </a>
              </div>
            )}
            <div className="actions wrap">
              <button
                onClick={() => {
                  setScript(readableText(episode.script));
                  setEditing(!editing);
                }}
              >
                Edit script
              </button>
              <button
                className="primary"
                disabled={!!busy || editing}
                onClick={() => setModal("hermesVoice")}
              >
                {busy === "render" ? <Busy /> : <Play size={14} />}Generate
                Hermes voice
              </button>
              <button
                disabled={!!busy || editing}
                onClick={() => setModal("speech")}
              >
                <Sparkles size={14} />
                OpenAI voice
              </button>
            </div>
            <p className="voice-caption">
              {voice?.available
                ? `Hermes voice: ${voice.provider}  /  ${voice.voice}${voice.online ? "  /  online speech" : "  /  local speech"}`
                : "Hermes voice status is unavailable."}
            </p>
            <details className="offline-voice">
              <summary>Other voice options</summary>
              <button
                disabled={!!busy || editing}
                onClick={() =>
                  run("render", () =>
                    api("/episodes/" + episode.id + "/render", {
                      provider: "local",
                    }),
                  )
                }
              >
                Windows voice (offline, robotic)
              </button>
            </details>
            {editing ? (
              <>
                <textarea
                  className="script-editor"
                  aria-label="Podcast script"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                />
                <button
                  className="primary"
                  onClick={() =>
                    run("save", async () => {
                      await api("/episodes/" + episode.id, { script }, "PUT");
                      setEditing(false);
                    })
                  }
                >
                  Save script
                </button>
              </>
            ) : (
              <div className="podcast-script">
                <MD text={readableText(episode.script)} />
              </div>
            )}
            {episode.file && (
              <div className="delivery-panel">
                <h3>Ready to take it with you?</h3>
                <p>
                  Hermes uses the local outbox adapter. Direct Telegram delivery
                  requires a configured bot and chat.
                </p>
                <div className="actions">
                  <button onClick={() => setModal("hermes")}>
                    <Send size={14} />
                    Send via Hermes
                  </button>
                  <button onClick={() => setModal("telegram")}>
                    <Send size={14} />
                    Send to Telegram
                  </button>
                </div>
              </div>
            )}
          </article>
        ) : (
          <Empty
            title="A little less scrolling, a little more recall"
            text="Select concepts and create a script. Add questions and pauses before generating an audio file."
          />
        )}
      </div>
      {modal && (
        <Modal
          title={
            modal === "script"
              ? "Draft a revision podcast?"
              : modal === "hermesVoice"
                ? "Generate the Hermes voice?"
                : modal === "speech"
                  ? "Generate OpenAI audio?"
                  : modal === "hermes"
                    ? "Approve Hermes Telegram delivery?"
                    : "Approve Telegram delivery?"
          }
          onClose={() => setModal("")}
        >
          <p>
            {modal === "script"
              ? `Selected notes will be sent to ${data.config.provider === "ollama" ? "your local Ollama model" : "OpenAI, if configured"} to draft an editable script.`
              : modal === "hermesVoice"
                ? `This uses the exact Hermes voice-note synthesis pipeline (${voice?.provider || "configured provider"}, ${voice?.voice || "configured voice"}). ${voice?.online ? "The reviewed script is sent to the configured speech service." : ""} The audio is saved here. No Telegram message is sent by this action.`
                : modal === "speech"
                  ? "The reviewed script will be sent to OpenAI for speech generation. This is a paid API action."
                  : modal === "hermes"
                    ? "This sends the reviewed audio through the installed Hermes CLI to its configured Telegram home chat. An explicit delivery receipt is saved locally."
                    : "This sends the generated audio to the chat configured in Settings. Telegram stores the delivered message."}
          </p>
          <button
            className="primary"
            disabled={!!busy}
            onClick={() => {
              if (modal === "script") make(true);
              else
                run("approved", async () => {
                  const r = await api(
                    "/episodes/" +
                      episode!.id +
                      (["speech", "hermesVoice"].includes(modal)
                        ? "/render"
                        : "/deliver"),
                    ["speech", "hermesVoice"].includes(modal)
                      ? {
                          provider:
                            modal === "hermesVoice" ? "hermes" : "openai",
                          consent: true,
                        }
                      : { mode: modal, confirm: true },
                  );
                  notify(r.message || "Audio generated.");
                  setModal("");
                });
            }}
          >
            {busy ? <Busy /> : <Check size={15} />}Approve this action
          </button>
        </Modal>
      )}
    </div>
  );
}
