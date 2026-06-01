import { MigrationInterface, QueryRunner } from "typeorm";

export class NullableWorkerMaxConcurrentTasks1780000000000 implements MigrationInterface {
  public readonly name = "NullableWorkerMaxConcurrentTasks1780000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        alter column max_concurrent_tasks drop not null,
        alter column max_concurrent_tasks set default 1;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      update client_workers
      set max_concurrent_tasks = 1
      where max_concurrent_tasks is null;
    `);

    await queryRunner.query(`
      alter table client_workers
        alter column max_concurrent_tasks set not null,
        alter column max_concurrent_tasks set default 1;
    `);
  }
}
