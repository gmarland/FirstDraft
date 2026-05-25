import { MigrationInterface, QueryRunner } from "typeorm";
import { buildTaskSummary } from "../../store/commands/commandSummary.js";
import type { CommandMode } from "../../types.js";

type CommandSummaryRow = {
  transaction_id: string;
  command: string;
  command_mode: string;
};

export class CommandTaskSummary1710000000012 implements MigrationInterface {
  public readonly name = "CommandTaskSummary1710000000012";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_commands
        add column if not exists task_summary text;
    `);

    const rows = await queryRunner.query(`
      select transaction_id, command, command_mode
      from client_commands
      where task_summary is null
    `) as CommandSummaryRow[];

    for (const row of rows) {
      const commandMode = row.command_mode === "shell" || row.command_mode === "gitflow"
        ? row.command_mode
        : "ai";
      await queryRunner.query(
        `
          update client_commands
          set task_summary = $2
          where transaction_id = $1
        `,
        [row.transaction_id, buildTaskSummary(row.command, commandMode as CommandMode)]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_commands
        drop column if exists task_summary;
    `);
  }
}
