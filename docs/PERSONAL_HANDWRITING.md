# Your handwriting in Synapse

There are two separate features: reading handwritten ink and typing with a handwriting font.

## Read your writing

Open AI notes beneath a sheet, then choose Convert handwriting. Review the text before keeping it. The selected vision model reads the sheet's ink, visible placed text and note title. It should keep the original language and mark uncertain words or formula parts as `[unclear]`. Recognition quality depends on the model and the legibility of the sample. This does not train a model on your writing.

Your original strokes, links, images and their colours remain untouched. A diagram starts as an original sketch. Create tidy diagram proposes separate editable shapes. Check its labels and arrow directions before keeping it. The diagram request uses the sketch description, not unrelated links from the rest of the notebook.

## Type in your own style

Open Brush settings, then My handwriting font. Import a TTF, OTF, WOFF or WOFF2 file made from your handwriting. Turn on the handwriting appearance to use it in typed note text. The same font is available in the Neat handwriting view of AI notes. Use default removes the imported font without changing any note text.

The font is checked by the browser before it is saved. It stays in this application's local browser storage on the current device. It is restored when Synapse opens, works offline after import, and is never uploaded to an AI service. Keep the original font file as a backup. Clearing application or browser storage removes this local font. To use it on another device, import the same file there too. Shared readers use their own font or the fallback. Code blocks and interface labels retain their normal fonts.

A photo of a few sentences cannot supply a complete personal font. First make a font using labelled samples of the characters you need: capitals, lowercase letters, digits, punctuation, and any additional script or mathematical symbols. A font-making tool can turn those glyph samples into TTF or OTF. Synapse imports that result; it does not claim to train a handwriting model or invent missing personal glyphs. Unsupported glyphs use the fallback font.

## Checks

Tests cover font format and size rejection, browser decoding failure, storage failure without replacing the previous font, restoration after reopening, removal, and serialized imports. Handwriting tests verify source preservation, original image and link references, multilingual text, explicit uncertainty, and review-only conversion. Physical recognition quality still needs checking with the writer's actual samples and chosen model.
