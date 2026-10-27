import React from "react";
import "@fontsource/geist/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/instrument-serif/400.css";
import { createRoot } from "react-dom/client";
const App = React.lazy(() => import("./App"));
const TabletApp = React.lazy(() => import("./TabletApp"));
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/500.css";
import "@fontsource/inter/400-italic.css";
import "@fontsource/lora/400-italic.css";
import "./styles.css";
import "./notebook.css";
import "./notebook-v3.css";
(window as any).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense fallback={<p role="status">Opening Synapse…</p>}>
      {location.pathname.startsWith("/tablet") ? <TabletApp /> : <App />}
    </React.Suspense>
  </React.StrictMode>,
);
