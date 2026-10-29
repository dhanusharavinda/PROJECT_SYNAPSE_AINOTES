import { it, expect, vi } from "vitest";
import { RelayClient } from "../src/relayClient";
import { identityKeys, seal, aad, sendPackets } from "../src/relayProtocol";
class Socket extends EventTarget {
  readyState = 0;
  bufferedAmount = 0;
  send(_data: string) {}
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
    this.message({ type: "ready" });
  }
  message(data: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}
it("does not let a late close from the old socket reject requests on its replacement", async () => {
  const host = await identityKeys(),
    own = await identityKeys(),
    room = crypto.randomUUID(),
    clientId = crypto.randomUUID(),
    sockets: Socket[] = [];
  const client = new RelayClient(
    {
      url: "https://relay.example",
      room,
      client: clientId,
      relayToken: "synthetic",
      hostPublic: host.publicKey,
      privateKey: own.privateKey,
    },
    () => {
      const s = new Socket();
      sockets.push(s);
      return s as any;
    },
  );
  const first = client.connect();
  sockets[0].open();
  await first;
  sockets[0].readyState = 2;
  const reconnect = client.connect();
  sockets[1].open();
  await reconnect;
  const request = client.request("collab/snapshot", {
    id: crypto.randomUUID(),
  });
  await vi.waitFor(() => expect(client.pending.size).toBe(1));
  const id = client.pending.keys().next().value!;
  sockets[0].close();
  expect(client.pending.size).toBe(1);
  const encrypted = await seal(
    await client.key,
    aad(room, clientId, id, "response"),
    { status: 200, data: { connected: true } },
  );
  await sendPackets(
    {
      readyState: 1,
      bufferedAmount: 0,
      send: (data: string) => sockets[1].message(JSON.parse(data)),
    } as any,
    clientId,
    id,
    host.publicKey,
    encrypted,
  );
  expect((await request).data.connected).toBe(true);
  client.close();
});
