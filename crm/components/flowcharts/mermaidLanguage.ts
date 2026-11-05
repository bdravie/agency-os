import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Light syntax colouring for Mermaid in the editor. It only colours text: Mermaid itself decides what is valid.
const KEYWORD = /^(flowchart|graph|subgraph|end|direction|sequenceDiagram|participant|actor|activate|deactivate|autonumber|note|over|loop|alt|else|opt|par|and|rect|critical|break|gantt|title|dateFormat|axisFormat|tickInterval|section|excludes|todayMarker|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|journey|pie|mindmap|timeline|gitGraph|classDef|class|style|linkStyle|click|TB|TD|BT|LR|RL)\b/;
const ARROW = /^(?:<<|[<xo])?(?:--+|==+|-\.+-?|~~~)(?:>>|[>xo)]|\|)?|^->>|^-->>|^->|^-\)|^--\)/;

const mermaidStream = StreamLanguage.define({
  name: "mermaid",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("%%")) { stream.skipToEnd(); return "comment"; }
    if (stream.match(/^"[^"]*"?/)) return "string";
    if (stream.match(ARROW)) return "operator";
    if (stream.match(/^[[\](){}|]/)) return "bracket";
    if (stream.match(KEYWORD)) return "keyword";
    if (stream.match(/^[\w-]+/)) return null;
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "%%" } },
});

const style = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--accent-text)", fontWeight: "600" },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.string, color: "var(--cyan)" },
  { tag: tags.operator, color: "var(--text-2)", fontWeight: "600" },
  { tag: tags.bracket, color: "var(--muted)" },
]);

export const mermaidLanguage = [mermaidStream, syntaxHighlighting(style)];
