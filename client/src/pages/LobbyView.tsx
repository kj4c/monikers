import type { RoomState } from "@monikers/shared";
import {
  formatMultiplier,
  MAX_CARDS_PER_PLAYER,
  MAX_MAX_SKIPS,
  MAX_TURN_SECONDS,
  MIN_CARDS_PER_PLAYER,
  MIN_TURN_SECONDS,
  PHRASE_BANK_SIZE,
  cardsForPlayer,
  teamMultipliers,
  totalCardsNeeded,
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
  const skips = room.maxSkips;
  const unlimited = skips <= 0;
  const usingBank = room.cardSource === "bank";
  const bankNeed = totalCardsNeeded(room.players, n);
  const bankTooSmall = usingBank && bankNeed > PHRASE_BANK_SIZE;
  const previewMult = teamMultipliers(room.players, true);
  const uneven =
    t1.length > 0 && t2.length > 0 && t1.length !== t2.length;
  const boostedTeam = previewMult.team1 > 1 ? 1 : 2;
  const t1Cards = t1[0]
    ? cardsForPlayer(room.players, n, t1[0])
    : n;
  const t2Cards = t2[0]
    ? cardsForPlayer(room.players, n, t2[0])
    : n;

  const setCount = (count: number) => {
    socket.emit("lobby:setCardsPerPlayer", { count });
  };

  const setSkips = (count: number) => {
    socket.emit("lobby:setMaxSkips", { count });
  };

  return (
    <div className="stack">
      <p className="hint">
        Share code <strong>{room.code}</strong>.{" "}
        {usingBank ? (
          <>
            We&apos;ll deal cards from the phrase bank ({PHRASE_BANK_SIZE}{" "}
            phrases)
            {uneven
              ? ` — Team 1 adds ${t1Cards} each, Team 2 adds ${t2Cards} each.`
              : `, ${n} each.`}
          </>
        ) : uneven ? (
          <>
            Team 1 adds <strong>{t1Cards}</strong> cards each, Team 2 adds{" "}
            <strong>{t2Cards}</strong> each so both sides put in the same
            total.
          </>
        ) : (
          <>
            Each player will add <strong>{n}</strong> custom cards.
          </>
        )}{" "}
        Skips: <strong>{unlimited ? "unlimited" : skips}</strong>. Timer:{" "}
        <strong>{room.turnSeconds}s</strong>.
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

      {uneven && (
        <>
          <p className="hint">
            Smaller team writes extra cards so both teams contribute{" "}
            {Math.max(t1.length, t2.length) * n} total.
          </p>
          {isHost && (
            <button
              type="button"
              className={
                room.pointMultiplier ? "btn-primary" : "btn-secondary"
              }
              onClick={() =>
                socket.emit("lobby:setPointMultiplier", {
                  enabled: !room.pointMultiplier,
                })
              }
            >
              {room.pointMultiplier
                ? `Point boost on ${formatMultiplier(
                    previewMult.team1 > 1
                      ? previewMult.team1
                      : previewMult.team2
                  )} for Team ${boostedTeam}`
                : "Enable point multiplier for smaller team"}
            </button>
          )}
          {!isHost && room.pointMultiplier && (
            <p className="hint">
              Point boost on — Team {boostedTeam} scores{" "}
              {formatMultiplier(
                previewMult.team1 > 1 ? previewMult.team1 : previewMult.team2
              )}
              .
            </p>
          )}
        </>
      )}

      {isHost && (
        <div className="stack">
          <div
            className="team-col"
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <h3>Cards</h3>
            <div className="choice-row">
              <button
                type="button"
                className={usingBank ? "btn-secondary" : "btn-secondary selected"}
                onClick={() =>
                  socket.emit("lobby:setCardSource", { source: "custom" })
                }
              >
                Write your own
              </button>
              <button
                type="button"
                className={usingBank ? "btn-secondary selected" : "btn-secondary"}
                onClick={() =>
                  socket.emit("lobby:setCardSource", { source: "bank" })
                }
              >
                Phrase bank
              </button>
            </div>
            {usingBank && (
              <p className="hint" style={{ margin: 0 }}>
                {bankTooSmall
                  ? `Need ${bankNeed} cards, bank only has ${PHRASE_BANK_SIZE}. Lower cards per player.`
                  : `Deals ${bankNeed} unique cards, then skips writing.`}
              </p>
            )}
          </div>
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
          </div>
          <div
            className="team-col"
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <h3>Skips per turn</h3>
            <div className="row" style={{ justifyContent: "center" }}>
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={unlimited}
                onClick={() => setSkips(skips - 1)}
              >
                −
              </button>
              <strong style={{ minWidth: "4.5rem", textAlign: "center" }}>
                {unlimited ? "∞" : skips}
              </strong>
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={!unlimited && skips >= MAX_MAX_SKIPS}
                onClick={() => setSkips(unlimited ? 1 : skips + 1)}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className={
                unlimited ? "btn-primary btn-small" : "btn-secondary btn-small"
              }
              style={{ width: "100%" }}
              onClick={() => setSkips(unlimited ? 3 : 0)}
            >
              {unlimited ? "Use a skip limit" : "Unlimited skips"}
            </button>
          </div>
          <div
            className="team-col"
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <h3>Turn timer</h3>
            <div className="row" style={{ justifyContent: "center" }}>
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={room.turnSeconds <= MIN_TURN_SECONDS}
                onClick={() =>
                  socket.emit("lobby:setTurnSeconds", {
                    seconds: room.turnSeconds - 5,
                  })
                }
              >
                −
              </button>
              <strong style={{ minWidth: "4.5rem", textAlign: "center" }}>
                {room.turnSeconds}s
              </strong>
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={room.turnSeconds >= MAX_TURN_SECONDS}
                onClick={() =>
                  socket.emit("lobby:setTurnSeconds", {
                    seconds: room.turnSeconds + 5,
                  })
                }
              >
                +
              </button>
            </div>
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
            disabled={bankTooSmall}
            onClick={() =>
              socket.emit(
                usingBank ? "lobby:startFromBank" : "lobby:startCardSelect"
              )
            }
          >
            {usingBank ? "Start game" : "Start card select"}
          </button>
        </div>
      )}
      {!isHost && (
        <p className="hint">
          {usingBank
            ? "Waiting for host to start the game…"
            : "Waiting for host to start card select…"}
        </p>
      )}
    </div>
  );
}
