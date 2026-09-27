export interface Db {
  query(sql: string, params: unknown[]): Promise<void>;
}
