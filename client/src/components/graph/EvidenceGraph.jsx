import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";

const STANCE_COLOR = { supports: "#2e8b57", contradicts: "#c0392b", inconclusive: "#c98b0b" };
export const TYPE_COLOR = {
  peer_reviewed: "#1f3a5f",
  preprint: "#4c6a90",
  vendor: "#c98b0b",
  blog: "#8a6d3b",
  news: "#5c6670",
  unknown: "#9aa5b1",
};

const style = [
  {
    selector: "node[kind='claim']",
    style: {
      shape: "round-rectangle",
      "background-color": "#1f3a5f",
      color: "#fff",
      label: "data(label)",
      "text-valign": "center",
      "font-size": 11,
      "font-weight": 700,
      width: 56,
      height: 32,
    },
  },
  { selector: "node[kind='claim'][status='contested']", style: { "border-width": 3, "border-color": "#ffd27a" } },
  {
    selector: "node[kind='passage']",
    style: {
      "background-color": (n) => TYPE_COLOR[n.data("sourceType")] ?? TYPE_COLOR.unknown,
      label: "data(label)",
      "font-size": 9,
      color: "#222831",
      "text-valign": "bottom",
      "text-margin-y": 4,
      width: 16,
      height: 16,
    },
  },
  {
    selector: "edge",
    style: { width: 2.5, "curve-style": "bezier", "target-arrow-shape": "none", "line-color": (e) => STANCE_COLOR[e.data("stance")] },
  },
  { selector: "edge[status='ai_suggested']", style: { "line-style": "dashed", opacity: 0.8 } },
  { selector: "edge[status='disputed']", style: { "line-color": "#6c4ab6", width: 3.5 } },
  { selector: ":selected", style: { "overlay-color": "#17806f", "overlay-opacity": 0.15 } },
];

export default function EvidenceGraph({ elements, onSelectClaim, onSelectPassage, onSelectLink, onClear }) {
  const ref = useRef(null);
  const cyRef = useRef(null);
  const handlers = useRef({});
  handlers.current = { onSelectClaim, onSelectPassage, onSelectLink, onClear }; // latest callbacks without re-creating the graph

  useEffect(() => {
    const cy = cytoscape({ container: ref.current, style, elements: [], wheelSensitivity: 0.2 });
    cy.on("tap", "node[kind='claim']", (e) => handlers.current.onSelectClaim?.(e.target.data()));
    cy.on("tap", "node[kind='passage']", (e) => handlers.current.onSelectPassage?.(e.target.data()));
    cy.on("tap", "edge", (e) => handlers.current.onSelectLink?.(e.target.data()));
    cy.on("tap", (e) => e.target === cy && handlers.current.onClear?.());
    cyRef.current = cy;
    return () => cy.destroy();
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    cy.layout({ name: "cose", animate: false, nodeRepulsion: 9000, idealEdgeLength: 90, padding: 30 }).run();
  }, [elements]);

  return <div ref={ref} className="h-full min-h-[480px] w-full rounded-xl border border-line bg-white" role="img" aria-label="Evidence graph" />;
}
