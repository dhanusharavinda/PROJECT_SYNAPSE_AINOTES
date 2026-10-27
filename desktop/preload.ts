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
