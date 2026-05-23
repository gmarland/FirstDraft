import { MigrationInterface, QueryRunner } from "typeorm";

export class DropRepositoryBranches1710000000002 implements MigrationInterface {
  public readonly name = "DropRepositoryBranches1710000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("drop table if exists user_git_repository_branches;");
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Branch tracking was intentionally removed.
  }
}
