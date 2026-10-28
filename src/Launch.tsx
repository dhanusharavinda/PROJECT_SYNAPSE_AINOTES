import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import "./launch.css";
function Ready({
  onReady,
  children,
}: {
  onReady: () => void;
  children: ReactNode;
}) {
  useEffect(onReady, [onReady]);
  return <>{children}</>;
}
export { Ready };
export class ShellBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="launch-error" role="alert"><h1>Synapse could not open</h1><p>Your saved notebook is unchanged. Reload to try again.</p><button onClick={() => location.reload()}>Reload Synapse</button></main>;
    return this.props.children;
  }
}
export default function Launch({ ready, onDismiss }: { ready: boolean; onDismiss?: () => void }) {
  const [elapsed, setElapsed] = useState(false),
    [skip, setSkip] = useState(false),
    [gone, setGone] = useState(false);
  const overlay = useRef<HTMLDivElement>(null), skipButton = useRef<HTMLButtonElement>(null);
  const dismiss = useRef(onDismiss); dismiss.current = onDismiss;
  useEffect(() => {
    if (gone) return;
    overlay.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      // Canvas shortcuts listen on window. Inert content alone does not disable those handlers.
      event.stopImmediatePropagation();
      if (event.key === "Escape") { event.preventDefault(); if (ready) setSkip(true); return; }
      if (event.key === "Tab") { event.preventDefault(); (skipButton.current || overlay.current)?.focus({ preventScroll: true }); return; }
      if ((event.key === "Enter" || event.key === " ") && event.target === skipButton.current && !event.ctrlKey && !event.metaKey && !event.altKey) return;
      event.preventDefault();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [gone, ready]);
  useEffect(() => {
    let duration = 850;
    try {
      if (localStorage.getItem("synapse-long-welcome") === "true")
        duration = 5000;
    } catch {}
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      duration = 0;
    const timer = setTimeout(() => setElapsed(true), duration);
    return () => clearTimeout(timer);
  }, []);
  const leaving = ready && (elapsed || skip);
  useEffect(() => {
    if (leaving) {
      const timer = setTimeout(() => { setGone(true); dismiss.current?.(); }, 280);
      return () => clearTimeout(timer);
    }
  }, [leaving]);
  if (gone) return null;
  return (
    <div
      ref={overlay}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className={"synapse-launch" + (leaving ? " leaving" : "")}
      aria-label="Opening Synapse"
    >
      <div className="launch-colour" aria-hidden="true" />
      <span className="launch-wordmark">Synapse</span>
      {ready && <button ref={skipButton} onClick={() => setSkip(true)}>Open notebook</button>}
    </div>
  );
}
