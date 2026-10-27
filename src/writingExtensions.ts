import Paragraph from "@tiptap/extension-paragraph";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
export const AlignedParagraph = Paragraph.extend({
  addAttributes() {
    return {
      textAlign: {
        default: "left",
        parseHTML: (el) => {
          const value = el.getAttribute("data-align") || el.style.textAlign;
          return ["left", "center", "right", "justify"].includes(value)
            ? value
            : "left";
        },
        renderHTML: (attrs) => ({
          style: `text-align:${attrs.textAlign}`,
          "data-align": attrs.textAlign,
        }),
      },
    };
  },
  renderMarkdown(node, helpers) {
    const content = helpers.renderChildren(node.content || []);
    return node.attrs?.textAlign && node.attrs.textAlign !== "left"
      ? `<p data-align="${node.attrs.textAlign}">${content}</p>`
      : content;
  },
});
export const RenumberLists = Extension.create({
  name: "renumberLists",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((t) => t.docChanged)) return;
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type.name === "orderedList" && node.attrs.start !== 1)
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, start: 1 });
          });
          return tr.docChanged ? tr : undefined;
        },
      }),
    ];
  },
});
