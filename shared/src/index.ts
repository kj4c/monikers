export const DEFAULT_TURN_SECONDS = 60;
export const MIN_TURN_SECONDS = 10;
export const MAX_TURN_SECONDS = 180;
export const DEFAULT_MAX_SKIPS = 3;
export const MIN_MAX_SKIPS = 0;
export const MAX_MAX_SKIPS = 10;
export const POINTS_MIN = 1;
export const POINTS_MAX = 4;
export const DEFAULT_CARDS_PER_PLAYER = 8;
export const MIN_CARDS_PER_PLAYER = 1;
export const MAX_CARDS_PER_PLAYER = 20;
export const ROOM_CODE_LENGTH = 5;

export type Phase =
  | "lobby"
  | "cardSelect"
  | "playing"
  | "roundEnd"
  | "gameOver";

export type Team = 1 | 2;

export type Points = 1 | 2 | 3 | 4;

export interface Card {
  id: string;
  text: string;
  description: string;
  points: Points;
  createdBy: string;
}

export interface Player {
  id: string;
  name: string;
  team: Team;
  ready: boolean;
  cardsSubmitted: boolean;
  connected: boolean;
}

export interface Turn {
  playerId: string;
  team: Team;
  endsAt: number;
  timedOut: boolean;
  /** Current card being described (only sent to clue-giver in public state? Server sends full; client hides for others) */
  currentCard: Card | null;
}

export interface ScoredCard {
  card: Card;
  team: Team;
  playerId: string;
}

export interface Scores {
  team1: number;
  team2: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  players: Player[];
  cardsPerPlayer: number;
  /** 0 = unlimited skips this turn */
  maxSkips: number;
  /** Seconds on the turn clock */
  turnSeconds: number;
  /** playerId -> cards being built during cardSelect */
  submissions: Record<string, Card[]>;
  deck: Card[];
  skipPile: Card[];
  scoredThisRound: ScoredCard[];
  /** All cards in play for reshuffling between rounds */
  roundCards: Card[];
  round: 1 | 2 | 3;
  turn: Turn | null;
  /** Last clue-giver, used to continue turn order across rounds */
  lastPlayerId: string | null;
  /** Waiting for this player to tap Start turn */
  pendingPlayerId: string | null;
  /** Flash TIMES UP until the next player starts */
  timesUp: boolean;
  /** Waiting for the first turn of the current round */
  firstTurnPending: boolean;
  /** Global turn counter for strict T1/T2 alternating when team sizes differ */
  turnIndex: number;
  scores: Scores;
  roundScores: Scores;
}

export function clampCardsPerPlayer(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CARDS_PER_PLAYER;
  return Math.min(
    MAX_CARDS_PER_PLAYER,
    Math.max(MIN_CARDS_PER_PLAYER, Math.round(n))
  );
}

export function clampMaxSkips(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MAX_SKIPS;
  return Math.min(MAX_MAX_SKIPS, Math.max(MIN_MAX_SKIPS, Math.round(n)));
}

export function clampTurnSeconds(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TURN_SECONDS;
  return Math.min(MAX_TURN_SECONDS, Math.max(MIN_TURN_SECONDS, Math.round(n)));
}

export function skipLimitReached(skipCount: number, maxSkips: number): boolean {
  if (maxSkips <= 0) return false;
  return skipCount >= maxSkips;
}

/** Smaller team gets larger/smaller so one extra opponent is a modest boost. */
export function teamMultipliers(players: Player[]): Scores {
  const team1 = players.filter((p) => p.team === 1).length;
  const team2 = players.filter((p) => p.team === 2).length;
  if (team1 === 0 || team2 === 0 || team1 === team2) {
    return { team1: 1, team2: 1 };
  }
  if (team1 < team2) {
    return { team1: team2 / team1, team2: 1 };
  }
  return { team1: 1, team2: team1 / team2 };
}

export function formatScore(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatMultiplier(n: number): string {
  if (n === 1) return "";
  const rounded = Math.round(n * 100) / 100;
  return `×${rounded}`;
}

export function skipLabel(skipCount: number, maxSkips: number): string {
  if (maxSkips <= 0) return `${skipCount}/∞`;
  return `${skipCount}/${maxSkips}`;
}

export function roundRule(round: 1 | 2 | 3): string {
  switch (round) {
    case 1:
      return "Use any words except what's written on the card.";
    case 2:
      return "One word only.";
    case 3:
      return "Gestures only — no talking.";
  }
}

export function pointColor(points: Points): string {
  switch (points) {
    case 1:
      return "#7B2D8E";
    case 2:
      return "#2BB8C8";
    case 3:
      return "#3DBB8A";
    case 4:
      return "#E31C23";
  }
}
