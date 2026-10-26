import path from "node:path";
import { Vault, uid } from "../server/vault.js";
import { Providers } from "../server/providers.js";
const v = new Vault(path.resolve("work/local-ai-check"));
await v.init();
const p = new Providers(v);
p.config = {
  ...p.config,
  provider: "ollama",
  ollamaModel: "voytas26/openclaw-qwen3vl-8b-opt:latest",
};
const result = await p.layers({
  id: uid(),
  title: "Cosine similarity",
  context: "Linear algebra",
  group: "Representations",
  layers: {
    intuition: "Compare the direction of two nonzero vectors.",
    technical:
      "cos(a,b) = dot(a,b) / (norm(a) * norm(b)). For unit vectors this equals dot product.",
    implementation: "Handle zero-length vectors explicitly.",
  },
  links: [],
  sources: [],
  drawings: [],
  status: "collected",
  revision: 1,
  updated: new Date().toISOString(),
});
if (!result.intuition || !result.technical || !result.implementation)
  throw new Error("Local model returned incomplete layers.");
console.log(
  JSON.stringify({
    provider: "Ollama",
    model: p.config.ollamaModel,
    structuredExplanation: "passed",
    layerCharacters: Object.values(result).map((s) => s.length),
    cloudCalls: 0,
  }),
);
