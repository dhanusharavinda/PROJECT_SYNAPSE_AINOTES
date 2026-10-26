import { useState, useRef } from "react";
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
} from "lucide-react";
import type { Bootstrap, Note, Source, Episode } from "./types";
import { api, fileUrl } from "./api";
import { Modal, MD, Busy, Empty } from "./ui";
type Props = {
  data: Bootstrap;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  onOpen: (n: Note) => void;
};
export function Inbox({ data, refresh, notify, onOpen }: Props) {
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
    (s) => !!s.archived === showArchived,
  );
  const source =
    visibleSources.find((s) => s.id === selected) || visibleSources[0];
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
          <div className="eyebrow">COLLECT WITH INTENTION</div>
          <h1>
            Your Inbox<span className="title-dot">.</span>
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
            Capture
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
      <div className="actions" style={{ marginBottom: 20 }}>
        <button
          className={!showArchived ? "active" : ""}
          onClick={() => {
            setShowArchived(false);
            setSelected(undefined);
          }}
        >
          Inbox {data.sources.filter((s) => !s.archived).length}
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
        <div className="inbox-layout">
          <div className="source-list">
            {visibleSources.map((s) => (
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
                <span className={"file-icon " + s.kind}>
                  {s.kind === "image" ? (
                    <Image size={20} />
                  ) : s.kind === "media" || s.kind === "reel" ? (
                    <Video size={20} />
                  ) : s.kind === "web" ? (
                    <Link2 size={20} />
                  ) : (
                    <FileText size={20} />
                  )}
                </span>
                <div>
                  <span className="eyebrow">
                    {s.kind} · {new Date(s.created).toLocaleDateString()}
                  </span>
                  <strong>{s.title}</strong>
                  <p>{s.text ? s.text.slice(0, 90) : s.coverage}</p>
                  <small>
                    {s.text
                      ? "Ready to read"
                      : "Needs extraction or a transcript"}
                  </small>
                </div>
              </button>
            ))}
          </div>
          {source && (
            <article className="source-detail">
              <div className="eyebrow">ORIGINAL SOURCE</div>
              <h2>{source.title}</h2>
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
                    {busy === "ocr" ? <Busy /> : <Search size={13} />}Local OCR
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
                          ? "Source restored to Inbox."
                          : "Source archived. Notes and original files are preserved.",
                      );
                    })
                  }
                >
                  {source.archived ? "Restore to Inbox" : "Archive source"}
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
                  {busy === "analyze" ? <Busy /> : <Sparkles size={15} />}Review
                  with AI
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
                                api("/proposals/" + p.id, { action: "accept" }),
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
          )}
        </div>
      ) : (
        <Empty
          title="A clear inbox, a curious mind"
          text="Capture a resource, then decide what it contributes. Nothing becomes a new branch automatically."
        />
      )}
      {modal && (
        <Modal title="Capture a source" onClose={() => setModal(false)}>
          <label>
            Title
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
            disabled={!title.trim() || (!text.trim() && !url.trim()) || !!busy}
            onClick={() =>
              run("capture", async () => {
                const s = await api<Source>("/sources", {
                  title,
                  text,
                  url: url || undefined,
                });
                setSelected(s.id);
                setTitle("");
                setText("");
                setUrl("");
                setModal(false);
              })
            }
          >
            {busy ? <Busy /> : <Plus size={15} />}Save to Inbox
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
export function Review({
  data,
  refresh,
  notify,
  onOpen,
  initialId,
}: { initialId?: string } & Props) {
  const latest = new Map(
    data.reviews.map((r) => [r.noteId, r] as const).reverse(),
  );
  const due = data.notes
    .filter((n) => n.reviewEnabled !== false)
    .filter(
      (n) => !latest.has(n.id) || new Date(latest.get(n.id)!.due) <= new Date(),
    );
  const [id, setId] = useState(initialId || due[0]?.id || data.notes[0]?.id);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [question, setQuestion] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState("");
  const [consent, setConsent] = useState("");
  const note = data.notes.find((n) => n.id === id);
  const prompt =
    question ||
    `Explain ${note?.title || "this concept"} in your own words. Give an example, a limitation, and a connection to another concept.`;
  function choose(next: string) {
    setId(next);
    setAnswer("");
    setRevealed(false);
    setHint(false);
    setQuestion("");
    setFeedback("");
  }
  async function rate(rating: string) {
    if (!note) return;
    setBusy("save");
    try {
      await api("/reviews", {
        noteId: note.id,
        question: prompt,
        answer,
        rating,
        hintUsed: hint,
      });
      await refresh();
      notify("Practice recorded. Your next review is scheduled.");
      const next = due.find((n) => n.id !== note.id);
      if (next) choose(next.id);
      else {
        setRevealed(false);
        setAnswer("");
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="workspace-page review-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">RETRIEVE BEFORE YOU REVEAL</div>
          <h1>
            Make it stick<span className="title-dot">.</span>
          </h1>
          <p>A small practice session beats another unopened bookmark.</p>
        </div>
        <span className="pill">{due.length} concepts ready for review</span>
      </header>
      <div className="review-layout">
        <aside className="review-queue">
          <span className="eyebrow">YOUR CONCEPTS</span>
          {data.notes.map((n) => (
            <button
              className={id === n.id ? "selected" : ""}
              key={n.id}
              onClick={() => choose(n.id)}
            >
              <span className={"status-dot " + n.status} />
              <span>
                {n.title}
                <small>
                  {latest.has(n.id)
                    ? new Date(latest.get(n.id)!.due).toLocaleDateString()
                    : "First practice"}
                </small>
              </span>
              {due.some((d) => d.id === n.id) && (
                <i className="due-indicator" />
              )}
            </button>
          ))}
        </aside>
        {note ? (
          <article className="review-card">
            <div className="eyebrow">
              {note.group} / {note.title}
            </div>
            <h2>{prompt}</h2>
            <div className="actions">
              <button onClick={() => setHint(true)} disabled={hint}>
                <Eye size={14} />
                Need a hint
              </button>
              <button onClick={() => setConsent("question")}>
                <Sparkles size={14} />
                New AI question
              </button>
            </div>
            {hint && (
              <div className="hint">
                <strong>A small cue</strong>
                <p>{note.layers.intuition.split(/[.!?]/)[0]}.</p>
              </div>
            )}
            <label className="answer-label">
              Your explanation
              <textarea
                aria-label="Recall answer"
                placeholder="Close the mental textbook. What can you explain from memory?"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </label>
            {!revealed ? (
              <button className="primary" onClick={() => setRevealed(true)}>
                Reveal my note <Eye size={15} />
              </button>
            ) : (
              <>
                <div className="revealed-note">
                  <span className="eyebrow">YOUR SAVED EXPLANATION</span>
                  <MD text={note.layers.intuition} />
                  <details>
                    <summary>Technical detail</summary>
                    <MD text={note.layers.technical} />
                  </details>
                  <button onClick={() => onOpen(note)}>
                    Open note <ArrowUpRight size={13} />
                  </button>
                </div>
                <div className="review-assessment">
                  <h3>How did the attempt go?</h3>
                  <p>
                    {hint
                      ? "You used a hint. Record that honestly when choosing your next review."
                      : "Rate recall and application, not how familiar the answer looks."}
                  </p>
                  <div className="rating-buttons">
                    {[
                      ["again", "Could not recall", "10 min"],
                      ["hard", "Needed help", "1 day"],
                      ["good", "Explained it", "Spaced review"],
                      ["easy", "Applied it", "Longer interval"],
                    ].map(([key, label, time]) => (
                      <button
                        key={key}
                        disabled={!!busy}
                        onClick={() => rate(key)}
                      >
                        <strong>{label}</strong>
                        <small>{time}</small>
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    disabled={!answer.trim()}
                    onClick={() => setConsent("feedback")}
                  >
                    <Sparkles size={14} />
                    Get AI feedback on my attempt
                  </button>
                  {feedback && (
                    <div className="feedback">
                      <MD text={feedback} />
                    </div>
                  )}
                </div>
              </>
            )}
          </article>
        ) : (
          <Empty
            title="Start with one concept"
            text="Create a note, then return here to practice recalling it."
          />
        )}
      </div>
      {consent && (
        <Modal title="Use AI for this practice?" onClose={() => setConsent("")}>
          <p>
            This sends the selected note
            {consent === "feedback" ? " and your answer" : ""} to{" "}
            {data.config.provider === "ollama"
              ? "local Ollama"
              : "OpenAI, if configured"}
            . AI feedback is advice you can challenge.
          </p>
          <button
            className="primary"
            disabled={!!busy}
            onClick={async () => {
              const kind = consent;
              setBusy("ai");
              try {
                const result = await api("/notes/" + id + "/ai", {
                  kind,
                  question: prompt,
                  answer,
                });
                if (kind === "question") setQuestion(result.text);
                else setFeedback(result.text);
                setConsent("");
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            {busy ? <Busy /> : <Sparkles size={14} />}Approve and continue
          </button>
        </Modal>
      )}
    </div>
  );
}
export function Audio({ data, refresh, notify }: Props) {
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
          <div className="eyebrow">TAKE YOUR LEARNING WITH YOU</div>
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
            Create local script
          </button>
          <button
            disabled={!selected.length || !!busy}
            onClick={() => setModal("script")}
          >
            <Sparkles size={14} />
            Draft with AI
          </button>
          <div className="quiet-note">
            <p>
              Local scripts and Windows speech need no cloud provider. Listening
              alone does not mark a concept practiced.
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
                  setScript(episode.script);
                  setEditing(!editing);
                }}
              >
                Edit script
              </button>
              <button
                className="primary"
                disabled={!!busy || editing}
                onClick={() =>
                  run("render", () =>
                    api("/episodes/" + episode.id + "/render", {
                      provider: "local",
                    }),
                  )
                }
              >
                {busy === "render" ? <Busy /> : <Play size={14} />}Generate
                local audio
              </button>
              <button
                disabled={!!busy || editing}
                onClick={() => setModal("speech")}
              >
                <Sparkles size={14} />
                OpenAI voice
              </button>
            </div>
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
                <MD text={episode.script} />
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
                      (modal === "speech" ? "/render" : "/deliver"),
                    modal === "speech"
                      ? { provider: "openai", consent: true }
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
