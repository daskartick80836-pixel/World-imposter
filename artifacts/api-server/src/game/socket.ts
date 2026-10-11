import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  clueInputSchema,
  createRoomInputSchema,
  guessInputSchema,
  joinRoomInputSchema,
  removePlayerInputSchema,
  roomActionInputSchema,
  resumeRoomInputSchema,
  voteInputSchema,
  type Ack,
  type CategoryId,
  type ClientToServerEvents,
  type GameOverPayload,
  type GamePhase,
  type GameRoomView,
  type GameRole,
  type LanguageCode,
  type PrivateRolePayload,
  type RoomJoinResult,
  type RoomPlayerView,
  type ServerToClientEvents,
  type WinningSide,
} from "@workspace/api-zod";
import { getRandomBotClue, getRandomWord } from "../game-data";

type RoomPlayer = {
  id: string;
  socketId: string | null;
  resumeToken: string;
  name: string;
  score: number;
  isBot: boolean;
  connected: boolean;
  role: GameRole | null;
  word: string | null;
  hasClue: boolean;
  hasVoted: boolean;
};

type InternalRoom = {
  code: string;
  hostId: string;
  language: LanguageCode;
  category: CategoryId;
  phase: GamePhase;
  round: number;
  players: RoomPlayer[];
  secretWord: string | null;
  clues: GameRoomView["clues"];
  voteCandidates: string[];
  votes: Record<string, string>;
  winner: WinningSide | null;
  eliminatedId: string | null;
};

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const rooms = new Map<string, InternalRoom>();
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createRoomCode(): string {
  let code = "";
  do {
    code = Array.from({ length: 5 }, () =>
      roomCodeAlphabet[randomInt(0, roomCodeAlphabet.length)],
    ).join("");
  } while (rooms.has(code));
  return code;
}

function createResumeToken(): string {
  return randomBytes(32).toString("base64url");
}

function activePlayers(room: InternalRoom): RoomPlayer[] {
  return room.players.filter((player) => player.isBot || player.connected);
}

function activeHumans(room: InternalRoom): RoomPlayer[] {
  return room.players.filter((player) => !player.isBot && player.connected);
}

function playerView(room: InternalRoom, player: RoomPlayer): RoomPlayerView {
  return {
    id: player.id,
    name: player.name,
    score: player.score,
    isBot: player.isBot,
    connected: player.connected,
    isHost: player.id === room.hostId,
    hasClue: player.hasClue,
    hasVoted: player.hasVoted,
  };
}

function roomView(room: InternalRoom): GameRoomView {
  const voters = activePlayers(room);
  return {
    code: room.code,
    hostId: room.hostId,
    language: room.language,
    category: room.category,
    phase: room.phase,
    round: room.round,
    players: room.players.map((player) => playerView(room, player)),
    clues: room.clues,
    voteCandidates: room.voteCandidates,
    clueCount: room.clues.length,
    voteCount: Object.keys(room.votes).length,
    voterCount: voters.length,
    winner: room.winner,
  };
}

function emitRoom(io: GameIo, room: InternalRoom): void {
  io.to(room.code).emit("roomState", roomView(room));
}

function respond<T>(ack: (response: Ack<T>) => void, data: T): void {
  ack({ ok: true, data });
}

function reject<T>(ack: (response: Ack<T>) => void, message: string): void {
  ack({ ok: false, error: message });
}

function normalizeWord(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getRoomAndPlayer(
  socket: GameSocket,
  roomCode: string,
): { room: InternalRoom; player: RoomPlayer } | null {
  const room = rooms.get(roomCode);
  const playerId = socket.data.playerId;
  if (!room || !playerId) return null;
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player || !player.connected || player.socketId !== socket.id) return null;
  return { room, player };
}

function getEligibleVoteTargets(room: InternalRoom): string[] {
  const living = activePlayers(room).map((player) => player.id);
  return room.voteCandidates.length > 0
    ? living.filter((id) => room.voteCandidates.includes(id))
    : living;
}

function seedBotVotes(room: InternalRoom): void {
  const candidates = getEligibleVoteTargets(room);
  for (const player of activePlayers(room).filter((candidate) => candidate.isBot)) {
    const options =
      candidates.length > 1
        ? candidates.filter((candidateId) => candidateId !== player.id)
        : candidates;
    const targetId = options[randomInt(0, options.length)];
    if (!targetId) continue;
    room.votes[player.id] = targetId;
    player.hasVoted = true;
  }
}

function scoreAndFinish(
  io: GameIo,
  room: InternalRoom,
  winner: WinningSide,
  reason: GameOverPayload["reason"],
): void {
  const impostor = room.players.find((player) => player.role === "IMPOSTOR");
  if (!impostor || !room.secretWord) return;

  room.winner = winner;
  room.phase = "RESULTS";
  room.players.forEach((player) => {
    if (winner === "CREW" && player.role === "CREW") player.score += 100;
    if (winner === "IMPOSTOR" && player.role === "IMPOSTOR") player.score += 200;
  });

  emitRoom(io, room);
  io.to(room.code).emit("gameOver", {
    winner,
    impostorId: impostor.id,
    secretWord: room.secretWord,
    eliminatedId: room.eliminatedId,
    scores: Object.fromEntries(room.players.map((player) => [player.id, player.score])),
    reason,
  });
}

function finishVote(io: GameIo, room: InternalRoom): void {
  const counts: Record<string, number> = {};
  Object.values(room.votes).forEach((targetId) => {
    counts[targetId] = (counts[targetId] ?? 0) + 1;
  });
  const high = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter((id) => counts[id] === high);
  if (leaders.length === 0) return;

  if (leaders.length > 1) {
    io.to(room.code).emit("voteOutcome", {
      counts,
      leaders,
      eliminatedId: null,
      tie: true,
    });
    room.voteCandidates = leaders;
    enterVoting(io, room, leaders);
    return;
  }

  const eliminatedId = leaders[0];
  const eliminated = room.players.find((player) => player.id === eliminatedId);
  if (!eliminated) return;

  room.eliminatedId = eliminated.id;
  room.voteCandidates = [];
  room.phase = eliminated.role === "IMPOSTOR" ? "GUESS" : "RESULTS";
  io.to(room.code).emit("voteOutcome", {
    counts,
    leaders,
    eliminatedId,
    tie: false,
  });
  io.to(room.code).emit("playerRevealed", {
    playerId: eliminated.id,
    role: eliminated.role ?? "CREW",
  });

  if (eliminated.role === "IMPOSTOR") {
    emitRoom(io, room);
  } else {
    scoreAndFinish(io, room, "IMPOSTOR", "INNOCENT_ELIMINATED");
  }
}

function maybeFinishVoting(io: GameIo, room: InternalRoom): void {
  const voters = activePlayers(room);
  if (voters.length > 0 && voters.every((player) => Boolean(room.votes[player.id]))) {
    finishVote(io, room);
  } else {
    emitRoom(io, room);
  }
}

function enterVoting(
  io: GameIo,
  room: InternalRoom,
  tiedIds: string[] = [],
): void {
  room.phase = tiedIds.length > 0 ? "TIEBREAKER" : "VOTING";
  room.voteCandidates = tiedIds.length > 0
    ? tiedIds
    : activePlayers(room).map((player) => player.id);
  room.votes = {};
  room.players.forEach((player) => {
    player.hasVoted = false;
  });
  seedBotVotes(room);
  emitRoom(io, room);
  maybeFinishVoting(io, room);
}

function maybeEnterVoting(io: GameIo, room: InternalRoom): void {
  const voters = activePlayers(room);
  if (
    room.phase === "CLUES" &&
    voters.length > 0 &&
    voters.every((player) => player.hasClue)
  ) {
    enterVoting(io, room);
  }
}

function sendPrivateRole(socket: GameSocket, room: InternalRoom, player: RoomPlayer): void {
  if (player.role === null) return;
  const payload: PrivateRolePayload = {
    role: player.role,
    word: player.word,
    category: room.category,
    round: room.round,
  };
  socket.emit("privateRole", payload);
}

function clearRound(room: InternalRoom): void {
  room.phase = "LOBBY";
  room.secretWord = null;
  room.clues = [];
  room.voteCandidates = [];
  room.votes = {};
  room.winner = null;
  room.eliminatedId = null;
  room.players.forEach((player) => {
    player.role = null;
    player.word = null;
    player.hasClue = false;
    player.hasVoted = false;
  });
}

type GameIo = Server<ClientToServerEvents, ServerToClientEvents>;

export function attachGameSocket(httpServer: HttpServer): GameIo {
  const io: GameIo = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, methods: ["GET", "POST"] },
    maxHttpBufferSize: 16_384,
    connectionStateRecovery: {
      maxDisconnectionDuration: 120_000,
      skipMiddlewares: true,
    },
  });

  io.on("connection", (socket) => {
    socket.on("createRoom", (payload, ack) => {
      const parsed = createRoomInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Check your name, language, and category.");

      const roomCode = createRoomCode();
      const playerId = randomUUID();
      const resumeToken = createResumeToken();
      const player: RoomPlayer = {
        id: playerId,
        socketId: socket.id,
        resumeToken,
        name: parsed.data.playerName,
        score: 0,
        isBot: false,
        connected: true,
        role: null,
        word: null,
        hasClue: false,
        hasVoted: false,
      };
      const room: InternalRoom = {
        code: roomCode,
        hostId: playerId,
        language: parsed.data.language,
        category: parsed.data.category,
        phase: "LOBBY",
        round: 0,
        players: [player],
        secretWord: null,
        clues: [],
        voteCandidates: [],
        votes: {},
        winner: null,
        eliminatedId: null,
      };

      rooms.set(roomCode, room);
      socket.data.playerId = playerId;
      socket.data.roomCode = roomCode;
      socket.join(roomCode);
      respond(ack, {
        room: roomView(room),
        playerId,
        resumeToken,
      });
      emitRoom(io, room);
    });

    socket.on("joinRoom", (payload, ack) => {
      const parsed = joinRoomInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Enter a valid room code and player name.");
      const room = rooms.get(parsed.data.roomCode);
      if (!room) return reject(ack, "That room could not be found.");
      if (room.phase !== "LOBBY") return reject(ack, "This round has already started.");
      if (room.players.length >= 10) return reject(ack, "This room is full.");
      if (
        room.players.some(
          (player) =>
            player.name.toLocaleLowerCase() ===
            parsed.data.playerName.toLocaleLowerCase(),
        )
      ) {
        return reject(ack, "That name is already being used in this room.");
      }

      const playerId = randomUUID();
      const resumeToken = createResumeToken();
      room.players.push({
        id: playerId,
        socketId: socket.id,
        resumeToken,
        name: parsed.data.playerName,
        score: 0,
        isBot: false,
        connected: true,
        role: null,
        word: null,
        hasClue: false,
        hasVoted: false,
      });
      socket.data.playerId = playerId;
      socket.data.roomCode = room.code;
      socket.join(room.code);
      respond(ack, { room: roomView(room), playerId, resumeToken });
      emitRoom(io, room);
    });

    socket.on("resumeRoom", (payload, ack) => {
      const parsed = resumeRoomInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "The saved room session is invalid.");
      const room = rooms.get(parsed.data.roomCode);
      const player = room?.players.find(
        (candidate) => candidate.resumeToken === parsed.data.resumeToken,
      );
      if (!room || !player) return reject(ack, "That saved room is no longer available.");

      const previousSocketId = player.socketId;
      player.socketId = socket.id;
      player.connected = true;
      socket.data.playerId = player.id;
      socket.data.roomCode = room.code;
      socket.join(room.code);
      if (previousSocketId && previousSocketId !== socket.id) {
        io.sockets.sockets.get(previousSocketId)?.disconnect(true);
      }

      respond(ack, {
        room: roomView(room),
        playerId: player.id,
        resumeToken: player.resumeToken,
      });
      emitRoom(io, room);
      sendPrivateRole(socket, room, player);
    });

    socket.on("addBot", (payload, ack) => {
      const parsed = roomActionInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Invalid room action.");
      const session = getRoomAndPlayer(socket, parsed.data.roomCode);
      if (!session) return reject(ack, "Rejoin the room before adding a bot.");
      const { room, player } = session;
      if (room.hostId !== player.id) return reject(ack, "Only the host can add bots.");
      if (room.phase !== "LOBBY") return reject(ack, "Bots can only be added in the lobby.");
      if (room.players.length >= 10) return reject(ack, "This room is full.");

      const number = room.players.filter((candidate) => candidate.isBot).length + 1;
      room.players.push({
        id: `bot-${randomUUID()}`,
        socketId: null,
        resumeToken: "",
        name: `Guest bot ${number}`,
        score: 0,
        isBot: true,
        connected: true,
        role: null,
        word: null,
        hasClue: false,
        hasVoted: false,
      });
      emitRoom(io, room);
      respond(ack, roomView(room));
    });

    socket.on("startGame", (payload, ack) => {
      const parsed = roomActionInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Invalid room action.");
      const session = getRoomAndPlayer(socket, parsed.data.roomCode);
      if (!session) return reject(ack, "Rejoin the room before starting.");
      const { room, player } = session;
      if (room.hostId !== player.id) return reject(ack, "Only the host can start the round.");
      if (room.phase !== "LOBBY") return reject(ack, "The round is already underway.");
      if (activePlayers(room).length < 3 || activeHumans(room).length < 2) {
        return reject(ack, "A round needs at least 3 players, including 2 people.");
      }
      if (room.players.filter((candidate) => !candidate.isBot).length > 10) {
        return reject(ack, "This room is full.");
      }

      const humans = activeHumans(room);
      const impostor = humans[randomInt(0, humans.length)];
      if (!impostor) return reject(ack, "Could not select an impostor.");

      room.round += 1;
      room.secretWord = getRandomWord(room.language, room.category);
      room.phase = "CLUES";
      room.winner = null;
      room.eliminatedId = null;
      room.voteCandidates = [];
      room.votes = {};
      room.clues = [];
      const privateRoles: Array<{ player: RoomPlayer; socket: GameSocket }> = [];
      room.players.forEach((candidate) => {
        candidate.role = candidate.id === impostor.id ? "IMPOSTOR" : "CREW";
        candidate.word = candidate.role === "CREW" ? room.secretWord : null;
        candidate.hasClue = candidate.isBot;
        candidate.hasVoted = false;
        if (candidate.isBot) {
          room.clues.push({
            playerId: candidate.id,
            playerName: candidate.name,
            clue: getRandomBotClue(room.language),
          });
        } else if (candidate.socketId) {
          const targetSocket = io.sockets.sockets.get(candidate.socketId);
          if (targetSocket) {
            privateRoles.push({ player: candidate, socket: targetSocket as GameSocket });
          }
        }
      });
      emitRoom(io, room);
      privateRoles.forEach(({ player: candidate, socket: targetSocket }) => {
        sendPrivateRole(targetSocket, room, candidate);
      });
      maybeEnterVoting(io, room);
      respond(ack, roomView(room));
    });

    socket.on("submitClue", (payload, ack) => {
      const parsed = clueInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Clues must be 1–120 characters.");
      const session = getRoomAndPlayer(socket, parsed.data.roomCode);
      if (!session) return reject(ack, "Rejoin the room before submitting a clue.");
      const { room, player } = session;
      if (room.phase !== "CLUES") return reject(ack, "Clue-giving has ended.");
      if (player.hasClue) return reject(ack, "You already submitted a clue.");

      const clue = {
        playerId: player.id,
        playerName: player.name,
        clue: parsed.data.clue,
      };
      player.hasClue = true;
      room.clues.push(clue);
      io.to(room.code).emit("clueAdded", clue);
      maybeEnterVoting(io, room);
      respond(ack, roomView(room));
    });

    socket.on("startVoting", (payload, ack) => {
      const parsed = roomActionInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Invalid room action.");
      const session = getRoomAndPlayer(socket, parsed.data.roomCode);
      if (!session) return reject(ack, "Rejoin the room before continuing.");
      const { room, player } = session;
      if (room.hostId !== player.id) return reject(ack, "Only the host can start the vote.");
      if (room.phase !== "CLUES") return reject(ack, "The vote has already started.");
      enterVoting(io, room);
      respond(ack, roomView(room));
    });

    socket.on("submitVote", (payload, ack) => {
      const parsed = voteInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Choose a valid player to vote for.");
      const session = getRoomAndPlayer(socket, parsed.data.roomCode);
      if (!session) return reject(ack, "Rejoin the room before voting.");
      const { room, player } = session;
      if (room.phase !== "VOTING" && room.phase !== "TIEBREAKER") {
        return reject(ack, "Voting is not open.");
      }
      if (room.votes[player.id]) return reject(ack, "Your vote is already locked.");
      const candidates = getEligibleVoteTargets(room);
      if (!candidates.includes(parsed.data.targetId)) {
        return reject(ack, "That player is not eligible for this vote.");
      }
      if (candidates.length > 1 && parsed.data.targetId === player.id) {
        return reject(ack, "You cannot vote for yourself.");
      }

      room.votes[player.id] = parsed.data.targetId;
      player.hasVoted = true;
      maybeFinishVoting(io, room);
      respond(ack, roomView(room));
    });

    socket.on("submitGuess", (payload, ack) => {
      const parsed = guessInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Enter a word or phrase to guess.");
      const session = getRoomAndPlayer(socket, parsed.data.roomCode);
      if (!session) return reject(ack, "Rejoin the room before guessing.");
      const { room, player } = session;
      if (
        room.phase !== "GUESS" ||
        room.eliminatedId !== player.id ||
        player.role !== "IMPOSTOR" ||
        !room.secretWord
      ) {
        return reject(ack, "Only the voted-out impostor can make the final guess.");
      }

      const correct =
        normalizeWord(parsed.data.word) === normalizeWord(room.secretWord);
      scoreAndFinish(
        io,
        room,
        correct ? "IMPOSTOR" : "CREW",
        correct ? "CORRECT_GUESS" : "WRONG_GUESS",
      );
      respond(ack, roomView(room));
    });

    socket.on("nextRound", (payload, ack) => {
      const parsed = roomActionInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Invalid room action.");
      const session = getRoomAndPlayer(socket, parsed.data.roomCode);
      if (!session) return reject(ack, "Rejoin the room before starting another round.");
      const { room, player } = session;
      if (room.hostId !== player.id) return reject(ack, "Only the host can start a rematch.");
      if (room.phase !== "RESULTS") return reject(ack, "Finish the current round first.");
      clearRound(room);
      emitRoom(io, room);
      respond(ack, roomView(room));
    });

    socket.on("removePlayer", (payload, ack) => {
      const parsed = removePlayerInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Invalid player selection.");
      const session = getRoomAndPlayer(socket, parsed.data.roomCode);
      if (!session) return reject(ack, "Rejoin the room before removing a player.");
      const { room, player } = session;
      if (room.hostId !== player.id) return reject(ack, "Only the host can remove a player.");
      if (room.phase !== "LOBBY") return reject(ack, "Players can only be removed in the lobby.");
      if (parsed.data.playerId === room.hostId) return reject(ack, "The host cannot remove themselves.");
      const removed = room.players.find((candidate) => candidate.id === parsed.data.playerId);
      if (!removed) return reject(ack, "That player is no longer in the room.");
      if (removed.socketId) {
        const targetSocket = io.sockets.sockets.get(removed.socketId) as GameSocket | undefined;
        targetSocket?.leave(room.code);
        if (targetSocket) {
          targetSocket.data.roomCode = undefined;
          targetSocket.data.playerId = undefined;
          targetSocket.emit("errorMsg", "The host removed you from the room.");
        }
      }
      room.players = room.players.filter((candidate) => candidate.id !== removed.id);
      emitRoom(io, room);
      respond(ack, roomView(room));
    });

    socket.on("leaveRoom", (payload, ack) => {
      const parsed = roomActionInputSchema.safeParse(payload);
      if (!parsed.success) return reject(ack, "Invalid room action.");
      const session = getRoomAndPlayer(socket, parsed.data.roomCode);
      if (!session) return reject(ack, "You are no longer in that room.");
      const { room, player } = session;
      if (room.phase !== "LOBBY" && room.phase !== "RESULTS") {
        return reject(ack, "Finish the current round before leaving.");
      }
      player.connected = false;
      player.socketId = null;
      socket.leave(room.code);
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;

      if (player.id === room.hostId) {
        const nextHost = room.players.find(
          (candidate) => candidate.id !== player.id && !candidate.isBot && candidate.connected,
        );
        if (!nextHost) {
          rooms.delete(room.code);
          respond(ack, null);
          return;
        }
        room.hostId = nextHost.id;
      }
      room.players = room.players.filter((candidate) => candidate.id !== player.id);
      if (room.players.length === 0) rooms.delete(room.code);
      else emitRoom(io, room);
      respond(ack, null);
    });

    socket.on("disconnect", () => {
      const roomCode = socket.data.roomCode;
      const playerId = socket.data.playerId;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const player = room?.players.find((candidate) => candidate.id === playerId);
      if (!room || !player || player.socketId !== socket.id) return;

      player.connected = false;
      if (room.hostId === player.id) {
        const nextHost = room.players.find(
          (candidate) => candidate.id !== player.id && !candidate.isBot && candidate.connected,
        );
        if (nextHost) room.hostId = nextHost.id;
      }
      emitRoom(io, room);

      if (room.phase === "GUESS" && room.eliminatedId === player.id) {
        scoreAndFinish(io, room, "CREW", "IMPOSTOR_DISCONNECTED");
      } else if (room.phase === "CLUES") {
        maybeEnterVoting(io, room);
      } else if (room.phase === "VOTING" || room.phase === "TIEBREAKER") {
        maybeFinishVoting(io, room);
      }
    });
  });

  return io;
}
