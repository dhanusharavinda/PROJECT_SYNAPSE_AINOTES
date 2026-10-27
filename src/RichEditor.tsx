import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { createPortal } from "react-dom";
import type { Editor as CoreEditor, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
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
import { usePreferences, keyCombination } from "./preferences";
import { MediaImage } from "./editorMedia";
import { copyText, readClipboard } from "./clipboard";
import { repairNotebookMarkup } from "./content";
import { youtubeLink } from "./youtube";
import VideoPasteMenu from "./VideoPasteMenu";
import { AlignedParagraph, RenumberLists } from "./writingExtensions";
const editorDisplay = (text: string) =>
  displayMarkdown(repairNotebookMarkup(text)).replace(
    /\/files\/attachments\/[^\s)]+/g,
    (url) => mediaUrl(url),
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
  addNodeView() {
    return MediaImage;
  },
  parseMarkdown(t, h) {
    const size = String(t.title || "").match(
      /^synapse-width:(\d+)(?:;align:(left|right))?$/,
    );
    return h.createNode("image", {
      src: t.href,
      alt: t.text,
      title: size ? (size[2] ? "synapse-align:" + size[2] : null) : t.title,
      width: size ? Number(size[1]) : null,
    });
  },
  renderMarkdown(n) {
    const width = n.attrs?.width;
    const align = n.attrs?.title?.match(/^synapse-align:(left|right)$/)?.[1];
    const title = width
      ? ` "synapse-width:${Math.round(Number(width))}${align ? ";align:" + align : ""}"`
      : n.attrs?.title
        ? ` "${n.attrs.title}"`
        : "";
    return `![${String(n.attrs?.alt || "Image").replace(/[\[\]]/g, "")}](${n.attrs?.src || ""}${title})`;
  },
});
const commandInfo = [
  ["align-left", "Align left", Type],
  ["align-center", "Align centre", Type],
  ["align-right", "Align right", Type],
  ["align-justify", "Justify text", Type],
  ["undo", "Undo", Undo2],
  ["redo", "Redo", Redo2],
  ["text", "Normal text", Type],
  ["h1", "Large heading", Heading2],
  ["h2", "Heading", Heading2],
  ["h3", "Small heading", Heading2],
  ["bold", "Bold", Bold],
  ["italic", "Italic", Italic],
  ["underline", "Underline", Underline],
  ["bullet", "Bulleted list", List],
  ["numbered", "Numbered list", ListOrdered],
  ["todo", "To-do list", ListTodo],
  ["code", "Code block", Code2],
  ["inline-code", "Inline code", Code2],
  ["table", "Table", Table2],
  ["variant", "Another explanation", Layers],
  ["link", "Link a page", Link2],
  ["page", "Page inside this page", FilePlus2],
  ["image", "Upload image", ImagePlus],
  ["file", "Upload PDF or file", FilePlus2],
  ["draw", "Draw on page", PenLine],
  ["flowchart", "Make a flowchart", Workflow],
  ["diagram", "Diagram selected text or notes", Workflow],
  ["quote", "Quote", Quote],
  ["divider", "Divider", Minus],
  ["float", "Move writing freely", Type],
] as const;

const Editor = forwardRef<
  EditorHandle,
  {
    value: string;
    onChange: (s: string) => void;
    onCommand: (cmd: string) => void;
    onUpload?: (file: File) => void;
    onVideo?: (url: string, label: string) => void;
    readOnly?: boolean;
    onReady?: (e: CoreEditor) => void;
    compact?: boolean;
    onObjectAction?: (command: "resize" | "delete" | "duplicate") => void;
    onPlace?: (
      kind: "image" | "drawing" | "table" | "text",
      src: string,
      alt?: string,
    ) => void;
  }
>(function Editor(
  {
    value,
    onChange,
    onCommand,
    onUpload,
    onVideo,
    readOnly = false,
    onReady,
    compact = false,
    onObjectAction,
    onPlace,
  },
  forwarded,
) {
  const change = useRef(onChange);
  const preferences = usePreferences();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const placeRef = useRef(onPlace);
  placeRef.current = onPlace;
  change.current = onChange;
  const commandCallback = useRef(onCommand);
  commandCallback.current = onCommand;
  const uploadCallback = useRef(onUpload);
  uploadCallback.current = onUpload;
  const currentValue = useRef(value);
  currentValue.current = value;
  const [raw, setRaw] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number }>();
  const [videoPaste, setVideoPaste] = useState<{
    url: string;
    x: number;
    y: number;
  }>();
  const videoCallback = useRef(onVideo);
  videoCallback.current = onVideo;
  const [mediaTarget, setMediaTarget] = useState<HTMLElement>();
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
  const filtered = [...commandInfo]
    .sort((a, b) => {
      const order = [
        "link",
        "page",
        "text",
        "todo",
        "image",
        "table",
        "flowchart",
        "code",
        "numbered",
        "bullet",
        "variant",
      ];
      return (
        (order.includes(a[0]) ? order.indexOf(a[0]) : 99) -
        (order.includes(b[0]) ? order.indexOf(b[0]) : 99)
      );
    })
    .filter(
      ([key, label]) =>
        (key !== "float" || !!onPlace) &&
        (!slash ||
          key.includes(slash.query.toLowerCase()) ||
          label.toLowerCase().includes(slash.query.toLowerCase())),
    );
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  function offerVideo(text: string, view: CoreEditor["view"]) {
    const video = youtubeLink(text);
    if (!video) return false;
    captured.current = {
      from: view.state.selection.from,
      to: view.state.selection.to,
    };
    const coords = view.coordsAtPos(view.state.selection.from);
    setVideoPaste({
      url: text.trim(),
      x: Math.max(8, Math.min(coords.left, innerWidth - 310)),
      y: Math.max(8, Math.min(coords.bottom + 6, innerHeight - 260)),
    });
    return true;
  }
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        codeBlock: false,
        link: { openOnClick: false },
      }),
      AlignedParagraph,
      RenumberLists,
      CodeWithCopy,
      Markdown,
      TableKit.configure({
        table: { resizable: true, allowTableNodeSelection: true },
      }),
      NotebookImage.configure({
        HTMLAttributes: { "data-can-float": onPlace ? "true" : "false" },
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
        onFloat: (id: string) => placeRef.current?.("drawing", id),
        floatable: !!onPlace,
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
        const assigned = Object.entries(preferencesRef.current.shortcuts).find(
          ([, shortcut]) => shortcut && shortcut === keyCombination(event),
        )?.[0];
        if (
          assigned &&
          ["copy", "cut", "paste", "select-all"].includes(assigned) &&
          (event.ctrlKey || event.metaKey || event.altKey) &&
          !(
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            ["c", "x", "v", "a"].includes(event.key.toLowerCase())
          )
        ) {
          event.preventDefault();
          window.dispatchEvent(
            new CustomEvent("synapse:action", {
              detail: assigned,
              cancelable: true,
            }),
          );
          return true;
        }
        if (
          assigned &&
          (event.ctrlKey || event.metaKey || event.altKey) &&
          commandInfo.some((info) => info[0] === assigned)
        ) {
          event.preventDefault();
          doRef.current(assigned);
          return true;
        }
        const shade = Object.entries(preferencesRef.current.shortcuts).find(
          ([key, shortcut]) =>
            pastelNames.includes(key as any) &&
            shortcut === keyCombination(event),
        )?.[0];
        if (shade && !_view.state.selection.empty) {
          const mark = _view.state.schema.marks.pastel.create({ shade });
          _view.dispatch(
            _view.state.tr.addMark(
              _view.state.selection.from,
              _view.state.selection.to,
              mark,
            ),
          );
          event.preventDefault();
          return true;
        }
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
        if (view.state.selection.$from.parent.type.name === "codeBlock") {
          const text = event.clipboardData?.getData("text/plain");
          if (text !== undefined) {
            event.preventDefault();
            view.dispatch(view.state.tr.insertText(text));
            return true;
          }
        }
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
        const text = event.clipboardData?.getData("text/plain");
        if (text && offerVideo(text, view)) return true;
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
    if (!editor || readOnly) return;
    const action = (event: Event) => {
      if (event.defaultPrevented || !editor.view.hasFocus()) return;
      const cmd = (event as CustomEvent).detail;
      if (cmd === "undo" || cmd === "redo") {
        event.preventDefault();
        if (cmd === "undo") editor.commands.undo();
        else editor.commands.redo();
      } else if (cmd === "select-all") {
        event.preventDefault();
        editor.commands.selectAll();
      } else if (cmd === "copy" || cmd === "cut") {
        event.preventDefault();
        const selection = editor.state.selection;
        void copyText(
          editor.state.doc.textBetween(selection.from, selection.to, "\n"),
        ).then(() => {
          if (cmd === "cut") editor.commands.deleteRange(selection);
        });
      } else if (cmd === "paste") {
        event.preventDefault();
        void readClipboard()
          .then(insertClipboardText)
          .catch(() => {});
      } else if (commandInfo.some((info) => info[0] === cmd)) {
        event.preventDefault();
        run(cmd);
      }
    };
    window.addEventListener("synapse:action", action);
    return () => window.removeEventListener("synapse:action", action);
  }, [editor, readOnly]);
  useEffect(() => {
    if (!editor || !onPlace) return;
    const float = (event: Event) => {
      event.preventDefault();
      const data = (event as CustomEvent).detail;
      placeRef.current?.("image", data.src, data.alt);
    };
    editor.view.dom.addEventListener("synapse:float-image", float);
    return () =>
      editor.view.dom.removeEventListener("synapse:float-image", float);
  }, [editor, !!onPlace]);
  useEffect(() => {
    if (!context) return;
    const close = (event: Event) => {
      if ((event.target as HTMLElement)?.closest?.(".context-menu")) return;
      setContext(undefined);
    };
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
  function insertClipboardText(text: string) {
    if (!editor || !text) return;
    if (editor.state.selection.$from.parent.type.name === "codeBlock") {
      editor.view.dispatch(editor.state.tr.insertText(text));
    } else if (!offerVideo(text, editor.view)) {
      if (/^\s*\d+[.)]\s+/m.test(text)) {
        editor.commands.insertContent(text, { contentType: "markdown" });
        return;
      }
      editor.commands.insertContent(
        text.includes("\n")
          ? text.split(/\r?\n/).map((line) => ({
              type: "paragraph",
              content: line ? [{ type: "text", text: line }] : [],
            }))
          : { type: "text", text },
      );
    }
  }
  function finishVideo(mode: "link" | "named" | "thumbnail", label: string) {
    if (!editor || !videoPaste) return;
    restore();
    const title = label.trim() || "YouTube video";
    if (mode === "thumbnail" && videoCallback.current) {
      editor.commands.deleteSelection();
      videoCallback.current(videoPaste.url, title);
    } else {
      const video = youtubeLink(videoPaste.url)!;
      editor.commands.insertContent({
        type: "text",
        text: mode === "link" ? videoPaste.url : title,
        marks: [
          {
            type: "link",
            attrs: { href: video.url, target: "_blank", rel: "noreferrer" },
          },
        ],
      });
    }
    setVideoPaste(undefined);
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
    if (cmd.startsWith("align-"))
      c.updateAttributes("paragraph", { textAlign: cmd.slice(6) }).run();
    else if (cmd === "undo") c.undo().run();
    else if (cmd === "redo") c.redo().run();
    else if (cmd === "bold") c.toggleBold().run();
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
    else if (cmd === "float" && onPlace) {
      const { from, to, $from } = editor.state.selection;
      const range =
        from === to
          ? { from: $from.before(), to: $from.after() }
          : { from, to };
      let content =
        editor.state.doc.slice(range.from, range.to).content.toJSON() || [];
      if (
        content.some(
          (node: JSONContent) =>
            node.type === "text" || node.type === "hardBreak",
        )
      )
        content = [{ type: "paragraph", content }];
      const text = editor.markdown!.serialize({ type: "doc", content });
      editor.commands.deleteRange(range);
      onPlace("text", text);
    } else
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
        if (onPlace) {
          onPlace("image", src, alt);
          return;
        }
        if (!editor) return;
        restore();
        const displayed = mediaUrl(
          src.replace(/^\.\.\/(attachments|drawings)\//, "/files/$1/"),
        );
        editor
          .chain()
          .focus()
          .setImage({ src: displayed, alt, width: 280 } as any)
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
        if (onPlace) {
          onPlace("drawing", id);
          return;
        }
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
    [editor, slash, onPlace],
  );
  if (!editor) return null;
  const table = editor.isActive("table");
  const inlineButtons = [
    ["bold", "Bold", Bold],
    ["italic", "Italic", Italic],
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
      className={"editor-wrap" + (compact ? " compact-editor" : "")}
      onContextMenu={(e) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        const media = (e.target as HTMLElement).closest<HTMLElement>(
          ".inline-drawing,.notebook-image",
        );
        setMediaTarget(media || undefined);
        if (!media && editor.state.selection.empty) {
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
        } else if (a) {
          e.preventDefault();
          let href = a.getAttribute("href") || "";
          href = href.replace(/^\.\.\/(attachments|drawings)\//, "/files/$1/");
          if (/^(https?:\/\/|\/files\/)/i.test(href))
            window.open(mediaUrl(href), "_blank", "noopener");
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
          {onPlace && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const selection = editor.state.selection.$from;
                for (let depth = selection.depth; depth > 0; depth--) {
                  const node = selection.node(depth);
                  if (node.type.name !== "table") continue;
                  const from = selection.before(depth);
                  const markdown = editor.markdown!.serialize({
                    type: "doc",
                    content: [node.toJSON()],
                  });
                  editor.commands.deleteRange({
                    from,
                    to: from + node.nodeSize,
                  });
                  onPlace("table", markdown);
                  break;
                }
              }}
            >
              Move freely
            </button>
          )}
        </div>
      )}
      {slash &&
        filtered.length > 0 &&
        createPortal(
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
          </div>,
          document.body,
        )}
      {videoPaste && (
        <VideoPasteMenu
          x={videoPaste.x}
          y={videoPaste.y}
          url={videoPaste.url}
          onChoose={finishVideo}
          allowThumbnail={!!onVideo}
        />
      )}
      {context &&
        createPortal(
          <div
            role="menu"
            aria-label="Edit selected content"
            className={"context-menu" + (mediaTarget ? " is-media" : "")}
            style={{
              left: Math.max(8, context.x),
              top: Math.max(8, context.y),
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
            onWheel={(e) => e.stopPropagation()}
          >
            {mediaTarget && (
              <div className="context-media-actions">
                {mediaTarget.classList.contains("notebook-image") && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      const src = mediaTarget
                        .querySelector("img")
                        ?.getAttribute("src");
                      if (src) commandCallback.current("extract:" + src);
                      setContext(undefined);
                    }}
                  >
                    Extract using AI
                  </button>
                )}
                {[
                  ...mediaTarget.querySelectorAll<HTMLButtonElement>(
                    ".drawing-tools button,.media-controls button",
                  ),
                ].map((button, index) => (
                  <button
                    role="menuitem"
                    key={index}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      button.click();
                      setContext(undefined);
                    }}
                  >
                    {button.textContent}
                  </button>
                ))}
                <button
                  role="menuitem"
                  onClick={() => {
                    mediaTarget.dataset.inlineResize = "true";
                    setContext(undefined);
                  }}
                >
                  Resize
                </button>
              </div>
            )}
            <div className="context-clipboard">
              {(["Copy", "Cut", "Paste"] as const).map((label) => (
                <button
                  role="menuitem"
                  key={label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    restore();
                    if (label === "Paste") {
                      void readClipboard().then(insertClipboardText);
                    } else {
                      const selection = editor.state.selection;
                      void copyText(
                        editor.state.doc.textBetween(
                          selection.from,
                          selection.to,
                          "\n",
                        ),
                      ).then(() => {
                        if (label === "Cut")
                          editor.commands.deleteRange(selection);
                      });
                    }
                    setContext(undefined);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
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
            <div className="context-table-actions">
              {onPlace && table && (
                <button
                  role="menuitem"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const selection = editor.state.selection.$from;
                    for (let depth = selection.depth; depth > 0; depth--) {
                      const node = selection.node(depth);
                      if (node.type.name !== "table") continue;
                      const from = selection.before(depth),
                        text = editor.markdown!.serialize({
                          type: "doc",
                          content: [node.toJSON()],
                        });
                      editor.commands.deleteRange({
                        from,
                        to: from + node.nodeSize,
                      });
                      onPlace("table", text);
                      break;
                    }
                    setContext(undefined);
                  }}
                >
                  Move table freely
                </button>
              )}
              {onObjectAction &&
                (["resize", "duplicate", "delete"] as const).map((command) => (
                  <button
                    role="menuitem"
                    key={command}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onObjectAction(command);
                      setContext(undefined);
                    }}
                  >
                    {command.charAt(0).toUpperCase() + command.slice(1)} object
                  </button>
                ))}
              {table &&
                (
                  [
                    ["Row above", "addRowBefore"],
                    ["Row below", "addRowAfter"],
                    ["Column left", "addColumnBefore"],
                    ["Column right", "addColumnAfter"],
                    ["Delete row", "deleteRow"],
                    ["Delete column", "deleteColumn"],
                    ["Delete table", "deleteTable"],
                  ] as const
                ).map(([label, cmd]) => (
                  <button
                    role="menuitem"
                    key={cmd}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor.chain().focus()[cmd]().run();
                      setContext(undefined);
                    }}
                  >
                    {label}
                  </button>
                ))}
              <button
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.commands.undo();
                  setContext(undefined);
                }}
              >
                Undo <small>Ctrl+Z</small>
              </button>
              <button
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.commands.redo();
                  setContext(undefined);
                }}
              >
                Redo <small>Ctrl+Shift+Z</small>
              </button>
            </div>
            <div className="context-clipboard">
              <button
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  await copyText(
                    editor.state.doc.textBetween(
                      editor.state.selection.from,
                      editor.state.selection.to,
                      "\n",
                    ),
                  );
                  setContext(undefined);
                }}
              >
                Copy <small>Ctrl+C</small>
              </button>
              <button
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    restore();
                    editor.commands.insertContentAt(
                      editor.state.selection,
                      editor.isActive("codeBlock")
                        ? { type: "text", text }
                        : text.replace(/</g, "&lt;"),
                    );
                    setContext(undefined);
                  } catch {
                    restore();
                    setContext(undefined);
                  }
                }}
              >
                Paste <small>Ctrl+V</small>
              </button>
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
                  "align-left",
                  "align-center",
                  "align-right",
                  "align-justify",
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
                  ...(onPlace ? ["float"] : []),
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
          </div>,
          document.body,
        )}
    </div>
  );
});
export default Editor;
