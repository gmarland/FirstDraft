import { UserRole } from "../../types.js";

export type CreateUserInput = {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
};

export type CreateGoogleUserInput = {
  email: string;
  googleSub: string;
  name?: string;
  role?: UserRole;
};
