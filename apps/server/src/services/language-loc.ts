import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { repos } from "../db/schema.js";

export interface LanguageLocStats {
  reposScanned: number;
  filesScanned: number;
  totalLoc: number;
  durationMs: number;
  errors: string[];
}

// Extension → GitHub Linguist language name. Names must match github-client
// output so the row merges by (repo_id, language) instead of creating a
// duplicate with loc_count but no bytes.
const EXT_TO_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".pyi": "Python",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".swift": "Swift",
  ".m": "Objective-C",
  ".mm": "Objective-C++",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".cxx": "C++",
  ".hpp": "C++",
  ".hh": "C++",
  ".cs": "C#",
  ".php": "PHP",
  ".scala": "Scala",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".fish": "Shell",
  ".ps1": "PowerShell",
  ".psm1": "PowerShell",
  ".sql": "SQL",
  ".r": "R",
  ".lua": "Lua",
  ".pl": "Perl",
  ".html": "HTML",
  ".htm": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sass": "Sass",
  ".less": "Less",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".md": "Markdown",
  ".mdx": "MDX",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".toml": "TOML",
  ".json": "JSON",
  ".xml": "XML",
  ".dart": "Dart",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".hs": "Haskell",
  ".elm": "Elm",
  ".clj": "Clojure",
  ".cljs": "ClojureScript",
  ".zig": "Zig",
  ".nim": "Nim",
  ".jl": "Julia",
  ".tf": "HCL",
  ".hcl": "HCL",
  ".proto": "Protocol Buffer",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".mako": "Mako",
};

const FILENAME_TO_LANG: Record<string, string> = {
  Dockerfile: "Dockerfile",
  Procfile: "Procfile",
  Makefile: "Makefile",
  Rakefile: "Ruby",
  Gemfile: "Ruby",
};

const IGNORE_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  "Gemfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "uv.lock",
  "Pipfile.lock",
]);

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".vite",
  ".cache",
  ".parcel-cache",
  "coverage",
  ".coverage",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  "target",
  "vendor",
  ".pnpm",
  ".yarn",
  ".gradle",
  ".idea",
  ".vscode",
  "bower_components",
  ".svelte-kit",
  ".astro",
  "tmp",
  "temp",
]);

const MAX_FILE_BYTES = 4 * 1024 * 1024;

function detectLanguage(name: string): string | null {
  const byName = FILENAME_TO_LANG[name];
  if (byName) return byName;
  const ext = extname(name).toLowerCase();
  if (!ext) return null;
  return EXT_TO_LANG[ext] ?? null;
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) n++;
  }
  if (content.charCodeAt(content.length - 1) !== 10) n++;
  return n;
}

function walkRepo(
  root: string,
  counters: Map<string, number>,
  onFile: () => void
): void {
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".github") continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (IGNORE_FILES.has(entry.name)) continue;
      const lang = detectLanguage(entry.name);
      if (!lang) continue;
      try {
        const st = statSync(full);
        if (st.size > MAX_FILE_BYTES) continue;
        const content = readFileSync(full, "utf8");
        const lines = countLines(content);
        counters.set(lang, (counters.get(lang) ?? 0) + lines);
        onFile();
      } catch {
        // unreadable, binary decode failure, etc — skip
      }
    }
  }
}

export async function syncLanguageLoc(): Promise<LanguageLocStats> {
  const t0 = Date.now();
  const stats: LanguageLocStats = {
    reposScanned: 0,
    filesScanned: 0,
    totalLoc: 0,
    durationMs: 0,
    errors: [],
  };

  const allRepos = await db.select().from(repos).all();
  for (const r of allRepos) {
    if (r.optedOut) continue;
    let exists = false;
    try {
      exists = statSync(r.localPath).isDirectory();
    } catch {
      continue;
    }
    if (!exists) continue;

    const counters = new Map<string, number>();
    walkRepo(r.localPath, counters, () => {
      stats.filesScanned++;
    });

    stats.reposScanned++;

    if (counters.size === 0) continue;

    for (const [language, loc] of counters) {
      stats.totalLoc += loc;
      db.run(sql`
        INSERT INTO repo_languages (repo_id, language, bytes, loc_count, color)
        VALUES (${r.id}, ${language}, 0, ${loc}, NULL)
        ON CONFLICT(repo_id, language) DO UPDATE SET loc_count = excluded.loc_count
      `);
    }

    // Reset loc for languages no longer found (file deleted etc). Only zero
    // languages that currently have bytes = 0, to avoid clobbering Linguist
    // languages we just don't have file extensions for (e.g. Mako).
    const keys = [...counters.keys()];
    db.run(sql`
      UPDATE repo_languages
      SET loc_count = 0
      WHERE repo_id = ${r.id}
        AND loc_count > 0
        AND language NOT IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})
    `);
  }

  stats.durationMs = Date.now() - t0;
  return stats;
}
