import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkerTaskTypes1710000000007 implements MigrationInterface {
  public readonly name = "WorkerTaskTypes1710000000007";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        add column if not exists enabled_task_types text[] not null default '{ai,shell,gitflow}';

      update client_workers
      set enabled_task_types = '{ai,shell,gitflow}'
      where enabled_task_types is null
        or cardinality(enabled_task_types) = 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        drop column if exists enabled_task_types;
    `);
  }
}
