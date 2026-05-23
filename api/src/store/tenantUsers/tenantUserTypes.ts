import { UserRole } from "../../types.js";

export type CreateUserInput = {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
};
