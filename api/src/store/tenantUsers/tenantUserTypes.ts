import { UserRole } from "../../types.js";

export type CreateUserInput = {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
};

export type UpdateUserInput = {
  email?: string;
  name?: string;
  password?: string;
};
