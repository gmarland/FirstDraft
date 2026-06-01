import { MigrationInterface, QueryRunner } from "typeorm";

export class GitflowOnlyTaskModel1810000000000 implements MigrationInterface {
  public readonly name = "GitflowOnlyTaskModel1810000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      delete from client_commands
      where command_mode <> 'gitflow';

      update client_workers
      set enabled_task_types = '{gitflow}';

      alter table client_workers
        alter column enabled_task_types set default '{gitflow}';

      alter table client_commands
        alter column command_mode set default 'gitflow';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        alter column enabled_task_types set default '{ai,shell,gitflow}';

      alter table client_commands
        alter column command_mode set default 'ai';
    `);
  }
}
