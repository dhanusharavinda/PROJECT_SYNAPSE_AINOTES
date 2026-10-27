import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor as CoreEditor, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  List,
  ListOrdered,
  ListTodo,
  Table2,
  Link2,
  ImagePlus,
  PenLine,
  Workflow,
  Code2,
  Undo2,
  Redo2,
  FilePlus2,
  Palette,
  Quote,
  Minus,
  Layers,
  Type,
} from "lucide-react";
import { displayMarkdown, storageMarkdown } from "./markdown";
import { mediaUrl } from "./api";
const editorDisplay = (text: string) =>
  displayMarkdown(text).replace(/\/files\/attachments\/[^\s)]+/g, (url) =>
    mediaUrl(url),
  );
import {
  VariantGroup,
  VariantOption,
  DrawingBlock,
  Pastel,
  CodeWithCopy,
  pastelNames,
} from "./editorNodes";

export interface EditorHandle {
  unlinkTo: (id: string) => void;
  capture: () => void;
  selectedText: () => string;
  linkTo: (id: string, title: string) => void;
  insertImage: (src: string, alt: string) => void;
  insertFile: (src: string, label: string) => void;
  insertDrawing: (id: string) => void;
  focusDrawing: (id: string) => void;
  getEditor: () => CoreEditor | null;
}
const NotebookImage = Image.extend({
  parseMarkdown(t, h) {
    const size = String(t.title || "").match(/^synapse-width:(\d+)$/);
    return h.createNode("image", {
      src: t.href,
      alt: t.text,
      title: size ? null : t.title,
      width: size ? Number(size[1]) : null,
    });
  },
  renderMarkdown(n) {
    const width = n.attrs?.width;
    const title = width
      ? ` "synapse-width:${Math.round(Number(width))}"`
      : n.attrs?.title
        ? ` "${n.attrs.title}"`
        : "";
    return `![${String(n.attrs?.alt || "Image").replace(/[\[\]]/g, "")}](${n.attrs?.src || ""}${title})`;
  },
});
const commandInfo = [
  ["text", "Normal text", Type],
  ["h1", "Large heading", Heading2],
  ["h2", "Heading", Heading2],
  ["h3", "Small heading", Heading2],
  ["bold", "Bold", Bold],
  ["italic", "Italic / cursive", Italic],
  ["underline", "Underline", Underline],
  ["bullet", "Bulleted list", List],
  ["numbered", "Numbered list", ListOrdered],
  ["todo", "To-do list", ListTodo],
  ["code", "Code block", Code2],
  ["inline-code", "Inline code", Code2],
  ["table", "Flexible table", Table2],
  ["variant", "Add another variant", Layers],
  ["link", "Link a page", Link2],
  ["page", "Page inside this page", FilePlus2],
  ["image", "Upload image", ImagePlus],
  ["file", "Upload PDF or file", FilePlus2],
  ["draw", "Drawing canvas", PenLine],
  ["flowchart", "Generate flowchart draft", Workflow],
  ["diagram", "Diagram selected text or notes", Workflow],
  ["quote", "Quote", Quote],
  ["divider", "Divider", Minus],
] as const;

const Editor = forwardRef<
  EditorHandle,
  {
    value: string;
    onChange: (s: string) => void;
    onCommand: (cmd: string) => void;
    onUpload?: (file: File) => void;
    readOnly?: boolean;
    onReady?: (e: CoreEditor) => void;
  }
>(function Editor(
  { value, onChange, onCommand, onUpload, readOnly = false, onReady },
  forwarded,
) {
  const change = useRef(onChange);
  change.current = onChange;
  const commandCallback = useRef(onCommand);
  commandCallback.current = onCommand;
  const uploadCallback = useRef(onUpload);
  uploadCallback.current = onUpload;
  const currentValue = useRef(value);
  currentValue.current = value;
  const [raw, setRaw] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number }>();
  const [slash, setSlash] = useState<{
    from: number;
    to: number;
    query: string;
    x: number;
    y: number;
  }>();
  const [active, setActive] = useState(0);
  const [, setSelectionTick] = useState(0);
  const [palette, setPalette] = useState(false);
  const captured = useRef<{ from: number; to: number } | undefined>(undefined);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const activeRef = useRef(active);
  activeRef.current = active;
  const doRef = useRef<(cmd: string) => void>(() => {});
  const filtered = commandInfo.filter(
    ([key, label]) =>
      !slash ||
      key.includes(slash.query.toLowerCase()) ||
      label.toLowerCase().includes(slash.query.toLowerCase()),
  );
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: { openOnClick: false } }),
      CodeWithCopy,
      Markdown,
      TableKit.configure({
        table: { resizable: true, allowTableNodeSelection: true },
      }),
      NotebookImage.configure({
        allowBase64: false,
        resize: {
          enabled: true,
          directions: ["bottom-right", "bottom-left"],
          alwaysPreserveAspectRatio: true,
          minWidth: 80,
          minHeight: 40,
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      VariantGroup,
      VariantOption,
      Pastel,
      DrawingBlock.configure({
        onOpen: (id: string) => commandCallback.current("drawing:" + id),
      }),
      Placeholder.configure({
        placeholder:
          "Write your note. Type / for blocks, or select text and right-click for more options.",
      }),
    ],
    content: editorDisplay(value),
    contentType: "markdown",
    editable: !readOnly,
    onCreate: ({ editor }) => onReady?.(editor),
    onSelectionUpdate: () => setSelectionTick((t) => t + 1),
    onTransaction: ({ transaction }) => {
      if (captured.current && transaction.docChanged) {
        captured.current = {
          from: transaction.mapping.map(captured.current.from, 1),
          to: transaction.mapping.map(captured.current.to, -1),
        };
        if (captured.current.to < captured.current.from)
          captured.current.to = captured.current.from;
      }
    },
    onUpdate: ({ editor }) => {
      const md = storageMarkdown(editor.getMarkdown());
      if (md !== currentValue.current) change.current(md);
      const from = editor.state.selection.from;
      const before = editor.state.doc.textBetween(
        Math.max(0, from - 80),
        from,
        "\n",
      );
      const match = before.match(/(?:^|\s)\/([\w-]*)$/);
      let coords = { left: 100, bottom: 120 };
      try {
        coords = editor.view.coordsAtPos(from);
      } catch {}
      setSlash(
        match
          ? {
              from: from - match[1].length - 1,
              to: from,
              query: match[1],
              x: Math.max(8, Math.min(coords.left, window.innerWidth - 330)),
              y: Math.max(
                8,
                Math.min(coords.bottom + 6, window.innerHeight - 330),
              ),
            }
          : undefined,
      );
      setActive(0);
    },
    editorProps: {
      attributes: {
        class: "note-editor",
        "aria-label": "Note explanation",
        role: "textbox",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape") {
          setContext(undefined);
          setSlash(undefined);
          return true;
        }
        if (slashRef.current) {
          if (event.key === "ArrowDown") {
            setActive((i) => (i + 1) % Math.max(1, filteredRef.current.length));
            return true;
          }
          if (event.key === "ArrowUp") {
            setActive(
              (i) =>
                (i + filteredRef.current.length - 1) %
                Math.max(1, filteredRef.current.length),
            );
            return true;
          }
          if (event.key === "Enter" && filteredRef.current[activeRef.current]) {
            doRef.current(filteredRef.current[activeRef.current][0]);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const file = [...(event.clipboardData?.files || [])].find((f) =>
          f.type.startsWith("image/"),
        );
        if (file && uploadCallback.current) {
          captured.current = {
            from: view.state.selection.from,
            to: view.state.selection.to,
          };
          uploadCallback.current(file);
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files || [])];
        if (files.length && uploadCallback.current) {
          const pos = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos;
          if (pos !== undefined) captured.current = { from: pos, to: pos };
          files.forEach((f) => uploadCallback.current?.(f));
          return true;
        }
        return false;
      },
    },
  });
  useEffect(() => {
    if (editor && storageMarkdown(editor.getMarkdown()) !== value)
      editor.commands.setContent(editorDisplay(value), {
        contentType: "markdown",
        emitUpdate: false,
      });
  }, [value, editor]);
  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);
  useEffect(() => {
    if (!context) return;
    const close = () => setContext(undefined);
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [context]);
  function capture() {
    if (editor)
      captured.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
  }
  function restore() {
    if (!editor) return;
    const range = captured.current;
    if (range && range.to <= editor.state.doc.content.size)
      editor.commands.setTextSelection(range);
    editor.commands.focus();
  }
  function addVariant() {
    if (!editor) return;
    restore();
    const { from, to, $from } = editor.state.selection;
    let ancestor = -1;
    for (let d = $from.depth; d > 0; d--)
      if ($from.node(d).type.name === "variantGroup") {
        ancestor = d;
        break;
      }
    if (ancestor > 0) {
      editor
        .chain()
        .focus()
        .insertContentAt($from.end(ancestor), {
          type: "variantOption",
          attrs: { label: "" },
          content: [{ type: "paragraph" }],
        })
        .run();
      return;
    }
    let range = { from, to };
    let content: JSONContent[];
    if (from === to) {
      range = { from: $from.before(), to: $from.after() };
      content = [$from.parent.toJSON()];
    } else {
      content = editor.state.doc.slice(from, to).content.toJSON() || [];
      if (content.some((n) => n.type === "text" || n.type === "hardBreak"))
        content = [{ type: "paragraph", content }];
    }
    editor
      .chain()
      .focus()
      .insertContentAt(range, {
        type: "variantGroup",
        content: [
          {
            type: "variantOption",
            attrs: { label: "" },
            content: content.length ? content : [{ type: "paragraph" }],
          },
          {
            type: "variantOption",
            attrs: { label: "" },
            content: [{ type: "paragraph" }],
          },
        ],
      })
      .run();
    setTimeout(() => {
      const group = editor.view.dom.querySelector(
        ".variant-group:not(.expanded) .variant-controls button",
      ) as HTMLButtonElement | null;
      group?.click();
    }, 0);
  }
  function run(cmd: string) {
    if (!editor) return;
    setContext(undefined);
    setPalette(false);
    if (slash) {
      editor
        .chain()
        .focus()
        .deleteRange({ from: slash.from, to: slash.to })
        .run();
      setSlash(undefined);
    } else restore();
    capture();
    const c = editor.chain().focus();
    if (cmd === "bold") c.toggleBold().run();
    else if (cmd === "italic") c.toggleItalic().run();
    else if (cmd === "underline") c.toggleUnderline().run();
    else if (cmd === "bullet") c.toggleBulletList().run();
    else if (cmd === "numbered") c.toggleOrderedList().run();
    else if (cmd === "todo") c.toggleTaskList().run();
    else if (cmd === "code") c.toggleCodeBlock().run();
    else if (cmd === "inline-code") c.toggleCode().run();
    else if (cmd === "text") c.setParagraph().run();
    else if (/^h[123]$/.test(cmd))
      c.toggleHeading({ level: Number(cmd[1]) as 1 | 2 | 3 }).run();
    else if (cmd === "quote") c.toggleBlockquote().run();
    else if (cmd === "divider") c.setHorizontalRule().run();
    else if (cmd === "table")
      c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    else if (cmd === "variant") addVariant();
    else
      commandCallback.current(
        cmd === "concept" ? "page" : cmd === "diagram" ? "flowchart" : cmd,
      );
    setSelectionTick((t) => t + 1);
  }
  doRef.current = run;
  useImperativeHandle(
    forwarded,
    () => ({
      unlinkTo: (id) => {
        if (!editor) return;
        const transaction = editor.state.tr;
        editor.state.doc.descendants((node, pos) => {
          if (
            node.isText &&
            node.marks.some(
              (mark) =>
                mark.type.name === "link" && mark.attrs.href === id + ".md",
            )
          )
            transaction.removeMark(
              pos,
              pos + node.nodeSize,
              editor.schema.marks.link,
            );
        });
        editor.view.dispatch(transaction);
      },
      capture,
      selectedText: () =>
        editor
          ? editor.state.doc.textBetween(
              editor.state.selection.from,
              editor.state.selection.to,
              " ",
            )
          : "",
      linkTo: (id, title) => {
        if (!editor) return;
        restore();
        let { from, to } = editor.state.selection;
        if (from === to) {
          editor.state.doc.descendants((node, pos) => {
            if (to !== from || !node.isText) return;
            const at = (node.text || "")
              .toLowerCase()
              .indexOf(title.toLowerCase());
            if (at >= 0) {
              from = pos + at;
              to = from + title.length;
            }
          });
        }
        if (from !== to)
          editor
            .chain()
            .focus()
            .setTextSelection({ from, to })
            .setLink({ href: id + ".md" })
            .run();
        else
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: title,
              marks: [{ type: "link", attrs: { href: id + ".md" } }],
            })
            .run();
      },
      insertImage: (src, alt) => {
        if (!editor) return;
        restore();
        const displayed = mediaUrl(
          src.replace(/^\.\.\/(attachments|drawings)\//, "/files/$1/"),
        );
        editor
          .chain()
          .focus()
          .setImage({ src: displayed, alt })
          .insertContent({ type: "paragraph" })
          .run();
        capture();
      },
      insertFile: (src, label) => {
        if (!editor) return;
        restore();
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: label,
            marks: [{ type: "link", attrs: { href: mediaUrl(src) } }],
          })
          .run();
        capture();
      },
      insertDrawing: (id) => {
        if (!editor) return;
        restore();
        editor.commands.setTextSelection(editor.state.selection.to);
        editor
          .chain()
          .focus()
          .insertContent([
            { type: "drawingBlock", attrs: { id } },
            { type: "paragraph" },
          ])
          .run();
        capture();
      },
      focusDrawing: (id) => {
        editor?.view.dom
          .querySelector(`[data-drawing-id="${id}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      },
      getEditor: () => editor,
    }),
    [editor, slash],
  );
  if (!editor) return null;
  const table = editor.isActive("table");
  const inlineButtons = [
    ["bold", "Bold", Bold],
    ["italic", "Italic / cursive", Italic],
    ["underline", "Underline", Underline],
    ["h2", "Heading", Heading2],
    ["bullet", "Bulleted list", List],
    ["numbered", "Numbered list", ListOrdered],
    ["todo", "To-do list", ListTodo],
    ["code", "Code block", Code2],
    ["table", "Table", Table2],
    ["link", "Link a page", Link2],
    ["image", "Upload image", ImagePlus],
    ["draw", "Draw", PenLine],
  ] as const;
  return (
    <div
      className="editor-wrap"
      onContextMenu={(e) => {
        if (readOnly) return;
        e.preventDefault();
        if (editor.state.selection.empty) {
          const pos = editor.view.posAtCoords({
            left: e.clientX,
            top: e.clientY,
          })?.pos;
          if (pos !== undefined) editor.commands.setTextSelection(pos);
        }
        capture();
        setContext({
          x: Math.min(e.clientX, window.innerWidth - 320),
          y: Math.min(e.clientY, window.innerHeight - 500),
        });
      }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        const id = a
          ?.getAttribute("href")
          ?.match(/^(?:\.\/)?([a-f0-9-]{36})\.md$/)?.[1];
        if (id) {
          e.preventDefault();
          commandCallback.current("note:" + id);
        }
      }}
    >
      {!readOnly && (
        <div
          className="editor-toolbar"
          role="toolbar"
          aria-label="Note formatting"
        >
          {inlineButtons.map(([cmd, label, Icon]) => (
            <button
              key={cmd}
              aria-label={label}
              title={label}
              className={
                "icon " +
                (editor.isActive(
                  cmd === "italic"
                    ? "italic"
                    : cmd === "bold"
                      ? "bold"
                      : cmd === "underline"
                        ? "underline"
                        : cmd === "code"
                          ? "codeBlock"
                          : "__none",
                )
                  ? "active"
                  : "")
              }
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                capture();
                run(cmd);
              }}
            >
              <Icon size={16} />
            </button>
          ))}
          <button
            className="icon"
            aria-label="Pastel text colors"
            title="Pastel text colors"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              capture();
              setPalette(!palette);
            }}
          >
            <Palette size={16} />
          </button>
          <button
            className="icon"
            aria-label="Undo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 size={15} />
          </button>
          <button
            className="icon"
            aria-label="Redo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 size={15} />
          </button>
          <button
            className={"icon " + (raw ? "active" : "")}
            aria-label="Markdown source"
            title="Markdown source"
            onClick={() => setRaw(!raw)}
          >
            <Code2 size={15} />
          </button>
        </div>
      )}
      {palette && (
        <div className="pastel-picker">
          {pastelNames.map((shade) => (
            <button
              key={shade}
              data-pastel={shade}
              aria-label={"Text color " + shade}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                restore();
                editor.chain().focus().setMark("pastel", { shade }).run();
                setPalette(false);
              }}
            >
              {shade}
            </button>
          ))}
          <button
            onClick={() => {
              restore();
              editor.chain().focus().unsetMark("pastel").run();
              setPalette(false);
            }}
          >
            Reset
          </button>
        </div>
      )}
      {raw ? (
        <textarea
          className="raw-editor"
          aria-label="Markdown source"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
      {table && !readOnly && (
        <div
          className="table-actions"
          role="toolbar"
          aria-label="Table controls"
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addRowBefore().run()}
          >
            + Row above
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            + Row below
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addColumnBefore().run()}
          >
            + Column left
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            + Column right
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            Remove row
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            Remove column
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            Remove table
          </button>
        </div>
      )}
      {slash && filtered.length > 0 && (
        <div
          className="slash-menu"
          style={{ left: slash.x, top: slash.y }}
          role="menu"
          aria-label="Slash commands"
        >
          {filtered.map(([cmd, label, Icon], i) => (
            <button
              className={i === active ? "active" : ""}
              role="menuitem"
              key={cmd}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(cmd)}
            >
              <Icon size={15} />
              <span>/{cmd}</span>
              <small>{label}</small>
            </button>
          ))}
        </div>
      )}
      {context && (
        <div
          role="menu"
          aria-label="Edit selected content"
          className="context-menu"
          style={{ left: Math.max(8, context.x), top: Math.max(8, context.y) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="context-format">
            {inlineButtons.slice(0, 8).map(([cmd, label, Icon]) => (
              <button
                key={cmd}
                role="menuitem"
                aria-label={label}
                title={label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(cmd)}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
          <div className="context-colors">
            {pastelNames.map((shade) => (
              <button
                key={shade}
                data-pastel={shade}
                title={shade}
                aria-label={"Text color " + shade}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  restore();
                  editor.chain().focus().setMark("pastel", { shade }).run();
                  setContext(undefined);
                }}
              >
                Aa
              </button>
            ))}
          </div>
          {commandInfo
            .filter(([key]) =>
              [
                "variant",
                "link",
                "page",
                "code",
                "inline-code",
                "table",
                "image",
                "file",
                "draw",
                "flowchart",
                "diagram",
                "todo",
                "numbered",
                "bullet",
                "quote",
                "divider",
              ].includes(key),
            )
            .map(([cmd, label, Icon]) => (
              <button
                key={cmd}
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(cmd)}
              >
                <Icon size={15} />
                {label}
                <small>/{cmd}</small>
              </button>
            ))}
        </div>
      )}
    </div>
  );
});
export default Editor;
