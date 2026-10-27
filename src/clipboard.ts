export async function copyText(text: string) {
  if (window.synapseEditing?.writeClipboard) {
    await window.synapseEditing.writeClipboard(text);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const selection = window.getSelection();
    const ranges = selection
      ? Array.from({ length: selection.rangeCount }, (_, i) =>
          selection.getRangeAt(i).cloneRange(),
        )
      : [];
    const focused = document.activeElement as HTMLElement | null;
    const input = document.createElement("textarea");
    input.value = text;
    input.style.cssText = "position:fixed;left:-10000px;top:0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    focused?.focus({ preventScroll: true });
    selection?.removeAllRanges();
    ranges.forEach((range) => selection?.addRange(range));
    if (!copied) throw new Error("Select the text and press Ctrl+C.");
  }
}
export function readClipboard(): Promise<string> {
  return (
    window.synapseEditing?.readClipboard?.() || navigator.clipboard.readText()
  );
}
