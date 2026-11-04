# Tool wheel in 1.10.1

The wheel preserves the icons supplied by each action. Straight, Curved, Elbow, and Double arrows have distinct symbols and short visible captions. All four create different arrow geometries, and choosing a variant with an arrow selected changes that existing arrow.

The main toolbar also provides a quick Arrow button with a symbol picker, Zoom out, Zoom in and percentage reset. Turn off Tool wheel in Brush settings to replace the wheel with the compact All tools menu. The same available actions remain grouped there, and the pen hold no longer opens the wheel. The preference stays on the current device.

Shapes have their own group. The generic Arrow shortcut and duplicate Write here action were removed. Text editing has one Copy, Cut, and Paste entry per wheel. Clipboard operations, zoom, brush settings, theme, font, layering, headings, and alignment use appropriate icons. Color choices show swatches, and pink and green highlighters show their own colors.

Pen restores its previous color and width after a highlighter. Resize activates and focuses a larger resize handle. Paste works directly from the toolbar wheel even when the canvas has not been focused. Actions that need selected objects, an external command handler, or a capability unavailable in the current workspace are disabled or omitted. AI actions still require the configured provider and their normal review flow.

The wheel stays open during idle time and scrolling. An action, an outside tap, the close button, or Escape dismisses it.

Input recovery ends interrupted pans and retains captured ink when pointer capture is lost, the window loses focus, a fresh primary pen contact starts, or the user changes tools. Escape explicitly cancels the current interaction. Zero-pressure pen-up still commits the completed stroke. Background autosave leaves a held stroke active. Page navigation commits captured input before switching sheets, and Undo removes the completed stroke.

Regression checks cover distinct icons and actual geometry for all four arrows, clipboard dispatch, highlighter restoration, unsupported commands, real resize behavior, lost-capture recovery, interrupted panning, fresh pen contacts, and zero-pressure stroke completion. Physical spacedesk stylus latency remains a device test.
