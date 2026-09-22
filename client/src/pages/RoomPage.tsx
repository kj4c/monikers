import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { getStoredName, useSocket } from "../socket";
import { getSession } from "../session";
import { AdBanner } from "../components/AdBanner";
import { LoadingPanel } from "../components/LoadingPanel";
import { RoomCodeCopy } from "../components/RoomCodeCopy";
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
    const onKicked = () => {
      navigate("/", {
        replace: true,
        state: { message: "You were removed from the room by the host." },
      });
    };
    window.addEventListener("monikers:ended", onEnded);
    window.addEventListener("monikers:kicked", onKicked);
    return () => {
      window.removeEventListener("monikers:ended", onEnded);
      window.removeEventListener("monikers:kicked", onKicked);
    };
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
      <div className="app-shell view-enter">
        <header className="room-header">
          <div className="room-header-left">
            <button type="button" className="btn-back" onClick={goHome}>
              ← Back
            </button>
            <RoomCodeCopy code={roomCode} variant="header" />
          </div>
        </header>
        <div className="room-body">
          <LoadingPanel label={`Connecting to room ${roomCode}…`} />
        </div>
      </div>
    );
  }

  const isHost = room.hostId === playerId;
  const inGame =
    room.phase === "playing" ||
    room.phase === "roundEnd" ||
    room.phase === "gameOver";
  const showAds = room.phase !== "playing" && !room.noAds;
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
    <div className="app-shell view-enter">
      <header className="room-header">
        <div className="room-header-left">
          {!inGame && (
            <button type="button" className="btn-back" onClick={goHome}>
              ← Back
            </button>
          )}
          <RoomCodeCopy code={room.code} variant="header" />
        </div>
        <div className="room-meta">
          {phaseLabel}
          <br />
          {isHost ? "Host" : "Player"}
        </div>
      </header>
      <main className="room-body">
        {error && (
          <div className="error-banner" key={error}>
            {error}
          </div>
        )}
        <div key={room.phase} className="phase-view">
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
        </div>
      </main>
      {showAds && <AdBanner />}
    </div>
  );
}
