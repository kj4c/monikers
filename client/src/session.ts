const NAME_KEY = "monikers:name";
const SESSION_KEY = "monikers:session";

export type RoomSession = {
  playerId: string;
  roomCode: string;
  name: string;
};

export function getStoredName() {
  return localStorage.getItem(NAME_KEY)?.trim() ?? "";
}

export function setStoredName(name: string) {
  localStorage.setItem(NAME_KEY, name.trim());
}

export function getSession(): RoomSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoomSession;
    if (!parsed?.playerId || !parsed?.roomCode || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: RoomSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  setStoredName(session.name);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
