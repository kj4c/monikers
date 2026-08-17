import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Card, RoomState } from "@monikers/shared";
import {
  formatMultiplier,
  formatScore,
  roundRule,
  skipLabel,
  skipLimitReached,
  teamMultipliers,
} from "@monikers/shared";
import type { Socket } from "socket.io-client";
import { MonikerCard } from "../components/MonikerCard";

const KICKOFF_CARD: Card = {
  id: "_kickoff",
  text: "moniker",
  description: "",
  points: 3,
  createdBy: "",
};

type Props = {
  room: RoomState;
  meId: string;
  isHost: boolean;
  socket: Socket;
};

function useCountdown(endsAt: number | null) {
  const [left, setLeft] = useState(() =>
    endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0
  );
  useEffect(() => {
    if (!endsAt) {
      setLeft(0);
      return;
    }
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return left;
}

export function PlayingView({ room, meId, socket }: Props) {
  const turn = room.turn;
  const isClueGiver = turn?.playerId === meId;
  const clueGiver = room.players.find((p) => p.id === turn?.playerId);
  const pending = room.players.find((p) => p.id === room.pendingPlayerId);
  const seconds = useCountdown(turn?.endsAt ?? null);
  const timedOut =
    !!turn && (turn.timedOut || Date.now() >= turn.endsAt || seconds <= 0);
  const locked = timedOut || !!turn?.timedOut || room.timesUp || !turn;
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipAlert, setSkipAlert] = useState(false);
  const timeoutSent = useRef(false);
  const burstSeq = useRef(0);
  const seenScored = useRef(room.scoredThisRound.length);
  const seenSkips = useRef(room.skipPile.length);
  const [bursts, setBursts] = useState<
    { id: number; kind: "got" | "skip"; points?: number; team?: 1 | 2 }[]
  >([]);

  const drag = useRef({
    active: false,
    startX: 0,
    x: 0,
  });
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  const current = turn?.currentCard;
  const waitingToStart = !turn && !!room.pendingPlayerId;
  const isNextUp = room.pendingPlayerId === meId;
  const isRoundKickoff = waitingToStart && !room.timesUp && room.firstTurnPending;
  const showPlayFace = (isClueGiver && !room.timesUp) || isRoundKickoff;
  const faceCard = isRoundKickoff ? KICKOFF_CARD : current;
  const clock = isRoundKickoff ? room.turnSeconds : seconds;
  const mult = teamMultipliers(room.players);

  useEffect(() => {
    timeoutSent.current = false;
  }, [turn?.playerId, turn?.endsAt]);

  useEffect(() => {
    if (!turn || Date.now() < turn.endsAt) return;
    if (timeoutSent.current) return;
    timeoutSent.current = true;
    socket.emit("turn:timeout");
  }, [timedOut, turn, socket]);

  const warnSkipsUsed = () => {
    setSkipAlert(true);
    window.setTimeout(() => setSkipAlert(false), 1800);
  };

  const spawnBurst = (
    kind: "got" | "skip",
    points?: number,
    team?: 1 | 2
  ) => {
    const id = ++burstSeq.current;
    setBursts((xs) => [...xs, { id, kind, points, team }]);
    window.setTimeout(() => {
      setBursts((xs) => xs.filter((x) => x.id !== id));
    }, 1000);
  };

  useEffect(() => {
    const scored = room.scoredThisRound.length;
    const skips = room.skipPile.length;
    if (!isClueGiver && !isRoundKickoff && !room.timesUp) {
      if (scored > seenScored.current) {
        const last = room.scoredThisRound[scored - 1];
        if (last) {
          const awarded =
            last.card.points * (last.team === 1 ? mult.team1 : mult.team2);
          spawnBurst("got", awarded, last.team);
        }
      }
      if (skips > seenSkips.current) {
        spawnBurst("skip");
      }
    }
    seenScored.current = scored;
    seenSkips.current = skips;
  }, [
    room.scoredThisRound,
    room.skipPile.length,
    room.timesUp,
    isClueGiver,
    isRoundKickoff,
    mult.team1,
    mult.team2,
  ]);

  const commit = (dir: "got" | "skip") => {
    if (animating || locked) return;
    if (dir === "skip" && skipLimitReached(room.skipPile.length, room.maxSkips)) {
      warnSkipsUsed();
      return;
    }
    if (dir === "got" && current && turn) {
      const awarded =
        current.points * (turn.team === 1 ? mult.team1 : mult.team2);
      spawnBurst("got", awarded, turn.team);
    } else {
      spawnBurst("skip");
    }
    setAnimating(true);
    setOffset(dir === "got" ? 420 : -420);
    window.setTimeout(() => {
      if (dir === "got") socket.emit("turn:gotIt");
      else socket.emit("turn:skip");
      setOffset(0);
      setAnimating(false);
    }, 180);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!isClueGiver || !current || animating || locked) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { active: true, startX: e.clientX, x: 0 };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current.active || locked) return;
    const x = e.clientX - drag.current.startX;
    drag.current.x = x;
    setOffset(x);
  };

  const onPointerUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (locked) {
      setOffset(0);
      return;
    }
    const x = drag.current.x;
    if (x > 90) commit("got");
    else if (x < -90) {
      if (skipLimitReached(room.skipPile.length, room.maxSkips)) {
        setOffset(0);
        warnSkipsUsed();
        return;
      }
      commit("skip");
    } else setOffset(0);
  };

  const rotation = offset / 28;
  const overlay =
    offset > 40
      ? "rgba(46, 204, 113, 0.2)"
      : offset < -40
        ? "rgba(231, 76, 60, 0.2)"
        : "transparent";

  return (
    <div className={`play-layout${isRoundKickoff ? " kickoff" : ""}`}>
      <div className="play-kickoff-scene">
      <div className="round-banner">
        <strong>Round {room.round}</strong>
        <span>{roundRule(room.round)}</span>
      </div>

      <div className="scores-bar">
        <div
          className={`score-pill${bursts.some((b) => b.kind === "got" && b.team === 1) ? " scored" : ""}`}
        >
          <span>
            Team 1
            {mult.team1 !== 1 ? ` ${formatMultiplier(mult.team1)}` : ""}
          </span>
          {formatScore(room.scores.team1)}
          {bursts
            .filter((b) => b.kind === "got" && b.team === 1)
            .map((b) => (
              <em key={b.id} className="score-pop">
                +{formatScore(b.points ?? 0)}
              </em>
            ))}
        </div>
        <div
          className={`score-pill${bursts.some((b) => b.kind === "got" && b.team === 2) ? " scored" : ""}`}
        >
          <span>
            Team 2
            {mult.team2 !== 1 ? ` ${formatMultiplier(mult.team2)}` : ""}
          </span>
          {formatScore(room.scores.team2)}
          {bursts
            .filter((b) => b.kind === "got" && b.team === 2)
            .map((b) => (
              <em key={b.id} className="score-pop">
                +{formatScore(b.points ?? 0)}
              </em>
            ))}
        </div>
      </div>

      {(turn || isRoundKickoff) && (
        <div className={`timer ${!isRoundKickoff && seconds <= 10 ? "urgent" : ""}`}>
          {Math.floor(clock / 60)}:{String(clock % 60).padStart(2, "0")}
        </div>
      )}

      {room.timesUp && (
        <div className="times-up-flash" aria-live="assertive">
          <div className="times-up-text">TIMES UP!</div>
          <p className="hint">
            {isNextUp
              ? "Your turn — tap start when you're ready."
              : `Waiting for ${pending?.name ?? "the next player"} to start.`}
          </p>
          {isNextUp && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => socket.emit("turn:start")}
            >
              Start my turn
            </button>
          )}
        </div>
      )}

      {waitingToStart && !room.timesUp && !isRoundKickoff && (
        <div className="waiting-turn compact-wait">
          <p className="hint">Up next</p>
          <h2>{pending?.name ?? "Player"}</h2>
          {isNextUp ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => socket.emit("turn:start")}
            >
              Start my turn
            </button>
          ) : (
            <p className="hint">Waiting for them to start…</p>
          )}
        </div>
      )}

      {turn && !isClueGiver && !room.timesUp && (
        <div className="waiting-turn compact-wait">
          <p className="hint">Now describing</p>
          <h2>{clueGiver?.name ?? "Player"}&apos;s turn</h2>
          <p className="hint">
            Team {turn.team} · Skips{" "}
            {skipLabel(room.skipPile.length, room.maxSkips)}
          </p>
          <p className="hint">Listen &amp; guess in person!</p>
        </div>
      )}

      {showPlayFace && (
        <>
          <div className="swipe-hints">
            <span className="left">← Skip</span>
            <span className="right">Got it →</span>
          </div>
          <div className="swipe-stage">
            {skipAlert && (
              <div className="skip-alert">All skips are used up</div>
            )}
            {faceCard && (!locked || isRoundKickoff) ? (
              <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  transform: `translateX(${offset}px) rotate(${rotation}deg)`,
                  transition:
                    drag.current.active || animating
                      ? "none"
                      : "transform 0.2s ease",
                  background: overlay,
                  borderRadius: 18,
                  height: "100%",
                }}
              >
                <MonikerCard className="swipeable" card={faceCard} />
              </div>
            ) : (
              <div className="waiting-turn compact-wait">
                <h2>{locked ? "TIMES UP!" : "No card left"}</h2>
                <p className="hint">
                  {locked
                    ? "No last-minute changes."
                    : room.skipPile.length
                      ? "Unskip a card or end your turn."
                      : "Round finishing…"}
                </p>
              </div>
            )}
          </div>

          <div className="action-row">
            <button
              type="button"
              className="btn-skip"
              disabled={!isRoundKickoff && (!current || animating || locked)}
              onClick={() => commit("skip")}
            >
              Skip
            </button>
            <button
              type="button"
              className="btn-got"
              disabled={!isRoundKickoff && (!current || animating || locked)}
              onClick={() => commit("got")}
            >
              Got it
            </button>
          </div>

          <div className="action-row">
            <button
              type="button"
              className="btn-secondary"
              disabled={!isRoundKickoff && locked}
              onClick={() => setSkipOpen(true)}
            >
              Skips {skipLabel(room.skipPile.length, room.maxSkips)}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!isRoundKickoff && locked}
              onClick={() => socket.emit("turn:end")}
            >
              End my turn
            </button>
          </div>
        </>
      )}
      </div>

      {bursts.length > 0 && (
        <div className="play-fx" aria-hidden>
          {bursts.map((b) => (
            <div key={b.id} className={`play-flash ${b.kind}`} />
          ))}
          {bursts.map((b) => (
            <div key={`shout-${b.id}`} className={`play-shout ${b.kind}`}>
              {b.kind === "got" ? "GOT IT!" : "SKIPPED!"}
            </div>
          ))}
        </div>
      )}

      {isRoundKickoff && (
        <div className="play-kickoff-overlay">
          {isNextUp ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => socket.emit("turn:start")}
            >
              Start my turn
            </button>
          ) : (
            <p className="hint kickoff-wait">
              Waiting for {pending?.name ?? "the next player"} to start…
            </p>
          )}
        </div>
      )}

      {skipOpen && isClueGiver && !locked && (
        <div className="modal-backdrop" onClick={() => setSkipOpen(false)}>
          <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
            <h3>Skip pile</h3>
            {room.skipPile.length === 0 && (
              <p className="hint">No skipped cards</p>
            )}
            <div className="skip-list">
              {room.skipPile.map((c) => (
                <div key={c.id} className="skip-item">
                  <span>{c.text}</span>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => {
                      socket.emit("turn:unskip", { cardId: c.id });
                      setSkipOpen(false);
                    }}
                  >
                    Unskip
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSkipOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RoundEndView({
  room,
  isHost,
  socket,
}: {
  room: RoomState;
  isHost: boolean;
  socket: Socket;
}) {
  const stats = room.players
    .map((p) => {
      const got = room.scoredThisRound.filter((s) => s.playerId === p.id);
      return {
        player: p,
        cards: got.length,
        points: got.reduce((sum, s) => sum + s.card.points, 0),
      };
    })
    .sort((a, b) => b.cards - a.cards || a.player.team - b.player.team);
  const mult = teamMultipliers(room.players);

  return (
    <div className="tally stack">
      <h2>Round {room.round} over</h2>

      <div className="score-block earned">
        <p className="score-kicker">This round we earned</p>
        <div className="score-teams">
          <div>
            <span>
              Team 1
              {mult.team1 !== 1 ? ` ${formatMultiplier(mult.team1)}` : ""}
            </span>
            <strong>+{formatScore(room.roundScores.team1)}</strong>
          </div>
          <div>
            <span>
              Team 2
              {mult.team2 !== 1 ? ` ${formatMultiplier(mult.team2)}` : ""}
            </span>
            <strong>+{formatScore(room.roundScores.team2)}</strong>
          </div>
        </div>
      </div>

      <div className="score-block totals">
        <p className="score-kicker">Game total</p>
        <div className="score-teams">
          <div>
            <span>Team 1</span>
            <strong>{formatScore(room.scores.team1)}</strong>
          </div>
          <div>
            <span>Team 2</span>
            <strong>{formatScore(room.scores.team2)}</strong>
          </div>
        </div>
      </div>

      <div className="stat-block">
        <p className="score-kicker">Cards got this round</p>
        {stats.map(({ player, cards, points }) => (
          <div key={player.id} className="stat-row">
            <span>
              {player.name}
              <em> · Team {player.team}</em>
            </span>
            <strong>
              {cards} {cards === 1 ? "card" : "cards"}
              <span className="stat-pts"> · {points} pts</span>
            </strong>
          </div>
        ))}
      </div>

      {isHost ? (
        <button
          type="button"
          className="btn-primary"
          onClick={() => socket.emit("host:nextRound")}
        >
          {room.round >= 3 ? "See final scores" : `Start round ${room.round + 1}`}
        </button>
      ) : (
        <p className="hint">Waiting for host…</p>
      )}
    </div>
  );
}

export function GameOverView({
  room,
  isHost,
  socket,
}: {
  room: RoomState;
  isHost: boolean;
  socket: Socket;
}) {
  const winner =
    room.scores.team1 === room.scores.team2
      ? "It's a tie!"
      : room.scores.team1 > room.scores.team2
        ? "Team 1 wins!"
        : "Team 2 wins!";

  return (
    <div className="tally stack">
      <h2>Game over</h2>
      <p className="big">{winner}</p>
      <p className="hint">Final scores</p>
      <p className="big">
        Team 1: {formatScore(room.scores.team1)}
        <br />
        Team 2: {formatScore(room.scores.team2)}
      </p>
      {isHost ? (
        <>
          <button
            type="button"
            className="btn-primary"
            onClick={() => socket.emit("host:goHome")}
          >
            Play again
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => socket.emit("host:replay")}
          >
            Rematch (same cards)
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => socket.emit("host:newGame")}
          >
            New cards
          </button>
        </>
      ) : (
        <p className="hint">Waiting for host…</p>
      )}
    </div>
  );
}
