import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { RoomState } from "@monikers/shared";
import { MAX_SKIPS, roundRule } from "@monikers/shared";
import type { Socket } from "socket.io-client";
import { MonikerCard } from "../components/MonikerCard";

type Props = {
  room: RoomState;
  meId: string;
  isHost: boolean;
  socket: Socket;
};

function useCountdown(endsAt: number | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return left;
}

export function PlayingView({ room, meId, isHost, socket }: Props) {
  const turn = room.turn;
  const isClueGiver = turn?.playerId === meId;
  const clueGiver = room.players.find((p) => p.id === turn?.playerId);
  const seconds = useCountdown(turn?.endsAt ?? null);
  const timedOut = seconds <= 0;
  const [skipOpen, setSkipOpen] = useState(false);

  const drag = useRef({
    active: false,
    startX: 0,
    x: 0,
  });
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  const current = turn?.currentCard;

  const commit = (dir: "got" | "skip") => {
    if (animating) return;
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
    if (!isClueGiver || !current || animating) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { active: true, startX: e.clientX, x: 0 };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current.active) return;
    const x = e.clientX - drag.current.startX;
    drag.current.x = x;
    setOffset(x);
  };

  const onPointerUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const x = drag.current.x;
    if (x > 90) commit("got");
    else if (x < -90) {
      if (room.skipPile.length >= MAX_SKIPS) {
        setOffset(0);
        return;
      }
      commit("skip");
    } else setOffset(0);
  };

  const rotation = offset / 28;
  const overlay =
    offset > 40 ? "rgba(46, 204, 113, 0.2)" : offset < -40 ? "rgba(231, 76, 60, 0.2)" : "transparent";

  return (
    <div className="play-layout">
      <div className="round-banner">
        <strong>Round {room.round}</strong>
        <span>{roundRule(room.round)}</span>
      </div>

      <div className="scores-bar">
        <div className="score-pill">
          <span>Team 1</span>
          {room.scores.team1}
        </div>
        <div className="score-pill">
          <span>Team 2</span>
          {room.scores.team2}
        </div>
      </div>

      <div className={`timer ${seconds <= 10 ? "urgent" : ""}`}>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </div>

      {!isClueGiver && (
        <div className="waiting-turn">
          <p className="hint">Now describing</p>
          <h2>{clueGiver?.name ?? "Player"}&apos;s turn</h2>
          <p className="hint">
            Team {turn?.team} · Skips {room.skipPile.length}/{MAX_SKIPS}
          </p>
          <p className="hint">Listen &amp; guess in person!</p>
        </div>
      )}

      {isClueGiver && (
        <>
          <div className="swipe-hints">
            <span className="left">← Skip</span>
            <span className="right">Got it →</span>
          </div>
          <div className="swipe-stage">
            {current ? (
              <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  transform: `translateX(${offset}px) rotate(${rotation}deg)`,
                  transition: drag.current.active || animating ? "none" : "transform 0.2s ease",
                  background: overlay,
                  borderRadius: 18,
                }}
              >
                <MonikerCard card={current} />
              </div>
            ) : (
              <div className="waiting-turn">
                <h2>No card left</h2>
                <p className="hint">
                  {room.skipPile.length
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
              disabled={!current || room.skipPile.length >= MAX_SKIPS || animating}
              onClick={() => commit("skip")}
            >
              Skip
            </button>
            <button
              type="button"
              className="btn-got"
              disabled={!current || animating}
              onClick={() => commit("got")}
            >
              Got it
            </button>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSkipOpen(true)}
          >
            Skip pile ({room.skipPile.length}/{MAX_SKIPS})
          </button>

          {(timedOut || true) && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => socket.emit("turn:end")}
            >
              {timedOut ? "End turn" : "End turn early"}
            </button>
          )}
        </>
      )}

      {isHost && !isClueGiver && timedOut && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => socket.emit("turn:end")}
        >
          Force end turn
        </button>
      )}

      {skipOpen && isClueGiver && (
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
  return (
    <div className="tally stack">
      <h2>Round {room.round} over!</h2>
      <p className="hint">This round</p>
      <p className="big">
        Team 1: {room.roundScores.team1} · Team 2: {room.roundScores.team2}
      </p>
      <p className="hint">Total</p>
      <p className="big">
        Team 1: {room.scores.team1} · Team 2: {room.scores.team2}
      </p>
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
        Team 1: {room.scores.team1}
        <br />
        Team 2: {room.scores.team2}
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
