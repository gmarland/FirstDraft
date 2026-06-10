import { MigrationInterface, QueryRunner } from "typeorm";

export class NullableWorkerOwnership1710000000001 implements MigrationInterface {
  name = "NullableWorkerOwnership1710000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table worker_refresh_tokens
        alter column user_id drop not null
    `);
    await queryRunner.query(`
      alter table client_workers
        alter column user_id drop not null
    `);
    await queryRunner.query(`
      alter table worker_jira_integrations
        alter column user_id drop not null
    `);
    await queryRunner.query(`
      alter table client_commands
        alter column user_id drop not null
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_commands
        alter column user_id set not null
    `);
    await queryRunner.query(`
      alter table worker_jira_integrations
        alter column user_id set not null
    `);
    await queryRunner.query(`
      alter table client_workers
        alter column user_id set not null
    `);
    await queryRunner.query(`
      alter table worker_refresh_tokens
        alter column user_id set not null
    `);
  }
}
