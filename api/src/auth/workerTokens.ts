import jwt, { SignOptions } from "jsonwebtoken";
import { WorkerRefreshTokenStore } from "../store/workerAuth/workerRefreshTokenStore.js";
import { User } from "../types.js";
import { WorkerAccessPayload } from "./workerAuthTypes.js";

export type WorkerJwtConfig = {
  secret: string;
  issuer: string;
  audience: string;
  accessExpiresIn: SignOptions["expiresIn"];
  refreshExpiresInSeconds: number;
};

export type WorkerApiKeyConfig = {
  apiKey: string;
  apiSecret: string;
};

export type WorkerTokenPair = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  tokenType: "Bearer";
};

export class WorkerTokenService {
  public constructor(
    private readonly config: WorkerJwtConfig,
    private readonly refreshTokens: WorkerRefreshTokenStore
  ) {}

  public async issue(workerId: string, user: User): Promise<WorkerTokenPair> {
    return this.issueForUser(workerId, user.userId);
  }

  public async issueForApiKey(workerId: string): Promise<WorkerTokenPair> {
    return this.issueForUser(workerId, null);
  }

  public async refresh(refreshToken: string): Promise<WorkerTokenPair | undefined> {
    const consumed = await this.refreshTokens.consume(refreshToken);
    if (!consumed) return undefined;

    const refresh = await this.refreshTokens.issue(consumed.workerId, consumed.userId, this.config.refreshExpiresInSeconds);
    await this.refreshTokens.markReplaced(consumed.id, refresh.id);
    return this.createTokenPair(consumed.workerId, consumed.userId, refresh.refreshToken);
  }

  public async verifyAccessToken(accessToken: string): Promise<WorkerAccessPayload | undefined> {
    try {
      const payload = jwt.verify(accessToken, this.config.secret, {
        issuer: this.config.issuer,
        audience: this.config.audience
      }) as WorkerAccessPayload;

      if (payload.typ !== "worker_access" || !payload.workerId || payload.sub !== payload.workerId || payload.userId === undefined) {
        return undefined;
      }

      const active = await this.refreshTokens.isActiveUser(payload.userId);
      return active ? payload : undefined;
    } catch {
      return undefined;
    }
  }

  private async issueForUser(workerId: string, userId: string | null): Promise<WorkerTokenPair> {
    const refresh = await this.refreshTokens.issue(workerId, userId, this.config.refreshExpiresInSeconds);
    return this.createTokenPair(workerId, userId, refresh.refreshToken);
  }

  private createTokenPair(workerId: string, userId: string | null, refreshToken: string): WorkerTokenPair {
    const accessToken = jwt.sign(
      {
        typ: "worker_access",
        workerId,
        userId
      },
      this.config.secret,
      {
        subject: workerId,
        issuer: this.config.issuer,
        audience: this.config.audience,
        expiresIn: this.config.accessExpiresIn
      }
    );

    return {
      accessToken,
      accessTokenExpiresIn: 3600,
      refreshToken,
      refreshTokenExpiresIn: this.config.refreshExpiresInSeconds,
      tokenType: "Bearer"
    };
  }
}

export function createWorkerJwtConfigFromEnv(): WorkerJwtConfig {
  const secret = process.env.WORKER_JWT_SECRET ?? process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "dev-only-worker-jwt-secret");
  if (!secret) {
    throw new Error("WORKER_JWT_SECRET or JWT_SECRET is required");
  }

  return {
    secret,
    issuer: process.env.WORKER_JWT_ISSUER ?? "firstdraft-api",
    audience: process.env.WORKER_JWT_AUDIENCE ?? "firstdraft-worker-api",
    accessExpiresIn: "1h",
    refreshExpiresInSeconds: 7 * 24 * 60 * 60
  };
}

export function createWorkerApiKeyConfigFromEnv(): WorkerApiKeyConfig | undefined {
  const apiKey = process.env.WORKER_API_KEY?.trim();
  const apiSecret = process.env.WORKER_API_SECRET?.trim();
  if (!apiKey && !apiSecret) return undefined;
  if (!apiKey || !apiSecret) {
    throw new Error("WORKER_API_KEY and WORKER_API_SECRET must both be set or both be omitted");
  }

  return { apiKey, apiSecret };
}
