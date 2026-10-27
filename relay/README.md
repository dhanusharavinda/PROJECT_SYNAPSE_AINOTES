# Synapse encrypted device relay

This Cloudflare Worker uses one SQLite-backed Durable Object per PC to route authenticated WebSocket connections. It stores owner/device token hashes, origin restrictions and expiry metadata. Note packets are forwarded in memory and are never written to storage. Observability logging is disabled.

The app encrypts RPC payloads with Web Crypto P-256 ECDH, HKDF-SHA-256 and AES-256-GCM. Room, client, request ID and direction are authenticated additional data. The relay does not receive private keys. Cloudflare still observes network and connection metadata.

Run `npm ci`, `npm run check`, then `npm run dev` in this folder for a local relay on port 4340. For production, sign in using Wrangler with account/user read and Workers deployment permissions, then `npm run deploy`. SQLite Durable Objects work on the Workers Free plan. Free limits are hard limits and service availability is not guaranteed. Keep offline backups.

Set the resulting HTTPS origin in `public/relay-config.json` and deploy the Vercel frontend. The desktop discovers this configuration. Do not publish this folder's .wrangler state or local credentials. Developer-only environment overrides are SYNAPSE_RELAY_URL and SYNAPSE_TABLET_ORIGIN for isolated tests.

QR codes are temporary capabilities. They contain the PC public key and short-lived pairing details, not its private key. Permanent device access is issued inside the encrypted handshake, uses a different relay credential, and is bound to the tablet public key. Revoke devices in Windows Settings. Expired invitations and unauthenticated sockets are cleaned by Durable Object alarms. Registration, message size, connection count and transfer rate are bounded.
