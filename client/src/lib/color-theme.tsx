import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const COLOR_THEMES = ["blue", "forest", "sunset", "slate"] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

export const COLOR_THEME_LABELS: Record<ColorTheme, string> = {
  blue: "Blue",
  forest: "Forest",
  sunset: "Sunset",
  slate: "Slate",
};

const COLOR_THEME_STORAGE_KEY = "preservarr-color-theme";
const DEFAULT_COLOR_THEME: ColorTheme = "blue";

interface ColorThemeContextValue {
  colorTheme: ColorTheme;
  colorThemes: readonly ColorTheme[];
  setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextValue | null>(null);

export function isColorTheme(value: string | null): value is ColorTheme {
  return value !== null && (COLOR_THEMES as readonly string[]).includes(value);
}

function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.setAttribute("data-color-theme", theme);
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(DEFAULT_COLOR_THEME);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    const initialTheme = isColorTheme(storedTheme) ? storedTheme : DEFAULT_COLOR_THEME;

    setColorThemeState(initialTheme);
    applyColorTheme(initialTheme);
  }, []);

  const setColorTheme = useCallback((theme: ColorTheme) => {
    setColorThemeState(theme);
    applyColorTheme(theme);
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
  }, []);

  const value = useMemo<ColorThemeContextValue>(
    () => ({
      colorTheme,
      colorThemes: COLOR_THEMES,
      setColorTheme,
    }),
    [colorTheme, setColorTheme]
  );

  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>;
}

export function useColorTheme() {
  const context = useContext(ColorThemeContext);
  if (!context) {
    throw new Error("useColorTheme must be used within a ColorThemeProvider");
  }
  return context;
}
