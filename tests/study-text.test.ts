import { expect, it } from "vitest";
import { readableText } from "../src/studyText";
import { plainNote, variantsMarkdown } from "../src/content";
import { speechText } from "../server/retrieval";
import { youtubeLink } from "../src/youtube";
import { penOutline, penWeight } from "../src/penStroke";
import type { Note } from "../src/types";
it("uses visible words rather than formatting tags for recall cues", () => {
  const body = variantsMarkdown([
    {
      label: "Example",
      body: '<p>A <span data-pastel="mint">useful connection</span> stays readable.</p>',
    },
  ]);
  const note = {
    body,
    canvas: {
      height: 500,
      items: [{ kind: "text", text: "<em>Another example.</em>" }],
    },
  } as Note;
  expect(plainNote(note)).toBe(
    "A useful connection stays readable.\n\nAnother example.",
  );
});
it("cleans old escaped tags and annotation markers from stored scripts", () => {
  expect(
    readableText(
      '&lt;span data-pastel="mint"&gt;Remember this&lt;/span&gt;\n:::endoption',
    ),
  ).toBe("Remember this");
  expect(
    speechText(
      "<p>Try <strong>one example</strong>.</p>\n```python\nprint(1)\n```",
    ),
  ).toBe("Try one example.\n\nA code example is available in your note.");
});
it("preserves literal code and comparisons in text supplied to AI", () => {
  const code =
    '```ts\nconst values: Array<string> = [];\nconst html = "<span>Literal markup</span>";\n```';
  expect(readableText(code)).toBe(code);
  expect(readableText("Use `Array<string>` when x < y and z > w.")).toBe(
    "Use `Array<string>` when x < y and z > w.",
  );
  expect(plainNote({ body: code } as Note)).toBe(code);
});
it("preserves readable linked labels and paragraph breaks", () => {
  expect(
    readableText("<p>First &amp; second.</p><p>[Another idea](note.md)</p>"),
  ).toBe("First & second.\nAnother idea");
});
it("recognizes standard, short and shorts YouTube links", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
  ])
    expect(youtubeLink(url)?.id).toBe("dQw4w9WgXcQ");
});
it("keeps timestamps and playlist context on pasted video links", () => {
  const url = "https://youtu.be/dQw4w9WgXcQ?t=90&list=PLexample";
  expect(youtubeLink(url)?.url).toBe(url);
});
it("does not treat lookalike hosts or arbitrary URLs as video thumbnails", () => {
  for (const url of [
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "https://youtube.com/watch?v=bad",
    "https://example.com/dQw4w9WgXcQ",
  ])
    expect(youtubeLink(url)).toBeUndefined();
});
it("varies nib width subtly by speed without an abrupt first jump", () => {
  const slow = penWeight(1, 16),
    fast = penWeight(60, 16);
  expect(slow).toBeGreaterThan(fast);
  expect(Math.abs(slow - 1)).toBeLessThan(0.04);
  expect(Math.abs(fast - 1)).toBeLessThan(0.05);
  let weight = 1;
  for (let i = 0; i < 100; i++) weight = penWeight(60, 16, weight);
  expect(weight).toBeGreaterThan(0.85);
});
it("renders rounded continuous ink for a curved or stationary pointer", () => {
  for (const points of [
    [
      [0, 0],
      [10, 20],
      [30, 25],
      [50, 10],
    ],
    [
      [1, 1],
      [1, 1],
    ],
  ] as [number, number][][]) {
    const path = penOutline({
      kind: "pen",
      points,
      width: 60,
      height: 40,
      strokeWidth: 3,
    } as any);
    expect(path).toMatch(/^M/);
    expect(path).toContain("Q");
    expect(path).toMatch(/ Z$/);
    expect(path).not.toMatch(/NaN|Infinity/);
  }
});
