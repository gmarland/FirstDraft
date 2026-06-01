import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveWorkerEnabled1770000000000 implements MigrationInterface {
  public readonly name = "RemoveWorkerEnabled1770000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers drop column if exists enabled;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        add column if not exists enabled boolean not null default true;
    `);
  }
}
