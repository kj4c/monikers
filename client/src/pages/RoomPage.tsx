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
  const { socket, playerId, room, error, clearError, joinRoom } = useSocket();
  const name = getStoredName();
  const roomCode = (code ?? "").toUpperCase();
  const joining = useRef(false);

  useEffect(() => {
    const onEnded = () => {
      navigate("/", { replace: true });
    };
    window.addEventListener("monikers:ended", onEnded);
    return () => window.removeEventListener("monikers:ended", onEnded);
  }, [navigate]);

  useEffect(() => {
    if (!name || !roomCode) return;
    if (room?.code === roomCode) return;
    if (joining.current) return;

    // Prefer session rejoin (handled on connect); if no session for this room, join by name
    const session = getSession();
    if (session?.roomCode === roomCode && session.playerId) {
      // connect handler will rejoin; if already connected without room, join by name reclaim
      if (!room) {
        joining.current = true;
        void joinRoom(roomCode, name)
          .catch(() => {})
          .finally(() => {
            joining.current = false;
          });
      }
      return;
    }

    joining.current = true;
    void joinRoom(roomCode, name)
      .catch(() => {})
      .finally(() => {
        joining.current = false;
      });
  }, [room, roomCode, name, joinRoom]);

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

  if (!room || !playerId || room.code !== roomCode) {
    return (
      <div className="app-shell">
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
        <div>
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
