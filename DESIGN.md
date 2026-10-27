---
name: Synapse
description: A sage and ink notebook with a quiet frame and a readable working sheet.
colors:
  sheet-selection: "#86a28e"
  paper-margin: "#d6a7a76b"
  selection-ink: "#173c2e"
  ink: "#24392f"
  muted: "#606e65"
  green: "#245344"
  pale: "#e9f0e8"
  surface: "#fff"
  canvas: "#fafbf8"
  frame: "#f0f3ef"
  line: "#e5e9e1"
  selection: "#e2e9e1"
  violet: "#7360ad"
  variant-ink: "#655078"
  dark-ink: "#e1e9e0"
  dark-muted: "#abb7aa"
  dark-surface: "#202622"
  dark-line: "#3d493e"
  dark-pale: "#303c32"
  dark-green: "#a0c6a5"
  diagram-paper: "#f5f5f5"
  diagram-ink: "#2d3142"
  diagram-muted: "#4f5d75"
  diagram-accent: "#bf4520"
  diagram-rule: "#bfc0c0"
typography:
  small:
    fontSize: "11px"
  body-ui:
    fontSize: "14px"
  metadata:
    fontSize: "13px"
  writing-title:
    fontSize: "32px"
  handwriting:
    fontFamily: "Segoe Print, Bradley Hand, cursive"
    fontSize: "17px"
  font-preview:
    fontSize: "20px"
  page-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  note-title:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-1.6px"
  note-body:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "16px"
    lineHeight: 1.85
  graph-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  control:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.4
  code:
    fontFamily: "Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.7
rounded:
  handle: "4px"
  sheet-tools: "12px"
  inline: "3px"
  badge: "5px"
  content: "6px"
  control: "7px"
  block: "8px"
  panel: "10px"
spacing:
  tight: "4px"
  control: "8px"
  row: "12px"
  paragraph: "16px"
  block: "20px"
  gutter: "24px"
  sheet: "40px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "#fff"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-primary-hover:
    backgroundColor: "#183e31"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "#3b5042"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "#2c4033"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  navigation-active:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  graph-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.content}"
    padding: "12px 14px"
    width: "230px"
    height: "124px"
  graph-card-selected:
    backgroundColor: "#eff5ef"
  variant-group:
    padding: "8px 0 8px 17px"
---

# Design System: Synapse

## Notebook sheet update, 27 October 2026

The user requested glass navigation and a ruled Paper mode. These explicit material choices override the generic flat-surface guidance for navigation and notebook ruling. The sage and ink identity remains. Light and Dark remain available beside Paper. The writing sheet fills the available width when side panels close, and those choices persist.

The note is a working surface with a compact Write, Move, Pen, Arrow, Shape, Text box, and Table toolbar. Content starts small and can be moved, resized, layered, copied, undone, or deleted. New pen marks use tight bounds. Generated diagrams and older drawings can be edited inside the page. Optional explanation labels use an underline and a transparent background. Page details stay behind a disclosure. The separate diagram palette remains unchanged.

The standard reading face stays Lora. Handwritten writing uses the installed Windows Segoe Print face, with local cursive fallbacks, and introduces no font download. Small utility text has an 11px floor. The glass surface uses translucent low-chroma sage with an 18px backdrop blur. Paper uses a warm white sheet, faint 32px blue-gray ruling, and a quiet margin line. On the narrow web companion, placed objects read in document order; the Windows app retains their free positions.

Direction record: Taste's Framed sheet, seed 313269818, with the user-requested glass and paper exceptions. The signature is a learning sheet that combines explanation, annotation, and recall. The principal screen question is: what am I trying to understand, and how can I express it here?

## Overview

**Creative North Star: "A working sheet beside a quiet frame"**

Synapse keeps the user-confirmed sage and ink identity. A pale frame contains navigation and a white sheet carries the work. The interface is compact and restrained, while Lora gives sustained note writing a slower reading rhythm. Inter keeps controls and graph relationships easy to scan.

This records the implemented system in `src/styles.css`, sampled against `Graph.tsx`, `RichEditor.tsx`, `NoteView.tsx`, `editorNodes.tsx`, and `diagramDesign.ts`. It preserves an existing identity rather than proposing a new visual world. The independently chosen Diagram Design editorial treatment belongs to generated diagrams, not the surrounding notebook interface.

**Key Characteristics:**

- Sage selection and deep ink text.
- A white working sheet within a pale frame.
- Inter controls paired with Lora note typography.
- Quiet containers, visible relationships, and contextual editing tools.
- A separate editorial palette for generated diagrams.

## Colors

The palette is muted and botanical, with dark text providing structure and sage indicating selection.

### Primary

- **Deep sage (`green`)** carries light-theme primary actions, links, graph emphasis, and checkbox accents.
- **Pale sage (`pale`, `selection`)** carries local hover and selected navigation surfaces.

### Secondary

- **Muted violet (`violet`, `variant-ink`)** identifies explanation alternatives and selected supporting actions. It is a secondary accent, not a replacement for sage.

### Neutral

- **Working paper (`surface`)** is the note and graph panel surface.
- **Pale frame (`frame`, `canvas`)** separates navigation and the workspace background from the sheet.
- **Ink, secondary ink, and rule (`ink`, `muted`, `line`)** supply text hierarchy and light structural dividers.
- **Dark theme tokens (`dark-*`)** describe the final semantic variable overrides. The canvas and several inherited component colors still have separate literal declarations. Theme conversion is not a simple inversion.

Generated SVG diagrams use the separate `diagram-*` tokens: neutral paper, blue-black ink, slate supporting text, a rust accent, and light rules. Their background remains paper-colored in dark UI previews. Transparent drawing assets retain their transparency.

**The Separate Diagram World Rule.** Use the editorial palette inside generated diagrams; keep sage and ink for notebook chrome.

## Typography

**Display and reading font:** Lora with Georgia and serif fallbacks, for note titles and note prose.

**Interface font:** Inter with the existing system fallback stack. Page titles, graph cards, navigation, and controls use the interface voice.

**Code font:** Consolas with a monospace fallback. Generated diagram nodes use Geist with Inter fallback; edge labels use Geist Mono with a monospace fallback.

The frontmatter records the desktop roles after the stylesheet cascade, not the earlier superseded heading values. Page titles reduce to 24px and note titles to 28px at the phone breakpoint. The final note-body rule retains 16px type across breakpoints, including the wide layout. Paragraphs have 16px separation. Code and table content use their compact supporting styles.

**The Two Reading Speeds Rule.** Keep sustained writing in Lora and task controls and graph relationships in Inter.

## Layout

The desktop shell uses a 232px navigation frame and a flexible workspace. The note workspace can add a 270px connections panel, changing to 230px at 1200px and disappearing at 1000px. On phones, navigation becomes a fixed 252px drawer. The later root declaration fixes the frame token at 232px even though older media rules declare other values.

Working pages use 24px horizontal gutters. Note content is centered with a 940px maximum width and 40px horizontal inset. At 1250px the inset becomes 28px; at 700px it becomes 16px. The graph workspace has a 170px topic outline, a flexible center, and an optional 280px relationship ledger. At 1250px the outline disappears and the ledger becomes 260px.

At 1000px and below, graph exploration uses a readable concept list instead of the flow canvas. Between 701px and 1000px the list and ledger remain adjacent. At 700px and below they stack, and the concept list has a 400px scroll limit. The desktop graph uses viewport height; the phone graph flows with content. A compact 48px navigation handle offsets the sticky editor toolbar where present.

Spacing is a pragmatic set of small control gaps, paragraph spacing, and larger sheet gutters, not a uniform mathematical scale. Preserve the distinct densities of the reading sheet, toolbars, and ledger.

## Elevation & Depth

Normal note and graph surfaces rely on tone, fine rules, and selection fills. Refined graph cards explicitly have no shadow. Floating menus, dialogs, and the mobile navigation drawer use soft shadows to distinguish an overlay from the work beneath it. The sticky editor toolbar carries a nearly imperceptible shadow.

The sidecar records exact overlay shadows and the short state transitions. Reduced-motion styling removes CSS transitions and reduces animations. Graph reframing separately uses a 200ms fit animation in source; the CSS media rule does not govern that JavaScript animation.

**The Quiet Surface Rule.** Keep working surfaces flat; reserve visible elevation for overlays.

## Shapes

Containers have gently rounded corners. Controls use the control radius, embedded media and graph cards use the content radius, larger editor blocks use the block radius, and floating menus and graph workspace frames use the panel radius. One-pixel rules provide most boundaries. Selection strengthens the graph card border rather than adding lift.

Status dots are small circles. Chips are compact rounded rectangles. Generated diagrams use rectangles for normal nodes, diamonds for decisions, and capsule terminals, with orthogonal connectors and gently rounded bends. These diagram shapes belong to the diagram grammar.

## Components

### Buttons

Compact and direct. Primary light-theme buttons use sage with white text. Secondary buttons use a white surface, green-gray text, and a fine border. Hover changes fill and border. Focus-visible uses a 3px sage outline with a 3px offset. Disabled controls reduce opacity and use the unavailable cursor. Icon controls have transparent backgrounds and compact padding; editor toolbar targets are at least 30px square.

### Inputs / Fields

White fields use a fine green-gray border, the control radius, and 13px interface type. Focus changes the border and adds a soft 3px ring. Muted placeholders remain visible. Optional variant labels intentionally remove field chrome while retaining their accessible label.

### Navigation

The pale frame uses 13px navigation buttons and 12px note rows. Selected rows receive a pale sage fill. Rows truncate long note titles. A compact sticky navigation handle provides access when the sidebar is hidden, and the phone layout uses a drawer.

### Chips

Status chips combine a small circular indicator with explicit state text. Collected, explained, and practiced remain visually distinct through text and supporting color. Violet chips are a secondary variant. Their inherited compact styling is evidence of the current app, not a new default for body text.

### Cards / Containers

Graph concept cards carry a group, title, short context, status, and open-note action. Their title and context truncate within a fixed card footprint. Selected cards use a sage outline and pale fill. Dark cards use the final theme overrides, and their label text inherits semantic ink after the review correction.

### Definition alternatives

The first alternative remains visible while a small disclosure exposes the rest. A fine sage left rule groups the writing. Controls and optional labels use muted violet ink; expanded options use dashed dividers. The 12px control size and corrected label colors are the current reviewed values. Alternatives remain part of normal document flow.

### Contextual editing and drawings

The sticky toolbar provides familiar formatting. Contextual menus use the floating panel treatment and scroll when necessary. Inline drawings have a transparent surface, an unobtrusive boundary on hover or selection, and editing controls revealed on hover or keyboard focus. On phones, drawing controls stay visible. Code blocks and editable tables retain their own boundaries, scrolling, and contextual operations.

### Relationship ledger

Connections are sentences separated by fine top rules, with muted supporting reasons and an affordance to follow the relationship. They use the interface font and remain readable beside the graph or below the phone list. This structure documents the current graph surface; it is not a mandatory composition for every screen.

## Do's and Don'ts

### Notebook 1.2 interaction refinement

The sheet keeps one compact row of drawing icons. Text formatting, table operations, stacking, duplication, deletion, and resize actions belong in right-click menus. A selected object shows a small grip; resize handles appear only after choosing Resize. No selection toolbar may add height above the sheet during a gesture. Context menus render at document level so overlapping objects cannot cover them. Paper uses a 32px writing rhythm and measures the active writing font's baseline for the ruling.

All notes uses flat, left-aligned rows: 16px titles, 13px secondary details, a 32px desktop title and 24px narrow title. Search, group, sort, dates, and checkboxes serve organization directly. The single theme button cycles Light, Dark, and Paper. Preserve the existing sage/ink palette and Inter/Lora pairing. Blank notebook space is writable paper, rather than a decorative empty panel.

### Do:

- **Do** preserve the confirmed sage and ink identity and Inter/Lora pairing.
- **Do** use semantic ink, surface, line, and muted variables for theme-aware graph text.
- **Do** preserve a white reading sheet and quiet contextual controls.
- **Do** pair status color with explicit text.
- **Do** keep generated diagram styling separate from application chrome.
- **Do** verify responsive layouts against the final cascade and the rendered surface.

### Don't:

- **Don't** replace the existing identity during ordinary refinement.
- **Don't** turn graph-specific composition into a global layout requirement.
- **Don't** give flat working cards decorative elevation.
- **Don't** use em dashes in interface copy, generated text, or documentation.

Not canonized: inherited small or low-contrast peripheral copy, legacy kicker and eyebrow selectors, hover-only variant removal visibility, and any other craft-floor defects outside the scored graph/editor contrast corrections. Their presence in source is not permission to reuse them. The finish verdict is scoped to the reviewed corrections. The missing Impeccable concept seed and QUALITY BAR card remain disclosed process limitations in `docs/REVIEW.md`; this post-build record does not supply that missing provenance.
