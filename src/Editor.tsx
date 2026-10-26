import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { displayMarkdown, storageMarkdown } from "./markdown";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading2,
  List,
  Table2,
  Link2,
  ImagePlus,
  PenLine,
  Workflow,
  Code2,
  Undo2,
  Redo2,
  FilePlus2,
} from "lucide-react";
export default function Editor({
  value,
  onChange,
  onCommand,
  readOnly = false,
}: {
  value: string;
  onChange: (s: string) => void;
  onCommand: (cmd: string) => void;
  readOnly?: boolean;
}) {
  const change = useRef(onChange);
  change.current = onChange;
  const currentValue = useRef(value);
  currentValue.current = value;
  const [slash, setSlash] = useState(false);
  const [raw, setRaw] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Markdown,
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({
        placeholder:
          "Explain it in your own words. Type / to add a link, table, or drawing.",
      }),
    ],
    content: displayMarkdown(value),
    contentType: "markdown",
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const markdown = storageMarkdown(editor.getMarkdown());
      if (markdown !== currentValue.current) change.current(markdown);
      const before = editor.state.doc.textBetween(
        Math.max(0, editor.state.selection.from - 2),
        editor.state.selection.from,
      );
      setSlash(before.endsWith("/"));
    },
    editorProps: {
      attributes: {
        class: "note-editor",
        "aria-label": "Note explanation",
        role: "textbox",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape") setSlash(false);
        return false;
      },
    },
  });
  useEffect(() => {
    if (editor && storageMarkdown(editor.getMarkdown()) !== value) {
      editor.commands.setContent(displayMarkdown(value), {
        contentType: "markdown",
        emitUpdate: false,
      });
    }
  }, [value, editor]);
  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [readOnly, editor]);
  function command(cmd: string) {
    if (slash) {
      editor
        ?.chain()
        .focus()
        .deleteRange({
          from: editor.state.selection.from - 1,
          to: editor.state.selection.from,
        })
        .run();
      setSlash(false);
    }
    if (cmd === "table")
      editor
        ?.chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    else onCommand(cmd);
  }
  if (!editor) return null;
  return (
    <div
      className="editor-wrap"
      onClick={(e) => {
        const anchor = (e.target as HTMLElement).closest("a");
        const match = anchor
          ?.getAttribute("href")
          ?.match(/^([a-f0-9-]{36})\.md$/);
        if (match) {
          e.preventDefault();
          onCommand("note:" + match[1]);
        }
      }}
    >
      {!readOnly && (
        <div
          className="editor-toolbar"
          role="toolbar"
          aria-label="Note formatting"
        >
          {[
            {
              label: "Bold",
              Icon: Bold,
              run: () => editor.chain().focus().toggleBold().run(),
            },
            {
              label: "Italic",
              Icon: Italic,
              run: () => editor.chain().focus().toggleItalic().run(),
            },
            {
              label: "Heading",
              Icon: Heading2,
              run: () =>
                editor.chain().focus().toggleHeading({ level: 3 }).run(),
            },
            {
              label: "List",
              Icon: List,
              run: () => editor.chain().focus().toggleBulletList().run(),
            },
            { label: "Table", Icon: Table2, run: () => command("table") },
            { label: "Link concept", Icon: Link2, run: () => command("link") },
            {
              label: "Insert image or attachment",
              Icon: ImagePlus,
              run: () => command("image"),
            },
            { label: "Draw", Icon: PenLine, run: () => command("draw") },
            {
              label: "Flowchart",
              Icon: Workflow,
              run: () => command("flowchart"),
            },
            {
              label: "Undo",
              Icon: Undo2,
              run: () => editor.chain().focus().undo().run(),
            },
            {
              label: "Redo",
              Icon: Redo2,
              run: () => editor.chain().focus().redo().run(),
            },
          ].map(({ label, Icon, run }) => (
            <button
              key={label}
              title={label}
              aria-label={label}
              className="icon"
              onClick={run}
            >
              <Icon size={16} />
            </button>
          ))}
          <button
            className={"icon " + (raw ? "active" : "")}
            title="Markdown source"
            aria-label="Markdown source"
            onClick={() => setRaw(!raw)}
          >
            <Code2 size={16} />
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
      )}{" "}
      {slash && (
        <div className="slash-menu">
          {[
            ["link", "Link a concept", Link2],
            ["concept", "New concept", FilePlus2],
            ["table", "Table", Table2],
            ["draw", "Drawing canvas", PenLine],
            ["flowchart", "AI flowchart draft", Workflow],
            ["image", "Image or attachment", ImagePlus],
          ].map(([key, label, Icon]: any) => (
            <button key={key} onClick={() => command(key)}>
              <Icon size={16} />
              <span>/{key}</span>
              <small>{label}</small>
            </button>
          ))}
        </div>
      )}
      {editor.isActive("table") && !readOnly && (
        <div className="table-actions">
          <button onClick={() => editor.chain().focus().addRowAfter().run()}>
            + Row
          </button>
          <button onClick={() => editor.chain().focus().addColumnAfter().run()}>
            + Column
          </button>
          <button onClick={() => editor.chain().focus().deleteRow().run()}>
            Remove row
          </button>
          <button onClick={() => editor.chain().focus().deleteTable().run()}>
            Remove table
          </button>
        </div>
      )}
    </div>
  );
}
