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

function Stepper({
  value,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
}: {
  value: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        disabled={decDisabled}
        onClick={onDec}
        aria-label="Decrease"
      >
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button
        type="button"
        className="stepper-btn"
        onClick={onInc}
        disabled={incDisabled}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

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
    <div className="lobby-view stack">
      <section className="lobby-intro">
        <p className="lobby-intro-label">Share this code</p>
        <div className="lobby-code">{room.code}</div>
        <p className="lobby-intro-summary">
          {usingBank ? (
            <>
              Phrase bank deal · {bankNeed} cards
              {uneven
                ? ` · Team 1 ${t1Cards} each, Team 2 ${t2Cards} each`
                : ` · ${n} each`}
            </>
          ) : uneven ? (
            <>
              Custom cards · Team 1 adds {t1Cards} each, Team 2 adds {t2Cards}{" "}
              each
            </>
          ) : (
            <>Custom cards · {n} per player</>
          )}
          {" · "}
          {unlimited ? "Unlimited skips" : `${skips} skips`}
          {" · "}
          {room.turnSeconds}s turns
        </p>
      </section>

      <div className="lobby-teams">
        {[1, 2].map((team) => (
          <div className={`team-col team-${team}`} key={team}>
            <h3>Team {team}</h3>
            {(team === 1 ? t1 : t2).map((p) => (
              <div
                key={p.id}
                className={`player-chip ${p.id === meId ? "me" : ""} ${p.connected ? "" : "offline"}`}
              >
                <span className="player-chip-name">
                  {p.name}
                  {p.id === room.hostId && (
                    <span className="host-badge" title="Host">
                      ★
                    </span>
                  )}
                </span>
                {isHost && (
                  <div className="player-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() =>
                        socket.emit("lobby:swapTeam", { playerId: p.id })
                      }
                    >
                      Swap
                    </button>
                    {p.id !== meId && (
                      <button
                        type="button"
                        className="btn-danger btn-small"
                        onClick={() =>
                          socket.emit("host:removePlayer", { playerId: p.id })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(team === 1 ? t1 : t2).length === 0 && (
              <p className="hint team-empty">Waiting for players…</p>
            )}
          </div>
        ))}
      </div>

      {uneven && (
        <div className="lobby-callout">
          <p className="hint">
            Smaller team writes extra cards so both sides contribute{" "}
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
        </div>
      )}

      {isHost && (
        <>
          <div className="lobby-settings">
            <div className="setting-card setting-wide">
              <h3>Cards</h3>
              <div className="segmented">
                <button
                  type="button"
                  className={usingBank ? "" : "selected"}
                  onClick={() =>
                    socket.emit("lobby:setCardSource", { source: "custom" })
                  }
                >
                  Write your own
                </button>
                <button
                  type="button"
                  className={usingBank ? "selected" : ""}
                  onClick={() =>
                    socket.emit("lobby:setCardSource", { source: "bank" })
                  }
                >
                  Phrase bank
                </button>
              </div>
              {usingBank && (
                <p className={`hint setting-note${bankTooSmall ? " error" : ""}`}>
                  {bankTooSmall
                    ? `Need ${bankNeed} cards, bank only has ${PHRASE_BANK_SIZE}. Lower cards per player.`
                    : `Deals ${bankNeed} unique cards, then skips writing.`}
                </p>
              )}
            </div>

            <div className="lobby-settings-row">
              <div className="setting-card">
                <h3>Cards per player</h3>
                <Stepper
                  value={String(n)}
                  decDisabled={n <= MIN_CARDS_PER_PLAYER}
                  incDisabled={n >= MAX_CARDS_PER_PLAYER}
                  onDec={() => setCount(n - 1)}
                  onInc={() => setCount(n + 1)}
                />
              </div>

              <div className="setting-card">
                <h3>Skips per turn</h3>
                <Stepper
                  value={unlimited ? "∞" : String(skips)}
                  decDisabled={unlimited}
                  incDisabled={!unlimited && skips >= MAX_MAX_SKIPS}
                  onDec={() => setSkips(skips - 1)}
                  onInc={() => setSkips(unlimited ? 1 : skips + 1)}
                />
                <button
                  type="button"
                  className={`setting-toggle${unlimited ? " active" : ""}`}
                  onClick={() => setSkips(unlimited ? 3 : 0)}
                >
                  {unlimited ? "Use a skip limit" : "Unlimited skips"}
                </button>
              </div>

              <div className="setting-card setting-full">
                <h3>Turn timer</h3>
                <Stepper
                  value={`${room.turnSeconds}s`}
                  decDisabled={room.turnSeconds <= MIN_TURN_SECONDS}
                  incDisabled={room.turnSeconds >= MAX_TURN_SECONDS}
                  onDec={() =>
                    socket.emit("lobby:setTurnSeconds", {
                      seconds: room.turnSeconds - 5,
                    })
                  }
                  onInc={() =>
                    socket.emit("lobby:setTurnSeconds", {
                      seconds: room.turnSeconds + 5,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="lobby-actions">
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
        </>
      )}

      {!isHost && (
        <div className="lobby-waiting">
          <p className="lobby-waiting-title">Waiting for host</p>
          <p className="hint">
            {usingBank
              ? "The host will start the game when everyone is ready."
              : "The host will start card select when everyone is ready."}
          </p>
        </div>
      )}
    </div>
  );
}
