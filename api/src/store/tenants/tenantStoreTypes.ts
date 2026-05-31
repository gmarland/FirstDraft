import { User } from "../../types.js";
import { CreateUserInput, UpdateUserInput } from "../tenantUsers/tenantUserTypes.js";

export type { CreateUserInput, UpdateUserInput } from "../tenantUsers/tenantUserTypes.js";

export type AppStore = {
  migrate(): Promise<void>;
  createUser(input: CreateUserInput): Promise<User>;
  listUsers(): Promise<User[]>;
  getUser(userId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUser(userId: string, input: UpdateUserInput): Promise<User | undefined>;
  listCommandOutputObjectKeysForUser(userId: string): Promise<string[]>;
  deleteUser(userId: string): Promise<boolean>;
  authenticateUser(
    email: string,
    password: string,
  ): Promise<User | undefined>;
  disableUser(userId: string): Promise<User | undefined>;
  close(): Promise<void>;
};
