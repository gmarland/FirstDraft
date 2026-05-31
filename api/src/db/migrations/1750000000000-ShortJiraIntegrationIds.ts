import { MigrationInterface, QueryRunner } from "typeorm";

export class ShortJiraIntegrationIds1750000000000 implements MigrationInterface {
  public readonly name = "ShortJiraIntegrationIds1750000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      delete from integration_intake_event_users;
      delete from worker_jira_integrations;

      alter table worker_jira_integrations
        alter column integration_id type text using integration_id::text;

      alter table integration_intake_event_users
        alter column integration_id type text using integration_id::text;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      delete from integration_intake_event_users;
      delete from worker_jira_integrations;

      alter table worker_jira_integrations
        alter column integration_id type uuid using integration_id::uuid;

      alter table integration_intake_event_users
        alter column integration_id type uuid using integration_id::uuid;
    `);
  }
}
