import { randomBytes } from "node:crypto";
import type { Card, Points, RoomState, Team } from "@monikers/shared";
import {
  POINTS_MAX,
  POINTS_MIN,
  ROOM_CODE_LENGTH,
  clampCardsPerPlayer,
} from "@monikers/shared";
import { v4 as uuid } from "uuid";
import {
  allCardsSubmitted,
  allReady,
  canStartCardSelect,
  createEmptyRoom,
  endTurn,
  gotIt,
  nextRound,
  replayGame,
  resetToLobby,
  sanitizeStateForPlayer,
  shuffleTeams,
  skip,
  startGame,
  swapTeam,
  unskip,
} from "./game.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
/** Keep empty (all-away) rooms this long so phones can wake and rejoin */
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;

const rooms = new Map<string, RoomState>();
/** socketId -> { roomCode, playerId } */
const sockets = new Map<string, { roomCode: string; playerId: string }>();
const roomCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

function generateCode(): string {
  let code = "";
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i]! % CODE_CHARS.length];
  }
  if (rooms.has(code)) return generateCode();
  return code;
}

function clearRoomCleanup(code: string) {
  const t = roomCleanupTimers.get(code);
  if (t) clearTimeout(t);
  roomCleanupTimers.delete(code);
}

function scheduleRoomCleanup(code: string) {
  clearRoomCleanup(code);
  roomCleanupTimers.set(
    code,
    setTimeout(() => {
      const room = rooms.get(code);
      if (room && !room.players.some((p) => p.connected)) {
        for (const [sid, b] of sockets) {
          if (b.roomCode === code) sockets.delete(sid);
        }
        rooms.delete(code);
      }
      roomCleanupTimers.delete(code);
    }, ROOM_IDLE_MS)
  );
}

export function getRoom(code: string): RoomState | undefined {
  return rooms.get(code.toUpperCase());
}

export function emitRoomState(
  io: { to: (room: string) => { emit: (e: string, d: unknown) => void } },
  room: RoomState
) {
  for (const player of room.players) {
    const state = sanitizeStateForPlayer(room, player.id);
    io.to(player.id).emit("room:state", state);
  }
}

export function emitToSocket(
  socket: { emit: (e: string, d: unknown) => void },
  room: RoomState,
  playerId: string
) {
  socket.emit("room:state", sanitizeStateForPlayer(room, playerId));
}

function bindSocket(
  socketId: string,
  roomCode: string,
  playerId: string
) {
  // Drop any previous binding for this socket
  sockets.set(socketId, { roomCode, playerId });
  clearRoomCleanup(roomCode);
}

function unbindSocketOnly(socketId: string) {
  sockets.delete(socketId);
}

export function createRoom(
  socketId: string,
  name: string
): { room: RoomState; playerId: string } {
  const code = generateCode();
  const playerId = uuid();
  const room = createEmptyRoom(code, playerId);
  const player = {
    id: playerId,
    name: name.trim().slice(0, 24) || "Player",
    team: 1 as Team,
    ready: false,
    cardsSubmitted: false,
    connected: true,
  };
  room.players.push(player);
  room.submissions[playerId] = [];
  rooms.set(code, room);
  bindSocket(socketId, code, playerId);
  return { room, playerId };
}

function reclaimByName(room: RoomState, name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return room.players.find(
    (p) => !p.connected && p.name.trim().toLowerCase() === n
  );
}

export function joinRoom(
  socketId: string,
  code: string,
  name: string
): { room?: RoomState; playerId?: string; error?: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: "Room not found" };

  const displayName = name.trim().slice(0, 24) || "Player";

  // Already bound as this socket
  const existingBind = sockets.get(socketId);
  if (existingBind?.roomCode === room.code) {
    const p = room.players.find((x) => x.id === existingBind.playerId);
    if (p) {
      p.connected = true;
      return { room, playerId: p.id };
    }
  }

  // Reclaim seat after phone sleep / tab restore (same name, was away)
  const reclaim = reclaimByName(room, displayName);
  if (reclaim) {
    reclaim.connected = true;
    reclaim.name = displayName;
    bindSocket(socketId, room.code, reclaim.id);
    return { room, playerId: reclaim.id };
  }

  if (room.phase !== "lobby" && room.phase !== "cardSelect") {
    return { error: "Game already started — use the same name to rejoin" };
  }

  if (room.players.some((p) => p.id === socketId)) {
    return { room, playerId: socketId };
  }

  const t1 = room.players.filter((p) => p.team === 1).length;
  const t2 = room.players.filter((p) => p.team === 2).length;
  const team: Team = t1 <= t2 ? 1 : 2;
  const playerId = uuid();

  const player = {
    id: playerId,
    name: displayName,
    team,
    ready: false,
    cardsSubmitted: false,
    connected: true,
  };
  room.players.push(player);
  room.submissions[playerId] = [];
  bindSocket(socketId, room.code, playerId);
  return { room, playerId };
}

/** Restore a known player after reconnect / page reopen */
export function rejoinRoom(
  socketId: string,
  code: string,
  playerId: string,
  name: string
): { room?: RoomState; playerId?: string; error?: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: "Room not found" };

  const player = room.players.find((p) => p.id === playerId);
  if (!player) {
    // Fall back to name reclaim / fresh join
    return joinRoom(socketId, code, name);
  }

  const displayName = name.trim().slice(0, 24);
  if (displayName) player.name = displayName;
  player.connected = true;
  bindSocket(socketId, room.code, player.id);
  return { room, playerId: player.id };
}

export function getSocketBinding(socketId: string) {
  return sockets.get(socketId);
}

export function handleDisconnect(socketId: string): RoomState | null {
  const binding = sockets.get(socketId);
  if (!binding) return null;
  const room = rooms.get(binding.roomCode);
  if (!room) {
    unbindSocketOnly(socketId);
    return null;
  }

  const player = room.players.find((p) => p.id === binding.playerId);
  if (player) {
    player.connected = false;
  }

  // Soft disconnect: do NOT end their turn — phone sleep shouldn't skip them.
  // Keep host id stable; if host is away, hand off so others can still advance.
  if (room.hostId === binding.playerId) {
    const nextHost = room.players.find(
      (p) => p.connected && p.id !== binding.playerId
    );
    if (nextHost) room.hostId = nextHost.id;
  }

  unbindSocketOnly(socketId);

  if (!room.players.some((p) => p.connected)) {
    scheduleRoomCleanup(room.code);
  }

  return room;
}

export function requireHost(room: RoomState, playerId: string): string | null {
  if (room.hostId !== playerId) return "Only the host can do that";
  return null;
}

export function requirePlayer(room: RoomState, playerId: string) {
  return room.players.find((p) => p.id === playerId);
}

export function handleShuffleTeams(room: RoomState, playerId: string) {
  const err = requireHost(room, playerId);
  if (err) return { error: err };
  if (room.phase !== "lobby" && room.phase !== "cardSelect") {
    return { error: "Cannot shuffle now" };
  }
  shuffleTeams(room);
  return {};
}

export function handleSwapTeam(
  room: RoomState,
  hostId: string,
  targetPlayerId: string
) {
  const err = requireHost(room, hostId);
  if (err) return { error: err };
  if (room.phase !== "lobby" && room.phase !== "cardSelect") {
    return { error: "Cannot swap now" };
  }
  swapTeam(room, targetPlayerId);
  return {};
}

export function handleSetCardsPerPlayer(
  room: RoomState,
  playerId: string,
  count: number
) {
  const err = requireHost(room, playerId);
  if (err) return { error: err };
  if (room.phase !== "lobby") {
    return { error: "Can only change card count in the lobby" };
  }
  room.cardsPerPlayer = clampCardsPerPlayer(count);
  return {};
}

export function handleStartCardSelect(room: RoomState, playerId: string) {
  const err = requireHost(room, playerId);
  if (err) return { error: err };
  if (room.phase !== "lobby") return { error: "Already past lobby" };
  if (!canStartCardSelect(room)) {
    return { error: "Need at least 2 players, one on each team" };
  }
  room.phase = "cardSelect";
  room.players.forEach((p) => {
    p.ready = false;
    p.cardsSubmitted = false;
    room.submissions[p.id] = room.submissions[p.id] ?? [];
  });
  return {};
}

export function handleAddCard(
  room: RoomState,
  playerId: string,
  data: { text: string; description?: string; points: number }
) {
  if (room.phase !== "cardSelect") return { error: "Not in card select" };
  const player = requirePlayer(room, playerId);
  if (!player) return { error: "Not in room" };

  const cards = room.submissions[playerId] ?? [];
  if (cards.length >= room.cardsPerPlayer) {
    return { error: "You already have enough cards" };
  }

  const text = data.text?.trim() ?? "";
  if (!text) return { error: "Card needs a title" };
  const points = data.points as Points;
  if (
    !Number.isInteger(points) ||
    points < POINTS_MIN ||
    points > POINTS_MAX
  ) {
    return { error: "Points must be 1–4" };
  }

  const card: Card = {
    id: uuid(),
    text: text.slice(0, 80),
    description: (data.description ?? "").trim().slice(0, 280),
    points,
    createdBy: playerId,
  };
  cards.push(card);
  room.submissions[playerId] = cards;

  if (cards.length >= room.cardsPerPlayer) {
    player.cardsSubmitted = true;
  }

  player.ready = false;
  return {};
}

export function handleRemoveCard(
  room: RoomState,
  playerId: string,
  cardId: string
) {
  if (room.phase !== "cardSelect") return { error: "Not in card select" };
  const player = requirePlayer(room, playerId);
  if (!player) return { error: "Not in room" };

  const cards = room.submissions[playerId] ?? [];
  room.submissions[playerId] = cards.filter((c) => c.id !== cardId);
  player.cardsSubmitted =
    room.submissions[playerId].length >= room.cardsPerPlayer;
  player.ready = false;
  return {};
}

export function handleCardsDone(room: RoomState, playerId: string) {
  if (room.phase !== "cardSelect") return { error: "Not in card select" };
  const player = requirePlayer(room, playerId);
  if (!player) return { error: "Not in room" };
  const cards = room.submissions[playerId] ?? [];
  if (cards.length < room.cardsPerPlayer) {
    return {
      error: `Add ${room.cardsPerPlayer - cards.length} more card(s)`,
    };
  }
  player.cardsSubmitted = true;
  return {};
}

export function handleReady(room: RoomState, playerId: string) {
  if (room.phase !== "cardSelect") return { error: "Not in card select" };
  const player = requirePlayer(room, playerId);
  if (!player) return { error: "Not in room" };
  if (!player.cardsSubmitted) {
    return { error: "Finish your cards first" };
  }
  if (!allCardsSubmitted(room)) {
    return { error: "Waiting for everyone to finish cards" };
  }
  player.ready = !player.ready;
  return {};
}

export function handleHostStart(room: RoomState, playerId: string) {
  const err = requireHost(room, playerId);
  if (err) return { error: err };
  if (room.phase !== "cardSelect") return { error: "Not ready to start" };
  if (!allCardsSubmitted(room)) {
    return { error: "Not everyone has submitted cards" };
  }
  if (!allReady(room)) {
    return { error: "Not everyone is ready" };
  }
  startGame(room);
  return {};
}

export function handleGotIt(room: RoomState, playerId: string) {
  if (room.turn?.playerId !== playerId) return { error: "Not your turn" };
  return gotIt(room);
}

export function handleSkip(room: RoomState, playerId: string) {
  if (room.turn?.playerId !== playerId) return { error: "Not your turn" };
  return skip(room);
}

export function handleUnskip(
  room: RoomState,
  playerId: string,
  cardId: string
) {
  if (room.turn?.playerId !== playerId) return { error: "Not your turn" };
  return unskip(room, cardId);
}

export function handleEndTurn(room: RoomState, playerId: string) {
  if (room.turn?.playerId !== playerId && room.hostId !== playerId) {
    return { error: "Not your turn" };
  }
  return endTurn(room);
}

export function handleNextRound(room: RoomState, playerId: string) {
  const err = requireHost(room, playerId);
  if (err) return { error: err };
  return nextRound(room);
}

export function handleReplay(room: RoomState, playerId: string) {
  const err = requireHost(room, playerId);
  if (err) return { error: err };
  return replayGame(room);
}

export function handleNewGame(room: RoomState, playerId: string) {
  const err = requireHost(room, playerId);
  if (err) return { error: err };
  return resetToLobby(room);
}

/** Host ends the session — everyone goes home */
export function handleGoHome(room: RoomState, playerId: string): {
  error?: string;
  ended?: boolean;
  code?: string;
} {
  const err = requireHost(room, playerId);
  if (err) return { error: err };
  if (room.phase !== "gameOver") {
    return { error: "Game is not over" };
  }
  const code = room.code;
  clearRoomCleanup(code);
  for (const [sid, b] of sockets) {
    if (b.roomCode === code) sockets.delete(sid);
  }
  rooms.delete(code);
  return { ended: true, code };
}
