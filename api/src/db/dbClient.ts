export type DbQueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number | null;
};

export type DbClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[]
  ): Promise<DbQueryResult<T>>;
};

export type CloseableDbClient = DbClient & {
  close(): Promise<void>;
};
