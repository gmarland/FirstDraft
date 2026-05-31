import { ClientCommandSchema } from "./clientCommand.js";
import { ClientWorkerSchema } from "./clientWorker.js";
import { TenantSettingSchema } from "./tenantSetting.js";
import { UserSchema } from "./user.js";
import { WorkerGitRepositorySchema } from "./workerGitRepository.js";
import { WorkerJiraIntegrationSchema } from "./workerJiraIntegration.js";
import { WorkerRefreshTokenSchema } from "./workerRefreshToken.js";

export { ClientCommandSchema } from "./clientCommand.js";
export type { ClientCommandEntity } from "./clientCommand.js";
export { ClientWorkerSchema } from "./clientWorker.js";
export type { ClientWorkerEntity } from "./clientWorker.js";
export { TenantSettingSchema } from "./tenantSetting.js";
export type { TenantSettingEntity } from "./tenantSetting.js";
export { UserSchema } from "./user.js";
export type { UserEntity } from "./user.js";
export { WorkerGitRepositorySchema } from "./workerGitRepository.js";
export type { WorkerGitRepositoryEntity } from "./workerGitRepository.js";
export { WorkerJiraIntegrationSchema } from "./workerJiraIntegration.js";
export type { WorkerJiraIntegrationEntity } from "./workerJiraIntegration.js";
export { WorkerRefreshTokenSchema } from "./workerRefreshToken.js";
export type { WorkerRefreshTokenEntity } from "./workerRefreshToken.js";

export const entities = [
  UserSchema,
  TenantSettingSchema,
  WorkerRefreshTokenSchema,
  ClientWorkerSchema,
  WorkerGitRepositorySchema,
  WorkerJiraIntegrationSchema,
  ClientCommandSchema
];
