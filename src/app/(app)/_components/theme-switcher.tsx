"use client";

import { useEffect, useState } from "react";

export type ThemeId = "default" | "warm" | "ocean";

const THEMES: { id: ThemeId; label: string; color: string }[] = [
  { id: "warm", label: "Warm", color: "oklch(0.55 0.15 280)" },
  { id: "default", label: "Dark", color: "oklch(0.2 0 0)" },
  { id: "ocean", label: "Ocean", color: "oklch(0.6 0.12 190)" },
];

export function ThemeSwitcher() {
  const [current, setCurrent] = useState<ThemeId>("warm");

  useEffect(() => {
    const saved = localStorage.getItem("atoms-theme") as ThemeId | null;
    if (saved && THEMES.some((t) => t.id === saved)) {
      setCurrent(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      document.documentElement.setAttribute("data-theme", "warm");
    }
  }, []);

  function setTheme(id: ThemeId) {
    setCurrent(id);
    localStorage.setItem("atoms-theme", id);
    document.documentElement.setAttribute("data-theme", id);
  }

  return (
    <div className="flex items-center gap-1">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTheme(t.id)}
          title={t.label}
          className={[
            "h-4 w-4 rounded-full border-2 transition-transform",
            current === t.id
              ? "scale-110 border-foreground"
              : "border-transparent hover:scale-110",
          ].join(" ")}
          style={{ backgroundColor: t.color }}
        />
      ))}
    </div>
  );
}
