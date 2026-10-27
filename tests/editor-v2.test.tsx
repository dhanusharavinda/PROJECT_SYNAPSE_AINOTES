// @vitest-environment jsdom
import React, { createRef, useState } from "react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
  waitFor,
} from "@testing-library/react";
import Editor, { type EditorHandle } from "../src/Editor";
import type { Editor as CoreEditor } from "@tiptap/core";
import { MD } from "../src/ui";
import {
  parseVariants,
  variantsMarkdown,
  drawingMarkdown,
} from "../src/content";
import { storageMarkdown } from "../src/markdown";
import NoteView from "../src/NoteView";
import type { Bootstrap, Note } from "../src/types";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Range.prototype.getClientRects = () => [] as any;
  Range.prototype.getBoundingClientRect = () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON() {},
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function notebook(value = "Before embeddings after.") {
  let core!: CoreEditor;
  const handle = createRef<EditorHandle>();
  const changed = vi.fn(),
    command = vi.fn();
  function Harness() {
    const [body, setBody] = useState(value);
    return (
      <Editor
        ref={handle}
        value={body}
        onChange={(value) => {
          changed(value);
          setBody(value);
        }}
        onCommand={command}
        onReady={(e) => (core = e)}
      />
    );
  }
  const view = render(<Harness />);
  await screen.findByRole("textbox", { name: "Note explanation" });
  await waitFor(() => expect(core).toBeTruthy());
  return { core, handle, changed, command, ...view };
}
it("preserves both diagrams when writing below the second one in a controlled note", async () => {
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  const { core } = await notebook(
    "Before\n\n" +
      drawingMarkdown(a) +
      "\n\n" +
      drawingMarkdown(b) +
      "\n\nAfter",
  );
  fireEvent.click(
    await screen
      .findAllByRole("button", { name: "Write below" })
      .then((buttons) => buttons[1]),
  );
  expect(core.state.selection.$from.parent.type.name).toBe("paragraph");
  act(() => core.commands.insertContent("Following text."));
  expect(core.getMarkdown()).toContain(drawingMarkdown(a));
  expect(core.getMarkdown()).toContain(drawingMarkdown(b));
  expect(core.getMarkdown()).toContain("Following text.");
});
it("links the selected word without adding a see-also sentence", async () => {
  const { core, handle } = await notebook();
  act(() => {
    core.commands.setTextSelection({ from: 8, to: 18 });
    handle.current!.capture();
    handle.current!.linkTo(
      "11111111-1111-4111-8111-111111111111",
      "Embeddings",
    );
  });
  expect(core.getMarkdown()).toContain(
    "[embeddings](11111111-1111-4111-8111-111111111111.md)",
  );
  expect(core.getText()).toBe("Before embeddings after.");
  act(() => handle.current!.unlinkTo("11111111-1111-4111-8111-111111111111"));
  expect(core.getMarkdown()).toBe("Before embeddings after.");
});

it("keeps the latest revision when a delayed notebook refresh arrives after saving", async () => {
  const original: Note = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Concept",
    body: "My writing",
    context: "ML",
    group: "Study",
    layers: { intuition: "", technical: "", implementation: "" },
    links: [],
    sources: [],
    drawings: [],
    status: "collected",
    revision: 1,
    etag: "a".repeat(64),
    updated: "",
  };
  const data = {
    notes: [original],
    sources: [],
    proposals: [],
    reviews: [],
    episodes: [],
    shares: [],
    comments: [],
    positions: {},
    config: { provider: "none" },
  } as unknown as Bootstrap;
  const fetcher = vi.fn(async (_url, options) => {
    const sent = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        ...sent,
        revision: sent.revision + 1,
        etag: (sent.revision === 1 ? "b" : "c").repeat(64),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const props = {
    note: original,
    data,
    refresh: async () => {},
    onOpen: vi.fn(),
    onPractice: vi.fn(),
    onNew: vi.fn(),
    notify: vi.fn(),
    onDirty: vi.fn(),
  };
  const view = render(<NoteView {...props} />);
  await screen.findByRole("textbox", { name: "Note explanation" });
  fireEvent.change(screen.getByRole("textbox", { name: "Note title" }), {
    target: { value: "Renamed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save now" }));
  await waitFor(() => expect(screen.getByText("Saved locally")).toBeTruthy());
  expect(fetcher).toHaveBeenCalledTimes(1);
  view.rerender(<NoteView {...props} note={{ ...original }} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Concept meaning" }), {
    target: { value: "Vector meaning" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save now" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const second = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(second.revision).toBe(2);
  expect(second.etag).toBe("b".repeat(64));
  expect(second.title).toBe("Renamed");
});
it("wraps selected text into optional variants while retaining surrounding writing", async () => {
  const { core } = await notebook();
  act(() => core.commands.setTextSelection({ from: 8, to: 18 }));
  fireEvent.contextMenu(
    screen.getByRole("textbox", { name: "Note explanation" }),
    { clientX: 160, clientY: 180 },
  );
  fireEvent.click(
    screen.getByRole("menuitem", { name: /Another explanation/ }),
  );
  expect(core.getText()).toContain("Before");
  expect(core.getText()).toContain("embeddings");
  expect(core.getText()).toContain("after.");
  expect(core.getMarkdown()).toContain(":::variants");
  const parsed = parseVariants(
    core.getMarkdown().slice(core.getMarkdown().indexOf(":::variants")),
  );
  expect(parsed?.options).toHaveLength(2);
  expect(parsed?.options[0].body).toContain("embeddings");
  fireEvent.click(
    await screen.findByRole("button", { name: "Add another variant" }),
  );
  expect(
    parseVariants(
      core.getMarkdown().slice(core.getMarkdown().indexOf(":::variants")),
    )?.options,
  ).toHaveLength(3);
});
it("round-trips variants, pastel marks, tasks, code and image width in Markdown", async () => {
  const value =
    variantsMarkdown([
      { label: "", body: "Simple explanation." },
      { label: "In depth", body: "A more detailed explanation." },
    ]) +
    '\n\n- [x] Explain it\n- [ ] Practice it\n\n```python\nprint(42)\n```\n\n![Example](../attachments/example.png "synapse-width:320")\n\n<span data-pastel="mint">A useful detail.</span>';
  const { core } = await notebook(value);
  const md = storageMarkdown(core.getMarkdown());
  expect(parseVariants(md)?.options).toHaveLength(2);
  expect(md).toContain("- [x] Explain it");
  expect(md).toContain("```python");
  expect(md).toContain("synapse-width:320");
  expect(md).toContain('data-pastel="mint"');
  expect(core.getJSON().content?.some((n) => n.type === "variantGroup")).toBe(
    true,
  );
  expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
});
it("inserts a transparent drawing between paragraphs without deleting selected writing", async () => {
  const { core, handle } = await notebook();
  const id = "11111111-1111-4111-8111-111111111111";
  act(() => {
    core.commands.setTextSelection({ from: 8, to: 18 });
    handle.current!.capture();
    handle.current!.insertDrawing(id);
    core.commands.insertContent("Text after the diagram.");
  });
  const md = core.getMarkdown();
  expect(md).toContain("Before embeddings");
  expect(md).toContain(drawingMarkdown(id));
  expect(md).toContain("Text after the diagram.");
  expect(md.indexOf("Before")).toBeLessThan(md.indexOf(":::drawing"));
  expect(md.indexOf("Text after")).toBeGreaterThan(md.indexOf(":::drawing"));
});
it("lets the table add rows and columns at the current selection", async () => {
  const { core, container } = await notebook("");
  act(() => {
    core.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
  });
  await screen.findByRole("toolbar", { name: "Table controls" });
  fireEvent.click(screen.getByRole("button", { name: "+ Row below" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Column right" }));
  expect(container.querySelectorAll(".note-editor tr")).toHaveLength(3);
  expect(container.querySelector(".note-editor tr")?.children).toHaveLength(3);
});
it("uses italic text and exposes diagrams through slash commands", async () => {
  const { core, command } = await notebook();
  act(() => core.commands.setTextSelection({ from: 8, to: 18 }));
  fireEvent.click(screen.getByRole("button", { name: "Italic" }));
  expect(core.getMarkdown()).toContain("*embeddings*");
  act(() => {
    core.commands.setTextSelection(core.state.doc.content.size - 1);
    core.commands.insertContent(" /diagram");
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: /\/diagram/ }));
  expect(command).toHaveBeenCalledWith("flowchart");
  expect(core.getMarkdown()).not.toContain("/diagram");
});
it("sanitizes rich reading output and keeps variants expandable", () => {
  const { container } = render(
    <MD
      text={
        variantsMarkdown([
          { label: "", body: "Visible definition" },
          { label: "Example", body: "Hidden detail" },
        ]) +
        '\n\n<span data-pastel="sky">Color</span><script>alert(1)</script><img src="x" onerror="alert(2)">'
      }
    />,
  );
  expect(container.querySelector("details")).toBeTruthy();
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("[onerror]")).toBeNull();
  expect(container.querySelector('[data-pastel="sky"]')).toBeTruthy();
});
it("never stores a web pairing credential in a Markdown attachment URL", () => {
  expect(
    storageMarkdown(
      '![Image](http://127.0.0.1:4317/files/attachments/image.png?access=abcdef123456 "synapse-width:320")',
    ),
  ).toBe('![Image](../attachments/image.png "synapse-width:320")');
});
it("keeps a context menu open while its own list scrolls", async () => {
  const { core, container } = await notebook();
  act(() => core.commands.setTextSelection({ from: 1, to: 4 }));
  fireEvent.contextMenu(container.querySelector(".editor-wrap")!, {
    clientX: 150,
    clientY: 180,
  });
  const menu = screen.getByRole("menu", { name: "Edit selected content" });
  fireEvent.scroll(menu, { target: { scrollTop: 200 } });
  expect(
    screen.queryByRole("menu", { name: "Edit selected content" }),
  ).toBeTruthy();
  fireEvent.scroll(window);
  expect(
    screen.queryByRole("menu", { name: "Edit selected content" }),
  ).toBeNull();
});
it("pastes code as literal plain text, including angle brackets and newlines", async () => {
  const { core, container } = await notebook("```python\nold\n```");
  act(() => core.commands.setTextSelection({ from: 1, to: 4 }));
  const plain = "if x < 3:\n    print('<hello>')";
  fireEvent.paste(container.querySelector(".note-editor")!, {
    clipboardData: { files: [], getData: () => plain },
  });
  expect(core.state.doc.firstChild?.textContent).toBe(plain);
  expect(core.getMarkdown()).toContain(plain);
});
