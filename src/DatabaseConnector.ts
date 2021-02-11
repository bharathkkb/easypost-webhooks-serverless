import mysql, { Connection, ConnectionOptions, OkPacket } from 'mysql2/promise'
import { getYyyymmdd } from './CloudTime';
import { getLatestSecret } from './SecretsManager';
import { Nullable } from './Types';

export const getConnection = async (): Promise<Connection> => {
  // copy resourceId from secrets-manager (latest will auto get rotated secrets)
  // TODO: you may want to deploy this secretName (not secret) as an environment variable.
  const secretName = 'your-mysql-production-password';
  const password: string = await getLatestSecret(secretName)
  const options: ConnectionOptions = (process.env.CLOUD_SQL_CONNECTION_NAME !== undefined)
    ? {
      user: process.env.DB_USER,
      password,
      database: process.env.DB_NAME,
      // If connecting via unix domain socket, specify the path
      socketPath: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
    } : {
      user: process.env.DB_USER,
      password: process.env.DB_PASS ?? password,
      database: process.env.DB_NAME,
      // If connecting via TCP, enter the IP and port instead
      host: process.env.DB_HOST,
      port: process.env.DB_PORT === undefined ? undefined : Number(process.env.DB_PORT),
      // debug: true,
    }

  return await mysql.createConnection(options);
}

/**
 * Logs an error if it could not detect that a single row was updated.
 * Gracefully continues, which in many cases is not the proper course of action.
 *
 * @param conn connection to run query
 * @param sql parameterized query
 * @param parameterValues values for query parameters
 */
export const executeSingleRowModifiedQuery = async (connection: Connection, sql: string, parameterValues: (string | number | Date)[]): Promise<number | undefined> => {
  const updateTransactionsResults = await connection.execute(sql, parameterValues);

  if (Array.isArray(updateTransactionsResults) && updateTransactionsResults.length > 0) {
    const rowsAffected = (updateTransactionsResults[0] as OkPacket).affectedRows;
    if (rowsAffected !== 1) {
      // https://dev.mysql.com/doc/refman/8.0/en/insert-on-duplicate.html
      // With ON DUPLICATE KEY UPDATE, the affected-rows value per row is:
      // - 1 if the row is inserted as a new row,
      // - 2 if an existing row is updated, and
      // - 0 if an existing row is set to its current values.
      if (sql.indexOf('ON DUPLICATE KEY') === -1) {
        console.error(`Expected sql('${sql}' {${parameterValues.join(', ')}}) to have affectedRows === 1 (was: ${rowsAffected})`);
      }
    }

    return rowsAffected;
  }
  else {
    console.error('Not array or empty array:', updateTransactionsResults);
    return undefined;
  }
}

/**
 * Returns the number of affected rows - Up to caller to decide course of action (returns undefined for unexpected response)
 * Gracefully continues, which in many cases is not the proper course of action.
 *
 * @param conn connection to run query
 * @param sql parameterized query
 * @param parameterValues values for query parameters
 */
export const executeMultipleRowsModifiedQuery = async (connection: Connection, sql: string, parameterValues: (string | number)[]): Promise<number | undefined> => {
  const updateTransactionsResults = await connection.execute(sql, parameterValues);

  if (Array.isArray(updateTransactionsResults) && updateTransactionsResults.length > 0) {
    return (updateTransactionsResults[0] as OkPacket).affectedRows;
  }
  else {
    console.error('Not array or empty array:', updateTransactionsResults);
    return undefined;
  }
}

/**
 * Executes a parameterized INSERT statement and returns the ID of the new row from the AUTO_INCREMENT column.
 */
export const executeSingleRowInsertAutoIncrement = async (connection: Connection, sql: string, parameterValues: (string | number | null)[]): Promise<number | undefined> => {
  const updateTransactionsResults = await connection.execute(sql, parameterValues);

  if (Array.isArray(updateTransactionsResults) && updateTransactionsResults.length > 0) {
    const rowsAffected = (updateTransactionsResults[0] as any).affectedRows;
    if (rowsAffected !== 1) {
      console.error(`Expected sql('${sql}' {${parameterValues.join(', ')}}) to have affectedRows === 1 (was: ${rowsAffected})`);
      return undefined;
    }

    return (updateTransactionsResults[0] as any).insertId;
  }
  else {
    console.error('Not array or empty array:', updateTransactionsResults);
    return undefined;
  }
}

/**
 * Inserts a new row in `task_storage` table.  Id for newly created row is returned.
 */
export const addTaskStorage = async (
  connection: Connection,
  queueName: string,
  taskId: string,
  storageContents: string
): Promise<number | undefined> => {
  const rowId = await executeSingleRowInsertAutoIncrement(
    connection,
    'INSERT INTO task_storage (queue_name, task_id, storage_contents) VALUES (?, ?, ?);',
    [
      queueName,
      taskId,
      storageContents
    ]
  );

  return rowId;
}

export const setTaskStorageTaskCreated = async (connection: Connection, taskStorageId: number): Promise<boolean> => {
  // `id` is PK
  const sql = `UPDATE task_storage
        SET task_created=1
        WHERE id=?;`;
  const parameterValues = [
    taskStorageId
  ];
  const rowsAffected = await executeSingleRowModifiedQuery(connection, sql, parameterValues);
  return rowsAffected === 1;
}

/**
 * After successful task completion, ensures the file will not be processed twice (although concurrency itself is not managed in that manner)
 */
export const setTaskStorageProcessed = async (connection: Connection, taskStorageId: number): Promise<boolean> => {
  // `id` is PK
  const sql = `UPDATE task_storage
        SET processed=1
        WHERE id=?;`;
  const parameterValues = [
    taskStorageId
  ];
  const rowsAffected = await executeSingleRowModifiedQuery(connection, sql, parameterValues);
  return rowsAffected === 1;
}

export type TaskStorage = {
  queue_name: string,
  task_id: string,
  storage_contents: string,
  processed: number
}

/**
 * To allow the Storage Tasks to contain more payload (there is a limit on Google Queue) this table was introduced.
 *
 * @param connection db connection
 * @param taskStorageId id for the storage task
 */
export const getTaskStorage = async (connection: Connection, taskStorageId: number): Promise<Nullable<TaskStorage>> => {
  // id is unique
  const [rows] = await connection.execute(
    'SELECT queue_name, task_id, storage_contents, processed FROM task_storage WHERE `id`=?;',
    [taskStorageId]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows[0] as TaskStorage;
}
