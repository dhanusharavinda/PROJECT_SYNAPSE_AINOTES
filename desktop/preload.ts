import { contextBridge, ipcRenderer } from "electron";
import type { UpdateBridge, UpdateState } from "./updates";
const bridge: UpdateBridge = {
  state: () => ipcRenderer.invoke("synapse:updates", "state"),
  check: () => ipcRenderer.invoke("synapse:updates", "check"),
  download: () => ipcRenderer.invoke("synapse:updates", "download"),
  install: () => ipcRenderer.invoke("synapse:updates", "install"),
  subscribe(listener) {
    const handler = (_event: unknown, state: UpdateState) => listener(state);
    ipcRenderer.on("synapse:update-state", handler);
    return () => ipcRenderer.removeListener("synapse:update-state", handler);
  },
};
contextBridge.exposeInMainWorld("synapseUpdates", bridge);
contextBridge.exposeInMainWorld("synapseEditing", {
  readClipboard: () => ipcRenderer.invoke("synapse:clipboard", "read"),
  writeClipboard: (text: string) =>
    ipcRenderer.invoke("synapse:clipboard", "write", text),
  native: (command: string) => ipcRenderer.send("synapse:native-edit", command),
  subscribe(listener: (command: string) => void) {
    const handler = (_event: unknown, command: string) => listener(command);
    ipcRenderer.on("synapse:edit", handler);
    return () => ipcRenderer.removeListener("synapse:edit", handler);
  },
});
