import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  rejoinSession: () => Promise<boolean>;
};

const SocketContext = createContext<SocketContextValue | null>(null);

const URL =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.PROD ? window.location.origin : "http://localhost:3001");

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
  const roomRef = useRef<RoomState | null>(null);
  const rejoining = useRef(false);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const rejoinSession = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        const session = getSession();
        if (!session) {
          resolve(false);
          return;
        }
        if (rejoining.current) {
          resolve(true);
          return;
        }
        rejoining.current = true;
        socket.emit(
          "room:rejoin",
          {
            code: session.roomCode,
            playerId: session.playerId,
            name: session.name,
          },
          (res: Ack) => {
            rejoining.current = false;
            if (res?.ok && res.playerId && res.code) {
              setPlayerId(res.playerId);
              saveSession({
                playerId: res.playerId,
                roomCode: res.code,
                name: session.name,
              });
              resolve(true);
            } else {
              // Only clear if we aren't already showing this room live
              const live = roomRef.current;
              if (!live || live.code !== session.roomCode) {
                clearSession();
                setPlayerId(null);
                setRoom(null);
              }
              resolve(false);
            }
          }
        );
      }),
    [socket]
  );

  useEffect(() => {
    const onConnect = () => {
      setSocketId(socket.id ?? null);
      void rejoinSession();
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
  }, [socket, rejoinSession]);

  const waitForRoom = useCallback(
    (code: string, timeoutMs = 4000) =>
      new Promise<void>((resolve, reject) => {
        if (roomRef.current?.code === code) {
          resolve();
          return;
        }
        const timer = window.setTimeout(() => {
          socket.off("room:state", onState);
          reject(new Error("Timed out waiting for room"));
        }, timeoutMs);
        const onState = (state: RoomState) => {
          if (state.code === code) {
            window.clearTimeout(timer);
            socket.off("room:state", onState);
            resolve();
          }
        };
        socket.on("room:state", onState);
      }),
    [socket]
  );

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
            void waitForRoom(res.code)
              .catch(() => {})
              .finally(() => resolve(res.code!));
          } else reject(new Error(res?.error ?? "Failed to create room"));
        });
      }),
    [socket, waitForRoom]
  );

  const joinRoom = useCallback(
    (code: string, name: string) =>
      new Promise<string>((resolve, reject) => {
        setStoredName(name);
        const normalized = code.trim().toUpperCase();
        const session = getSession();
        socket.emit(
          "room:join",
          {
            code: normalized,
            name,
            playerId:
              session?.roomCode === normalized ? session.playerId : undefined,
          },
          (res: Ack) => {
            if (res?.ok && res.code && res.playerId) {
              saveSession({
                playerId: res.playerId,
                roomCode: res.code,
                name: name.trim(),
              });
              setPlayerId(res.playerId);
              void waitForRoom(res.code)
                .catch(() => {})
                .finally(() => resolve(res.code!));
            } else reject(new Error(res?.error ?? "Failed to join room"));
          }
        );
      }),
    [socket, waitForRoom]
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
      rejoinSession,
    }),
    [socket, socketId, playerId, room, error, createRoom, joinRoom, rejoinSession]
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
