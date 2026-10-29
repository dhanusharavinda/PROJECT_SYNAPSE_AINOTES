// @vitest-environment jsdom
import React from "react";
import { it, expect, vi } from "vitest";
import {
  render,
  within,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Vault } from "../server/vault";
import { Collaboration } from "../server/collaboration";
import { newTabletNote } from "../src/tabletStore";
import SharedNotebook from "../src/SharedNotebook";
const mocked = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../src/api", () => ({
  api: mocked.call,
  setSharedMediaScope: () => {},
  fileUrl: () => "",
}));
vi.mock("../src/NotebookSheet", async () => ({
  default: (await import("react")).forwardRef(({ children }: any, _ref) => (
    <div>{children}</div>
  )),
}));
vi.mock("../src/RichEditor", async () => ({
  default: (await import("react")).forwardRef(
    ({ value, onChange, readOnly }: any, _ref) => (
      <textarea
        aria-label="Body"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    ),
  ),
}));
vi.mock("../src/AccountPanel", () => ({ Collaborators: () => null }));
it("keeps two sessions synchronized over repeated edits and a lost save acknowledgement with newer typing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-live-")),
    v = new Vault(root);
  await v.init();
  const note = await v.write({ ...newTabletNote(), body: "Initial" }),
    c = new Collaboration(v),
    owner = {
      session: "owner",
      email: "owner@example.test",
      name: "Owner",
      localOwner: true,
    };
  const people = {
    a: { session: "a", email: "a@example.test", name: "Alex" },
    b: { session: "b", email: "b@example.test", name: "Beth" },
  };
  await c.invite(note.id, owner, people.a.email, "editor");
  await c.invite(note.id, owner, people.b.email, "editor");
  let drop = true;
  const watches: Promise<unknown>[] = [];
  mocked.call.mockImplementation(async (url: string, body: any) => {
    const parts = url.split("/"),
      action = parts.at(-1)!,
      actor = people[parts.at(-2) as "a" | "b"];
    if (action === "snapshot") return c.snapshot(note.id, actor);
    if (action === "watch") {
      const watch = c.watch(note.id, actor, body.cursor, body.revision);
      watches.push(watch);
      return watch;
    }
    if (action === "acquire") return c.acquire(note.id, actor, body.cell);
    if (action === "release") {
      c.release(note.id, actor, body.cell);
      return { ok: true };
    }
    if (action === "change") {
      const saved = await c.change(
        note.id,
        actor,
        body.changes,
        body.operation,
      );
      if (actor.session === "a" && drop) {
        drop = false;
        throw Object.assign(new Error("Acknowledgement interrupted"), {
          status: 503,
        });
      }
      return saved;
    }
  });
  try {
    const ui = render(
      <>
        <div data-testid="a">
          <SharedNotebook
            id={note.id}
            connection="a"
            notify={() => {}}
            onBack={() => {}}
          />
        </div>
        <div data-testid="b">
          <SharedNotebook
            id={note.id}
            connection="b"
            notify={() => {}}
            onBack={() => {}}
          />
        </div>
      </>,
    );
    const a = (await within(ui.getByTestId("a")).findByLabelText(
        "Body",
      )) as HTMLTextAreaElement,
      b = (await within(ui.getByTestId("b")).findByLabelText(
        "Body",
      )) as HTMLTextAreaElement;
    fireEvent.focus(a);
    fireEvent.change(a, { target: { value: "First saved value" } });
    await within(ui.getByTestId("a")).findByText(/Reconnecting/);
    fireEvent.change(a, {
      target: { value: "Newer typing while the acknowledgement is missing" },
    });
    await waitFor(
      () =>
        expect(b.value).toBe(
          "Newer typing while the acknowledgement is missing",
        ),
      { timeout: 6000 },
    );
    fireEvent.blur(a);
    for (let round = 0; round < 4; round++) {
      const writer = round % 2 ? a : b,
        reader = round % 2 ? b : a;
      await waitFor(() => expect(writer.readOnly).toBe(false), {
        timeout: 5000,
      });
      fireEvent.focus(writer);
      fireEvent.change(writer, { target: { value: "Round " + round } });
      await waitFor(() => expect(reader.value).toBe("Round " + round), {
        timeout: 5000,
      });
      fireEvent.blur(writer);
    }
    await waitFor(() =>
      expect(ui.container.querySelector("[role=alert]")).toBeNull(),
    );
    expect((await v.note(note.id)).body).toBe("Round 3");
  } finally {
    cleanup();
    c.broadcast(note.id, { type: "closing" });
    await Promise.allSettled(watches);
    await fs.rm(root, { recursive: true, force: true });
    localStorage.clear();
  }
}, 20000);
