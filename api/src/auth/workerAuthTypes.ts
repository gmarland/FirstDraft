import { JwtPayload } from "jsonwebtoken";

export type WorkerAccessPayload = JwtPayload & {
  sub: string;
  typ: "worker_access";
  workerId: string;
  userId: string | null;
};
