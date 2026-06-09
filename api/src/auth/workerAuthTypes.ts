import { JwtPayload } from "jsonwebtoken";

export type WorkerAccessPayload = JwtPayload & {
  sub: string;
  typ: "worker_access";
  workerId: string;
  userId: string | null;
};

export type ApiToWorkerPayload = JwtPayload & {
  sub: "firstdraft-api";
  typ: "api_to_worker";
  workerId: string;
  transactionId: string;
};
