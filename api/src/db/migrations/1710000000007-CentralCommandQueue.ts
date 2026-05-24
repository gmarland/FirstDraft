import { MigrationInterface, QueryRunner } from "typeorm";

export class CentralCommandQueue1710000000007 implements MigrationInterface {
  public readonly name = "CentralCommandQueue1710000000007";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_commands
        alter column worker_id drop not null,
        add column if not exists repository_url text,
        add column if not exists normalized_repository_url text;

      create index if not exists client_commands_queue_idx
        on client_commands(status, worker_id, command_mode, created_at);

      create index if not exists client_commands_repository_idx
        on client_commands(normalized_repository_url);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop index if exists client_commands_repository_idx;
      drop index if exists client_commands_queue_idx;

      update client_commands
      set worker_id = 'unassigned'
      where worker_id is null;

      alter table client_commands
        alter column worker_id set not null,
        drop column if exists normalized_repository_url,
        drop column if exists repository_url;
    `);
  }
}
