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
  const root = document.documentElement;
  if (root.dataset.theme !== resolved) root.dataset.theme = resolved;
  if (root.style.colorScheme !== resolved) root.style.colorScheme = resolved;
  return resolved;
}

function writePref(next: ThemePref): void {
  if (window.localStorage.getItem(STORAGE_KEY) !== next) {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
}

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

  useEffect(() => {
    setTheme(applyTheme(pref));
  }, [pref]);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => setTheme(applyTheme("system"));
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    writePref(p);
    setPrefState((prev) => (prev === p ? prev : p));
  }, []);

  const toggle = useCallback(() => {
    setPrefState((prev) => {
      const current: Theme = prev === "system" ? resolveSystem() : prev;
      const next: Theme = current === "dark" ? "light" : "dark";
      writePref(next);
      return next;
    });
  }, []);

  return { pref, theme, setPref, toggle };
}
