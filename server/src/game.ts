import type { Card, RoomState, Team } from "@monikers/shared";
import {
  DEFAULT_CARDS_PER_PLAYER,
  DEFAULT_MAX_SKIPS,
  DEFAULT_TURN_SECONDS,
  cardsForPlayer,
  skipLimitReached,
  teamMultipliers,
} from "@monikers/shared";

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function emptyScores() {
  return { team1: 0, team2: 0 };
}

export function createEmptyRoom(code: string, hostId: string): RoomState {
  return {
    code,
    hostId,
    phase: "lobby",
    players: [],
    cardsPerPlayer: DEFAULT_CARDS_PER_PLAYER,
    maxSkips: DEFAULT_MAX_SKIPS,
    turnSeconds: DEFAULT_TURN_SECONDS,
    cardSource: "custom",
    pointMultiplier: false,
    submissions: {},
    deck: [],
    skipPile: [],
    scoredThisRound: [],
    roundCards: [],
    round: 1,
    turn: null,
    lastPlayerId: null,
    pendingPlayerId: null,
    timesUp: false,
    firstTurnPending: false,
    turnIndex: 0,
    scores: emptyScores(),
    roundScores: emptyScores(),
  };
}

export function shuffleTeams(room: RoomState) {
  const shuffled = shuffle(room.players);
  shuffled.forEach((p, i) => {
    p.team = (i % 2 === 0 ? 1 : 2) as Team;
  });
  room.players = shuffled;
}

export function swapTeam(room: RoomState, playerId: string) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return;
  player.team = player.team === 1 ? 2 : 1;
}

function teamPlayers(room: RoomState, team: Team) {
  // Keep disconnected players in the roster so phone sleep doesn't drop their seat
  return room.players.filter((p) => p.team === team);
}

/**
 * Strict team alternating: T1, T2, T1, T2, …
 * Each team cycles its own roster independently, so 2 vs 3 becomes
 * A C B D A E B C … instead of dumping leftover teammates in a row.
 */
function playerAtTurnIndex(room: RoomState, index: number): string | null {
  const t1 = teamPlayers(room, 1);
  const t2 = teamPlayers(room, 2);
  if (t1.length === 0 && t2.length === 0) return null;
  if (t1.length === 0) return t2[index % t2.length]!.id;
  if (t2.length === 0) return t1[index % t1.length]!.id;

  const pair = Math.floor(index / 2);
  if (index % 2 === 0) return t1[pair % t1.length]!.id;
  return t2[pair % t2.length]!.id;
}

export function nextPlayerId(
  room: RoomState,
  currentPlayerId: string | null
): string | null {
  if (currentPlayerId == null) {
    room.turnIndex = 0;
    return playerAtTurnIndex(room, 0);
  }
  room.turnIndex += 1;
  return playerAtTurnIndex(room, room.turnIndex);
}

export function startTurn(room: RoomState, playerId: string) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return;

  // Fresh shuffle of remaining cards at the start of every turn
  room.deck = shuffle([...room.deck, ...room.skipPile]);
  room.skipPile = [];

  const currentCard = room.deck.length > 0 ? room.deck[0] : null;
  room.pendingPlayerId = null;
  room.timesUp = false;
  room.firstTurnPending = false;
  room.turn = {
    playerId,
    team: player.team,
    endsAt: Date.now() + room.turnSeconds * 1000,
    timedOut: false,
    currentCard,
  };
}

function turnLocked(room: RoomState): boolean {
  if (!room.turn) return true;
  if (room.turn.timedOut) return true;
  return Date.now() >= room.turn.endsAt;
}

function queueNextTurn(room: RoomState, currentId: string, timesUp: boolean) {
  room.lastPlayerId = currentId;
  if (room.skipPile.length > 0) {
    room.deck = [...room.deck, ...room.skipPile];
    room.skipPile = [];
  }
  room.turn = null;

  if (room.deck.length === 0) {
    room.timesUp = false;
    room.pendingPlayerId = null;
    endRound(room);
    return;
  }

  const next = nextPlayerId(room, currentId);
  room.pendingPlayerId = next;
  room.timesUp = timesUp;
}

export function peekCurrentCard(room: RoomState): Card | null {
  return room.deck[0] ?? null;
}

export function syncCurrentCard(room: RoomState) {
  if (room.turn) {
    room.turn.currentCard = peekCurrentCard(room);
  }
}

export function startGame(room: RoomState) {
  const allCards: Card[] = [];
  for (const p of room.players) {
    const cards = room.submissions[p.id] ?? [];
    allCards.push(...cards);
  }
  room.roundCards = shuffle(allCards);
  room.deck = [...room.roundCards];
  room.skipPile = [];
  room.scoredThisRound = [];
  room.round = 1;
  room.scores = emptyScores();
  room.roundScores = emptyScores();
  room.phase = "playing";
  room.lastPlayerId = null;
  room.turnIndex = 0;
  room.timesUp = false;
  room.firstTurnPending = true;
  room.turn = null;
  room.players.forEach((p) => {
    p.ready = false;
  });

  const first = nextPlayerId(room, null);
  room.pendingPlayerId = first;
}

/** Rematch with the same card pack; keeps players and teams. */
export function replayGame(room: RoomState): { ok: boolean; error?: string } {
  if (room.phase !== "gameOver") {
    return { ok: false, error: "Game is not over" };
  }
  if (room.roundCards.length === 0) {
    return { ok: false, error: "No cards to replay" };
  }

  room.deck = shuffle([...room.roundCards]);
  room.skipPile = [];
  room.scoredThisRound = [];
  room.round = 1;
  room.scores = emptyScores();
  room.roundScores = emptyScores();
  room.phase = "playing";
  room.turn = null;
  room.lastPlayerId = null;
  room.turnIndex = 0;
  room.timesUp = false;
  room.firstTurnPending = true;
  room.players.forEach((p) => {
    p.ready = false;
  });

  const first = nextPlayerId(room, null);
  room.pendingPlayerId = first;
  return { ok: true };
}

/** Back to lobby; keeps players, teams, and settings. Clears cards. */
export function resetToLobby(room: RoomState): { ok: boolean; error?: string } {
  if (room.phase !== "gameOver" && room.phase !== "cardSelect") {
    return { ok: false, error: "Can't return to lobby now" };
  }

  room.phase = "lobby";
  room.deck = [];
  room.skipPile = [];
  room.scoredThisRound = [];
  room.roundCards = [];
  room.round = 1;
  room.scores = emptyScores();
  room.roundScores = emptyScores();
  room.turn = null;
  room.lastPlayerId = null;
  room.pendingPlayerId = null;
  room.timesUp = false;
  room.firstTurnPending = false;
  room.turnIndex = 0;
  room.submissions = {};
  room.players.forEach((p) => {
    p.ready = false;
    p.cardsSubmitted = false;
    room.submissions[p.id] = [];
  });
  return { ok: true };
}

export function gotIt(room: RoomState): { ok: boolean; error?: string } {
  if (room.phase !== "playing" || !room.turn) {
    return { ok: false, error: "Not playing" };
  }
  if (turnLocked(room)) {
    return { ok: false, error: "Time's up" };
  }
  if (room.deck.length === 0) {
    return { ok: false, error: "No cards left" };
  }

  const card = room.deck.shift()!;
  room.scoredThisRound.push({
    card,
    team: room.turn.team,
    playerId: room.turn.playerId,
  });
  const mult = teamMultipliers(room.players, room.pointMultiplier);
  const awarded =
    card.points * (room.turn.team === 1 ? mult.team1 : mult.team2);
  if (room.turn.team === 1) {
    room.scores.team1 += awarded;
    room.roundScores.team1 += awarded;
  } else {
    room.scores.team2 += awarded;
    room.roundScores.team2 += awarded;
  }

  syncCurrentCard(room);

  if (room.deck.length === 0 && room.skipPile.length === 0) {
    endRound(room);
  } else if (room.deck.length === 0 && room.skipPile.length > 0) {
    // Must unskip or end turn — no current card
    syncCurrentCard(room);
  }

  return { ok: true };
}

export function skip(room: RoomState): { ok: boolean; error?: string } {
  if (room.phase !== "playing" || !room.turn) {
    return { ok: false, error: "Not playing" };
  }
  if (turnLocked(room)) {
    return { ok: false, error: "Time's up" };
  }
  if (room.deck.length === 0) {
    return { ok: false, error: "No cards left" };
  }
  if (skipLimitReached(room.skipPile.length, room.maxSkips)) {
    return { ok: false, error: "Skip limit reached" };
  }

  const card = room.deck.shift()!;
  room.skipPile.push(card);
  syncCurrentCard(room);
  return { ok: true };
}

export function unskip(
  room: RoomState,
  cardId: string
): { ok: boolean; error?: string } {
  if (room.phase !== "playing" || !room.turn) {
    return { ok: false, error: "Not playing" };
  }
  if (turnLocked(room)) {
    return { ok: false, error: "Time's up" };
  }
  const idx = room.skipPile.findIndex((c) => c.id === cardId);
  if (idx === -1) {
    return { ok: false, error: "Card not in skip pile" };
  }

  const card = room.skipPile.splice(idx, 1)[0];
  // Current card (if any) goes back to front of deck
  if (room.deck.length > 0) {
    // deck[0] is current — leave it, put unskipped at front
    room.deck.unshift(card);
  } else {
    room.deck.unshift(card);
  }
  syncCurrentCard(room);
  return { ok: true };
}

export function endTurn(room: RoomState): { ok: boolean; error?: string } {
  if (room.phase !== "playing" || !room.turn) {
    return { ok: false, error: "Not playing" };
  }

  queueNextTurn(room, room.turn.playerId, false);
  return { ok: true };
}

export function expireTurn(room: RoomState): { ok: boolean; error?: string } {
  if (room.phase !== "playing" || !room.turn) {
    return { ok: false, error: "Not playing" };
  }
  if (Date.now() + 500 < room.turn.endsAt) {
    return { ok: false, error: "Time remaining" };
  }
  room.turn.timedOut = true;
  queueNextTurn(room, room.turn.playerId, true);
  return { ok: true };
}

export function startPendingTurn(
  room: RoomState,
  playerId: string
): { ok: boolean; error?: string } {
  if (room.phase !== "playing") {
    return { ok: false, error: "Not playing" };
  }
  if (room.turn) {
    return { ok: false, error: "A turn is already in progress" };
  }
  if (!room.pendingPlayerId) {
    return { ok: false, error: "No one is waiting to start" };
  }
  if (room.pendingPlayerId !== playerId) {
    return { ok: false, error: "Not your turn to start" };
  }
  startTurn(room, playerId);
  return { ok: true };
}

export function endRound(room: RoomState) {
  if (room.turn) {
    room.lastPlayerId = room.turn.playerId;
  }
  room.phase = "roundEnd";
  room.turn = null;
  room.skipPile = [];
  room.deck = [];
  room.pendingPlayerId = null;
  room.timesUp = false;
}

export function nextRound(room: RoomState): { ok: boolean; error?: string } {
  if (room.phase !== "roundEnd") {
    return { ok: false, error: "Not at round end" };
  }

  if (room.round >= 3) {
    room.phase = "gameOver";
    return { ok: true };
  }

  room.round = (room.round + 1) as 1 | 2 | 3;
  room.roundScores = emptyScores();
  room.scoredThisRound = [];
  room.deck = shuffle([...room.roundCards]);
  room.skipPile = [];
  room.phase = "playing";
  room.timesUp = false;
  room.firstTurnPending = true;
  room.turn = null;

  const next = nextPlayerId(room, room.lastPlayerId);
  room.pendingPlayerId = next;
  return { ok: true };
}

export function canStartCardSelect(room: RoomState): boolean {
  const t1 = room.players.filter((p) => p.team === 1).length;
  const t2 = room.players.filter((p) => p.team === 2).length;
  return room.players.length >= 2 && t1 >= 1 && t2 >= 1;
}

export function allCardsSubmitted(room: RoomState): boolean {
  return room.players.every((p) => {
    const cards = room.submissions[p.id] ?? [];
    return cards.length >= cardsForPlayer(room.players, room.cardsPerPlayer, p);
  });
}

export function allReady(room: RoomState): boolean {
  return room.players.every((p) => p.ready);
}

/** Public state: hide current card text from non-clue-givers by cloning. */
export function sanitizeStateForPlayer(
  room: RoomState,
  playerId: string
): RoomState {
  const clone: RoomState = structuredClone(room);
  // Don't send other players' in-progress submissions' full details? Actually during cardSelect
  // only own submissions matter for editing; others can see counts.
  if (clone.phase === "cardSelect") {
    for (const pid of Object.keys(clone.submissions)) {
      if (pid !== playerId) {
        // Keep length via placeholder stubs without text
        clone.submissions[pid] = clone.submissions[pid].map((c) => ({
          ...c,
          text: "•••",
          description: "",
        }));
      }
    }
  }

  if (
    clone.phase === "playing" &&
    clone.turn &&
    clone.turn.playerId !== playerId
  ) {
    clone.turn = {
      ...clone.turn,
      currentCard: null,
    };
    // Hide deck contents and skip pile text from non-clue-givers
    clone.deck = clone.deck.map((c) => ({
      ...c,
      text: "•••",
      description: "",
    }));
    clone.skipPile = clone.skipPile.map((c) => ({
      ...c,
      text: "•••",
      description: "",
    }));
  }

  return clone;
}
