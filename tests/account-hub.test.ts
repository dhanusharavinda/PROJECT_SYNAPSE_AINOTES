import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { AccountHub } from "../relay/src/accounts";
let hub: AccountHub, key: any, store: Map<string, any>;
let publicJwk: any;
const clientId = "test.apps.googleusercontent.com";
async function token(
  email = "owner@gmail.com",
  extra: any = {},
  options: any = {},
) {
  return new SignJWT({
    email,
    email_verified: true,
    nonce: "b".repeat(64),
    ...extra,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(options.issuer || "https://accounts.google.com")
    .setAudience(options.audience || clientId)
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(options.exp || "5m")
    .sign(key);
}
const req = (path: string, body?: unknown, session?: string) =>
  new Request("https://example/accounts/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: "Bearer " + session } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
beforeEach(async () => {
  store = new Map();
  if (!key) {
    const pair = await generateKeyPair("RS256");
    key = pair.privateKey;
    publicJwk = await exportJWK(pair.publicKey);
  }
  const jwk = publicJwk;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        keys: [{ ...jwk, kid: "test", alg: "RS256", use: "sig" }],
      }),
    ),
  );
  const ctx = {
    storage: {
      get: async (k: string) => store.get(k),
      put: async (k: string, v: any) => {
        store.set(k, v);
      },
      delete: async (k: string) => store.delete(k),
      list: async ({ prefix = "" }: any = {}) =>
        new Map([...store].filter(([k]) => k.startsWith(prefix))),
      setAlarm: async () => {},
    },
  };
  const env = {
    GOOGLE_CLIENT_ID: clientId,
    ROOMS: {
      idFromName: (x: string) => x,
      get: () => ({
        fetch: async (_u: string, o: any) =>
          o?.headers?.Authorization === "Bearer host-proof"
            ? Response.json({ online: true })
            : new Response(null, { status: 403 }),
      }),
    },
  };
  hub = new AccountHub(ctx as any, env as any);
});
afterEach(() => vi.unstubAllGlobals());
it("verifies Google signatures, issuer, audience, expiry and verified email before minting a session", async () => {
  for (const credential of [
    "forged",
    await token("owner@gmail.com", { email_verified: false }),
    await token("owner@gmail.com", {}, { audience: "other" }),
    await token("owner@gmail.com", {}, { issuer: "https://evil.example" }),
    await token("owner@gmail.com", {}, { exp: 1 }),
  ])
    expect((await hub.fetch(req("login", { credential }))).status).toBe(401);
  const result = (await (
    await hub.fetch(req("login", { credential: await token() }))
  ).json()) as any;
  expect(result.token).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify([...store.keys()])).not.toContain(result.token);
  expect(
    (
      (await (
        await hub.fetch(req("me", undefined, result.token))
      ).json()) as any
    ).email,
  ).toBe("owner@gmail.com");
  await hub.fetch(req("logout", {}, result.token));
  expect((await hub.fetch(req("me", undefined, result.token))).status).toBe(
    401,
  );
});
it("requires both account identity and PC proof to publish a page, and filters invitations by recipient", async () => {
  const owner = (await (
    await hub.fetch(req("login", { credential: await token() }))
  ).json()) as any;
  const page = {
    id: crypto.randomUUID(),
    room: crypto.randomUUID(),
    title: "Shared",
    hostPublic: "key",
    hostToken: "wrong",
    members: [{ email: "reader@gmail.com", role: "viewer" }],
  };
  expect((await hub.fetch(req("publish", page, owner.token))).status).toBe(403);
  expect(
    (
      await hub.fetch(
        req("publish", { ...page, hostToken: "host-proof" }, owner.token),
      )
    ).status,
  ).toBe(200);
  const reader = (await (
    await hub.fetch(
      req("login", { credential: await token("reader@gmail.com") }),
    )
  ).json()) as any;
  expect(
    (
      (await (
        await hub.fetch(req("pages", undefined, reader.token))
      ).json()) as any
    )[0].role,
  ).toBe("viewer");
  const stranger = (await (
    await hub.fetch(
      req("login", { credential: await token("stranger@gmail.com") }),
    )
  ).json()) as any;
  expect(
    await (await hub.fetch(req("pages", undefined, stranger.token))).json(),
  ).toEqual([]);
  expect(
    (
      await hub.fetch(
        req("publish", { ...page, hostToken: "host-proof" }, reader.token),
      )
    ).status,
  ).toBe(403);
});
