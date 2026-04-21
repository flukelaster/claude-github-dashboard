import * as si from "simple-icons";
import type { CSSProperties } from "react";

interface SimpleIcon {
  title: string;
  hex: string;
  path: string;
}

// GitHub Linguist names → simple-icons slug
const LANG_SLUG: Record<string, string> = {
  JavaScript: "javascript",
  TypeScript: "typescript",
  Python: "python",
  Go: "go",
  Rust: "rust",
  Ruby: "ruby",
  PHP: "php",
  Java: "openjdk",
  C: "c",
  "C++": "cplusplus",
  "C#": "dotnet",
  Swift: "swift",
  Kotlin: "kotlin",
  Dart: "dart",
  HTML: "html5",
  CSS: "css",
  SCSS: "sass",
  Sass: "sass",
  Less: "less",
  Stylus: "stylus",
  Shell: "gnubash",
  Bash: "gnubash",
  Zsh: "gnubash",
  Fish: "gnubash",
  PowerShell: "powershell",
  Batchfile: "windowsterminal",
  Markdown: "markdown",
  MDX: "mdx",
  JSON: "json",
  YAML: "yaml",
  TOML: "toml",
  XML: "xml",
  Dockerfile: "docker",
  Vue: "vuedotjs",
  Svelte: "svelte",
  Astro: "astro",
  Elixir: "elixir",
  Erlang: "erlang",
  Haskell: "haskell",
  Clojure: "clojure",
  Scala: "scala",
  Lua: "lua",
  Julia: "julia",
  R: "r",
  Perl: "perl",
  Zig: "zig",
  Nim: "nim",
  Crystal: "crystal",
  OCaml: "ocaml",
  "F#": "fsharp",
  Nix: "nixos",
  Terraform: "terraform",
  HCL: "terraform",
  GraphQL: "graphql",
  Prisma: "prisma",
  Solidity: "solidity",
  Vim: "vim",
  "Emacs Lisp": "gnuemacs",
  Lisp: "gnuemacs",
  CoffeeScript: "coffeescript",
  TeX: "latex",
  LaTeX: "latex",
  MATLAB: "octave",
  Assembly: "assemblyscript",
  WebAssembly: "webassembly",
  TSX: "react",
  JSX: "react",
  "Jupyter Notebook": "jupyter",
  SQL: "postgresql",
  PLpgSQL: "postgresql",
  TSQL: "microsoftsqlserver",
  // Fallbacks for things without good icons keep null → colored dot
};

function slugToKey(slug: string): string {
  // simple-icons v13 exports "si" + PascalCase(slug)
  return "si" + slug.charAt(0).toUpperCase() + slug.slice(1);
}

function getSiIcon(slug: string): SimpleIcon | null {
  const key = slugToKey(slug);
  const record = si as unknown as Record<string, SimpleIcon | undefined>;
  return record[key] ?? null;
}

/** Some simple-icons use near-black hex which disappears in dark theme. Detect and override. */
function adjustColor(hex: string): string {
  const h = hex.toLowerCase().replace("#", "");
  // Count of very dark colors (#000, #111, #222 etc.) — use currentColor to inherit theme
  if (h === "000000" || h === "181717" || h === "1f1f1f" || h === "1b1f24" || h === "2d3748") {
    return "currentColor";
  }
  return `#${h}`;
}

interface Props {
  language: string;
  /** GitHub-provided linguist color (fallback when no simple-icons match) */
  color?: string | null;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export default function LangIcon({
  language,
  color,
  size = 14,
  className,
  style,
}: Props) {
  const slug = LANG_SLUG[language];
  const icon = slug ? getSiIcon(slug) : null;

  if (icon) {
    const fill = adjustColor(icon.hex);
    return (
      <svg
        role="img"
        aria-label={language}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <title>{language}</title>
        <path d={icon.path} fill={fill} />
      </svg>
    );
  }

  // Fallback: colored dot using GitHub's linguist color.
  return (
    <span
      aria-label={language}
      title={language}
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color ?? "var(--color-ink-placeholder)",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
