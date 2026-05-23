import { WebSocket } from "ws";
import { Command } from "../../types.js";

export type SignalRConnection = {
  connectionId: string;
  socket: WebSocket;
  workerId?: string;
  handshakeComplete: boolean;
  keepAlive?: NodeJS.Timeout;
};

export type HubConnectionRegistry = {
  get(connectionId: string): SignalRConnection | undefined;
  set(connectionId: string, connection: SignalRConnection): void;
  delete(connectionId: string): void;
};

export type CommandLifecycleObserver = {
  commandStarted(command: Command): Promise<void>;
  commandCompleted(command: Command): Promise<void>;
};
