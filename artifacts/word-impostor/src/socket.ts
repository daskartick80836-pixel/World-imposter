import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@workspace/api-zod";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let sharedSocket: GameSocket | undefined;

export function getGameSocket(): GameSocket {
  if (!sharedSocket) {
    sharedSocket = io({
      autoConnect: false,
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelayMax: 2500,
    });
  }
  return sharedSocket;
}
