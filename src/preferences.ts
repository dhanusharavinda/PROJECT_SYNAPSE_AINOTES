import { useEffect, useState } from "react";

export const shortcutDefaults: Record<string, string> = {
  rose: "Alt+1",
  peach: "Alt+2",
  lemon: "Alt+3",
  mint: "Alt+4",
  draw: "Alt+5",
  select: "Alt+6",
  text: "Alt+7",
  arrow: "Alt+8",
  table: "Alt+9",
  eraser: "E",
  write: "",
  rectangle: "",
  ellipse: "",
  diamond: "",
  triangle: "",
  line: "",
  undo: "Ctrl+Z",
  redo: "Ctrl+Shift+Z",
  "select-all": "Ctrl+A",
  duplicate: "Ctrl+D",
  bold: "Ctrl+B",
  italic: "Ctrl+I",
  underline: "Ctrl+U",
  code: "",
  "inline-code": "",
  bullet: "",
  numbered: "",
  todo: "",
  h1: "",
  h2: "",
  h3: "",
  variant: "",
  link: "",
  page: "",
  image: "",
  file: "",
  flowchart: "",
  quote: "",
  divider: "",
  library: "",
  graph: "",
  settings: "",
  "new-note": "Ctrl+N",
  theme: "",
  save: "Ctrl+S",
  search: "Ctrl+K",
  copy: "Ctrl+C",
  cut: "Ctrl+X",
  paste: "Ctrl+V",
};
export const shortcutLabels: Record<string, string> = {
  rose: "Rose text",
  peach: "Peach text",
  lemon: "Yellow text",
  mint: "Mint text",
  draw: "Pen",
  select: "Move objects",
  text: "Text anywhere",
  arrow: "Arrow",
  table: "Table",
  eraser: "Eraser",
  write: "Writing",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Diamond",
  triangle: "Triangle",
  line: "Line",
  undo: "Undo",
  redo: "Redo",
  "select-all": "Select all",
  duplicate: "Duplicate selection",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  code: "Code block",
  "inline-code": "Inline code",
  bullet: "Bullet list",
  numbered: "Numbered list",
  todo: "To-do list",
  h1: "Large heading",
  h2: "Heading",
  h3: "Small heading",
  variant: "Another explanation",
  link: "Link a note",
  page: "Subpage",
  image: "Image",
  file: "PDF or file",
  flowchart: "Flowchart",
  quote: "Quote",
  divider: "Divider",
  library: "All notes",
  graph: "Knowledge graph",
  settings: "Settings",
  "new-note": "New note",
  theme: "Switch theme",
  save: "Save note",
  search: "Find notes",
  copy: "Copy",
  cut: "Cut",
  paste: "Paste",
};
export interface Preferences {
  font: "default" | "handwritten";
  shortcuts: Record<string, string>;
}
export function readPreferences(): Preferences {
  try {
    const stored = JSON.parse(
      localStorage.getItem("synapse-preferences") || "{}",
    );
    return {
      font: stored.font === "handwritten" ? "handwritten" : "default",
      shortcuts: {
        ...shortcutDefaults,
        ...(Object.fromEntries(
          Object.entries(stored.shortcuts || {}).filter(
            ([key, value]) =>
              key in shortcutDefaults && typeof value === "string",
          ),
        ) as Record<string, string>),
      },
    };
  } catch {
    return { font: "default", shortcuts: { ...shortcutDefaults } };
  }
}
export function savePreferences(value: Preferences) {
  localStorage.setItem("synapse-preferences", JSON.stringify(value));
  window.dispatchEvent(new Event("synapse:preferences"));
}
export function usePreferences() {
  const [value, setValue] = useState(readPreferences);
  useEffect(() => {
    const update = () => setValue(readPreferences());
    window.addEventListener("synapse:preferences", update);
    return () => window.removeEventListener("synapse:preferences", update);
  }, []);
  return value;
}
export function keyCombination(event: KeyboardEvent | React.KeyboardEvent) {
  const key =
    event.key === " "
      ? "Space"
      : event.code?.startsWith("Digit")
        ? event.code.slice(5)
        : event.key.length === 1
          ? event.key.toUpperCase()
          : event.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return "";
  return [
    event.ctrlKey ? "Ctrl" : "",
    event.metaKey ? "Meta" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    key,
  ]
    .filter(Boolean)
    .join("+");
}
