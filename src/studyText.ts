/** Human-readable note text for recall cues and spoken scripts, never HTML. */
export function readableText(source: string) {
  const code: string[] = [];
  let token = "\u0000synapse-code-";
  while (source.includes(token)) token += "_";
  source = source.replace(
    /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)|`[^`\n]+`/g,
    (text) => {
      code.push(text);
      return token + (code.length - 1) + "\u0000";
    },
  );
  return source
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<(?:br\s*\/?|\/p|\/div|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/gi, "")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code: string) => {
      const n =
        code[0].toLowerCase() === "x"
          ? parseInt(code.slice(1), 16)
          : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/gi, "")
    .replace(
      /^\s*:::(?:option|variants|endvariants|endoption|drawing)\b[^\n]*$/gm,
      "",
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
    .trim()
    .replace(
      new RegExp(token + "(\\d+)\u0000", "g"),
      (_, index) => code[Number(index)],
    );
}
