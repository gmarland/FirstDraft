import { ApiKey } from "../../types.js";

export type CreateApiKeyInput = {
  userId: string;
  name?: string;
};

export type CreateApiKeyResult = {
  apiKey: string;
  apiSecret: string;
  record: ApiKey;
};

export type AuthenticatedApiKey = {
  key: ApiKey;
};
