import { EntitySchema } from "typeorm";

export type UserGitRepositoryEntity = {
  userId: string;
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  defaultSourceBranch: string;
  defaultTargetBranch: string;
  lastSourceBranch: string;
  enabled: boolean;
  firstUsedAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const UserGitRepositorySchema = new EntitySchema<UserGitRepositoryEntity>({
  name: "UserGitRepository",
  tableName: "user_git_repositories",
  columns: {
    userId: { type: "uuid", name: "user_id", primary: true },
    normalizedRepositoryUrl: { type: "text", name: "normalized_repository_url", primary: true },
    repositoryUrl: { type: "text", name: "repository_url" },
    defaultSourceBranch: { type: "text", name: "default_source_branch" },
    defaultTargetBranch: { type: "text", name: "default_target_branch", default: "'main'" },
    lastSourceBranch: { type: "text", name: "last_source_branch" },
    enabled: { type: "boolean", default: true },
    firstUsedAt: { type: "timestamptz", name: "first_used_at", createDate: true },
    lastUsedAt: { type: "timestamptz", name: "last_used_at", createDate: true },
    createdAt: { type: "timestamptz", name: "created_at", createDate: true },
    updatedAt: { type: "timestamptz", name: "updated_at", updateDate: true }
  }
});
