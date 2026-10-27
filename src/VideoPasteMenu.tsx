import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
export default function VideoPasteMenu({
  x,
  y,
  onChoose,
  allowThumbnail = true,
}: {
  x: number;
  y: number;
  onChoose: (mode: "link" | "named" | "thumbnail", label: string) => void;
  allowThumbnail?: boolean;
}) {
  const [label, setLabel] = useState("YouTube video");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = () => {
      input.current?.focus();
      input.current?.select();
    };
    if (typeof window.requestAnimationFrame === "function") {
      const frame = requestAnimationFrame(focus);
      return () => cancelAnimationFrame(frame);
    }
    const timer = setTimeout(focus, 0);
    return () => clearTimeout(timer);
  }, []);
  return createPortal(
    <div
      className="video-paste-menu"
      role="dialog"
      aria-label="Paste YouTube video"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onChoose("link", label);
        }
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          onChoose("named", label);
        }
        if (e.key === "Tab") {
          const controls = [
            ...e.currentTarget.querySelectorAll<HTMLElement>("input,button"),
          ];
          const first = controls[0],
            last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <strong>Paste video as</strong>
      <input
        ref={input}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Video name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <button onClick={() => onChoose("link", label)}>Link only</button>
      <button onClick={() => onChoose("named", label)}>Named link</button>
      {allowThumbnail && (
        <button onClick={() => onChoose("thumbnail", label)}>
          Resizable thumbnail
        </button>
      )}
      <button className="text-button" onClick={() => onChoose("link", label)}>
        Keep original link
      </button>
    </div>,
    document.body,
  );
}
