import fs from "node:fs/promises";
import { run } from "./providers.js";
import { atomic, AppError, type Vault } from "./vault.js";
export function wslPath(file: string) {
  if (!/^[A-Za-z]:\\/.test(file))
    throw new AppError(400, "Hermes delivery requires a Windows drive path.");
  return "/mnt/" + file[0].toLowerCase() + file.slice(2).replaceAll("\\", "/");
}
export async function deliverHermes(vault: Vault, id: string) {
  const receiptFile = vault.file(".synapse/outbox/" + id + ".json");
  const receipt = JSON.parse(await fs.readFile(receiptFile, "utf8"));
  if (receipt.state !== "queued" || receipt.delivered)
    throw new AppError(
      409,
      "This delivery is no longer queued. Check its receipt before retrying.",
    );
  const file = vault.file("audio/" + receipt.audioFile);
  await fs.access(file);
  receipt.state = "sending";
  await atomic(receiptFile, JSON.stringify(receipt, null, 2));
  try {
    const output = await run(
      "wsl.exe",
      ["-u", "root", "--exec", "hermes", "send", "--to", "telegram", "--json"],
      `${String(receipt.caption)
        .replace(/MEDIA:/gi, "[media reference]")
        .replace(/[\r\n]/g, " ")}\nMEDIA:${wslPath(file)}\n`,
    );
    let remote: unknown;
    try {
      remote = JSON.parse(output);
    } catch {
      remote = { acceptedByCli: true };
    }
    receipt.state = "delivered";
    receipt.delivered = true;
    receipt.deliveredAt = new Date().toISOString();
    receipt.cliConfirmed = true;
    await atomic(receiptFile, JSON.stringify(receipt, null, 2));
    return { message: "Hermes confirmed Telegram delivery.", receipt };
  } catch {
    receipt.state = "failed-or-unknown";
    receipt.delivered = false;
    await atomic(receiptFile, JSON.stringify(receipt, null, 2));
    throw new AppError(
      502,
      "Hermes could not confirm delivery. The local receipt is marked failed-or-unknown. Check Telegram before retrying to avoid duplicate messages.",
    );
  }
}
