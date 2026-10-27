import { useState } from "react";
import type { Note } from "./types";
import { api } from "./api";
import { MD } from "./ui";
export default function AITeacher({ notes }: { notes: Note[] }) {
  const [ids, setIds] = useState<string[]>([]),
    [lesson, setLesson] = useState<{
      question: string;
      hint: string;
      explanation: string;
    }>(),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState(""),
    [reveal, setReveal] = useState(false),
    [hint, setHint] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function ask(evaluate = false) {
    setBusy(true);
    setError("");
    try {
      const r = await api<any>("/teacher", {
        noteIds: ids,
        ...(evaluate ? { question: lesson?.question, answer } : {}),
      });
      if (evaluate) setFeedback(r.feedback);
      else {
        setLesson(r);
        setAnswer("");
        setReveal(false);
        setHint(false);
        setFeedback("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="ai-teacher">
      <summary>AI teacher, practise selected notes</summary>
      <p>
        Pick up to ten notes. Try recalling the answer before asking for a hint.
        Requests use your configured AI provider.
      </p>
      <div className="teacher-notes">
        {notes.map((n) => (
          <label key={n.id}>
            <input
              type="checkbox"
              checked={ids.includes(n.id)}
              disabled={busy || (!ids.includes(n.id) && ids.length >= 10)}
              onChange={(e) => {
                setIds(
                  e.target.checked
                    ? [...ids, n.id]
                    : ids.filter((id) => id !== n.id),
                );
                setLesson(undefined);
              }}
            />
            {n.title}
          </label>
        ))}
      </div>
      <button disabled={busy || !ids.length} onClick={() => void ask()}>
        Ask a question
      </button>
      {error && <p role="alert">{error}</p>}
      {lesson && (
        <>
          <h3>{lesson.question}</h3>
          <textarea
            aria-label="Teacher answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Explain from memory"
          />
          <button onClick={() => setHint(true)}>Hint</button>
          {hint && <MD text={lesson.hint} />}
          <button
            disabled={busy || !answer.trim()}
            onClick={() => void ask(true)}
          >
            Discuss my answer
          </button>
          <button onClick={() => setReveal(true)}>Reveal explanation</button>
          {reveal && <MD text={lesson.explanation} />}
          <MD text={feedback} />
        </>
      )}
    </details>
  );
}
