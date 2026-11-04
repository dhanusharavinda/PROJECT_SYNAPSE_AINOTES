import { expect, it, vi } from "vitest";
import {
  createHandwritingFontManager,
  MAX_HANDWRITING_FONT_BYTES,
  validateHandwritingFont,
  type HandwritingFontRecord,
} from "../src/handwritingFont";

function fontBytes() {
  // A bounded SFNT envelope. Real font decoding is a separate browser gate.
  const bytes = new ArrayBuffer(40),
    view = new DataView(bytes);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 1);
  view.setUint32(20, 28);
  view.setUint32(24, 12);
  return bytes;
}
function fixture() {
  let saved: HandwritingFontRecord | undefined;
  const read = vi.fn(async () => saved),
    write = vi.fn(async (record?: HandwritingFontRecord) => {
      saved = record;
    });
  const decode = vi.fn(async (_bytes: ArrayBuffer, family: string) => ({
      family,
    })),
    apply = vi.fn();
  const environment = { read, write, decode, apply };
  const file = {
    name: "My writing.ttf",
    size: 40,
    arrayBuffer: async () => fontBytes(),
  };
  return {
    manager: createHandwritingFontManager(environment),
    environment,
    file,
  };
}

it("persists a validated local font, restores it after reopening, and removes it without changing note content", async () => {
  const { manager, environment, file } = fixture();
  await manager.importFont(file);
  expect(environment.decode).toHaveBeenCalledOnce();
  expect(environment.write.mock.invocationCallOrder[0]).toBeLessThan(
    environment.apply.mock.invocationCallOrder[0],
  );
  expect(manager.getSnapshot()).toEqual({ ready: true, name: file.name });
  const reopened = createHandwritingFontManager(environment);
  await reopened.initialize();
  expect(reopened.getSnapshot().name).toBe(file.name);
  await reopened.remove();
  expect(reopened.getSnapshot()).toEqual({ ready: true });
  expect(environment.apply).toHaveBeenLastCalledWith(undefined);
  const afterRemoval = createHandwritingFontManager(environment);
  await afterRemoval.initialize();
  expect(afterRemoval.getSnapshot().name).toBeUndefined();
});

it("keeps the previous font when browser validation or durable storage fails", async () => {
  const { manager, environment, file } = fixture();
  await manager.importFont(file);
  environment.decode.mockRejectedValueOnce(Error("decode"));
  await expect(
    manager.importFont({ ...file, name: "Broken.ttf" }),
  ).rejects.toThrow("could not load");
  expect(environment.write).toHaveBeenCalledTimes(1);
  environment.write.mockRejectedValueOnce(Error("quota"));
  await expect(
    manager.importFont({ ...file, name: "New.ttf" }),
  ).rejects.toThrow("could not be saved");
  expect(manager.getSnapshot().name).toBe(file.name);
  expect(environment.apply).toHaveBeenCalledTimes(1);
  environment.write.mockRejectedValueOnce(Error("blocked"));
  await expect(manager.remove()).rejects.toThrow("could not be removed");
  expect(manager.getSnapshot().name).toBe(file.name);
});

it("rejects renamed images, missing tables, truncated fonts and excessive sizes before browser decoding", async () => {
  const { manager, environment, file } = fixture();
  await expect(
    manager.importFont({ ...file, size: MAX_HANDWRITING_FONT_BYTES + 1 }),
  ).rejects.toThrow("8 MB");
  expect(environment.read).not.toHaveBeenCalled();
  expect(() => validateHandwritingFont("writing.png", fontBytes())).toThrow(
    "font file",
  );
  expect(() =>
    validateHandwritingFont("photo.ttf", new ArrayBuffer(40)),
  ).toThrow("not a supported font");
  const broken = fontBytes();
  new DataView(broken).setUint32(24, 500);
  expect(() => validateHandwritingFont("writing.ttf", broken)).toThrow(
    "incomplete",
  );
  expect(environment.decode).not.toHaveBeenCalled();
});

it("recovers from an unreadable saved font and serializes later imports", async () => {
  const { environment, file } = fixture();
  environment.read.mockResolvedValueOnce({
    name: "Old.ttf",
    bytes: new ArrayBuffer(20),
  });
  const manager = createHandwritingFontManager(environment);
  await manager.initialize();
  expect(manager.getSnapshot().error).toContain("could not load");
  await Promise.all([
    manager.importFont({ ...file, name: "First.ttf" }),
    manager.importFont({ ...file, name: "Second.ttf" }),
  ]);
  expect(manager.getSnapshot()).toEqual({ ready: true, name: "Second.ttf" });
  const reopened = createHandwritingFontManager(environment);
  await reopened.initialize();
  expect(reopened.getSnapshot().name).toBe("Second.ttf");
});
