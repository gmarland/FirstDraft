import { User } from "../types.js";

export type AuthenticatedUser = User;

export type JwtUserPayload = {
  sub: string;
  email: string;
  role: string;
};

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}
