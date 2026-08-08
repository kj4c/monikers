export const TURN_MS = 60_000;
export const MAX_SKIPS = 3;
export const POINTS_MIN = 1;
export const POINTS_MAX = 4;
export const TARGET_DECK_SIZE = 40;
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
  /** Current card being described (only sent to clue-giver in public state? Server sends full; client hides for others) */
  currentCard: Card | null;
}

export interface ScoredCard {
  card: Card;
  team: Team;
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
  scores: Scores;
  roundScores: Scores;
}

export function cardsPerPlayerForCount(playerCount: number): number {
  if (playerCount <= 0) return 5;
  const n = Math.round(TARGET_DECK_SIZE / playerCount);
  return Math.min(8, Math.max(3, n));
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
