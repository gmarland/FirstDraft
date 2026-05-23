import { DataSource, EntityTarget, ObjectLiteral, Repository } from "typeorm";
import { CloseableDbClient, DbQueryResult } from "./dbClient.js";

export class TypeOrmStoreContext implements CloseableDbClient {
  public constructor(private readonly dataSource: DataSource) {}

  public repository<Entity extends ObjectLiteral>(target: EntityTarget<Entity>): Repository<Entity> {
    return this.dataSource.getRepository(target);
  }

  public async query<T = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[]
  ): Promise<DbQueryResult<T>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      const result = await queryRunner.query(
        sql,
        parameters ? [...parameters] : undefined,
        true
      );

      return {
        rows: result.records as T[],
        rowCount: result.affected ?? result.records.length
      };
    } finally {
      await queryRunner.release();
    }
  }

  public close(): Promise<void> {
    return this.dataSource.destroy();
  }
}
