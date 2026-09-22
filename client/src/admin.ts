const ADMIN_KEY = "monikers:adminSecret";

export function getAdminSecret(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_KEY);
  } catch {
    return null;
  }
}

export function setAdminSecret(secret: string | null) {
  try {
    if (secret) sessionStorage.setItem(ADMIN_KEY, secret);
    else sessionStorage.removeItem(ADMIN_KEY);
  } catch {
    /* ignore */
  }
}

export function isAdminUnlocked(): boolean {
  return !!getAdminSecret();
}
