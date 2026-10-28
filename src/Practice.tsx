import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Lightbulb,
  Pin,
  Sparkles,
} from "lucide-react";
import type { Bootstrap, Note } from "./types";
import type { PracticeDeck } from "./practiceContent";
import { api } from "./api";
import { Busy, Empty } from "./ui";
import AITeacher from "./AITeacher";
import "./practice.css";

type Props = {
  data: Bootstrap;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  onOpen: (note: Note) => void;
  initialId?: string;
};
export default function Practice({
  data,
  refresh,
  notify,
  onOpen,
  initialId,
}: Props) {
  const notes = data.notes.filter((n) => !n.archived);
  const [id, setId] = useState(
    initialId ||
      notes.find(
        (n) =>
          n.reviewEnabled !== false &&
          (!data.reviews.some((r) => r.noteId === n.id) ||
            new Date(data.reviews.find((r) => r.noteId === n.id)!.due) <=
              new Date()),
      )?.id ||
      notes[0]?.id ||
      "",
  );
  const [mode, setMode] = useState<"recall" | "cards">("recall");
  const [onlyPins, setOnlyPins] = useState(false);
  const [deck, setDeck] = useState<PracticeDeck>();
  const [selected, setSelected] = useState<string[]>([]);
  const [revealedUnits, setRevealedUnits] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [answer, setAnswer] = useState("");
  const [index, setIndex] = useState(0);
  const [recallIndex, setRecallIndex] = useState(0);
  useEffect(() => setRecallIndex(0), [id]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [recorded, setRecorded] = useState(false);
  const generation = useRef(0);
  const note = notes.find((n) => n.id === id);
  const noteContent = note
    ? JSON.stringify([
        note.title,
        note.context,
        note.body,
        note.layers,
        note.canvas,
        note.links,
        note.drawings,
      ])
    : "";
  const pinned = (n: Note) => n.canvas?.items.some((i) => i.uncertain);
  const visibleNotes = onlyPins ? notes.filter(pinned) : notes;
  const card = deck?.cards[index];
  const latest = data.reviews.find((r) => r.noteId === id);
  useEffect(() => {
    const serial = ++generation.current;
    setDeck(undefined);
    setError("");
    setBusy("load");
    setSelected([]);
    setRevealedUnits([]);
    setHidden(false);
    setRevealed(false);
    setHint(false);
    setAnswer("");
    setIndex(0);
    setRecorded(false);
    if (!note) {
      setBusy("");
      return;
    }
    api<PracticeDeck>(`/practice/${note.id}`)
      .then((result) => {
        if (serial !== generation.current) return;
        setDeck(result);
        setSelected(
          result.units.filter((u) => u.uncertain && u.text).map((u) => u.id),
        );
      })
      .catch((e) => {
        if (serial === generation.current) setError(e.message);
      })
      .finally(() => {
        if (serial === generation.current) setBusy("");
      });
    return () => {
      generation.current++;
    };
  }, [id, noteContent]);
  function resetAttempt() {
    setRevealedUnits([]);
    setHint(false);
    setAnswer("");
    setRevealed(false);
    setRecorded(false);
  }
  async function createCards() {
    if (!note) return;
    const serial = generation.current;
    setBusy("cards");
    setError("");
    try {
      const result = await api<PracticeDeck>(`/practice/${note.id}/cards`, {});
      if (serial === generation.current) {
        setDeck(result);
        setIndex(0);
        resetAttempt();
      }
    } catch (e) {
      if (serial === generation.current) setError((e as Error).message);
    } finally {
      if (serial === generation.current) setBusy("");
    }
  }
  async function setSchedule(enabled: boolean) {
    if (!note) return;
    const serial = generation.current;
    setBusy("schedule");
    try {
      await api(
        `/notes/${note.id}`,
        { ...note, reviewEnabled: enabled },
        "PUT",
      );
      await refresh();
    } catch (e) {
      if (serial === generation.current) setError((e as Error).message);
    } finally {
      if (serial === generation.current) setBusy("");
    }
  }
  async function rate(rating: string) {
    if (!note || recorded || !revealed) return;
    const serial = generation.current;
    setBusy("save");
    try {
      await api("/reviews", {
        noteId: note.id,
        question:
          mode === "cards"
            ? card?.question
            : `Recall: ${
                deck?.units
                  .filter((u) => selected.includes(u.id))
                  .map((u) => u.label)
                  .join(", ") || note.title
              }`,
        answer,
        rating,
        hintUsed: hint,
      });
      if (serial === generation.current) setRecorded(true);
      await refresh();
      notify("Practice saved.");
    } catch (e) {
      if (serial === generation.current) setError((e as Error).message);
    } finally {
      if (serial === generation.current) setBusy("");
    }
  }
  if (!notes.length)
    return (
      <div className="workspace-page">
        <Empty title="Practice" text="Create a note to start recalling it." />
      </div>
    );
  return (
    <div className="workspace-page practice-page">
      <header className="practice-heading">
        <h1>Practice</h1>
        <button
          className={onlyPins ? "active" : ""}
          aria-pressed={onlyPins}
          onClick={() => {
            setOnlyPins(!onlyPins);
            if (!onlyPins && note && !pinned(note))
              setId(notes.find(pinned)?.id || "");
          }}
        >
          <Pin size={15} />
          Uncertain
        </button>
      </header>
      <div className="practice-controls">
        <select
          aria-label="Practice note"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="" disabled>
            Choose a note
          </option>
          {visibleNotes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
              {pinned(n) ? " (pinned)" : ""}
            </option>
          ))}
        </select>
        <div className="practice-modes" role="group" aria-label="Practice mode">
          <button
            aria-pressed={mode === "recall"}
            onClick={() => {
              setMode("recall");
              resetAttempt();
            }}
          >
            Recall
          </button>
          <button
            aria-pressed={mode === "cards"}
            onClick={() => {
              setMode("cards");
              resetAttempt();
            }}
          >
            Flashcards
          </button>
        </div>
      </div>
      {note && (
        <div className="practice-meta">
          <button className="text-button" onClick={() => onOpen(note)}>
            Open note
          </button>
          <details className="practice-schedule">
            <summary>
              {latest
                ? `Next practice ${new Date(latest.due).toLocaleDateString()}`
                : "Practice settings"}
            </summary>
            <label>
              <input
                type="checkbox"
                checked={note.reviewEnabled !== false}
                disabled={!!busy}
                onChange={(e) => setSchedule(e.target.checked)}
              />
              Include in scheduled practice
            </label>
            {latest && (
              <small>
                Last attempt {new Date(latest.date).toLocaleDateString()}
              </small>
            )}
          </details>
        </div>
      )}
      {error && (
        <p className="practice-error" role="alert">
          {error}
        </p>
      )}
      {busy === "load" && <Busy />}
      {!note && (
        <Empty
          title={onlyPins ? "No uncertainty pins" : "Choose a note"}
          text={
            onlyPins
              ? "Pin an object in your notebook when you want to revisit it."
              : "Select a note to begin."
          }
        />
      )}
      {note && deck && mode === "recall" && (
        <section className="recall-sheet" aria-label="Recall sheet">
          <div className="recall-controls">
            <p>
              {hidden
                ? "Recall, then reveal to compare."
                : "Choose what to recall."}
            </p>
            <label className="recall-toggle">
              <input
                type="checkbox"
                role="switch"
                aria-label="Hide selected answers"
                checked={hidden}
                disabled={!selected.length}
                onChange={(e) => {
                  setHidden(e.target.checked);
                  setRevealedUnits([]);
                  setRevealed(!e.target.checked);
                  setRecorded(false);
                }}
              />
              Hide answers
            </label>
          </div>
          {!deck.units.length && <p>Add an explanation to this note first.</p>}
          <div className="recall-passages">
            {deck.units
              .slice(
                Math.min(recallIndex, Math.max(0, deck.units.length - 1)),
                Math.min(recallIndex, Math.max(0, deck.units.length - 1)) + 1,
              )
              .map((unit) => (
                <div
                  className={
                    "recall-passage" +
                    (selected.includes(unit.id) ? " selected" : "")
                  }
                  key={unit.id}
                >
                  <label>
                    <input
                      aria-label={`Hide ${unit.label}${hidden ? "" : ": " + unit.text.slice(0, 45)}`}
                      type="checkbox"
                      disabled={hidden || !unit.text}
                      checked={selected.includes(unit.id)}
                      onChange={(e) => {
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, unit.id]
                            : s.filter((x) => x !== unit.id),
                        );
                        setRevealed(false);
                      }}
                    />
                    <span>
                      {unit.uncertain && (
                        <Pin size={12} className="uncertainty-pin" />
                      )}
                      {unit.label}
                    </span>
                  </label>
                  {hidden &&
                  selected.includes(unit.id) &&
                  !revealedUnits.includes(unit.id) ? (
                    <button
                      className="recall-mask"
                      aria-label={`Reveal ${unit.label}`}
                      onClick={() => {
                        setHint(true);
                        setRevealedUnits((s) => [...s, unit.id]);
                      }}
                    >
                      <Eye size={16} />
                      <span>Reveal this part</span>
                    </button>
                  ) : (
                    <p>
                      {unit.text ||
                        "This pinned object has no text. Open the note to review it visually."}
                    </p>
                  )}
                </div>
              ))}
          </div>
          {deck.units.length > 1 && (
            <div className="recall-navigation">
              <button
                aria-label="Previous passage"
                disabled={recallIndex === 0}
                onClick={() => setRecallIndex((i) => i - 1)}
              >
                <ArrowLeft size={15} />
              </button>
              <span>
                {recallIndex + 1} / {deck.units.length}
              </span>
              <button
                aria-label="Next passage"
                disabled={recallIndex >= deck.units.length - 1}
                onClick={() => setRecallIndex((i) => i + 1)}
              >
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {hidden && (
            <>
              <details className="practice-write">
                <summary>Write an answer (optional)</summary>{" "}
                <textarea
                  aria-label="Recall answer"
                  placeholder="Your answer, optional"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </details>
              <button
                className="primary"
                onClick={() => {
                  setHidden(false);
                  setRevealed(true);
                }}
              >
                <Eye size={15} />
                Reveal all
              </button>
            </>
          )}
        </section>
      )}
      {note && deck && mode === "cards" && (
        <section className="flashcard-stage" aria-label="Flashcards">
          {!card ? (
            <div className="flashcard-empty">
              <h2>Test your understanding</h2>
              <p>Six focused questions, with hints from your note.</p>
              <button
                className="primary"
                disabled={!!busy || data.config.provider === "none"}
                onClick={createCards}
              >
                {busy === "cards" ? <Busy /> : <Sparkles size={15} />}Create
                flashcards
              </button>
              <small>
                {data.config.provider === "none"
                  ? "Choose an AI provider in Settings. Recall works without AI."
                  : `Uses ${data.config.provider === "ollama" ? "local Ollama" : "your configured OpenAI model"} with this note's text and saved diagram labels.`}
              </small>
            </div>
          ) : (
            <>
              <div className="flashcard-position">
                <span>
                  {index + 1} / {deck.cards.length}
                </span>
                <div>
                  <button
                    aria-label="Previous card"
                    disabled={index === 0 || !!busy}
                    onClick={() => {
                      setIndex((i) => i - 1);
                      resetAttempt();
                    }}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    aria-label="Next card"
                    disabled={index === deck.cards.length - 1 || !!busy}
                    onClick={() => {
                      setIndex((i) => i + 1);
                      resetAttempt();
                    }}
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
              <h2>{card.question}</h2>
              {!revealed && (
                <>
                  <button
                    className="text-button"
                    disabled={hint}
                    onClick={() => setHint(true)}
                  >
                    <Lightbulb size={15} />
                    Hint
                  </button>
                  {hint && (
                    <p className="practice-hint">
                      {card.hint || "Think about the main idea in this note."}
                    </p>
                  )}
                  <details className="practice-write">
                    <summary>Write an answer (optional)</summary>{" "}
                    <textarea
                      aria-label="Flashcard answer"
                      placeholder="Say it aloud, or write your answer"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                  </details>
                  <button className="primary" onClick={() => setRevealed(true)}>
                    <Eye size={15} />
                    Reveal answer
                  </button>
                </>
              )}
              {revealed && (
                <div className="flashcard-answer">
                  <p>{card.answer}</p>
                  <details>
                    <summary>From your note</summary>
                    <blockquote>{card.evidence}</blockquote>
                  </details>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {revealed && note && (
        <div className="practice-rating">
          <span>{recorded ? "Practice recorded" : "How did it go?"}</span>
          <div>
            {[
              ["again", "Again"],
              ["hard", "With help"],
              ["good", "Recalled"],
              ["easy", "Applied"],
            ].map(([value, label]) => (
              <button
                key={value}
                disabled={!!busy || recorded}
                onClick={() => rate(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <small>Only a recorded attempt counts as practice.</small>
        </div>
      )}
      <AITeacher notes={notes} />
    </div>
  );
}
