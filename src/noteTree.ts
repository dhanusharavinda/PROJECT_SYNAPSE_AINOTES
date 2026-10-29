import type { Note } from "./types";
export function noteTree(
  notes: Note[],
  expanded: Set<string>,
  matches?: Set<string>,
) {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const included = matches ? new Set(matches) : new Set(byId.keys());
  if (matches)
    for (const id of matches) {
      let parent = byId.get(id)?.parentId;
      const seen = new Set([id]);
      while (parent && !seen.has(parent) && byId.has(parent)) {
        included.add(parent);
        seen.add(parent);
        parent = byId.get(parent)?.parentId;
      }
    }
  const children = new Map<string, Note[]>();
  for (const n of notes)
    if (included.has(n.id)) {
      const key = n.parentId && byId.has(n.parentId) ? n.parentId : "";
      children.set(key, [...(children.get(key) || []), n]);
    }
  const rows: { note: Note; depth: number; count: number }[] = [],
    seen = new Set<string>();
  function visit(n: Note, depth: number) {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    const kids = children.get(n.id) || [];
    rows.push({ note: n, depth, count: kids.length });
    if (matches || expanded.has(n.id))
      for (const child of kids) visit(child, depth + 1);
  }
  for (const n of children.get("") || []) visit(n, 0);
  // Keep malformed cyclic imports reachable, without promoting folded children.
  for (const n of notes)
    if (included.has(n.id) && !seen.has(n.id)) {
      let parent = n.parentId;
      const ancestors = new Set([n.id]);
      while (parent && byId.has(parent) && !ancestors.has(parent)) {
        ancestors.add(parent);
        parent = byId.get(parent)?.parentId;
      }
      if (parent && ancestors.has(parent)) visit(n, 0);
    }
  return rows;
}
