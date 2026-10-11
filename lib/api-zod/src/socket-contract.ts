import { z } from "zod";
import type {
  CategoryId,
  CategoryOption,
  GameConfig,
  LanguageCode,
  LanguageOption,
} from "./generated/types";

export const languageCodes = ["en", "bn", "hi", "es", "fr"] as const;
export const categoryIds = [
  "vehicles",
  "household",
  "electronics",
  "animals",
  "school",
  "food",
] as const;

export const languageCodeSchema = z.enum(languageCodes);
export const categoryIdSchema = z.enum(categoryIds);
export const roomCodeSchema = z.string().regex(/^[A-Z0-9]{5}$/);
export const playerNameSchema = z.string().trim().min(1).max(22);

export const createRoomInputSchema = z.object({
  playerName: playerNameSchema,
  language: languageCodeSchema,
  category: categoryIdSchema,
});

export const joinRoomInputSchema = z.object({
  roomCode: roomCodeSchema,
  playerName: playerNameSchema,
});

export const resumeRoomInputSchema = z.object({
  roomCode: roomCodeSchema,
  resumeToken: z.string().min(32).max(128),
});

export const roomActionInputSchema = z.object({ roomCode: roomCodeSchema });
export const removePlayerInputSchema = roomActionInputSchema.extend({
  playerId: z.string().min(1).max(96),
});

export const clueInputSchema = roomActionInputSchema.extend({
  clue: z.string().trim().min(1).max(120),
});

export const voteInputSchema = roomActionInputSchema.extend({
  targetId: z.string().min(1).max(96),
});

export const guessInputSchema = roomActionInputSchema.extend({
  word: z.string().trim().min(1).max(80),
});

export type GamePhase =
  | "LOBBY"
  | "CLUES"
  | "VOTING"
  | "TIEBREAKER"
  | "GUESS"
  | "RESULTS";
export type GameRole = "CREW" | "IMPOSTOR";
export type WinningSide = "CREW" | "IMPOSTOR";

export type RoomPlayerView = {
  id: string;
  name: string;
  score: number;
  isBot: boolean;
  connected: boolean;
  isHost: boolean;
  hasClue: boolean;
  hasVoted: boolean;
};

export type ClueView = {
  playerId: string;
  playerName: string;
  clue: string;
};

export type GameRoomView = {
  code: string;
  hostId: string;
  language: LanguageCode;
  category: CategoryId;
  phase: GamePhase;
  round: number;
  players: RoomPlayerView[];
  clues: ClueView[];
  voteCandidates: string[];
  clueCount: number;
  voteCount: number;
  voterCount: number;
  winner: WinningSide | null;
};

export type PrivateRolePayload = {
  role: GameRole;
  word: string | null;
  category: CategoryId;
  round: number;
};

export type VoteOutcomePayload = {
  counts: Record<string, number>;
  leaders: string[];
  eliminatedId: string | null;
  tie: boolean;
};

export type GameOverPayload = {
  winner: WinningSide;
  impostorId: string;
  secretWord: string;
  eliminatedId: string | null;
  scores: Record<string, number>;
  reason:
    | "INNOCENT_ELIMINATED"
    | "WRONG_GUESS"
    | "CORRECT_GUESS"
    | "IMPOSTOR_DISCONNECTED";
};

export type RevealedPlayerPayload = {
  playerId: string;
  role: GameRole;
};

export type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type RoomJoinResult = {
  room: GameRoomView;
  playerId: string;
  resumeToken: string;
};

export type ClientToServerEvents = {
  createRoom: (
    input: z.infer<typeof createRoomInputSchema>,
    ack: (response: Ack<RoomJoinResult>) => void,
  ) => void;
  joinRoom: (
    input: z.infer<typeof joinRoomInputSchema>,
    ack: (response: Ack<RoomJoinResult>) => void,
  ) => void;
  resumeRoom: (
    input: z.infer<typeof resumeRoomInputSchema>,
    ack: (response: Ack<RoomJoinResult>) => void,
  ) => void;
  addBot: (
    input: z.infer<typeof roomActionInputSchema>,
    ack: (response: Ack<GameRoomView>) => void,
  ) => void;
  startGame: (
    input: z.infer<typeof roomActionInputSchema>,
    ack: (response: Ack<GameRoomView>) => void,
  ) => void;
  submitClue: (
    input: z.infer<typeof clueInputSchema>,
    ack: (response: Ack<GameRoomView>) => void,
  ) => void;
  startVoting: (
    input: z.infer<typeof roomActionInputSchema>,
    ack: (response: Ack<GameRoomView>) => void,
  ) => void;
  submitVote: (
    input: z.infer<typeof voteInputSchema>,
    ack: (response: Ack<GameRoomView>) => void,
  ) => void;
  submitGuess: (
    input: z.infer<typeof guessInputSchema>,
    ack: (response: Ack<GameRoomView>) => void,
  ) => void;
  nextRound: (
    input: z.infer<typeof roomActionInputSchema>,
    ack: (response: Ack<GameRoomView>) => void,
  ) => void;
  removePlayer: (
    input: z.infer<typeof roomActionInputSchema> & { playerId: string },
    ack: (response: Ack<GameRoomView>) => void,
  ) => void;
  leaveRoom: (
    input: z.infer<typeof roomActionInputSchema>,
    ack: (response: Ack<null>) => void,
  ) => void;
};

export type ServerToClientEvents = {
  roomState: (room: GameRoomView) => void;
  privateRole: (payload: PrivateRolePayload) => void;
  clueAdded: (clue: ClueView) => void;
  playerRevealed: (player: RevealedPlayerPayload) => void;
  voteOutcome: (outcome: VoteOutcomePayload) => void;
  gameOver: (result: GameOverPayload) => void;
  errorMsg: (message: string) => void;
};
