import type { GitProvider, ProviderName } from "./types.js";
import { githubProvider } from "./github.js";
import { gitlabProvider } from "./gitlab.js";

const ALL_PROVIDERS: readonly GitProvider[] = [githubProvider, gitlabProvider] as const;

export function getProvider(name: ProviderName): GitProvider {
  const p = ALL_PROVIDERS.find((x) => x.name === name);
  if (!p) throw new Error(`Unknown provider: ${name}`);
  return p;
}

export function isProviderName(v: string): v is ProviderName {
  return ALL_PROVIDERS.some((p) => p.name === v);
}

export function getAllProviders(): readonly GitProvider[] {
  return ALL_PROVIDERS;
}

export async function getActiveProviders(): Promise<GitProvider[]> {
  const active: GitProvider[] = [];
  for (const p of ALL_PROVIDERS) {
    if (await p.hasToken()) active.push(p);
  }
  return active;
}

export type { GitProvider, ProviderName } from "./types.js";
