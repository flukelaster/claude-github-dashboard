// Keytar wrapper with optional fallback to in-memory (if keytar native binding missing).
// Phase-4 feature — we avoid crashing the app if keytar fails to load.

const SERVICE = "cgd.dashboard";

interface KeychainLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

let impl: KeychainLike | null = null;

async function load(): Promise<KeychainLike> {
  if (impl) return impl;
  try {
    const mod = await import("keytar");
    impl = mod.default ?? (mod as unknown as KeychainLike);
    return impl;
  } catch {
    const store = new Map<string, string>();
    impl = {
      async getPassword(_s, a) {
        return store.get(a) ?? null;
      },
      async setPassword(_s, a, p) {
        store.set(a, p);
      },
      async deletePassword(_s, a) {
        return store.delete(a);
      },
    };
    return impl;
  }
}

export async function getSecret(account: string): Promise<string | null> {
  const k = await load();
  return k.getPassword(SERVICE, account);
}

export async function setSecret(account: string, value: string): Promise<void> {
  const k = await load();
  await k.setPassword(SERVICE, account, value);
}

export async function deleteSecret(account: string): Promise<boolean> {
  const k = await load();
  return k.deletePassword(SERVICE, account);
}
