import type { Card, RoomState, Team } from "@monikers/shared";
import {
  DEFAULT_CARDS_PER_PLAYER,
  MAX_SKIPS,
  TURN_MS,
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
    submissions: {},
    deck: [],
    skipPile: [],
    scoredThisRound: [],
    roundCards: [],
    round: 1,
    turn: null,
    lastPlayerId: null,
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

/** Build alternating turn order starting from a given team index offset. */
export function getTurnOrder(room: RoomState): string[] {
  const t1 = teamPlayers(room, 1);
  const t2 = teamPlayers(room, 2);
  const order: string[] = [];
  const max = Math.max(t1.length, t2.length);
  for (let i = 0; i < max; i++) {
    if (i < t1.length) order.push(t1[i].id);
    if (i < t2.length) order.push(t2[i].id);
  }
  return order;
}

export function nextPlayerId(
  room: RoomState,
  currentPlayerId: string | null
): string | null {
  const order = getTurnOrder(room);
  if (order.length === 0) return null;
  if (!currentPlayerId) return order[0];
  const idx = order.indexOf(currentPlayerId);
  if (idx === -1) return order[0];
  return order[(idx + 1) % order.length];
}

export function startTurn(room: RoomState, playerId: string) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return;

  const currentCard = room.deck.length > 0 ? room.deck[0] : null;
  room.turn = {
    playerId,
    team: player.team,
    endsAt: Date.now() + TURN_MS,
    currentCard,
  };
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
  room.players.forEach((p) => {
    p.ready = false;
  });

  const first = nextPlayerId(room, null);
  if (first) startTurn(room, first);
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
  room.players.forEach((p) => {
    p.ready = false;
  });

  const first = nextPlayerId(room, null);
  if (first) startTurn(room, first);
  return { ok: true };
}

/** Back to lobby for a fresh card-select; keeps players and teams. */
export function resetToLobby(room: RoomState): { ok: boolean; error?: string } {
  if (room.phase !== "gameOver") {
    return { ok: false, error: "Game is not over" };
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
  if (room.deck.length === 0) {
    return { ok: false, error: "No cards left" };
  }

  const card = room.deck.shift()!;
  room.scoredThisRound.push({ card, team: room.turn.team });
  if (room.turn.team === 1) {
    room.scores.team1 += card.points;
    room.roundScores.team1 += card.points;
  } else {
    room.scores.team2 += card.points;
    room.roundScores.team2 += card.points;
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
  if (room.deck.length === 0) {
    return { ok: false, error: "No cards left" };
  }
  if (room.skipPile.length >= MAX_SKIPS) {
    return { ok: false, error: `Max ${MAX_SKIPS} skips` };
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

  const currentId = room.turn.playerId;
  room.lastPlayerId = currentId;

  // Put skip pile back into deck and shuffle
  if (room.skipPile.length > 0) {
    room.deck = shuffle([...room.deck, ...room.skipPile]);
    room.skipPile = [];
  }

  if (room.deck.length === 0) {
    endRound(room);
    return { ok: true };
  }

  const next = nextPlayerId(room, currentId);
  if (next) startTurn(room, next);
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

  const next = nextPlayerId(room, room.lastPlayerId);
  if (next) startTurn(room, next);
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
    return cards.length >= room.cardsPerPlayer;
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
