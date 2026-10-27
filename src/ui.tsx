import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { X, LoaderCircle } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { parseVariants } from "./content";
import { fileUrl, mediaUrl } from "./api";
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
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current
      ?.querySelector<HTMLElement>(
        'button,input,select,textarea,[tabindex="0"]',
      )
      ?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const controls = [
              ...panel.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
              ),
            ].filter((el) => el.getClientRects().length > 0);
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
const safeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [["dataPastel", "rose", "peach", "lemon", "mint", "sky", "lavender"]],
  },
};
function MarkdownText({ text, share }: { text: string; share?: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, safeSchema]]}
      components={{
        a: ({ href, children }) => {
          let target = href;
          if (href?.match(/^([a-f0-9-]{36})\.md$/))
            target = "/?note=" + href.slice(0, -3);
          else if (href?.startsWith("../attachments/"))
            target = href.replace("../attachments/", "/files/attachments/");
          if (share && target?.startsWith("/files/"))
            target +=
              (target.includes("?") ? "&" : "?") +
              "share=" +
              encodeURIComponent(share);
          return (
            <a
              href={target ? mediaUrl(target) : target}
              target={target?.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
            >
              {children}
            </a>
          );
        },
        img: ({ src, alt, title }) => {
          let target = src?.replace(
            /^\.\.\/(attachments|drawings)\//,
            "/files/$1/",
          );
          if (share && target?.startsWith("/files/"))
            target +=
              (target.includes("?") ? "&" : "?") +
              "share=" +
              encodeURIComponent(share);
          const width = title?.match(/^synapse-width:(\d+)$/)?.[1];
          return (
            <img
              src={target ? mediaUrl(target) : target}
              alt={alt || "Note image"}
              style={
                width
                  ? { width: Math.min(Number(width), 1200), maxWidth: "100%" }
                  : undefined
              }
            />
          );
        },
        pre: ({ children }) => (
          <div className="reading-code">
            <button
              onClick={(e) => {
                const code =
                  e.currentTarget.parentElement?.querySelector("code")
                    ?.textContent || "";
                const button = e.currentTarget;
                (
                  navigator.clipboard?.writeText(code) ||
                  Promise.reject(new Error())
                )
                  .then(() => {
                    button.textContent = "Copied";
                  })
                  .catch(() => {
                    button.textContent = "Select code and copy";
                  });
              }}
            >
              Copy code
            </button>
            <pre>{children}</pre>
          </div>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}
export function MD({
  text,
  share,
  depth = 0,
}: {
  text: string;
  share?: string;
  depth?: number;
}) {
  if (depth > 12) return <MarkdownText text={text} share={share} />;
  const blocks: any[] = [];
  const matcher = /^:::variants\s*$|^:::drawing (\{[^\n]*\}) :::\s*$/gm;
  let cursor = 0;
  for (const match of text.matchAll(matcher)) {
    if (match.index! < cursor) continue;
    const prefix = text.slice(0, match.index);
    const fences = prefix.match(/^```|^~~~/gm) || [];
    if (fences.length % 2) continue;
    const variants = match[0].startsWith(":::variants")
      ? parseVariants(text.slice(match.index))
      : undefined;
    if (variants) {
      if (match.index! > cursor)
        blocks.push(
          <MarkdownText
            key={cursor + "text"}
            text={text.slice(cursor, match.index)}
            share={share}
          />,
        );
      blocks.push(
        <div className="reading-variants" key={match.index}>
          <MD text={variants.options[0].body} share={share} depth={depth + 1} />
          <details>
            <summary>
              {variants.options[0].label ||
                `${variants.options.length - 1} alternative explanations`}
            </summary>
            {variants.options.slice(1).map((o, i) => (
              <section key={i}>
                {o.label && <strong>{o.label}</strong>}
                <MD text={o.body} share={share} depth={depth + 1} />
              </section>
            ))}
          </details>
        </div>,
      );
      cursor = match.index! + variants.raw.length;
    } else if (match[1]) {
      try {
        const attrs = JSON.parse(match[1]);
        if (!/^[a-f0-9-]{36}$/.test(attrs.id)) continue;
        if (match.index! > cursor)
          blocks.push(
            <MarkdownText
              key={cursor + "text"}
              text={text.slice(cursor, match.index)}
              share={share}
            />,
          );
        blocks.push(
          <figure className="reading-drawing" key={match.index}>
            <img
              src={fileUrl("drawings", attrs.id + ".svg", share)}
              alt="Drawing or flowchart"
              style={{ width: attrs.width || "100%", maxWidth: "100%" }}
            />
          </figure>,
        );
        cursor = match.index! + match[0].length;
      } catch {}
    }
  }
  if (cursor < text.length || !blocks.length)
    blocks.push(
      <MarkdownText
        key={cursor + "tail"}
        text={text.slice(cursor)}
        share={share}
      />,
    );
  return <div className="markdown">{blocks}</div>;
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
