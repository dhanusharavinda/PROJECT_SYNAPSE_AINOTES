import { useMemo } from "react";
import { renderDiagramSvg, type Diagram } from "./diagramDesign";
export default function DiagramPreview({ diagram }: { diagram: Diagram }) {
  const svg = useMemo(() => renderDiagramSvg(diagram), [diagram]);
  return (
    <div
      className="diagram-preview"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
