import { Vault, uid } from "./vault.js";
import type { Note } from "../src/types.js";
export async function seed(v: Vault) {
  if (!v.fresh || (await v.notes(true)).length) return;
  const ids = Array.from({ length: 8 }, uid);
  const defs = [
    [
      "AI engineering",
      "Start here",
      "Build useful systems around AI models, data, evaluation, and product constraints.",
      "AI engineering combines model capabilities with software systems. A working demo still needs evaluation, monitoring, and reliable data.",
      "Start with a small task. Define success, collect examples, build a baseline, and test failure cases.",
    ],
    [
      "Embeddings",
      "Representations",
      "An embedding represents an item as a vector. What counts as similar depends on the model and task.",
      "An embedding model maps inputs to a vector space. Distances can be useful for retrieval, but they do not certify factual correctness.\n\n### Example\nA query and a relevant passage may receive nearby representations.\n\n### Counterexample\nTwo sentences differing only by negation can be close even when their meaning conflicts.",
      "```python\nquery_vector = model.encode(query)\npassage_vectors = model.encode(passages)\n```\n\nUse the same model and compatible preprocessing for queries and indexed passages.",
    ],
    [
      "Vector search",
      "Retrieval",
      "Find items whose vectors are close to a query vector.",
      "Exact search compares against every item. Approximate nearest-neighbor indexes trade recall for speed and memory. Filters and the similarity metric affect results.",
      "Measure recall and latency on representative queries. Rebuild the index when changing embedding models.",
    ],
    [
      "Cosine similarity",
      "Representations",
      "Compare the direction of two nonzero vectors.",
      "cos(a,b) = (a · b) / (||a|| ||b||). For unit vectors, cosine similarity equals the dot product. Zero vectors need explicit handling.",
      "```python\nimport numpy as np\ndef cosine(a, b):\n    denominator = np.linalg.norm(a) * np.linalg.norm(b)\n    return float(np.dot(a,b) / denominator) if denominator else 0.0\n```",
    ],
    [
      "RAG",
      "Applications",
      "Retrieve relevant information before asking a model to answer.",
      "Retrieval-augmented generation combines retrieval with generation. It can supply current or private context, but incorrect retrieval and unsupported answers remain possible.",
      "Question -> retrieve -> rerank -> assemble context -> answer with references -> evaluate.",
    ],
    [
      "Tokenization",
      "Foundations",
      "Split input into pieces the model can process.",
      "Tokens may be words, subwords, bytes, or other units. Token counts depend on the tokenizer and language. A token is not always a word.",
      "Inspect token boundaries and reserve enough context for the answer.",
    ],
    [
      "Evaluating retrieval",
      "Evaluation",
      "Check whether the retrieved items actually help answer your questions.",
      "Evaluate retrieval separately from answer quality. Useful measures include recall@k, precision@k, and ranking quality on labeled examples.",
      "Keep a small set of real interview questions and expected supporting passages. Record failed cases.",
    ],
    [
      "Attention",
      "Foundations",
      "Let a model combine information from different positions based on the current input.",
      "In scaled dot-product attention, weights are formed from softmax(QK^T / sqrt(d_k)), then applied to V. Masks constrain which positions can contribute.",
      "Track tensor shapes and masking carefully. This note uses the neural-network meaning of attention.",
    ],
  ];
  const pending: { id: string; links: Note["links"] }[] = [];
  for (let i = 0; i < defs.length; i++) {
    const [title, group, intuition, technical, implementation] = defs[i];
    const links: Note["links"] =
      i === 0
        ? [
            {
              target: ids[5],
              relation: "related",
              reason: "A foundational concept",
            },
          ]
        : i === 1
          ? [
              {
                target: ids[2],
                relation: "used-in",
                reason: "Represents queries and searchable items",
              },
              {
                target: ids[3],
                relation: "related",
                reason: "A common comparison metric",
              },
            ]
          : i === 2
            ? [
                {
                  target: ids[4],
                  relation: "used-in",
                  reason: "Retrieves supporting passages",
                },
                {
                  target: ids[6],
                  relation: "related",
                  reason: "Search quality needs measurement",
                },
              ]
            : i === 4
              ? [
                  {
                    target: ids[1],
                    relation: "related",
                    reason: "Often uses embedding-based retrieval",
                  },
                ]
              : [];
    pending.push({ id: ids[i], links });
    await v.write({
      id: ids[i],
      title,
      group,
      context: "Machine learning",
      layers: { intuition, technical, implementation },
      links: [],
      sources: [],
      drawings: [],
      status: "collected",
      revision: 0,
      updated: "",
    });
  }
  for (const p of pending) {
    const n = await v.note(p.id);
    await v.write({ ...n, links: p.links }, n.revision);
  }
}
