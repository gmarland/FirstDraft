import { nanoid } from "nanoid";
import { Command, CommandMode, PaginatedCommands } from "../../types.js";
import { DbClient } from "../../db/dbClient.js";
import type { CancelCommandInput, CommandOutputMetadataInput, CommandPagination, CompleteCommandInput, TaskQueueQuery } from "../clientStore.js";
import { commandColumns, mapCommand, prefixedCommandColumns } from "./commandRowMappers.js";
import { buildTaskSummary } from "./commandSummary.js";

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
    const transactionId = nanoid();
    const result = await this.pool.query(
      `
        insert into client_commands (
          transaction_id,
          user_id,
          worker_id,
          command,
          task_summary,
          execution_command,
          command_mode,
          repository_url,
          normalized_repository_url,
          status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued')
        returning ${commandColumns}
      `,
      [
        transactionId,
        input.userId,
        input.workerId ?? null,
        input.command,
        buildTaskSummary(input.command, input.commandMode ?? "ai"),
        input.executionCommand ?? null,
        input.commandMode ?? "ai",
        input.repositoryUrl ?? null,
        input.normalizedRepositoryUrl ?? null
      ]
    );

    await this.pool.query(
      `
        insert into client_command_users (transaction_id, user_id)
        values ($1, $2)
        on conflict do nothing
      `,
      [transactionId, input.userId]
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
        select ${prefixedCommandColumns("commands")},
          worker_repos.normalized_repository_url is not null as worker_repository_match
        from client_commands commands
        inner join client_command_users command_users
          on command_users.transaction_id = commands.transaction_id
        inner join client_workers claiming_worker
          on claiming_worker.worker_id = $1
        left join worker_git_repositories worker_repos
          on worker_repos.worker_id = $1
          and worker_repos.normalized_repository_url = commands.normalized_repository_url
        where commands.status = 'queued'
          and command_users.user_id = claiming_worker.user_id
          and (commands.worker_id = $1 or commands.worker_id is null)
          and (
            commands.command_mode in ('ai', 'shell')
            or (
              $2::boolean
              and commands.command_mode = 'gitflow'
              and commands.normalized_repository_url is not null
              and worker_repos.normalized_repository_url is not null
            )
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

  public async setCommandExecutionCommand(transactionId: string, executionCommand: string): Promise<Command | undefined> {
    const result = await this.pool.query(
      `
        update client_commands
        set execution_command = $2
        where transaction_id = $1
          and status = 'queued'
        returning ${commandColumns}
      `,
      [transactionId, executionCommand]
    );

    return result.rows[0] ? mapCommand(result.rows[0]) : undefined;
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

  public async listWorkerCommands(workerId: string, pagination: CommandPagination): Promise<PaginatedCommands> {
    const offset = pagination.page * pagination.pageSize;
    const [commandsResult, countResult] = await Promise.all([
      this.pool.query(
        `
          select ${commandColumns}
          from client_commands
          where worker_id = $1
          order by created_at desc
          limit $2 offset $3
        `,
        [workerId, pagination.pageSize, offset]
      ),
      this.pool.query(
        `
          select count(*) as total
          from client_commands
          where worker_id = $1
        `,
        [workerId]
      )
    ]);

    return {
      commands: commandsResult.rows.map(mapCommand),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  public async listTaskQueueForUser(userId: string, query: TaskQueueQuery): Promise<PaginatedCommands> {
    const offset = query.page * query.pageSize;
    const commandsResult = await this.pool.query(
      `
        select ${prefixedCommandColumns("commands")},
          worker_owner.id as worker_owner_user_id,
          worker_owner.name as worker_owner_name,
          worker_owner.email as worker_owner_email,
          intake.provider as source_provider,
          intake.source_item_id,
          intake.source_item_key,
          intake.source_item_url,
          count(*) over() as task_queue_total
        from client_commands commands
        inner join client_command_users command_users
          on command_users.transaction_id = commands.transaction_id
        left join client_workers assigned_worker
          on assigned_worker.worker_id = commands.worker_id
        left join users worker_owner
          on worker_owner.id = assigned_worker.user_id
        left join lateral (
          select
            intake_events.provider,
            intake_events.source_item_id,
            intake_events.source_item_key,
            intake_events.source_item_url
          from integration_intake_events intake_events
          where intake_events.transaction_id = commands.transaction_id
          order by
            case when intake_events.status in ('queueing', 'queued', 'processing') then 0 else 1 end,
            intake_events.created_at asc,
            intake_events.id asc
          limit 1
        ) intake on true
        where command_users.user_id = $1
          and commands.status = any($4::text[])
        order by ${taskQueueOrderBy(query)}
        limit $2 offset $3
      `,
      [userId, query.pageSize, offset, query.statuses]
    );

    const total = commandsResult.rows[0]
      ? Number(commandsResult.rows[0].task_queue_total ?? 0)
      : await this.countTaskQueueForUser(userId, query);

    return {
      commands: commandsResult.rows.map(mapCommand),
      total,
      page: query.page,
      pageSize: query.pageSize
    };
  }

  private async countTaskQueueForUser(userId: string, query: TaskQueueQuery): Promise<number> {
    const countResult = await this.pool.query(
      `
        select count(*) as total
        from client_commands
        inner join client_command_users command_users
          on command_users.transaction_id = client_commands.transaction_id
        where command_users.user_id = $1
          and client_commands.status = any($2::text[])
      `,
      [userId, query.statuses]
    );

    return Number(countResult.rows[0]?.total ?? 0);
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
        from client_workers claiming_worker
        inner join client_command_users command_users
          on command_users.user_id = claiming_worker.user_id
        where client_commands.transaction_id = $1
          and claiming_worker.worker_id = $2
          and command_users.transaction_id = client_commands.transaction_id
          and client_commands.status = 'queued'
          and (client_commands.worker_id is null or client_commands.worker_id = $2)
        returning ${prefixedCommandColumns("client_commands")}
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

function taskQueueOrderBy(query: TaskQueueQuery): string {
  if (!query.sortBy) return defaultTaskQueueOrderBy();

  const direction = query.sortDirection === "desc" ? "desc" : "asc";
  const nulls = direction === "desc" ? "nulls last" : "nulls first";
  const tieBreakers = ", commands.created_at asc, commands.transaction_id asc";

  if (query.sortBy === "status") {
    return `${statusPriorityExpression()} ${direction}${tieBreakers}`;
  }

  if (query.sortBy === "source") {
    return `${sourceSortExpression()} ${direction} ${nulls}${tieBreakers}`;
  }

  if (query.sortBy === "task") {
    return `lower(coalesce(commands.task_summary, commands.command, '')) ${direction}${tieBreakers}`;
  }

  if (query.sortBy === "worker") {
    return `lower(coalesce(
      case
        when worker_owner.id is not null and worker_owner.id <> command_users.user_id
          then coalesce(worker_owner.name, worker_owner.email, commands.worker_id)
        else commands.worker_id
      end,
      'Unassigned'
    )) ${direction}${tieBreakers}`;
  }

  if (query.sortBy === "repository") {
    return `lower(coalesce(commands.repository_url, '')) ${direction} ${nulls}${tieBreakers}`;
  }

  return `commands.created_at ${direction}, commands.transaction_id asc`;
}

function defaultTaskQueueOrderBy(): string {
  return `
            ${statusPriorityExpression()} asc,
            case when commands.status in ('completed', 'failed') then commands.completed_at end desc nulls last,
            case when commands.status in ('completed', 'failed') then commands.created_at end desc,
            case when commands.status in ('queued', 'in_progress') then coalesce(commands.claimed_at, commands.created_at) end asc nulls last,
            commands.created_at asc,
            commands.transaction_id asc`;
}

function statusPriorityExpression(): string {
  return `case commands.status
              when 'queued' then 0
              when 'in_progress' then 1
              when 'completed' then 2
              when 'failed' then 3
              else 4
            end`;
}

function sourceSortExpression(): string {
  return `lower(trim(concat(
              coalesce(initcap(intake.provider), case when commands.command_mode = 'gitflow' then 'Manual' else '-' end),
              ' ',
              coalesce(intake.source_item_key, '')
            )))`;
}
