import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
export type ThemePref = Theme | "system";

const STORAGE_KEY = "cgd.theme";

function resolveSystem(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readPref(): ThemePref {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function applyTheme(pref: ThemePref): Theme {
  const resolved: Theme = pref === "system" ? resolveSystem() : pref;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

/** Init before React paints — avoids FOUC. Call from <script> in index.html or main.tsx pre-render. */
export function initTheme(): void {
  applyTheme(readPref());
}

export function useTheme(): {
  pref: ThemePref;
  theme: Theme;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
} {
  const [pref, setPrefState] = useState<ThemePref>(() => readPref());
  const [theme, setTheme] = useState<Theme>(() => (pref === "system" ? resolveSystem() : pref));

  // Apply whenever pref changes
  useEffect(() => {
    setTheme(applyTheme(pref));
  }, [pref]);

  // React to OS-level change when pref === "system"
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => setTheme(applyTheme("system"));
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    window.localStorage.setItem(STORAGE_KEY, p);
    setPrefState(p);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, next);
    setPrefState(next);
  }, [theme]);

  return { pref, theme, setPref, toggle };
}
