import { DbClient } from "../../db/dbClient.js";
import { toIsoString } from "../tenants/tenantRowMappers.js";

type QueryResultRow = Record<string, unknown>;

export type GitRepositorySuggestion = {
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  defaultSourceBranch?: string;
  defaultTargetBranch?: string;
  lastSourceBranch?: string;
  lastUsedAt: string;
  previouslyUsedByWorker: boolean;
};

export type RecordGitRepositoryUsageInput = {
  userId: string;
  workerId: string;
  repositoryUrl: string;
  sourceBranch: string;
  localPath?: string;
};

export type GitRepository = {
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  defaultSourceBranch: string;
  defaultTargetBranch: string;
  lastSourceBranch?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
};

export type SaveGitRepositoryInput = {
  repositoryUrl?: string;
  defaultSourceBranch?: string;
  defaultTargetBranch?: string;
  enabled?: boolean;
};

export type WorkerRepositoryUsage = {
  workerId: string;
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  localPath?: string;
  lastSourceBranch?: string;
  lastUsedAt: string;
};

export class GitRepositoryStore {
  public constructor(private readonly pool: DbClient) {}

  public async recordGitflowUsage(input: RecordGitRepositoryUsageInput): Promise<void> {
    const normalizedRepositoryUrl = normalizeRepositoryUrl(input.repositoryUrl);
    const sourceBranch = cleanBranch(input.sourceBranch) || "main";

    await this.pool.query(
      `
        insert into user_git_repositories (
          user_id,
          repository_url,
          normalized_repository_url,
          default_source_branch,
          default_target_branch,
          last_source_branch
        )
        values ($1, $2, $3, $4, $4, $4)
        on conflict (user_id, normalized_repository_url)
        do update set
          repository_url = excluded.repository_url,
          last_source_branch = excluded.last_source_branch,
          last_used_at = now(),
          updated_at = now()
      `,
      [input.userId, input.repositoryUrl.trim(), normalizedRepositoryUrl, sourceBranch]
    );
    await this.pool.query(
      `
        insert into worker_git_repositories (
          worker_id,
          normalized_repository_url,
          repository_url,
          local_path,
          last_source_branch
        )
        values ($1, $2, $3, $4, $5)
        on conflict (worker_id, normalized_repository_url)
        do update set
          repository_url = excluded.repository_url,
          local_path = coalesce(excluded.local_path, worker_git_repositories.local_path),
          last_source_branch = excluded.last_source_branch,
          last_used_at = now()
      `,
      [input.workerId, normalizedRepositoryUrl, input.repositoryUrl.trim(), input.localPath ?? null, sourceBranch]
    );
  }

  public async listRepositories(userId: string): Promise<GitRepository[]> {
    const result = await this.pool.query(
      `
        select
          repos.repository_url,
          repos.normalized_repository_url,
          repos.default_source_branch,
          repos.default_target_branch,
          repos.last_source_branch,
          repos.enabled,
          repos.created_at,
          repos.updated_at,
          repos.last_used_at
        from user_git_repositories repos
        where repos.user_id = $1
        order by repos.updated_at desc, repos.last_used_at desc
      `,
      [userId]
    );

    return result.rows.map(mapGitRepository);
  }

  public async saveRepository(userId: string, input: SaveGitRepositoryInput): Promise<GitRepository> {
    const repositoryUrl = clean(input.repositoryUrl);
    if (!repositoryUrl) throw new Error("repositoryUrl is required");

    const normalizedRepositoryUrl = normalizeRepositoryUrl(repositoryUrl);
    const defaultSourceBranch = cleanBranch(input.defaultSourceBranch) || "main";
    const defaultTargetBranch = cleanBranch(input.defaultTargetBranch) || defaultSourceBranch;
    const enabled = input.enabled ?? true;

    await this.pool.query(
      `
        insert into user_git_repositories (
          user_id,
          repository_url,
          normalized_repository_url,
          default_source_branch,
          default_target_branch,
          last_source_branch,
          enabled,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $4, $6, now())
        on conflict (user_id, normalized_repository_url)
        do update set
          repository_url = excluded.repository_url,
          default_source_branch = excluded.default_source_branch,
          default_target_branch = excluded.default_target_branch,
          enabled = excluded.enabled,
          updated_at = now()
      `,
      [userId, repositoryUrl, normalizedRepositoryUrl, defaultSourceBranch, defaultTargetBranch, enabled]
    );

    const saved = await this.getRepository(userId, normalizedRepositoryUrl);
    if (!saved) throw new Error("Repository was not saved");
    return saved;
  }

  public async updateRepository(
    userId: string,
    normalizedRepositoryUrl: string,
    input: Omit<SaveGitRepositoryInput, "repositoryUrl"> & { repositoryUrl?: string }
  ): Promise<GitRepository | undefined> {
    const existing = await this.getRepository(userId, normalizedRepositoryUrl);
    if (!existing) return undefined;

    return this.saveRepository(userId, {
      repositoryUrl: input.repositoryUrl ?? existing.repositoryUrl,
      defaultSourceBranch: input.defaultSourceBranch ?? existing.defaultSourceBranch,
      defaultTargetBranch: input.defaultTargetBranch ?? existing.defaultTargetBranch,
      enabled: input.enabled ?? existing.enabled
    });
  }

  public async deleteRepository(userId: string, normalizedRepositoryUrl: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        delete from user_git_repositories
        where user_id = $1
          and normalized_repository_url = $2
      `,
      [userId, normalizedRepositoryUrl]
    );

    return (result.rowCount ?? 0) > 0;
  }

  public async getRepository(userId: string, normalizedRepositoryUrl: string): Promise<GitRepository | undefined> {
    const result = await this.pool.query(
      `
        select
          repos.repository_url,
          repos.normalized_repository_url,
          repos.default_source_branch,
          repos.default_target_branch,
          repos.last_source_branch,
          repos.enabled,
          repos.created_at,
          repos.updated_at,
          repos.last_used_at
        from user_git_repositories repos
        where repos.user_id = $1
          and repos.normalized_repository_url = $2
      `,
      [userId, normalizedRepositoryUrl]
    );

    return result.rows[0] ? mapGitRepository(result.rows[0]) : undefined;
  }

  public async listGitflowSuggestions(userId: string, workerId: string): Promise<GitRepositorySuggestion[]> {
    const result = await this.pool.query(
      `
        select
          user_repos.repository_url,
          user_repos.normalized_repository_url,
          user_repos.default_source_branch,
          user_repos.default_target_branch,
          user_repos.last_source_branch,
          user_repos.last_used_at,
          worker_repos.normalized_repository_url is not null as previously_used_by_worker
        from user_git_repositories user_repos
        left join worker_git_repositories worker_repos
          on worker_repos.normalized_repository_url = user_repos.normalized_repository_url
          and worker_repos.worker_id = $2
        where user_repos.user_id = $1
          and user_repos.enabled = true
        order by user_repos.last_used_at desc
      `,
      [userId, workerId]
    );

    return result.rows.map(mapGitRepositorySuggestion);
  }

  public async listWorkerRepositoryUsage(normalizedRepositoryUrl: string): Promise<WorkerRepositoryUsage[]> {
    const result = await this.pool.query(
      `
        select
          worker_id,
          repository_url,
          normalized_repository_url,
          local_path,
          last_source_branch,
          last_used_at
        from worker_git_repositories
        where normalized_repository_url = $1
        order by last_used_at desc
      `,
      [normalizedRepositoryUrl]
    );

    return result.rows.map(mapWorkerRepositoryUsage);
  }
}

export function normalizeRepositoryUrl(repositoryUrl: string): string {
  const trimmed = repositoryUrl.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+)$/i);
  if (sshMatch) {
    return normalizeGitHubPath(sshMatch[1], sshMatch[2]);
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() === "github.com") {
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length >= 2) return normalizeGitHubPath(parts[0], parts[1]);
    }
  } catch {
    // Fall back to generic normalization below.
  }

  return stripGitSuffix(trimmed).toLowerCase();
}

function normalizeGitHubPath(owner: string, repo: string): string {
  return `github.com/${owner.toLowerCase()}/${stripGitSuffix(repo).toLowerCase()}`;
}

function stripGitSuffix(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function mapGitRepositorySuggestion(row: QueryResultRow): GitRepositorySuggestion {
  return {
    repositoryUrl: String(row.repository_url),
    normalizedRepositoryUrl: String(row.normalized_repository_url),
    defaultSourceBranch: row.default_source_branch ? String(row.default_source_branch) : undefined,
    defaultTargetBranch: row.default_target_branch ? String(row.default_target_branch) : undefined,
    lastSourceBranch: row.last_source_branch ? String(row.last_source_branch) : undefined,
    lastUsedAt: toIsoString(row.last_used_at),
    previouslyUsedByWorker: Boolean(row.previously_used_by_worker)
  };
}

function mapGitRepository(row: QueryResultRow): GitRepository {
  return {
    repositoryUrl: String(row.repository_url),
    normalizedRepositoryUrl: String(row.normalized_repository_url),
    defaultSourceBranch: String(row.default_source_branch),
    defaultTargetBranch: String(row.default_target_branch),
    lastSourceBranch: row.last_source_branch ? String(row.last_source_branch) : undefined,
    enabled: Boolean(row.enabled),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    lastUsedAt: toIsoString(row.last_used_at)
  };
}

function mapWorkerRepositoryUsage(row: QueryResultRow): WorkerRepositoryUsage {
  return {
    workerId: String(row.worker_id),
    repositoryUrl: String(row.repository_url),
    normalizedRepositoryUrl: String(row.normalized_repository_url),
    localPath: row.local_path ? String(row.local_path) : undefined,
    lastSourceBranch: row.last_source_branch ? String(row.last_source_branch) : undefined,
    lastUsedAt: toIsoString(row.last_used_at)
  };
}

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanBranch(value: string | undefined): string {
  return clean(value).replace(/^refs\/heads\//, "");
}
