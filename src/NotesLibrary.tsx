import { useState, useEffect } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import type { Note } from "./types";
import { noteSummary } from "./content";
import SlidesExport from "./SlidesExport";
export default function NotesLibrary({
  notes,
  onOpen,
  onNew,
  onDelete,
}: {
  notes: Note[];
  onOpen: (note: Note) => void;
  onNew: () => void;
  onDelete: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState(""),
    [group, setGroup] = useState(""),
    [order, setOrder] = useState("updated"),
    [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    setSelected((ids) =>
      ids.filter((id) => notes.some((note) => note.id === id)),
    );
  }, [notes]);
  const groups = [...new Set(notes.map((n) => n.group))].sort();
  const [slidesOpen, setSlidesOpen] = useState(false);
  const filtered = notes
    .filter(
      (n) =>
        (!group || n.group === group) &&
        (!query ||
          [n.title, n.context, n.group, n.noteDate || ""]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a, b) =>
      order === "title"
        ? a.title.localeCompare(b.title)
        : order === "date"
          ? (b.noteDate || "").localeCompare(a.noteDate || "")
          : b.updated.localeCompare(a.updated),
    );
  return (
    <div className="notes-library workspace-page">
      <header className="library-heading">
        <div>
          <h1>All notes</h1>
          <p>
            {notes.length} {notes.length === 1 ? "note" : "notes"} in your
            notebook
          </p>
        </div>
        <button onClick={onNew}>
          <Plus size={16} />
          New note
        </button>
      </header>
      <div className="library-filters">
        <label className="library-search">
          <Search size={16} />
          <input
            aria-label="Find a note"
            placeholder="Find a note"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter notes by group"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select
          aria-label="Sort notes"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        >
          <option value="updated">Recently edited</option>
          <option value="date">Note date</option>
          <option value="title">Title</option>
        </select>
      </div>
      {selected.length > 0 && (
        <div className="library-selection">
          <span>{selected.length} selected</span>
          <button onClick={() => setSelected([])}>Clear</button>
          <button onClick={() => onDelete(selected)}>
            <Trash2 size={15} />
            Delete
          </button>
          <button
            disabled={selected.length > 10}
            onClick={() => setSlidesOpen(true)}
          >
            Export slides
          </button>
        </div>
      )}
      {slidesOpen && (
        <SlidesExport
          notes={notes.filter((n) => selected.includes(n.id))}
          onClose={() => setSlidesOpen(false)}
        />
      )}
      <div className="library-table">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all visible notes"
                  checked={
                    !!filtered.length &&
                    filtered.every((n) => selected.includes(n.id))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? filtered.map((n) => n.id) : [],
                    )
                  }
                />
              </th>
              <th>Note</th>
              <th>Group</th>
              <th>Date</th>
              <th>Edited</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((n) => (
              <tr key={n.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={"Select " + n.title}
                    checked={selected.includes(n.id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, n.id]
                          : ids.filter((id) => id !== n.id),
                      )
                    }
                  />
                </td>
                <td>
                  <button className="library-note" onClick={() => onOpen(n)}>
                    <strong>{n.title}</strong>
                    <span>{noteSummary(n).slice(0, 100) || n.context}</span>
                  </button>
                </td>
                <td>{n.group}</td>
                <td>
                  {n.noteDate ? (
                    new Date(n.noteDate + "T12:00:00").toLocaleDateString()
                  ) : (
                    <span className="muted">No date</span>
                  )}
                </td>
                <td>{new Date(n.updated).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="library-empty">
          {notes.length
            ? "No notes match your search."
            : "Start with a note about something you want to understand."}
        </p>
      )}
    </div>
  );
}
