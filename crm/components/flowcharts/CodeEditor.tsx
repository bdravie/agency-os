"use client";

import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { mermaidLanguage } from "./mermaidLanguage";

// All its colours come from the CRM's tokens, so the editor follows light and dark by itself.
const crmTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px", backgroundColor: "transparent", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--accent)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--surface-2) 55%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--accent-soft)" },
  ".cm-selectionMatch": { backgroundColor: "var(--good-soft)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--surface-2)", color: "inherit", outline: "1px solid var(--line-strong)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--surface-2)", border: "none", color: "var(--muted)" },
  ".cm-panels": { backgroundColor: "var(--surface-2)", color: "var(--text)" },
  ".cm-panels input, .cm-panels button": { minHeight: "0", fontSize: "12.5px" },
});

/** Holds its own text once mounted. To replace the text from outside, change the component's `key`. */
export default function CodeEditor({ initial, onChange, onSave }: { initial: string; onChange: (code: string) => void; onSave: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };
  const start = useRef(initial);

  useEffect(() => {
    const view = new EditorView({
      doc: start.current,
      parent: host.current!,
      extensions: [
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => { handlers.current.onSave(); return true; } },
          indentWithTab,
        ]),
        basicSetup,
        mermaidLanguage,
        crmTheme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": "Mermaid code" }),
        EditorView.updateListener.of((u) => { if (u.docChanged) handlers.current.onChange(u.state.doc.toString()); }),
      ],
    });
    return () => view.destroy();
  }, []);

  return <div ref={host} className="fc-editor" />;
}
