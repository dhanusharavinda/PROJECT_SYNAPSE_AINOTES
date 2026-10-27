export const themes = ["light", "dark", "paper", "dotted"] as const;
export type Theme = (typeof themes)[number];
export const nextTheme = (theme: string): Theme =>
  themes[(themes.indexOf(theme as Theme) + 1) % themes.length];
