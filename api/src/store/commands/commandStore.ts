import { nanoid } from "nanoid";
import { Command, CommandMode } from "../../types.js";
import { DbClient } from "../../db/dbClient.js";
import type { CancelCommandInput, CommandOutputMetadataInput, CompleteCommandInput } from "../clientStore.js";
import { mapCommand } from "./commandRowMappers.js";

export class CommandStore {
  public constructor(private readonly pool: DbClient) {}

  public async createWorkerCommand(
    userId: string,
    workerId: string,
    command: string,
    commandMode: CommandMode = "ai",
    executionCommand?: string
  ): Promise<Command> {
    const result = await this.pool.query(
      `
        insert into client_commands (transaction_id, user_id, worker_id, command, execution_command, command_mode, status)
        values ($1, $2, $3, $4, $6, $5, 'queued')
          returning transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
      `,
      [nanoid(), userId, workerId, command, commandMode, executionCommand ?? null]
    );

    return mapCommand(result.rows[0]);
  }

  public async getWorkerCommand(transactionId: string): Promise<Command | undefined> {
    const result = await this.pool.query(
      `
        select transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
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
        select transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
        from client_commands
        where worker_id = $1 and status = 'queued'
        order by created_at
      `,
      [workerId]
    );

    return result.rows.map(mapCommand);
  }

  public async getInProgressWorkerCommands(workerId: string): Promise<Command[]> {
    const result = await this.pool.query(
      `
        select transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
        from client_commands
        where worker_id = $1 and status = 'in_progress'
        order by claimed_at, created_at
      `,
      [workerId]
    );

    return result.rows.map(mapCommand);
  }

  public async listWorkerCommands(workerId: string): Promise<Command[]> {
    const result = await this.pool.query(
      `
        select transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
        from client_commands
        where worker_id = $1
        order by created_at desc
      `,
      [workerId]
    );

    return result.rows.map(mapCommand);
  }

  public async markWorkerCommandInProgress(command: Command): Promise<Command | undefined> {
    const result = await this.pool.query(
      `
        update client_commands
        set status = 'in_progress', claimed_at = now()
        where transaction_id = $1 and status = 'queued'
        returning transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
      `,
      [command.transactionId]
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
        returning transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
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
        returning transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
      `,
      [input.transactionId, input.result, input.agentResponse ?? null, input.errorMessage, input.workerId ?? null]
    );

    if (!result.rows[0]) {
      const existing = await this.pool.query(
        `
          select transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
            output_object_key, output_bytes, output_started_at, output_updated_at,
            created_at, claimed_at, completed_at
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
        returning transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
      `,
      [input.transactionId, input.workerId ?? null, input.reason]
    );

    if (result.rows[0]) {
      return mapCommand(result.rows[0]);
    }

    const existing = await this.pool.query(
      `
        select transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
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
        returning transaction_id, user_id, worker_id, command, execution_command, command_mode, status, result, agent_response, error_message,
          output_object_key, output_bytes, output_started_at, output_updated_at,
          created_at, claimed_at, completed_at
      `,
      [timeoutMinutes, `command cancelled after being in progress for more than ${timeoutMinutes} minutes`]
    );

    return result.rows.map(mapCommand);
  }
}
