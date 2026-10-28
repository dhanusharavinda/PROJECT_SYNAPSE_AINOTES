import { useEffect, useRef, useState } from "react";
import { discoverRelay } from "./relayProtocol";
import BrandMark from "./BrandMark";
export default function SignIn() {
  const target = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    let script: HTMLScriptElement;
    void (async () => {
      const callback = new URLSearchParams(location.search).get("callback"),
        args = new URLSearchParams(location.hash.slice(1)),
        state = args.get("state"),
        nonce = args.get("nonce");
      if (
        !callback ||
        !state ||
        !nonce ||
        !/^[a-f0-9]{64}$/.test(state) ||
        !/^[a-f0-9]{64}$/.test(nonce)
      )
        throw Error("Start sign-in from Accounts in your Synapse app.");
      const endpoint = new URL(callback);
      if (
        endpoint.protocol !== "http:" ||
        !["127.0.0.1", "localhost"].includes(endpoint.hostname) ||
        endpoint.pathname !== "/api/account/complete" ||
        endpoint.search ||
        endpoint.username ||
        endpoint.password
      )
        throw Error("Invalid app callback. Start again in Synapse.");
      const relay = await discoverRelay(),
        response = await fetch(relay + "/accounts/config"),
        config = await response.json();
      if (!response.ok || !config.configured)
        throw Error(
          "Google sign-in is awaiting its one-time account setup. Your local notes still work.",
        );
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onerror = () =>
        setError(
          "Google sign-in could not load. Check your connection and try again.",
        );
      script.onload = () => {
        if (!live) return;
        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id: config.clientId,
          nonce,
          auto_select: false,
          callback: async ({ credential }: { credential: string }) => {
            try {
              const r = await fetch(relay + "/accounts/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential }),
              });
              const session = await r.json();
              if (!r.ok) throw Error(session.error);
              const local = await fetch(endpoint.href, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ state, token: session.token }),
              });
              if (!local.ok)
                throw Error(
                  (await local.json()).error ||
                    "Return to Synapse and start again.",
                );
              if (live) {
                setDone(true);
                history.replaceState(null, "", location.pathname);
              }
            } catch (e) {
              if (live)
                setError(
                  (e as Error).message +
                    " Keep Synapse open and allow this page to connect to your local app if your browser asks.",
                );
            }
          },
        });
        google.accounts.id.renderButton(target.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
        });
      };
      document.head.appendChild(script);
    })().catch((e) => setError(e.message));
    return () => {
      live = false;
      script?.remove();
    };
  }, []);
  return (
    <main className="signin-page">
      <BrandMark />
      <h1>{done ? "You're signed in" : "Sign in to Synapse"}</h1>
      <p>
        {done
          ? "Return to the Synapse app. You can close this tab."
          : "Use your Google account to invite people and open shared pages. Your private notes stay on your computer."}
      </p>
      {!done && <div ref={target} />} {error && <p role="alert">{error}</p>}
    </main>
  );
}
