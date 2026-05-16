import { DatabaseConnection } from 'kysely';
import Database from 'better-sqlite3';

/**
 * Config for the SQLite dialect.
 */
export interface BunSqliteDialectConfig {
    /**
     * A better-sqlite3 Database instance.
     */
    database: Database.Database;

    /**
     * Called once when the first query is executed.
     */
    onCreateConnection?: (connection: DatabaseConnection) => Promise<void>;
}
