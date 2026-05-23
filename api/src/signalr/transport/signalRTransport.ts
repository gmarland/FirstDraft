import { IncomingMessage, Server } from "http";
import { URL } from "url";
import { nanoid } from "nanoid";
import { WebSocket, WebSocketServer } from "ws";
import {
  handshakeResponse,
  parseFrames,
  pingMessage,
  SignalRInvocationMessage
} from "../protocol.js";
import { SignalRInvocationDispatcher } from "../invocations/signalRInvocationDispatcher.js";
import { HubConnectionRegistry, SignalRConnection } from "../shared/types.js";
import { WorkerRegistrationService } from "../workers/workerRegistrationService.js";

const keepAliveIntervalMs = 15000;

export class SignalRTransport {
  private readonly wss = new WebSocketServer({ noServer: true });

  public constructor(
    private readonly connections: HubConnectionRegistry,
    private readonly invocations: SignalRInvocationDispatcher,
    private readonly workerRegistration: WorkerRegistrationService
  ) {}

  public attach(server: Server): void {
    server.on("upgrade", (request, socket, head) => {
      if (!request.url) {
        socket.destroy();
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname !== "/WorkerHub") {
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit("connection", ws, request);
      });
    });

    this.wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
      this.addConnection(socket, request);
    });
  }

  private addConnection(socket: WebSocket, request: IncomingMessage): void {
    const url = new URL(request.url ?? "/WorkerHub", `http://${request.headers.host ?? "localhost"}`);
    const connectionId = url.searchParams.get("id") ?? nanoid();
    const connection: SignalRConnection = {
      connectionId,
      socket,
      handshakeComplete: false
    };

    this.connections.set(connectionId, connection);

    connection.keepAlive = setInterval(() => {
      if (connection.socket.readyState !== WebSocket.OPEN) return;
      connection.socket.send(pingMessage());
    }, keepAliveIntervalMs);

    socket.on("message", (data) => {
      this.handleFrames(connection, data.toString()).catch((error) => {
        console.error("error handling SignalR frame", error);
      });
    });

    socket.on("close", () => {
      if (connection.keepAlive) clearInterval(connection.keepAlive);
      this.connections.delete(connection.connectionId);
      if (connection.workerId) {
        this.workerRegistration.handleClientClosed(connection).catch((error) => {
          console.error("error handling worker close", error);
        });
      }
    });
  }

  private async handleFrames(connection: SignalRConnection, payload: string): Promise<void> {
    for (const frame of parseFrames(payload)) {
      if (!connection.handshakeComplete) {
        this.handleHandshake(connection);
        continue;
      }

      const message = JSON.parse(frame) as SignalRInvocationMessage;
      if (message.type === 6) continue;

      if (message.type !== 1 || !message.target) {
        this.invocations.sendUnsupportedMessageCompletion(connection, message);
        continue;
      }

      await this.invocations.handleInvocation(connection, message);
    }
  }

  private handleHandshake(connection: SignalRConnection): void {
    connection.handshakeComplete = true;
    connection.socket.send(handshakeResponse());
  }
}
