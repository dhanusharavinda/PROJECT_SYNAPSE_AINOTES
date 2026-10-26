import type { ReactNode } from "react";
import { X, LoaderCircle } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function MD({ text }: { text: string }) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => (
            <img
              src={
                src?.startsWith("../attachments/")
                  ? src.replace("../attachments/", "/files/attachments/")
                  : src?.startsWith("../drawings/")
                    ? src.replace("../drawings/", "/files/drawings/")
                    : src
              }
              alt={alt || "Note image"}
            />
          ),
          a: ({ href, children }) => (
            <a
              href={
                href?.match(/^([a-f0-9-]{36})\.md$/)
                  ? "/?note=" + href.slice(0, -3)
                  : href
              }
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
export function Busy() {
  return <LoaderCircle className="spin" size={18} />;
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-orbit">✦</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
