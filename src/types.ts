export type Layer = "intuition" | "technical" | "implementation";
export type Relation = "related" | "prerequisite" | "used-in" | "contrasts";
export interface CanvasItem {
  id: string;
  kind: "text" | "table" | "image" | "drawing" | "pen" | "arrow" | "rectangle" | "ellipse" | "diamond" | "triangle" | "line";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  src?: string;
  drawingId?: string;
  color?: string;
  points?: [number, number][];
  fitted?: boolean;
  strokeWidth?: number;
}
export interface NoteCanvas {
  items: CanvasItem[];
  height: number;
  width?: number;
}
export interface Note {
  id: string;
  title: string;
  context: string;
  group: string;
  layers: Record<Layer, string>;
  body?: string;
  canvas?: NoteCanvas;
  parentId?: string | null;
  links: {
    target: string;
    relation: Relation;
    reason: string;
    inline?: boolean;
  }[];
  sources: string[];
  drawings: string[];
  status: "collected" | "explained" | "practiced";
  revision: number;
  updated: string;
  noteDate?: string | null;
  etag?: string;
  archived?: boolean;
  reviewEnabled?: boolean;
}
export interface Source {
  archived?: boolean;
  id: string;
  title: string;
  kind: string;
  text: string;
  url?: string;
  file?: string;
  coverage: string;
  created: string;
}
export interface Proposal {
  id: string;
  sourceId?: string;
  noteId: string;
  baseRevision: number;
  baseEtag?: string;
  kind: "append" | "link" | "layers" | "diagram";
  title: string;
  reason: string;
  excerpt: string;
  content: string;
  target?: string;
  layers?: Record<Layer, string>;
  diagram?: {
    title?: string;
    type?: "flowchart" | "hierarchy" | "concept-map";
    nodes: {
      id: string;
      label: string;
      kind?: "step" | "decision" | "terminal" | "concept";
    }[];
    edges: { from: string; to: string; label: string }[];
  };
  state: "pending" | "accepted" | "dismissed";
}
export interface Review {
  id: string;
  noteId: string;
  question: string;
  answer: string;
  rating: "again" | "hard" | "good" | "easy";
  date: string;
  due: string;
  hintUsed?: boolean;
}
export interface Episode {
  id: string;
  title: string;
  noteIds: string[];
  script: string;
  file?: string;
  created: string;
  provider?: string;
}
export interface Share {
  id: string;
  noteId: string;
  role: "viewer" | "commenter" | "suggestion" | "editor";
  label: string;
  created: string;
  revoked: boolean;
}
export interface Comment {
  id: string;
  shareId: string;
  noteId: string;
  author: string;
  text: string;
  suggestion: boolean;
  created: string;
  state: "pending" | "accepted" | "dismissed";
}
export interface Config {
  provider: "none" | "openai" | "ollama";
  model: string;
  ollamaModel: string;
  ollamaUrl: string;
  keySet: boolean;
  telegramSet: boolean;
  chatSet: boolean;
  vaultPath: string;
  lan: boolean;
}
export interface State {
  sources: Source[];
  proposals: Proposal[];
  reviews: Review[];
  episodes: Episode[];
  shares: Share[];
  comments: Comment[];
  positions: Record<string, { x: number; y: number; pinned: boolean }>;
}
export interface Bootstrap extends State {
  notes: Note[];
  config: Config;
}
