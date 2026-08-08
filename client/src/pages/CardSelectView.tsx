import { useState } from "react";
import type { Points, RoomState } from "@monikers/shared";
import { pointColor } from "@monikers/shared";
import type { Socket } from "socket.io-client";
import { MonikerCard } from "../components/MonikerCard";

type Props = {
  room: RoomState;
  meId: string;
  isHost: boolean;
  socket: Socket;
};

export function CardSelectView({ room, meId, isHost, socket }: Props) {
  const mine = room.submissions[meId] ?? [];
  const me = room.players.find((p) => p.id === meId);
  const allSubmitted = room.players.every((p) => p.cardsSubmitted);
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState<Points>(1);

  const slots = Array.from({ length: room.cardsPerPlayer }, (_, i) => mine[i] ?? null);

  const addCard = () => {
    if (!text.trim()) return;
    socket.emit("cards:add", { text, description, points });
    setText("");
    setDescription("");
    setPoints(1);
    setComposerOpen(false);
  };

  return (
    <div className="stack">
      <p className="hint">
        Add <strong>{room.cardsPerPlayer}</strong> cards. Title + points (1–4).
      </p>

      <div className="slot-grid">
        {slots.map((card, i) =>
          card ? (
            <button
              type="button"
              key={card.id}
              className="card-slot"
              style={{ borderColor: pointColor(card.points) }}
              onClick={() => socket.emit("cards:remove", { cardId: card.id })}
            >
              <div className="mini-title">{card.text}</div>
              <div
                className="point-badge"
                style={{
                  background: pointColor(card.points),
                  width: 36,
                  height: 36,
                  fontSize: "0.65rem",
                }}
              >
                {card.points}
              </div>
              <span className="hint" style={{ marginTop: 6, fontSize: "0.7rem" }}>
                Tap to remove
              </span>
            </button>
          ) : (
            <button
              type="button"
              key={`empty-${i}`}
              className="card-slot empty"
              onClick={() => setComposerOpen(true)}
              disabled={mine.length >= room.cardsPerPlayer}
            >
              + Add your card
            </button>
          )
        )}
      </div>

      <div className="stack">
        <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Everyone</h3>
        {room.players.map((p) => {
          const count = (room.submissions[p.id] ?? []).length;
          return (
            <div key={p.id} className="player-chip">
              <span>
                {p.name}
                {p.id === meId ? " (you)" : ""}
              </span>
              <span className="hint">
                {count}/{room.cardsPerPlayer}
                {p.cardsSubmitted ? " ✓" : ""}
                {p.ready ? " ready" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {isHost && (
        <div className="teams">
          {[1, 2].map((team) => (
            <div className="team-col" key={team}>
              <h3>Team {team}</h3>
              {room.players
                .filter((p) => p.team === team)
                .map((p) => (
                  <div key={p.id} className="player-chip">
                    <span>{p.name}</span>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() =>
                        socket.emit("lobby:swapTeam", { playerId: p.id })
                      }
                    >
                      Swap
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {me?.cardsSubmitted && allSubmitted && (
        <button
          type="button"
          className={me.ready ? "btn-secondary" : "btn-primary"}
          onClick={() => socket.emit("player:ready")}
        >
          {me.ready ? "Unready" : "Ready"}
        </button>
      )}

      {isHost && allSubmitted && room.players.every((p) => p.ready) && (
        <button
          type="button"
          className="btn-primary"
          onClick={() => socket.emit("host:start")}
        >
          Start game
        </button>
      )}

      {!allSubmitted && me?.cardsSubmitted && (
        <p className="hint">Waiting for others to finish their cards…</p>
      )}

      {composerOpen && (
        <div className="modal-backdrop" onClick={() => setComposerOpen(false)}>
          <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
            <h3>Add your card</h3>
            <input
              placeholder="Title (what to guess)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={80}
              autoFocus
            />
            <textarea
              placeholder="Optional description / hint for you"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              rows={3}
            />
            <p className="hint">Points</p>
            <div className="points-picker">
              {([1, 2, 3, 4] as Points[]).map((p) => (
                <button
                  type="button"
                  key={p}
                  className={points === p ? "selected" : ""}
                  style={{ background: pointColor(p) }}
                  onClick={() => setPoints(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            {text.trim() && (
              <MonikerCard
                card={{ text, description, points }}
              />
            )}
            <button type="button" className="btn-primary" onClick={addCard}>
              Add card
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setComposerOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
