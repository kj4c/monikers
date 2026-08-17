import { useState, type CSSProperties } from "react";
import type { Card, Points, RoomState } from "@monikers/shared";
import { PHRASE_BANK, pointColor } from "@monikers/shared";
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
  const [editing, setEditing] = useState<Card | null | "new">(null);
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState<Points>(1);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankQuery, setBankQuery] = useState("");

  const usedPhrases = new Set(
    Object.values(room.submissions)
      .flat()
      .map((c) => c.text.toLowerCase())
  );
  const bankOptions = PHRASE_BANK.filter((p) => {
    if (usedPhrases.has(p.text.toLowerCase())) return false;
    const q = bankQuery.trim().toLowerCase();
    return !q || p.text.toLowerCase().includes(q);
  });

  const slots = Array.from(
    { length: room.cardsPerPlayer },
    (_, i) => mine[i] ?? null
  );
  const slotCols =
    room.cardsPerPlayer <= 1 ? 1 : room.cardsPerPlayer === 2 ? 2 : room.cardsPerPlayer <= 6 ? 3 : 4;

  const openNew = () => {
    setConfirmDelete(false);
    setEditing("new");
    setText("");
    setDescription("");
    setPoints(1);
  };

  const openEdit = (card: Card) => {
    setEditing(card);
    setText(card.text);
    setDescription(card.description);
    setPoints(card.points);
  };

  const closeSheet = () => {
    setConfirmDelete(false);
    setEditing(null);
  };

  const saveCard = () => {
    if (!text.trim()) return;
    if (editing && editing !== "new") {
      socket.emit("cards:update", {
        cardId: editing.id,
        text,
        description,
        points,
      });
    } else {
      socket.emit("cards:add", { text, description, points });
    }
    closeSheet();
  };

  const deleteCard = () => {
    if (editing && editing !== "new") {
      socket.emit("cards:remove", { cardId: editing.id });
    }
    closeSheet();
  };

  return (
    <div className="stack fit-screen">
      <div className="fit-screen-scroll">
      <p className="hint">
        Add <strong>{room.cardsPerPlayer}</strong> cards. Tap a card to edit,
        or pick from the phrase bank.
      </p>

      <div className="slot-grid" style={{ "--slot-cols": slotCols } as CSSProperties}>
        {slots.map((card, i) =>
          card ? (
            <button
              type="button"
              key={card.id}
              className="card-slot"
              style={{ borderColor: pointColor(card.points) }}
              onClick={() => openEdit(card)}
            >
              <div className="mini-title">{card.text}</div>
              <div
                className="point-badge"
                style={{
                  background: pointColor(card.points),
                  width: 28,
                  height: 28,
                  fontSize: "0.6rem",
                }}
              >
                {card.points}
              </div>
            </button>
          ) : (
            <button
              type="button"
              key={`empty-${i}`}
              className="card-slot empty"
              onClick={openNew}
              disabled={mine.length >= room.cardsPerPlayer}
            >
              + Add
            </button>
          )
        )}
      </div>

      {mine.length < room.cardsPerPlayer && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setBankOpen(true)}
        >
          Pick from phrase bank
        </button>
      )}

      <div className="player-status-row">
        {room.players.map((p) => {
          const count = (room.submissions[p.id] ?? []).length;
          return (
            <div
              key={p.id}
              className={`player-chip compact ${p.id === meId ? "me" : ""}`}
            >
              <span>
                {p.name}
                {p.id === meId ? " (you)" : ""}
              </span>
              <span className="hint">
                {count}/{room.cardsPerPlayer}
                {p.ready ? " ✓" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {isHost && (
        <div className="teams compact-teams">
          {[1, 2].map((team) => (
            <div className="team-col" key={team}>
              <h3>Team {team}</h3>
              {room.players
                .filter((p) => p.team === team)
                .map((p) => (
                  <div key={p.id} className="player-chip compact">
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

      {me?.cardsSubmitted && (
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

      {isHost && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setConfirmBack(true)}
        >
          Back to lobby
        </button>
      )}
      </div>

      {editing !== null && (
        <div className="modal-backdrop" onClick={closeSheet}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-body">
              <h3>{editing === "new" ? "Add your card" : "Edit card"}</h3>
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
                rows={2}
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
                  className="preview"
                  card={{ text, description, points }}
                />
              )}
            </div>
            <div className="sheet-footer">
              <button type="button" className="btn-primary" onClick={saveCard}>
                {editing === "new" ? "Add card" : "Save"}
              </button>
              {editing !== "new" && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={closeSheet}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {bankOpen && (
        <div className="modal-backdrop" onClick={() => setBankOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-body">
              <h3>Phrase bank</h3>
              <input
                placeholder="Search phrases"
                value={bankQuery}
                onChange={(e) => setBankQuery(e.target.value)}
                autoFocus
              />
              <div className="bank-list">
                {bankOptions.length === 0 && (
                  <p className="hint">No matching phrases left</p>
                )}
                {bankOptions.map((p) => (
                  <button
                    type="button"
                    key={p.text}
                    className="bank-item"
                    onClick={() => {
                      socket.emit("cards:add", {
                        text: p.text,
                        description: "",
                        points: p.points,
                        pack: "bank",
                      });
                      setBankOpen(false);
                      setBankQuery("");
                    }}
                  >
                    <span>{p.text}</span>
                    <span
                      className="point-badge"
                      style={{
                        background: pointColor(p.points),
                        width: 28,
                        height: 28,
                        fontSize: "0.6rem",
                      }}
                    >
                      {p.points}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="sheet-footer">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setBankOpen(false);
                  setBankQuery("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmBack && (
        <div
          className="modal-backdrop centered"
          onClick={() => setConfirmBack(false)}
        >
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Are you sure you want to go back?</h3>
            <p className="hint" style={{ margin: 0 }}>
              Everyone returns to the lobby and all cards are cleared.
            </p>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                setConfirmBack(false);
                socket.emit("host:backToLobby");
              }}
            >
              Yes, go back
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmBack(false)}
            >
              Stay here
            </button>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div
          className="modal-backdrop centered"
          onClick={() => setConfirmDelete(false)}
        >
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete this card?</h3>
            <p className="hint" style={{ margin: 0 }}>
              This can&apos;t be undone.
            </p>
            <button type="button" className="btn-danger" onClick={deleteCard}>
              Yes, delete
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
