import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveWorkerJiraIntegrationToken1800000000000 implements MigrationInterface {
  public readonly name = "RemoveWorkerJiraIntegrationToken1800000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table worker_jira_integrations
        drop column if exists api_token_encrypted;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table worker_jira_integrations
        add column if not exists api_token_encrypted text;
    `);
  }
}
