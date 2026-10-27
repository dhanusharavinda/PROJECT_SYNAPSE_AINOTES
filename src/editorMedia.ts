import type { NodeViewRenderer } from "@tiptap/core";

// DOM node views keep native dragging and resizing separate from text selection.
export const MediaImage: NodeViewRenderer = ({ node, getPos, editor }) => {
  let current = node;
  const dom = document.createElement("figure");
  dom.className = "notebook-image";
  dom.contentEditable = "false";
  dom.draggable = true;
  dom.setAttribute("data-drag-handle", "");
  const image = document.createElement("img");
  image.draggable = false;
  const controls = document.createElement("div");
  controls.className = "media-controls";
  function attrs(patch: Record<string, unknown>) {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...current.attrs,
        ...patch,
      }),
    );
  }
  for (const [label, align] of [
    ["Text on right", "left"],
    ["Text on left", "right"],
    ["Full row", "none"],
  ]) {
    const button = document.createElement("button");
    button.textContent = label;
    button.onmousedown = (e) => e.preventDefault();
    button.onclick = () => attrs({ title: "synapse-align:" + align });
    controls.append(button);
  }
  const remove = document.createElement("button");
  remove.textContent = "Delete";
  remove.onclick = () => {
    const pos = getPos();
    if (typeof pos === "number")
      editor.commands.deleteRange({ from: pos, to: pos + current.nodeSize });
  };
  controls.append(remove);
  const float = document.createElement("button");
  float.textContent = "Move freely";
  float.onclick = () => {
    const event = new CustomEvent("synapse:float-image", {
      bubbles: true,
      cancelable: true,
      detail: { src: current.attrs.src, alt: current.attrs.alt },
    });
    dom.dispatchEvent(event);
    if (!event.defaultPrevented) return;
    const pos = getPos();
    if (typeof pos === "number")
      editor.commands.deleteRange({ from: pos, to: pos + current.nodeSize });
  };
  if (
    editor.extensionManager.extensions.find(
      (extension) => extension.name === "image",
    )?.options.HTMLAttributes?.["data-can-float"] === "true"
  )
    controls.append(float);
  const handle = document.createElement("button");
  handle.className = "media-resize";
  handle.ariaLabel = "Resize image";
  let start = 0,
    width = 0;
  handle.onpointerdown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    start = event.clientX;
    width = dom.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
  };
  handle.onpointermove = (event) => {
    if (handle.hasPointerCapture(event.pointerId))
      dom.style.width = Math.max(80, width + event.clientX - start) + "px";
  };
  handle.onpointerup = (event) => {
    if (handle.hasPointerCapture(event.pointerId)) {
      attrs({ width: Math.round(dom.getBoundingClientRect().width) });
      handle.releasePointerCapture(event.pointerId);
    }
  };
  dom.append(image, controls, handle);
  function render() {
    image.src = current.attrs.src;
    image.alt = current.attrs.alt || "Note image";
    dom.style.width = (current.attrs.width || 280) + "px";
    dom.style.cssFloat =
      current.attrs.title?.match(/^synapse-align:(left|right)$/)?.[1] || "none";
  }
  render();
  return {
    dom,
    update(next) {
      if (next.type !== current.type) return false;
      current = next;
      render();
      return true;
    },
    stopEvent(event) {
      return (event.target as HTMLElement).closest("button") !== null;
    },
    ignoreMutation() {
      return true;
    },
  };
};
