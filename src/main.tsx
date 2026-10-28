import React, { useState, useCallback } from "react";
import Launch, { Ready, ShellBoundary } from "./Launch";
import "@fontsource/geist/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/instrument-serif/400.css";
import { createRoot } from "react-dom/client";
const App = React.lazy(() => import("./App"));
const SignIn = React.lazy(() => import("./SignIn"));
const PublicView = React.lazy(() => import("./PublicView"));
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
document.getElementById("root")?.setAttribute("spellcheck", "false");
function Root() {
  const [ready, setReady] = useState(false);
  const [launched, setLaunched] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onDismiss = useCallback(() => setLaunched(true), []);
  const notebook =
    !location.pathname.startsWith("/view/") &&
    !location.pathname.startsWith("/signin");
  return (
    <>
      {notebook && <Launch ready={ready} onDismiss={onDismiss} />}
      <div style={{ display: "contents" }} ref={element => { if (element) element.inert = notebook && !launched; }} aria-hidden={notebook && !launched ? true : undefined}>
      <React.Suspense fallback={<p role="status">Opening Synapse…</p>}>
        <Ready onReady={onReady}>
          {location.pathname.startsWith("/view/") ? (
            <PublicView />
          ) : location.pathname.startsWith("/signin") ? (
            <SignIn />
          ) : location.pathname.startsWith("/tablet") ? (
            <TabletApp />
          ) : (
            <App />
          )}
        </Ready>
      </React.Suspense>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ShellBoundary><Root /></ShellBoundary>
  </React.StrictMode>,
);
