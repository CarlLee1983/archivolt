declare module 'mysql2/promise' {
  interface Connection {
    query(sql: string): Promise<[unknown[], unknown]>
    end(): Promise<void>
  }
  function createConnection(url: string): Promise<Connection>
}
