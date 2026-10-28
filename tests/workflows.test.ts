import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApp } from "../server/app.js";
import { Vault, uid, nextDue, decodeNote } from "../server/vault.js";
import { isPrivate, publicPage, ocr, extractPdf } from "../server/capture.js";
import { seed } from "../server/seed.js";
import { candidateNotes, speechText } from "../server/retrieval.js";
import { wslPath } from "../server/hermes.js";
import { displayMarkdown, storageMarkdown } from "../src/markdown.js";
import type { Note } from "../src/types.js";
let root: string;
let app: Awaited<ReturnType<typeof createApp>>;
let note: Note;
const owner = (method: "get" | "post" | "put" | "delete", url: string) =>
  request(app.app)[method](url).set("x-test-owner", "true");
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-test-"));
  app = await createApp(root, { test: true });
  app.app.use(app.errors);
  note = (
    await owner("post", "/api/notes").send({
      title: "Embeddings",
      layers: {
        intuition: "A learned vector representation.",
        technical: "Model and task matter.",
        implementation: "Use compatible encoders.",
      },
    })
  ).body;
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await fs.rm(root, { recursive: true, force: true });
});
describe("local notebook integrity", () => {
  it("stores revision opt-out explicitly for non-study notes", async () => {
    const saved = await owner("put", "/api/notes/" + note.id).send({
      ...note,
      reviewEnabled: false,
    });
    expect(saved.body.reviewEnabled).toBe(false);
    expect((await app.vault.note(note.id)).reviewEnabled).toBe(false);
  });
  it("preserves section headings inside code and user explanations", async () => {
    const text =
      "```md\n## Technical\nThis is a code sample.\n```\n\n## Technical\nA subheading inside my explanation.";
    await owner("put", "/api/notes/" + note.id)
      .send({ ...note, layers: { ...note.layers, intuition: text } })
      .expect(200);
    expect((await app.vault.note(note.id)).layers.intuition).toBe(text);
  });
  it("keeps a blank group visible as Unsorted", async () => {
    const n = await owner("put", "/api/notes/" + note.id).send({
      ...note,
      group: "",
    });
    expect(n.body.group).toBe("Unsorted");
  });
  it("keeps existing links valid when their target is archived", async () => {
    const target = (
      await owner("post", "/api/notes").send({ title: "A related idea" })
    ).body;
    const linked = (
      await owner("put", "/api/notes/" + note.id).send({
        ...note,
        links: [{ target: target.id, relation: "related", reason: "" }],
      })
    ).body;
    await owner("delete", "/api/notes/" + target.id).expect(200);
    await owner("put", "/api/notes/" + note.id)
      .send({ ...linked, title: "Still editable" })
      .expect(200);
  });
  it("creates a real Markdown file and survives a fresh Vault instance", async () => {
    expect(note.id).toBeTruthy();
    const raw = await fs.readFile(
      path.join(root, "notes", note.id + ".md"),
      "utf8",
    );
    expect(raw).toContain("## Intuition");
    const reopened = new Vault(root);
    expect((await reopened.note(note.id)).layers).toEqual(note.layers);
  });
  it("saves layers and snapshots the previous version", async () => {
    const saved = await owner("put", "/api/notes/" + note.id).send({
      ...note,
      layers: { ...note.layers, technical: "New detail." },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.revision).toBe(2);
    const h = await owner("get", "/api/notes/" + note.id + "/history");
    expect(h.body[0].markdown).toContain("Model and task matter.");
  });
  it("rejects a stale concurrent save and preserves the winning change", async () => {
    await owner("put", "/api/notes/" + note.id)
      .send({ ...note, title: "Winning change" })
      .expect(200);
    await owner("put", "/api/notes/" + note.id)
      .send({ ...note, title: "Stale change" })
      .expect(409);
    expect((await app.vault.note(note.id)).title).toBe("Winning change");
  });
  it("detects an external Markdown edit even when revision was not incremented", async () => {
    const file = path.join(root, "notes", note.id + ".md");
    const raw = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      raw.replace(
        "A learned vector representation.",
        "External editor wrote this.",
      ),
    );
    await owner("put", "/api/notes/" + note.id)
      .send({ ...note, title: "Would overwrite external text" })
      .expect(409);
    expect((await app.vault.note(note.id)).layers.intuition).toBe(
      "External editor wrote this.",
    );
  });
  it("rejects self-links and unknown targets", async () => {
    for (const target of [note.id, uid()])
      await owner("put", "/api/notes/" + note.id)
        .send({
          ...note,
          links: [{ target, relation: "related", reason: "test" }],
        })
        .expect(400);
  });
  it("archives and restores without deleting the Markdown", async () => {
    await owner("delete", "/api/notes/" + note.id).expect(200);
    expect(await app.vault.notes()).toHaveLength(0);
    expect((await owner("get", "/api/archive")).body).toHaveLength(1);
    await owner("post", "/api/notes/" + note.id + "/restore")
      .send({})
      .expect(200);
    expect(await app.vault.notes()).toHaveLength(1);
  });
  it("rebuilds graph and stores pinned positions plus portable Canvas", async () => {
    await owner("post", "/api/positions")
      .send({ [note.id]: { x: 200, y: 150, pinned: true } })
      .expect(200);
    const state = (await owner("get", "/api/bootstrap")).body;
    expect(state.positions[note.id].pinned).toBe(true);
    const canvas = JSON.parse(
      await fs.readFile(path.join(root, "maps/knowledge-graph.canvas"), "utf8"),
    );
    expect(canvas.nodes[0].file).toBe("notes/" + note.id + ".md");
    expect(canvas.nodes[0].x).toBe(200);
  });
  it("starts empty without bundled subject-specific notes", async () => {
    const another = new Vault(path.join(root, "seed"));
    await another.init();
    await seed(another);
    expect(await another.notes()).toHaveLength(0);
    await seed(another);
    expect(await another.notes()).toHaveLength(0);
  });
});
describe("access boundaries", () => {
  it("never returns plain or encrypted secrets in bootstrap", async () => {
    Object.assign(app.providers.config, {
      openaiKey: "test-only-secret",
      telegramToken: "test-bot",
      telegramChat: "test-chat",
      secrets: "encrypted-test-payload",
    });
    const result = await owner("get", "/api/bootstrap");
    const config = JSON.stringify(result.body.config);
    expect(config).not.toContain("test-only-secret");
    expect(config).not.toContain("encrypted-test-payload");
    expect(config).not.toContain("test-bot");
    expect(result.body.config.keySet).toBe(true);
  });
  it("denies an unowned API request", async () => {
    await request(app.app).get("/api/bootstrap").expect(401);
  });
  it("rejects cross-origin mutation even with an owner session", async () => {
    await owner("post", "/api/notes")
      .set("Origin", "https://attacker.example")
      .send({ title: "injected" })
      .expect(403);
  });
  it("does not expose API secrets or other notes through a share link", async () => {
    const other = (
      await owner("post", "/api/notes").send({ title: "Private concept" })
    ).body;
    await owner("put", "/api/notes/" + note.id).send({
      ...note,
      links: [{ target: other.id, relation: "related", reason: "private" }],
    });
    const share = (
      await owner("post", "/api/shares").send({
        noteId: note.id,
        role: "viewer",
        label: "Read",
      })
    ).body;
    const shared = await request(app.app).get("/api/shared/" + share.id);
    expect(shared.status).toBe(200);
    expect(shared.body.note.links).toEqual([]);
    expect(JSON.stringify(shared.body)).not.toContain("Private concept");
    expect(shared.body.config).toBeUndefined();
  });
  it.each(["viewer", "commenter", "suggestion"])(
    "enforces %s against direct edits",
    async (role) => {
      const s = (
        await owner("post", "/api/shares").send({
          noteId: note.id,
          role,
          label: "test",
        })
      ).body;
      await request(app.app)
        .put("/api/shared/" + s.id)
        .send({ layers: note.layers, revision: note.revision, etag: note.etag })
        .expect(403);
    },
  );
  it("allows editor layer changes and rejects editor revision conflicts", async () => {
    const s = (
      await owner("post", "/api/shares").send({
        noteId: note.id,
        role: "editor",
        label: "Edit",
      })
    ).body;
    const body = {
      layers: { ...note.layers, intuition: "Shared edit." },
      revision: note.revision,
      etag: note.etag,
    };
    await request(app.app)
      .put("/api/shared/" + s.id)
      .send(body)
      .expect(200);
    await request(app.app)
      .put("/api/shared/" + s.id)
      .send(body)
      .expect(409);
    expect((await app.vault.note(note.id)).layers.intuition).toBe(
      "Shared edit.",
    );
  });
  it("requires owner acceptance for suggested text", async () => {
    const s = (
      await owner("post", "/api/shares").send({
        noteId: note.id,
        role: "suggestion",
        label: "Suggest",
      })
    ).body;
    const c = await request(app.app)
      .post("/api/shared/" + s.id + "/comments")
      .send({ author: "Classmate", text: "A useful example." });
    expect(c.status).toBe(201);
    expect((await app.vault.note(note.id)).layers.technical).not.toContain(
      "A useful example.",
    );
    await owner("post", "/api/comments/" + c.body.id)
      .send({ action: "accept" })
      .expect(200);
    expect((await app.vault.note(note.id)).layers.technical).toContain(
      "A useful example.",
    );
  });
  it("revokes links immediately", async () => {
    const s = (
      await owner("post", "/api/shares").send({
        noteId: note.id,
        role: "viewer",
        label: "",
      })
    ).body;
    await owner("delete", "/api/shares/" + s.id).expect(200);
    await request(app.app)
      .get("/api/shared/" + s.id)
      .expect(403);
  });
  it("rejects traversal, unknown files, and unsupported uploads", async () => {
    await owner("get", "/api/drawings/not-an-id").expect(400);
    await request(app.app).get("/files/attachments/secret.txt").expect(403);
    await owner("post", "/api/upload")
      .attach("file", Buffer.from("<script>bad</script>"), "payload.html")
      .expect(415);
  });
});
describe("source review and learning", () => {
  it("archives a source without deleting the original or its citation", async () => {
    const source = (
      await owner("post", "/api/upload").attach(
        "file",
        Buffer.from("Reference"),
        "reference.txt",
      )
    ).body;
    await owner("post", "/api/sources/" + source.id + "/archive")
      .send({ archived: true })
      .expect(200);
    expect((await app.vault.state()).sources[0].archived).toBe(true);
    expect(
      await fs.readFile(path.join(root, "attachments", source.file), "utf8"),
    ).toBe("Reference");
    await owner("post", "/api/sources/" + source.id + "/archive")
      .send({ archived: false })
      .expect(200);
  });
  it("rejects non-web source URLs and malformed URLs", async () => {
    for (const url of ["javascript://instagram.com/anything", "not a URL"])
      await owner("post", "/api/sources")
        .send({ title: "Invalid", url })
        .expect(400);
  });
  it("requires approval before visual extraction uploads", async () => {
    const source = (
      await owner("post", "/api/upload").attach(
        "file",
        Buffer.from("fixture"),
        "image.png",
      )
    ).body;
    await owner("post", "/api/sources/" + source.id + "/extract")
      .send({ mode: "vision" })
      .expect(400);
  });
  it("rejects a proposal after an external change with the same revision", async () => {
    vi.spyOn(app.providers, "layers").mockResolvedValue(note.layers);
    const p = (
      await owner("post", "/api/notes/" + note.id + "/ai").send({
        kind: "layers",
      })
    ).body[0];
    const file = path.join(root, "notes", note.id + ".md");
    await fs.writeFile(
      file,
      (await fs.readFile(file, "utf8")).replace(
        "Model and task matter.",
        "Externally revised.",
      ),
    );
    await owner("post", "/api/proposals/" + p.id)
      .send({ action: "accept" })
      .expect(409);
  });
  it("rejects fabricated source excerpts without saving suggestions", async () => {
    const source = (
      await owner("post", "/api/sources").send({
        title: "Source",
        text: "A real source excerpt.",
      })
    ).body;
    vi.spyOn(app.providers, "json").mockResolvedValue({
      items: [
        {
          noteId: note.id,
          title: "Claim",
          reason: "Test",
          excerpt: "Invented quote",
          content: "Addition",
          classification: "new-detail",
        },
      ],
    });
    await owner("post", "/api/sources/" + source.id + "/analyze")
      .send({})
      .expect(502);
    expect((await app.vault.state()).proposals).toHaveLength(0);
  });
  it("accepts a source addition once and attaches its provenance", async () => {
    const source = (
      await owner("post", "/api/sources").send({
        title: "Source",
        text: "A real source excerpt.",
      })
    ).body;
    vi.spyOn(app.providers, "json").mockResolvedValue({
      items: [
        {
          noteId: note.id,
          title: "Example",
          reason: "Useful example",
          excerpt: "A real source excerpt.",
          content: "An additional example.",
          classification: "better-example",
        },
      ],
    });
    const proposals = (
      await owner("post", "/api/sources/" + source.id + "/analyze").send({})
    ).body;
    await owner("post", "/api/proposals/" + proposals[0].id)
      .send({ action: "accept" })
      .expect(200);
    await owner("post", "/api/proposals/" + proposals[0].id)
      .send({ action: "accept" })
      .expect(409);
    const saved = await app.vault.note(note.id);
    expect(saved.sources).toContain(source.id);
    expect(saved.layers.technical).toContain("An additional example.");
  });
  it("keeps a generated flowchart pending until accepted", async () => {
    vi.spyOn(app.providers, "json").mockResolvedValue({
      type: "flowchart", rationale: "A sequence from query to vector.",
      nodes: [
        { id: "a", label: "Query" },
        { id: "b", label: "Vector" },
      ],
      edges: [{ from: "a", to: "b", label: "encode" }],
    });
    const p = (
      await owner("post", "/api/notes/" + note.id + "/ai").send({
        kind: "diagram",
      })
    ).body[0];
    expect((await app.vault.note(note.id)).drawings).toHaveLength(0);
    await owner("post", "/api/proposals/" + p.id)
      .send({ action: "accept" })
      .expect(200);
    const saved = await app.vault.note(note.id);
    const drawing = (await owner("get", "/api/drawings/" + saved.drawings[0]))
      .body;
    expect(drawing.diagram.nodes).toHaveLength(2);
  });
  it("captures an Instagram URL without claiming to have watched it", async () => {
    const r = await owner("post", "/api/sources").send({
      title: "A reel",
      url: "https://www.instagram.com/reel/test/",
    });
    expect(r.status).toBe(201);
    expect(r.body.coverage).toContain("has not been watched");
    expect(r.body.text).toBe("");
  });
  it("stores a text upload and exposes it only to an attached share", async () => {
    const source = (
      await owner("post", "/api/upload").attach(
        "file",
        Buffer.from("A useful passage"),
        "source.txt",
      )
    ).body;
    expect(source.text).toBe("A useful passage");
    const share = (
      await owner("post", "/api/shares").send({
        noteId: note.id,
        role: "viewer",
        label: "",
      })
    ).body;
    await request(app.app)
      .get("/files/attachments/" + source.file + "?share=" + share.id)
      .expect(403);
    await owner("put", "/api/notes/" + note.id)
      .send({ ...note, sources: [source.id] })
      .expect(200);
    await request(app.app)
      .get("/files/attachments/" + source.file + "?share=" + share.id)
      .expect(200);
  });
  it("does not apply an AI layer draft until approved", async () => {
    vi.spyOn(app.providers, "layers").mockResolvedValue({
      intuition: "Draft intuition",
      technical: "Draft technical",
      implementation: "Draft code",
    });
    const result = await owner("post", "/api/notes/" + note.id + "/ai").send({
      kind: "layers",
    });
    expect(result.status).toBe(200);
    expect((await app.vault.note(note.id)).layers).toEqual(note.layers);
    await owner("post", "/api/proposals/" + result.body[0].id)
      .send({ action: "accept" })
      .expect(200);
    expect((await app.vault.note(note.id)).layers.intuition).toBe(
      "Draft intuition",
    );
  });
  it("rejects stale suggestions instead of overwriting a newer explanation", async () => {
    vi.spyOn(app.providers, "layers").mockResolvedValue(note.layers);
    const p = (
      await owner("post", "/api/notes/" + note.id + "/ai").send({
        kind: "layers",
      })
    ).body[0];
    await owner("put", "/api/notes/" + note.id)
      .send({ ...note, title: "New title" })
      .expect(200);
    await owner("post", "/api/proposals/" + p.id)
      .send({ action: "accept" })
      .expect(409);
  });
  it("handles disabled AI without creating partial suggestions", async () => {
    await owner("post", "/api/notes/" + note.id + "/ai")
      .send({ kind: "layers" })
      .expect(400);
    expect((await app.vault.state()).proposals).toEqual([]);
  });
  it("records a recall attempt and a future due date without inventing mastery", async () => {
    const r = await owner("post", "/api/reviews").send({
      noteId: note.id,
      question: "Explain it",
      answer: "My attempt",
      rating: "hard",
      hintUsed: true,
    });
    expect(r.status).toBe(201);
    expect(r.body.hintUsed).toBe(true);
    expect(new Date(r.body.due).getTime()).toBeGreaterThan(Date.now());
    expect((await app.vault.note(note.id)).status).toBe("practiced");
    expect(r.body.mastery).toBeUndefined();
  });
  it("schedules another attempt in 10 minutes after a failed recall", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(nextDue("again", 4, now)).toBe("2026-01-01T00:10:00.000Z");
  });
  it("persists an editable drawing and a static preview", async () => {
    const drawing = (
      await owner("post", "/api/notes/" + note.id + "/drawings").send({})
    ).body;
    expect(drawing.id).toBeTruthy();
    await owner("put", "/api/drawings/" + drawing.id)
      .send({
        elements: [{ id: "shape", type: "rectangle" }],
        files: {},
        svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      })
      .expect(200);
    const saved = (await owner("get", "/api/drawings/" + drawing.id)).body;
    expect(saved.elements[0].id).toBe("shape");
    expect((await app.vault.note(note.id)).drawings).toContain(drawing.id);
  });
  it("creates a local revision script and does not mark listening as practice", async () => {
    const r = await owner("post", "/api/episodes").send({
      noteIds: [note.id],
      ai: false,
    });
    expect(r.status).toBe(201);
    expect(r.body.script).toContain("Pause playback");
    expect((await app.vault.note(note.id)).status).toBe("collected");
  });
  it("requires explicit approval before cloud speech and external delivery", async () => {
    const e = (
      await owner("post", "/api/episodes").send({
        noteIds: [note.id],
        ai: false,
      })
    ).body;
    await owner("post", "/api/episodes/" + e.id + "/render")
      .send({ provider: "openai" })
      .expect(400);
    await owner("post", "/api/episodes/" + e.id + "/deliver")
      .send({ mode: "telegram" })
      .expect(400);
  });
});
describe("bounded retrieval and local delivery preparation", () => {
  it("supports the installed Qwen raw-prompt template without dropping instructions", async () => {
    app.providers.config.provider = "ollama";
    const local = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            template: "{{ .Prompt }}",
            details: { family: "qwen3vl" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: JSON.stringify(note.layers),
            done_reason: "stop",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", local);
    expect(await app.providers.layers(note)).toEqual(note.layers);
    expect(String(local.mock.calls[1][0])).toContain("/api/generate");
    const payload = JSON.parse(local.mock.calls[1][1].body);
    expect(payload.prompt).toContain("Embeddings");
    expect(payload.prompt).toContain("<think>\n\n</think>\n\n");
    expect(payload.options.num_ctx).toBe(8192);
  });
  it("blocks an Ollama cloud alias before sending note content", async () => {
    app.providers.config.provider = "ollama";
    app.providers.config.ollamaModel = "a-cloud-alias";
    const remote = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          remote_model: "cloud-model",
          remote_host: "https://ollama.com",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", remote);
    await expect(
      app.providers.text("Explain this", "Private note text"),
    ).rejects.toThrow("remote Ollama model");
    expect(remote).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(remote.mock.calls)).not.toContain(
      "Private note text",
    );
  });
  it("accepts a valid draft from an installed local Ollama model", async () => {
    app.providers.config.provider = "ollama";
    const local = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ message: { content: JSON.stringify(note.layers) } }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", local);
    expect(await app.providers.layers(note)).toEqual(note.layers);
  });
  it("round-trips portable relative image links through the editor", () => {
    const original = "![Example](../attachments/example.png)";
    expect(displayMarkdown(original)).toBe(
      "![Example](/files/attachments/example.png)",
    );
    expect(storageMarkdown(displayMarkdown(original))).toBe(original);
  });
  it("prioritizes related notes without claiming factual confidence", () => {
    const unrelated = {
      ...note,
      id: uid(),
      title: "Gardening",
      context: "Plants",
      group: "Other",
      layers: {
        intuition: "How to water a plant.",
        technical: "",
        implementation: "",
      },
    };
    expect(
      candidateNotes(
        "Embedding vectors and similarity",
        [unrelated, note],
        1,
      )[0].id,
    ).toBe(note.id);
  });
  it("turns code and Markdown into a useful speech script", () => {
    expect(
      speechText(
        "## Example\n[Vectors](https://example.com)\n```python\nprivate_code()\n```",
      ),
    ).toBe("Example\nVectors\nA code example is available in your note.");
  });
  it("converts the actual Windows audio path without a shell command", () => {
    expect(
      wslPath(
        "C:\\SecondBrain\\PROJECTS\\PROJECT_SYNAPSE\\vault\\audio\\clip.wav",
      ),
    ).toBe("/mnt/c/SecondBrain/PROJECTS/PROJECT_SYNAPSE/vault/audio/clip.wav");
    expect(() => wslPath("/root/private")).toThrow();
  });
});
describe("public URL protections", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "169.254.169.254",
    "172.16.1.2",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])("blocks internal address %s", (address) => {
    expect(isPrivate(address)).toBe(true);
  });
  it("allows public addresses for a pinned lookup", () => {
    expect(isPrivate("93.184.216.34")).toBe(false);
    expect(isPrivate("2606:4700:4700::1111")).toBe(false);
  });
  it("rejects local addresses and non-HTTP schemes before fetching", async () => {
    await expect(publicPage("http://127.0.0.1")).rejects.toThrow("Private");
    await expect(publicPage("file:///etc/passwd")).rejects.toThrow(
      "Only public",
    );
    await expect(
      publicPage("http://name:password@example.com"),
    ).rejects.toThrow("Only public");
  });
});
