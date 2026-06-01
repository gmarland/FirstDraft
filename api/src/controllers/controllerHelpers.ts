import { NextFunction, Request, RequestHandler, Response } from "express";
import { WorkerTokenService } from "../auth/workerTokens.js";
import { WorkerAccessPayload } from "../auth/workerAuthTypes.js";
import { WorkerStore } from "../store/clientStore.js";
import { User, WorkerRegistration } from "../types.js";

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    return handler(req, res, next).catch(next);
  };
}

export function requireUser(req: Request, res: Response): User | undefined {
  const user = req.user as User | undefined;
  if (!user) {
    res.status(401).json({ error: "authentication required" });
    return undefined;
  }

  return user;
}

export async function requireWorkerForUser(
  store: WorkerStore,
  user: User,
  workerId: string,
  res: Response
): Promise<WorkerRegistration | undefined> {
  const worker = await store.getWorkerForUser(user.userId, workerId);
  if (!worker) {
    res.status(404).json({ error: "worker is not registered" });
    return undefined;
  }

  return worker;
}

export async function requireWorkerBearerToken(
  tokens: WorkerTokenService,
  authorization: string | undefined,
  res: Response
): Promise<WorkerAccessPayload | undefined> {
  const token = readBearerToken(authorization);
  if (!token) {
    res.status(401).json({ error: "worker bearer token is required" });
    return undefined;
  }

  const worker = await tokens.verifyAccessToken(token);
  if (!worker) {
    res.status(401).json({ error: "invalid worker token" });
    return undefined;
  }

  return worker;
}

function readBearerToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1];
}
