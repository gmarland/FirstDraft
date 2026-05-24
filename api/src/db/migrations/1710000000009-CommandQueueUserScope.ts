import { MigrationInterface, QueryRunner } from "typeorm";

export class CommandQueueUserScope1710000000009 implements MigrationInterface {
  public readonly name = "CommandQueueUserScope1710000000009";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create index if not exists client_commands_queue_user_idx
        on client_commands(status, user_id, worker_id, command_mode, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop index if exists client_commands_queue_user_idx;
    `);
  }
}
