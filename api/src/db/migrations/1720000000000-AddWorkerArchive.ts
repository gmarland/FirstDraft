import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkerArchive1720000000000 implements MigrationInterface {
  public readonly name = "AddWorkerArchive1720000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        add column if not exists archived_at timestamptz;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        drop column if exists archived_at;
    `);
  }
}
