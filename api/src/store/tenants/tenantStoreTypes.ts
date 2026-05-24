import { ApiKey, User } from "../../types.js";
import {
  AuthenticatedApiKey,
  CreateApiKeyInput,
  CreateApiKeyResult,
} from "../tenantApiKeys/tenantApiKeyTypes.js";
import { CreateUserInput, UpdateUserInput } from "../tenantUsers/tenantUserTypes.js";

export type {
  AuthenticatedApiKey,
  CreateApiKeyInput,
  CreateApiKeyResult,
} from "../tenantApiKeys/tenantApiKeyTypes.js";
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
  createApiKey(
    input: CreateApiKeyInput,
  ): Promise<CreateApiKeyResult>;
  listApiKeys(): Promise<ApiKey[]>;
  listApiKeysForUser(userId: string): Promise<ApiKey[]>;
  authenticateApiKey(
    apiKey: string,
    apiSecret: string,
  ): Promise<AuthenticatedApiKey | undefined>;
  revokeApiKey(keyId: string): Promise<ApiKey | undefined>;
  revokeApiKeyForUser(userId: string, keyId: string): Promise<ApiKey | undefined>;
  close(): Promise<void>;
};
