import { Node, Mark, mergeAttributes, type JSONContent } from "@tiptap/core";
import {
  NodeViewWrapper,
  NodeViewContent,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import CodeBlock from "@tiptap/extension-code-block";
import { useEffect, useState, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Copy,
  Check,
  PenLine,
  Trash2,
} from "lucide-react";
import { parseVariants } from "./content";
import { fileUrl } from "./api";
import { copyText } from "./clipboard";

export function VariantGroupView({ node, editor, getPos }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  function add() {
    const pos = getPos();
    if (pos === undefined) return;
    editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize - 1, {
        type: "variantOption",
        attrs: { label: "" },
        content: [{ type: "paragraph" }],
      })
      .run();
    setOpen(true);
  }
  return (
    <NodeViewWrapper className={"variant-group " + (open ? "expanded" : "")}>
      <div contentEditable={false} className="variant-controls">
        <button
          onClick={() => setOpen(!open)}
          aria-label={open ? "Collapse variants" : "Expand variants"}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{" "}
          {node.childCount - 1}{" "}
          {node.childCount === 2 ? "alternative" : "alternatives"}
        </button>
        {editor.isEditable && (
          <button onClick={add} aria-label="Add another variant">
            <Plus size={12} />
            Add variant
          </button>
        )}
      </div>
      <NodeViewContent className="variant-options" />
    </NodeViewWrapper>
  );
}
export function VariantOptionView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  return (
    <NodeViewWrapper className="variant-option">
      <div contentEditable={false} className="variant-label-row">
        {editor.isEditable ? (
          <input
            aria-label="Variant label (optional)"
            value={node.attrs.label || ""}
            placeholder="Label (optional)"
            onChange={(e) => updateAttributes({ label: e.target.value })}
          />
        ) : node.attrs.label ? (
          <span>{node.attrs.label}</span>
        ) : null}
        {editor.isEditable && (
          <button
            aria-label="Remove this variant"
            title="Remove this variant"
            onClick={() => {
              const pos = getPos();
              if (pos !== undefined) {
                const $pos = editor.state.doc.resolve(pos);
                if ($pos.parent.childCount > 1)
                  editor
                    .chain()
                    .focus()
                    .deleteRange({ from: pos, to: pos + node.nodeSize })
                    .run();
              }
            }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      <NodeViewContent className="variant-text" />
    </NodeViewWrapper>
  );
}
export const VariantOption = Node.create({
  name: "variantOption",
  content: "block+",
  defining: true,
  addAttributes() {
    return { label: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-variant-option]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-variant-option": "" }),
      0,
    ];
  },
  renderMarkdown(node, h) {
    return `:::option ${JSON.stringify({ label: node.attrs?.label || "" })}\n\n${h.renderChildren(node.content || [], "\n\n")}\n\n:::endoption`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(VariantOptionView);
  },
});
export const VariantGroup = Node.create({
  name: "variantGroup",
  group: "block",
  content: "variantOption+",
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: "section[data-variants]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-variants": "" }),
      0,
    ];
  },
  markdownTokenizer: {
    name: "variantGroup",
    level: "block",
    start: (src) => src.indexOf(":::variants"),
    tokenize(src, _tokens, lexer) {
      const parsed = parseVariants(src);
      if (!parsed) return;
      return {
        type: "variantGroup",
        raw: parsed.raw,
        options: parsed.options.map((o) => ({
          label: o.label,
          tokens: lexer.blockTokens(o.body),
        })),
      };
    },
  },
  parseMarkdown(token, h) {
    return h.createNode(
      "variantGroup",
      {},
      (token.options as any[]).map((o) =>
        h.createNode(
          "variantOption",
          { label: o.label },
          h.parseChildren(o.tokens).length
            ? h.parseChildren(o.tokens)
            : [{ type: "paragraph" }],
        ),
      ),
    );
  },
  renderMarkdown(node, h) {
    return `:::variants\n\n${h.renderChildren(node.content || [], "\n\n")}\n\n:::endvariants`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(VariantGroupView);
  },
});

function DrawingView({
  node,
  editor,
  getPos,
  updateAttributes,
  extension,
}: NodeViewProps) {
  const [version, setVersion] = useState(0);
  const resizeStart = useRef(0);
  useEffect(() => {
    const saved = (event: Event) => {
      if ((event as CustomEvent).detail?.id === node.attrs.id)
        setVersion(Date.now());
    };
    window.addEventListener("synapse:drawing-saved", saved);
    return () => window.removeEventListener("synapse:drawing-saved", saved);
  }, [node.attrs.id]);
  return (
    <NodeViewWrapper
      className="inline-drawing"
      data-drawing-id={node.attrs.id}
      style={{
        width: node.attrs.width ? Math.min(node.attrs.width, 1200) : 280,
      }}
    >
      <div className="drawing-tools" contentEditable={false}>
        {editor.isEditable && (
          <>
            <button onClick={() => extension.options.onOpen(node.attrs.id)}>
              <PenLine size={13} />
              Edit drawing
            </button>
            {extension.options.floatable && (
              <button
                onClick={() => {
                  const pos = getPos();
                  if (pos === undefined) return;
                  editor.commands.deleteRange({
                    from: pos,
                    to: pos + node.nodeSize,
                  });
                  extension.options.onFloat(node.attrs.id);
                }}
              >
                Move freely
              </button>
            )}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                const pos = getPos();
                if (pos !== undefined)
                  editor
                    .chain()
                    .insertContentAt(pos + node.nodeSize, { type: "paragraph" })
                    .setTextSelection(pos + node.nodeSize + 1)
                    .focus(pos + node.nodeSize + 1)
                    .run();
              }}
            >
              Write below
            </button>
          </>
        )}
        <span>Drag the corner to resize</span>
      </div>
      <div
        className="drawing-resizer"
        style={{
          resize: editor.isEditable ? "horizontal" : "none",
          width: "100%",
        }}
        onPointerDown={(e) => {
          resizeStart.current = Math.round(
            e.currentTarget.getBoundingClientRect().width,
          );
        }}
        onPointerUp={(e) => {
          const width = Math.round(
            e.currentTarget.getBoundingClientRect().width,
          );
          if (
            editor.isEditable &&
            width > 100 &&
            Math.abs(width - resizeStart.current) > 5
          )
            updateAttributes({ width });
        }}
      >
        <img
          style={{
            width: "100%",
            maxWidth: "100%",
          }}
          draggable={false}
          src={
            fileUrl("drawings", node.attrs.id + ".svg") +
            (fileUrl("drawings", node.attrs.id + ".svg").includes("?")
              ? "&"
              : "?") +
            "v=" +
            version
          }
          alt="Drawing or flowchart"
          onDoubleClick={() =>
            editor.isEditable && extension.options.onOpen(node.attrs.id)
          }
        />
      </div>
    </NodeViewWrapper>
  );
}
export const DrawingBlock = Node.create({
  name: "drawingBlock",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() {
    return {
      onOpen: (_id: string) => {},
      onFloat: (_id: string) => {},
      floatable: false,
    };
  },
  addAttributes() {
    return { id: { default: "" }, width: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-drawing-id]",
        getAttrs: (el) => ({ id: el.getAttribute("data-drawing-id") }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-drawing-id": HTMLAttributes.id }),
    ];
  },
  markdownTokenizer: {
    name: "drawingBlock",
    level: "block",
    start: (src) => src.indexOf(":::drawing "),
    tokenize(src) {
      const m = src.match(/^:::drawing (\{[^\n]*\}) :::(?:\n|$)/);
      if (!m) return;
      try {
        const attrs = JSON.parse(m[1]);
        if (!/^[a-f0-9-]{36}$/.test(attrs.id)) return;
        return { type: "drawingBlock", raw: m[0], attrs };
      } catch {
        return;
      }
    },
  },
  parseMarkdown: (t, h) => h.createNode("drawingBlock", t.attrs as any),
  renderMarkdown: (n) =>
    `:::drawing ${JSON.stringify({ id: n.attrs?.id, ...(n.attrs?.width ? { width: n.attrs.width } : {}) })} :::`,
  addNodeView() {
    return ReactNodeViewRenderer(DrawingView);
  },
});

export const pastelNames = [
  "rose",
  "peach",
  "lemon",
  "mint",
  "sky",
  "lavender",
] as const;
function colorSpan(src: string, attribute: string) {
  const open = src.match(
    new RegExp(
      "^<span " + attribute + '="(rose|peach|lemon|mint|sky|lavender)">',
    ),
  );
  if (!open) return;
  const tags = /<span\b[^>]*>|<\/span>/g;
  tags.lastIndex = open[0].length;
  let depth = 1,
    tag: RegExpExecArray | null;
  while ((tag = tags.exec(src))) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth === 0)
      return {
        raw: src.slice(0, tags.lastIndex),
        shade: open[1],
        inner: src.slice(open[0].length, tag.index),
      };
  }
}
export const Pastel = Mark.create({
  name: "pastel",
  addAttributes() {
    return { shade: { default: "rose" } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-pastel]",
        getAttrs: (el) =>
          pastelNames.includes(el.getAttribute("data-pastel") as any)
            ? { shade: el.getAttribute("data-pastel") }
            : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { "data-pastel": HTMLAttributes.shade }, 0];
  },
  markdownTokenizer: {
    name: "pastel",
    level: "inline",
    start: (s) => s.indexOf("<span data-pastel="),
    tokenize(src, _t, l) {
      const m = colorSpan(src, "data-pastel");
      if (m)
        return {
          type: "pastel",
          raw: m.raw,
          shade: m.shade,
          tokens: l.inlineTokens(m.inner),
        };
    },
  },
  parseMarkdown: (t, h) =>
    h.applyMark("pastel", h.parseInline(t.tokens || []), { shade: t.shade }),
  renderMarkdown: (n, h) =>
    `<span data-pastel="${n.attrs?.shade || "rose"}">${h.renderChildren(n)}</span>`,
});

export const TextBackground = Mark.create({
  name: "textBackground",
  addAttributes() {
    return { shade: { default: "lemon" } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-background]",
        getAttrs: (el) =>
          pastelNames.includes(el.getAttribute("data-background") as any)
            ? { shade: el.getAttribute("data-background") }
            : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { "data-background": HTMLAttributes.shade }, 0];
  },
  markdownTokenizer: {
    name: "textBackground",
    level: "inline",
    start: (s) => s.indexOf("<span data-background="),
    tokenize(src, _t, l) {
      const m = colorSpan(src, "data-background");
      if (m)
        return {
          type: "textBackground",
          raw: m.raw,
          shade: m.shade,
          tokens: l.inlineTokens(m.inner),
        };
    },
  },
  parseMarkdown: (t, h) =>
    h.applyMark("textBackground", h.parseInline(t.tokens || []), {
      shade: t.shade,
    }),
  renderMarkdown: (n, h) =>
    `<span data-background="${n.attrs?.shade || "lemon"}">${h.renderChildren(n)}</span>`,
});

function CodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <NodeViewWrapper className="code-block">
      <div className="code-toolbar" contentEditable={false}>
        {editor.isEditable ? (
          <input
            aria-label="Code language"
            value={node.attrs.language || ""}
            placeholder="Language (optional)"
            onChange={(e) =>
              updateAttributes({
                language: e.target.value.replace(/[^\w+-]/g, ""),
              })
            }
          />
        ) : (
          <span>{node.attrs.language || "Code"}</span>
        )}
        <button
          onClick={() =>
            copyText(node.textContent)
              .then(() => {
                setCopied(true);
                setCopyFailed(false);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => setCopyFailed(true))
          }
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}{" "}
          {copied
            ? "Copied"
            : copyFailed
              ? "Select code and copy"
              : "Copy code"}
        </button>
      </div>
      <pre>
        <NodeViewContent as={"code" as any} />
      </pre>
    </NodeViewWrapper>
  );
}
export const CodeWithCopy = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeView);
  },
});
