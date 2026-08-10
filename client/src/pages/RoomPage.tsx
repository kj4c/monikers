import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { getStoredName, useSocket } from "../socket";
import { getSession } from "../session";
import { LobbyView } from "./LobbyView";
import { CardSelectView } from "./CardSelectView";
import {
  GameOverView,
  PlayingView,
  RoundEndView,
} from "./PlayingView";

export function RoomPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const {
    socket,
    playerId,
    room,
    error,
    clearError,
    clearRoom,
    joinRoom,
    rejoinSession,
  } = useSocket();
  const name = getStoredName();
  const roomCode = (code ?? "").toUpperCase();
  const joining = useRef(false);
  const left = useRef(false);

  const goHome = () => {
    left.current = true;
    joining.current = true;
    socket.emit("room:leave");
    clearRoom();
    navigate("/", { replace: true });
  };

  useEffect(() => {
    const onEnded = () => {
      navigate("/", { replace: true });
    };
    window.addEventListener("monikers:ended", onEnded);
    return () => window.removeEventListener("monikers:ended", onEnded);
  }, [navigate]);

  useEffect(() => {
    if (left.current) return;
    if (!name || !roomCode) return;
    if (room?.code === roomCode && playerId) return;
    if (joining.current) return;

    const session = getSession();
    joining.current = true;

    const enter = async () => {
      try {
        if (session?.roomCode === roomCode && session.playerId) {
          const ok = await rejoinSession();
          if (!ok && !left.current) {
            // Session stale — fall back to name join (server reclaims same-name seat)
            await joinRoom(roomCode, name);
          }
        } else {
          await joinRoom(roomCode, name);
        }
      } catch {
        /* room:error shown via socket */
      } finally {
        joining.current = false;
      }
    };

    void enter();
  }, [room, roomCode, name, playerId, joinRoom, rejoinSession]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => clearError(), 4000);
    return () => window.clearTimeout(t);
  }, [error, clearError]);

  if (!name) {
    return (
      <Navigate
        to="/"
        replace
        state={{
          needName: true,
          joinCode: roomCode,
          message: "Please enter your name before joining a room.",
        }}
      />
    );
  }

  // Already in this room — keep UI mounted (avoid flash of "Connecting…")
  const inRoom = room?.code === roomCode && !!playerId;

  if (!inRoom) {
    return (
      <div className="app-shell">
        <header className="room-header">
          <div className="room-header-left">
            <button type="button" className="btn-back" onClick={goHome}>
              ← Back
            </button>
            <div className="room-code">{roomCode}</div>
          </div>
        </header>
        <div className="room-body stack">
          <p className="hint">Connecting to room {roomCode}…</p>
        </div>
      </div>
    );
  }

  const isHost = room.hostId === playerId;
  const phaseLabel =
    room.phase === "lobby"
      ? "Lobby"
      : room.phase === "cardSelect"
        ? "Cards"
        : room.phase === "playing"
          ? `Round ${room.round}`
          : room.phase === "roundEnd"
            ? "Round end"
            : "Finished";

  return (
    <div className="app-shell">
      <header className="room-header">
        <div className="room-header-left">
          <button type="button" className="btn-back" onClick={goHome}>
            ← Back
          </button>
          <div className="room-code">{room.code}</div>
        </div>
        <div className="room-meta">
          {phaseLabel}
          <br />
          {isHost ? "Host" : "Player"}
        </div>
      </header>
      <main className="room-body">
        {error && <div className="error-banner">{error}</div>}
        {room.phase === "lobby" && (
          <LobbyView
            room={room}
            meId={playerId}
            isHost={isHost}
            socket={socket}
          />
        )}
        {room.phase === "cardSelect" && (
          <CardSelectView
            room={room}
            meId={playerId}
            isHost={isHost}
            socket={socket}
          />
        )}
        {room.phase === "playing" && (
          <PlayingView
            room={room}
            meId={playerId}
            isHost={isHost}
            socket={socket}
          />
        )}
        {room.phase === "roundEnd" && (
          <RoundEndView room={room} isHost={isHost} socket={socket} />
        )}
        {room.phase === "gameOver" && (
          <GameOverView room={room} isHost={isHost} socket={socket} />
        )}
      </main>
    </div>
  );
}
