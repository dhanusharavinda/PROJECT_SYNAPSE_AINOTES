import { z } from "zod";
export const diagramSchema = z
  .object({
    title: z.string().max(160).optional(),
    type: z.enum(["flowchart", "hierarchy", "concept-map"]).optional(),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).max(30),
          label: z.string().trim().min(1).max(65),
          kind: z
            .enum(["step", "decision", "terminal", "concept"])
            .default("step"),
        }),
      )
      .min(2)
      .max(9),
    edges: z
      .array(
        z.object({
          from: z.string().max(30),
          to: z.string().max(30),
          label: z.string().max(40),
        }),
      )
      .min(1)
      .max(12),
  })
  .superRefine((d, ctx) => {
    const ids = new Set(d.nodes.map((n) => n.id));
    if (
      ids.size !== d.nodes.length ||
      d.edges.some((e) => !ids.has(e.from) || !ids.has(e.to))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Every connection must refer to a unique existing node.",
      });
      return;
    }
    const reached = new Set([d.nodes[0].id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of d.edges)
        if (reached.has(e.from) || reached.has(e.to)) {
          for (const id of [e.from, e.to])
            if (!reached.has(id)) {
              reached.add(id);
              changed = true;
            }
        }
    }
    if (reached.size !== ids.size)
      ctx.addIssue({
        code: "custom",
        message: "Connect each idea to the diagram, or remove unrelated nodes.",
      });
  });
