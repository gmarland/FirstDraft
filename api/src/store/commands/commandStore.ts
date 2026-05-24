import { nanoid } from "nanoid";
import { Command, CommandMode } from "../../types.js";
import { DbClient } from "../../db/dbClient.js";
import type { CancelCommandInput, CommandOutputMetadataInput, CompleteCommandInput } from "../clientStore.js";
import { mapCommand } from "./commandRowMappers.js";

export type CreateQueuedCommandInput = {
  userId: string;
  workerId?: string;
  command: string;
  commandMode?: CommandMode;
  executionCommand?: string;
  repositoryUrl?: string;
  normalizedRepositoryUrl?: string;
};

export class CommandStore {
  public constructor(private readonly pool: DbClient) {}

  public async createWorkerCommand(
    userId: string,
    workerId: string,
    command: string,
    commandMode: CommandMode = "ai",
    executionCommand?: string
  ): Promise<Command> {
    return this.createQueuedCommand({
      userId,
      workerId,
      command,
      commandMode,
      executionCommand
    });
  }

  public async createQueuedCommand(input: CreateQueuedCommandInput): Promise<Command> {
    const result = await this.pool.query(
      `
        insert into client_commands (
          transaction_id,
          user_id,
          worker_id,
          command,
          execution_command,
          command_mode,
          repository_url,
          normalized_repository_url,
          status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')
        returning ${commandColumns}
      `,
      [
        nanoid(),
        input.userId,
        input.workerId ?? null,
        input.command,
        input.executionCommand ?? null,
        input.commandMode ?? "ai",
        input.repositoryUrl ?? null,
        input.normalizedRepositoryUrl ?? null
      ]
    );

    return mapCommand(result.rows[0]);
  }

  public async getWorkerCommand(transactionId: string): Promise<Command | undefined> {
    const result = await this.pool.query(
      `
        select ${commandColumns}
        from client_commands
        where transaction_id = $1
      `,
      [transactionId]
    );

    return result.rows[0] ? mapCommand(result.rows[0]) : undefined;
  }

  public async getQueuedWorkerCommands(workerId: string): Promise<Command[]> {
    const result = await this.pool.query(
      `
        select ${commandColumns}
        from client_commands
        where worker_id = $1 and status = 'queued'
        order by created_at
      `,
      [workerId]
    );

    return result.rows.map(mapCommand);
  }

  public async getDispatchableQueuedCommands(workerId: string, workerSkills: string[]): Promise<Command[]> {
    const supportsGitflow = workerSkills.map((skill) => skill.toLowerCase()).includes("git");
    const result = await this.pool.query(
      `
        select ${prefixedCommandColumns},
          worker_repos.normalized_repository_url is not null as worker_repository_match
        from client_commands commands
        left join worker_git_repositories worker_repos
          on worker_repos.worker_id = $1
          and worker_repos.normalized_repository_url = commands.normalized_repository_url
        where commands.status = 'queued'
          and (commands.worker_id = $1 or commands.worker_id is null)
          and (
            commands.command_mode in ('ai', 'shell')
            or ($2::boolean and commands.command_mode = 'gitflow')
          )
        order by
          case when commands.worker_id = $1 then 0 else 1 end,
          case when worker_repos.normalized_repository_url is not null then 0 else 1 end,
          commands.created_at
      `,
      [workerId, supportsGitflow]
    );

    return result.rows.map(mapCommand);
  }

  public async getInProgressWorkerCommands(workerId: string): Promise<Command[]> {
    const result = await this.pool.query(
      `
        select ${commandColumns}
        from client_commands
        where worker_id = $1 and status = 'in_progress'
        order by claimed_at, created_at
      `,
      [workerId]
    );

    return result.rows.map(mapCommand);
  }

  public async getInProgressWorkerCommandsByWorkerIds(workerIds: string[]): Promise<Map<string, Command[]>> {
    const commandsByWorkerId = new Map<string, Command[]>();
    if (workerIds.length === 0) return commandsByWorkerId;

    const result = await this.pool.query(
      `
        select ${commandColumns}
        from client_commands
        where worker_id = any($1::text[])
          and status = 'in_progress'
        order by worker_id, claimed_at, created_at
      `,
      [workerIds]
    );

    for (const command of result.rows.map(mapCommand)) {
      if (!command.workerId) continue;
      const workerCommands = commandsByWorkerId.get(command.workerId) ?? [];
      workerCommands.push(command);
      commandsByWorkerId.set(command.workerId, workerCommands);
    }

    return commandsByWorkerId;
  }

  public async listWorkerCommands(workerId: string): Promise<Command[]> {
    const result = await this.pool.query(
      `
        select ${commandColumns}
        from client_commands
        where worker_id = $1
        order by created_at desc
      `,
      [workerId]
    );

    return result.rows.map(mapCommand);
  }

  public async markWorkerCommandInProgress(command: Command, workerId?: string): Promise<Command | undefined> {
    const assignedWorkerId = workerId ?? command.workerId;
    if (!assignedWorkerId) return undefined;

    const result = await this.pool.query(
      `
        update client_commands
        set worker_id = $2,
          status = 'in_progress',
          claimed_at = now()
        where transaction_id = $1
          and status = 'queued'
          and (worker_id is null or worker_id = $2)
        returning ${commandColumns}
      `,
      [command.transactionId, assignedWorkerId]
    );

    return result.rows[0] ? mapCommand(result.rows[0]) : undefined;
  }

  public async recordWorkerCommandOutputMetadata(input: CommandOutputMetadataInput): Promise<Command> {
    const result = await this.pool.query(
      `
        update client_commands
        set output_object_key = $2,
          output_bytes = $3,
          output_started_at = $4,
          output_updated_at = $5
        where transaction_id = $1
          and ($6::text is null or worker_id = $6)
        returning ${commandColumns}
      `,
      [
        input.transactionId,
        input.outputObjectKey,
        input.outputBytes,
        input.outputStartedAt ?? null,
        input.outputUpdatedAt ?? null,
        input.workerId ?? null
      ]
    );

    if (!result.rows[0]) {
      throw new Error("command not found");
    }

    return mapCommand(result.rows[0]);
  }

  public async completeWorkerCommand(input: CompleteCommandInput): Promise<Command> {
    const result = await this.pool.query(
      `
        update client_commands
        set result = $2,
          agent_response = $3,
          error_message = $4,
          status = case when $4::text is null then 'completed' else 'failed' end,
          completed_at = now()
        where transaction_id = $1
          and ($5::text is null or worker_id = $5)
          and status = 'in_progress'
        returning ${commandColumns}
      `,
      [input.transactionId, input.result, input.agentResponse ?? null, input.errorMessage, input.workerId ?? null]
    );

    if (!result.rows[0]) {
      const existing = await this.pool.query(
        `
          select ${commandColumns}
          from client_commands
          where transaction_id = $1
            and ($2::text is null or worker_id = $2)
        `,
        [input.transactionId, input.workerId ?? null]
      );

      if (!existing.rows[0]) {
        throw new Error("command not found");
      }

      return mapCommand(existing.rows[0]);
    }

    return mapCommand(result.rows[0]);
  }

  public async cancelWorkerCommand(input: CancelCommandInput): Promise<Command> {
    const result = await this.pool.query(
      `
        update client_commands
        set status = 'failed',
          error_message = $3,
          completed_at = now()
        where transaction_id = $1
          and ($2::text is null or worker_id = $2)
          and status in ('queued', 'in_progress')
        returning ${commandColumns}
      `,
      [input.transactionId, input.workerId ?? null, input.reason]
    );

    if (result.rows[0]) {
      return mapCommand(result.rows[0]);
    }

    const existing = await this.pool.query(
      `
        select ${commandColumns}
        from client_commands
        where transaction_id = $1
          and ($2::text is null or worker_id = $2)
      `,
      [input.transactionId, input.workerId ?? null]
    );

    if (!existing.rows[0]) {
      throw new Error("command not found");
    }

    return mapCommand(existing.rows[0]);
  }

  public async failStuckWorkerCommands(timeoutMinutes: number): Promise<Command[]> {
    const result = await this.pool.query(
      `
        update client_commands
        set status = 'failed',
          error_message = $2,
          completed_at = now()
        where status = 'in_progress'
          and claimed_at is not null
          and claimed_at < now() - ($1::int * interval '1 minute')
        returning ${commandColumns}
      `,
      [timeoutMinutes, `command cancelled after being in progress for more than ${timeoutMinutes} minutes`]
    );

    return result.rows.map(mapCommand);
  }
}

const commandColumnNames = [
  "transaction_id",
  "user_id",
  "worker_id",
  "command",
  "execution_command",
  "command_mode",
  "repository_url",
  "normalized_repository_url",
  "status",
  "result",
  "agent_response",
  "error_message",
  "output_object_key",
  "output_bytes",
  "output_started_at",
  "output_updated_at",
  "created_at",
  "claimed_at",
  "completed_at"
];

const commandColumns = commandColumnNames.join(", ");
const prefixedCommandColumns = commandColumnNames
  .map((column) => `commands.${column}`)
  .join(", ");
