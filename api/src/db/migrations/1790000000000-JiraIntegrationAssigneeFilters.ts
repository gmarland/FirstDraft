import { MigrationInterface, QueryRunner } from "typeorm";

export class JiraIntegrationAssigneeFilters1790000000000 implements MigrationInterface {
  public readonly name = "JiraIntegrationAssigneeFilters1790000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table worker_jira_integrations
        add column if not exists assignee_account_ids text[] not null default '{}',
        add column if not exists assignee_display_names text[] not null default '{}',
        add column if not exists assignee_email_addresses text[] not null default '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table worker_jira_integrations
        drop column if exists assignee_email_addresses,
        drop column if exists assignee_display_names,
        drop column if exists assignee_account_ids;
    `);
  }
}
