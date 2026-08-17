import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  createRoom,
  emitRoomState,
  emitToSocket,
  getRoom,
  getSocketBinding,
  handleAddCard,
  handleBackToLobby,
  handleCardsDone,
  handleDisconnect,
  handleEndTurn,
  handleGoHome,
  handleGotIt,
  handleHostStart,
  handleNewGame,
  handleNextRound,
  handleReady,
  handleRemoveCard,
  handleReplay,
  handleShuffleTeams,
  handleSkip,
  handleStartCardSelect,
  handleStartFromBank,
  handleStartTurn,
  handleSetCardsPerPlayer,
  handleSetCardSource,
  handleSetMaxSkips,
  handleSetTurnSeconds,
  handleSwapTeam,
  handleTimeout,
  handleUnskip,
  handleUpdateCard,
  joinRoom,
  rejoinRoom,
} from "./rooms.js";

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.use(
  cors({
    origin: isProd ? true : CLIENT_ORIGIN,
  })
);
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

if (isProd) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/socket.io")) return next();
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) next();
    });
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: isProd ? true : CLIENT_ORIGIN },
  // More tolerant of mobile background / flaky networks
  pingInterval: 25_000,
  pingTimeout: 90_000,
});

function broadcast(roomCode: string) {
  const room = getRoom(roomCode);
  if (!room) return;
  emitRoomState(io, room);
}

async function attachToRoom(
  socket: { id: string; join: (r: string) => Promise<void> | void },
  roomCode: string,
  playerId: string
) {
  await socket.join(roomCode);
  await socket.join(playerId);
}

io.on("connection", (socket) => {
  socket.on(
    "room:create",
    ({ name }: { name: string }, ack?: (r: unknown) => void) => {
      try {
        const { room, playerId } = createRoom(socket.id, name ?? "");
        void attachToRoom(socket, room.code, playerId).then(() => {
          emitToSocket(socket, room, playerId);
          ack?.({ ok: true, code: room.code, playerId });
        });
      } catch (e) {
        ack?.({ ok: false, error: String(e) });
      }
    }
  );

  socket.on(
    "room:join",
    (
      {
        code,
        name,
        playerId,
      }: { code: string; name: string; playerId?: string },
      ack?: (r: unknown) => void
    ) => {
      const result = joinRoom(socket.id, code ?? "", name ?? "", playerId);
      if (result.error || !result.room || !result.playerId) {
        ack?.({ ok: false, error: result.error ?? "Failed" });
        socket.emit("room:error", result.error ?? "Failed");
        return;
      }
      void attachToRoom(socket, result.room.code, result.playerId).then(() => {
        broadcast(result.room!.code);
        ack?.({
          ok: true,
          code: result.room!.code,
          playerId: result.playerId,
        });
      });
    }
  );

  socket.on(
    "room:rejoin",
    (
      {
        code,
        playerId,
        name,
      }: { code: string; playerId: string; name: string },
      ack?: (r: unknown) => void
    ) => {
      const result = rejoinRoom(
        socket.id,
        code ?? "",
        playerId ?? "",
        name ?? ""
      );
      if (result.error || !result.room || !result.playerId) {
        ack?.({ ok: false, error: result.error ?? "Failed" });
        return;
      }
      void attachToRoom(socket, result.room.code, result.playerId).then(() => {
        broadcast(result.room!.code);
        ack?.({
          ok: true,
          code: result.room!.code,
          playerId: result.playerId,
        });
      });
    }
  );

  const withRoom = (
    handler: (
      room: NonNullable<ReturnType<typeof getRoom>>,
      playerId: string
    ) => { error?: string; ended?: boolean; code?: string }
  ) => {
    const binding = getSocketBinding(socket.id);
    if (!binding) {
      socket.emit("room:error", "Not in a room");
      return;
    }
    const room = getRoom(binding.roomCode);
    if (!room) {
      socket.emit("room:error", "Room not found");
      return;
    }
    const result = handler(room, binding.playerId);
    if (result.error) {
      socket.emit("room:error", result.error);
      return;
    }
    if (result.ended && result.code) {
      io.to(result.code).emit("room:ended");
      return;
    }
    broadcast(room.code);
  };

  socket.on("lobby:shuffleTeams", () => {
    withRoom((room, playerId) => handleShuffleTeams(room, playerId));
  });

  socket.on("lobby:setCardsPerPlayer", ({ count }: { count: number }) => {
    withRoom((room, playerId) => handleSetCardsPerPlayer(room, playerId, count));
  });

  socket.on("lobby:setMaxSkips", ({ count }: { count: number }) => {
    withRoom((room, playerId) => handleSetMaxSkips(room, playerId, count));
  });

  socket.on("lobby:setTurnSeconds", ({ seconds }: { seconds: number }) => {
    withRoom((room, playerId) => handleSetTurnSeconds(room, playerId, seconds));
  });

  socket.on(
    "lobby:setCardSource",
    ({ source }: { source: "custom" | "bank" }) => {
      withRoom((room, playerId) => handleSetCardSource(room, playerId, source));
    }
  );

  socket.on("lobby:swapTeam", ({ playerId }: { playerId: string }) => {
    withRoom((room, hostId) => handleSwapTeam(room, hostId, playerId));
  });

  socket.on("lobby:startCardSelect", () => {
    withRoom((room, playerId) => handleStartCardSelect(room, playerId));
  });

  socket.on("lobby:startFromBank", () => {
    withRoom((room, playerId) => handleStartFromBank(room, playerId));
  });

  socket.on(
    "cards:add",
    (data: {
      text: string;
      description?: string;
      points: number;
      pack?: "custom" | "bank";
    }) => {
      withRoom((room, playerId) => handleAddCard(room, playerId, data));
    }
  );

  socket.on(
    "cards:update",
    (data: {
      cardId: string;
      text: string;
      description?: string;
      points: number;
    }) => {
      withRoom((room, playerId) => handleUpdateCard(room, playerId, data));
    }
  );

  socket.on("cards:remove", ({ cardId }: { cardId: string }) => {
    withRoom((room, playerId) => handleRemoveCard(room, playerId, cardId));
  });

  socket.on("cards:done", () => {
    withRoom((room, playerId) => handleCardsDone(room, playerId));
  });

  socket.on("player:ready", () => {
    withRoom((room, playerId) => handleReady(room, playerId));
  });

  socket.on("host:start", () => {
    withRoom((room, playerId) => handleHostStart(room, playerId));
  });

  socket.on("turn:gotIt", () => {
    withRoom((room, playerId) => handleGotIt(room, playerId));
  });

  socket.on("turn:skip", () => {
    withRoom((room, playerId) => handleSkip(room, playerId));
  });

  socket.on("turn:unskip", ({ cardId }: { cardId: string }) => {
    withRoom((room, playerId) => handleUnskip(room, playerId, cardId));
  });

  socket.on("turn:end", () => {
    withRoom((room, playerId) => handleEndTurn(room, playerId));
  });

  socket.on("turn:timeout", () => {
    withRoom((room) => handleTimeout(room));
  });

  socket.on("turn:start", () => {
    withRoom((room, playerId) => handleStartTurn(room, playerId));
  });

  socket.on("host:nextRound", () => {
    withRoom((room, playerId) => handleNextRound(room, playerId));
  });

  socket.on("host:replay", () => {
    withRoom((room, playerId) => handleReplay(room, playerId));
  });

  socket.on("host:newGame", () => {
    withRoom((room, playerId) => handleNewGame(room, playerId));
  });

  socket.on("host:backToLobby", () => {
    withRoom((room, playerId) => handleBackToLobby(room, playerId));
  });

  socket.on("host:goHome", () => {
    withRoom((room, playerId) => handleGoHome(room, playerId));
  });

  socket.on("room:leave", () => {
    const room = handleDisconnect(socket.id);
    if (room) broadcast(room.code);
  });

  socket.on("disconnect", () => {
    const room = handleDisconnect(socket.id);
    if (room) broadcast(room.code);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Monikers server on http://localhost:${PORT}`);
});
