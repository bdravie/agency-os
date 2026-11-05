"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

// Light is the default; the choice is kept in a cookie so the server can render the right theme with no flash.
export default function ThemeToggle({ initial }: { initial: "light" | "dark" }) {
  const [theme, setTheme] = useState<"light" | "dark">(initial);
  const choose = (t: "light" | "dark") => {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="seg" role="group" aria-label="Colour theme">
      <button type="button" aria-selected={theme === "light"} aria-label="Light theme" onClick={() => choose("light")}><Sun size={15} aria-hidden /> <span className="nav-label">Light</span></button>
      <button type="button" aria-selected={theme === "dark"} aria-label="Dark theme" onClick={() => choose("dark")}><Moon size={15} aria-hidden /> <span className="nav-label">Dark</span></button>
    </div>
  );
}
