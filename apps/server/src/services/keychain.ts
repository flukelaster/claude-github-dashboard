// Keytar wrapper. On platforms where keytar's native binary is missing or a
// secret-store backend (libsecret on Linux) is unavailable, we fall back to
// in-memory storage so the app still runs — but we expose the backend state
// via getBackend() so the UI can warn that secrets won't persist across
// restarts.

const SERVICE = "cgd.dashboard";

interface KeychainLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export type KeychainBackend = "keytar" | "memory";

let impl: KeychainLike | null = null;
let backend: KeychainBackend = "keytar";

async function load(): Promise<KeychainLike> {
  if (impl) return impl;
  try {
    const mod = await import("keytar");
    impl = mod.default ?? (mod as unknown as KeychainLike);
    backend = "keytar";
    return impl;
  } catch {
    const store = new Map<string, string>();
    backend = "memory";
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

export async function getBackend(): Promise<KeychainBackend> {
  await load();
  return backend;
}
