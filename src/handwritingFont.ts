export const MAX_HANDWRITING_FONT_BYTES = 8 * 1024 * 1024;
export const HANDWRITING_FALLBACK =
  '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

export type HandwritingFontRecord = { name: string; bytes: ArrayBuffer };
export type HandwritingFontState = {
  ready: boolean;
  name?: string;
  error?: string;
};
type FontFile = Pick<File, "name" | "size" | "arrayBuffer">;
type FontEnvironment<Face> = {
  read: () => Promise<HandwritingFontRecord | undefined>;
  write: (record?: HandwritingFontRecord) => Promise<void>;
  decode: (bytes: ArrayBuffer, family: string) => Promise<Face>;
  apply: (face: Face | undefined, family?: string) => void;
};

export function validateHandwritingFont(name: string, bytes: ArrayBuffer) {
  if (!/\.(ttf|otf|woff2?)$/i.test(name))
    throw Error("Choose a TTF, OTF, WOFF or WOFF2 font file.");
  if (bytes.byteLength < 12 || bytes.byteLength > MAX_HANDWRITING_FONT_BYTES)
    throw Error("Choose a valid font smaller than 8 MB.");
  const data = new DataView(bytes);
  const signature = data.getUint32(0);
  if (
    ![0x00010000, 0x4f54544f, 0x74727565, 0x774f4646, 0x774f4632].includes(
      signature,
    )
  )
    throw Error(
      "This file is not a supported font. Export it as TTF or OTF first.",
    );
  if (signature === 0x774f4646 || signature === 0x774f4632) {
    if (
      bytes.byteLength < 48 ||
      data.getUint32(8) !== bytes.byteLength ||
      data.getUint32(16) > 32 * 1024 * 1024
    )
      throw Error("This compressed font is damaged or too large.");
  } else {
    const tables = data.getUint16(4);
    if (!tables || tables > 256 || 12 + tables * 16 > bytes.byteLength)
      throw Error("This font is incomplete. Export the font again.");
    for (let i = 0; i < tables; i++) {
      const offset = data.getUint32(12 + i * 16 + 8),
        size = data.getUint32(12 + i * 16 + 12);
      if (offset + size > bytes.byteLength)
        throw Error("This font is incomplete. Export the font again.");
    }
  }
}

// Storage completes before appearance changes. A failed import never replaces
// the previous font, and no font bytes are sent to a server or model.
export function createHandwritingFontManager<Face>(
  environment: FontEnvironment<Face>,
) {
  let state: HandwritingFontState = { ready: false };
  let initialization: Promise<void> | undefined;
  let queue = Promise.resolve();
  let version = 0;
  const listeners = new Set<() => void>();
  function publish(next: HandwritingFontState) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = queue.then(action);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  function initialize() {
    return (initialization ||= enqueue(async () => {
      try {
        const record = await environment.read();
        if (record) {
          validateHandwritingFont(record.name, record.bytes);
          const family = `SynapsePersonalHandwriting${++version}`;
          const face = await environment.decode(record.bytes, family);
          environment.apply(face, family);
          publish({ ready: true, name: record.name });
        } else publish({ ready: true });
      } catch {
        publish({
          ready: true,
          error:
            "Your saved font could not load. Import it again or use the default.",
        });
      }
    }));
  }
  return {
    initialize,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async importFont(file: FontFile) {
      if (file.size > MAX_HANDWRITING_FONT_BYTES)
        throw Error("Choose a font smaller than 8 MB.");
      await initialize();
      return enqueue(async () => {
        const bytes = await file.arrayBuffer();
        validateHandwritingFont(file.name, bytes);
        const family = `SynapsePersonalHandwriting${++version}`;
        let face: Face;
        try {
          face = await environment.decode(bytes, family);
        } catch {
          throw Error(
            "This font could not load. Try a fresh TTF or OTF export.",
          );
        }
        const name = file.name
          .split(/[\\/]/)
          .at(-1)!
          .replaceAll("\u2014", " ")
          .slice(-120);
        try {
          await environment.write({ name, bytes });
        } catch {
          throw Error(
            "The font could not be saved on this device. Free some storage and try again.",
          );
        }
        environment.apply(face, family);
        publish({ ready: true, name });
      });
    },
    async remove() {
      await initialize();
      return enqueue(async () => {
        try {
          await environment.write();
        } catch {
          throw Error("The saved font could not be removed. Try again.");
        }
        environment.apply(undefined);
        publish({ ready: true });
      });
    },
  };
}

function fontDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(Error("Local font storage is unavailable."));
      return;
    }
    const request = indexedDB.open("synapse-handwriting-font", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("font");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(Error("Close other Synapse tabs and try again."));
  });
}
async function readFont() {
  const database = await fontDatabase();
  try {
    return await new Promise<HandwritingFontRecord | undefined>(
      (resolve, reject) => {
        const transaction = database.transaction("font", "readonly");
        const request = transaction.objectStore("font").get("personal");
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () =>
          reject(transaction.error);
      },
    );
  } finally {
    database.close();
  }
}
async function writeFont(record?: HandwritingFontRecord) {
  const database = await fontDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("font", "readwrite");
      const store = transaction.objectStore("font");
      if (record) store.put(record, "personal");
      else store.delete("personal");
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
let activeFace: FontFace | undefined;
export const handwritingFont = createHandwritingFontManager<FontFace>({
  read: readFont,
  write: writeFont,
  async decode(bytes, family) {
    if (typeof FontFace === "undefined")
      throw Error("Font loading is unavailable.");
    return await new FontFace(family, bytes).load();
  },
  apply(face, family) {
    if (face) document.fonts.add(face);
    if (activeFace) document.fonts.delete(activeFace);
    activeFace = face;
    if (family)
      document.documentElement.style.setProperty(
        "--handwriting-font",
        `"${family}", ${HANDWRITING_FALLBACK}`,
      );
    else document.documentElement.style.removeProperty("--handwriting-font");
  },
});
export const restoreHandwritingFont = () => handwritingFont.initialize();
