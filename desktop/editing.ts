export interface EditingContents {
  send: (channel: string, command: string) => void;
  undo: () => void;
  redo: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  selectAll: () => void;
}
export interface EditingWindow {
  webContents: EditingContents;
}
export function nativeEdit(contents: EditingContents, command: string) {
  if (command === "undo") contents.undo();
  else if (command === "redo") contents.redo();
  else if (command === "copy") contents.copy();
  else if (command === "cut") contents.cut();
  else if (command === "paste") contents.paste();
  else if (command === "select-all") contents.selectAll();
}
export function dispatchEdit(
  command: string,
  main: EditingWindow | null,
  focused: EditingWindow | null,
) {
  const target = focused || main;
  if (target === main) target?.webContents.send("synapse:edit", command);
  else if (target) nativeEdit(target.webContents, command);
}
