export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function isNotFound(msg: string): boolean {
  return /Could not resolve to a Repository|Not Found|404|does not exist/i.test(msg);
}
