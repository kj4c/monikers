import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type { RoomState } from "@monikers/shared";
import {
  clearSession,
  getSession,
  getStoredName,
  saveSession,
  setStoredName,
} from "./session";

type Ack = {
  ok?: boolean;
  code?: string;
  playerId?: string;
  error?: string;
};

type SocketContextValue = {
  socket: Socket;
  socketId: string | null;
  playerId: string | null;
  room: RoomState | null;
  error: string | null;
  clearError: () => void;
  clearRoom: () => void;
  createRoom: (name: string) => Promise<string>;
  joinRoom: (code: string, name: string) => Promise<string>;
};

const SocketContext = createContext<SocketContextValue | null>(null);

const URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket] = useState(() =>
    io(URL, {
      autoConnect: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })
  );
  const [socketId, setSocketId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(
    () => getSession()?.playerId ?? null
  );
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tryRejoin = useCallback(() => {
    const session = getSession();
    if (!session) return;
    socket.emit(
      "room:rejoin",
      {
        code: session.roomCode,
        playerId: session.playerId,
        name: session.name,
      },
      (res: Ack) => {
        if (res?.ok && res.playerId) {
          setPlayerId(res.playerId);
          saveSession({
            playerId: res.playerId,
            roomCode: res.code ?? session.roomCode,
            name: session.name,
          });
        } else {
          // Room gone — clear stale session
          clearSession();
          setPlayerId(null);
          setRoom(null);
        }
      }
    );
  }, [socket]);

  useEffect(() => {
    const onConnect = () => {
      setSocketId(socket.id ?? null);
      tryRejoin();
    };
    const onState = (state: RoomState) => setRoom(state);
    const onError = (msg: string) => setError(msg);
    const onEnded = () => {
      clearSession();
      setPlayerId(null);
      setRoom(null);
      window.dispatchEvent(new CustomEvent("monikers:ended"));
    };

    socket.on("connect", onConnect);
    socket.on("room:state", onState);
    socket.on("room:error", onError);
    socket.on("room:ended", onEnded);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("room:state", onState);
      socket.off("room:error", onError);
      socket.off("room:ended", onEnded);
    };
  }, [socket, tryRejoin]);

  const createRoom = useCallback(
    (name: string) =>
      new Promise<string>((resolve, reject) => {
        setStoredName(name);
        socket.emit("room:create", { name }, (res: Ack) => {
          if (res?.ok && res.code && res.playerId) {
            saveSession({
              playerId: res.playerId,
              roomCode: res.code,
              name: name.trim(),
            });
            setPlayerId(res.playerId);
            resolve(res.code);
          } else reject(new Error(res?.error ?? "Failed to create room"));
        });
      }),
    [socket]
  );

  const joinRoom = useCallback(
    (code: string, name: string) =>
      new Promise<string>((resolve, reject) => {
        setStoredName(name);
        socket.emit(
          "room:join",
          { code, name },
          (res: Ack) => {
            if (res?.ok && res.code && res.playerId) {
              saveSession({
                playerId: res.playerId,
                roomCode: res.code,
                name: name.trim(),
              });
              setPlayerId(res.playerId);
              resolve(res.code);
            } else reject(new Error(res?.error ?? "Failed to join room"));
          }
        );
      }),
    [socket]
  );

  const value = useMemo(
    () => ({
      socket,
      socketId,
      playerId,
      room,
      error,
      clearError: () => setError(null),
      clearRoom: () => {
        clearSession();
        setPlayerId(null);
        setRoom(null);
      },
      createRoom,
      joinRoom,
    }),
    [socket, socketId, playerId, room, error, createRoom, joinRoom]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket outside provider");
  return ctx;
}

export { getStoredName };
