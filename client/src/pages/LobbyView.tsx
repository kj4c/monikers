import type { RoomState } from "@monikers/shared";
import {
  MAX_CARDS_PER_PLAYER,
  MIN_CARDS_PER_PLAYER,
} from "@monikers/shared";
import type { Socket } from "socket.io-client";

type Props = {
  room: RoomState;
  meId: string;
  isHost: boolean;
  socket: Socket;
};

export function LobbyView({ room, meId, isHost, socket }: Props) {
  const t1 = room.players.filter((p) => p.team === 1);
  const t2 = room.players.filter((p) => p.team === 2);
  const n = room.cardsPerPlayer;

  const setCount = (count: number) => {
    socket.emit("lobby:setCardsPerPlayer", { count });
  };

  return (
    <div className="stack">
      <p className="hint">
        Share code <strong>{room.code}</strong>. Each player will add{" "}
        <strong>{n}</strong> custom cards.
      </p>

      <div className="teams">
        {[1, 2].map((team) => (
          <div className="team-col" key={team}>
            <h3>Team {team}</h3>
            {(team === 1 ? t1 : t2).map((p) => (
              <div
                key={p.id}
                className={`player-chip ${p.id === meId ? "me" : ""} ${p.connected ? "" : "offline"}`}
              >
                <span>
                  {p.name}
                  {p.id === room.hostId ? " ★" : ""}
                </span>
                {isHost && (
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() =>
                      socket.emit("lobby:swapTeam", { playerId: p.id })
                    }
                  >
                    Swap
                  </button>
                )}
              </div>
            ))}
            {(team === 1 ? t1 : t2).length === 0 && (
              <p className="hint">Waiting…</p>
            )}
          </div>
        ))}
      </div>

      {isHost && (
        <div className="stack">
          <div
            className="team-col"
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <h3>Cards per player</h3>
            <div className="row" style={{ justifyContent: "center" }}>
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={n <= MIN_CARDS_PER_PLAYER}
                onClick={() => setCount(n - 1)}
              >
                −
              </button>
              <strong style={{ minWidth: "2rem", textAlign: "center" }}>
                {n}
              </strong>
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={n >= MAX_CARDS_PER_PLAYER}
                onClick={() => setCount(n + 1)}
              >
                +
              </button>
            </div>
            <p className="hint" style={{ margin: 0, textAlign: "center" }}>
              Default 8 · range {MIN_CARDS_PER_PLAYER}–{MAX_CARDS_PER_PLAYER}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => socket.emit("lobby:shuffleTeams")}
          >
            Shuffle teams
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => socket.emit("lobby:startCardSelect")}
          >
            Start card select
          </button>
        </div>
      )}
      {!isHost && (
        <p className="hint">Waiting for host to start card select…</p>
      )}
    </div>
  );
}
