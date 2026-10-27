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
      shortcuts: { ...shortcutDefaults, ...stored.shortcuts },
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
      : event.code.startsWith("Digit")
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
