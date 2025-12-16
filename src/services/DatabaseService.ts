/**
 * MySQL Database Service for MCP Server
 * 
 * Copyright (c) 2024 Darshan Hanumanthappa
 * Licensed under the MIT License
 */

import mysql from 'mysql2/promise';

export class DatabaseService {
  private pool: mysql.Pool;
  private currentDatabase: string | null = null;

  constructor(config: {
    host: string;
    port: number;
    user: string;
    password: string;
    database?: string;
    ssl?: boolean;
  }) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    this.currentDatabase = config.database || null;
    console.error('[DEBUG] MySQL DatabaseService initialized');
    console.error(`[DEBUG] Connected to: ${config.host}:${config.port}`);
  }

  /**
   * Execute a SQL query
   */
  async query(sql: string, params: any[] = []): Promise<any> {
    try {
      console.error(`[DEBUG] Executing query: ${sql.substring(0, 100)}...`);
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error: any) {
      console.error(`[ERROR] Database query failed:`, error.message);
      throw error;
    }
  }

  /**
   * List all databases
   */
  async listDatabases(): Promise<string[]> {
    const result = await this.query('SHOW DATABASES');
    return result.map((row: any) => row.Database);
  }

  /**
   * Switch to a different database
   */
  async useDatabase(dbName: string): Promise<void> {
    await this.query(`USE ${dbName}`);
    this.currentDatabase = dbName;
    console.error(`[DEBUG] Switched to database: ${dbName}`);
  }

  /**
   * List all tables in current database
   */
  async listTables(database?: string): Promise<string[]> {
    if (database) {
      const result = await this.query(`SHOW TABLES FROM \`${database}\``);
      const key = `Tables_in_${database}`;
      return result.map((row: any) => row[key]);
    } else if (this.currentDatabase) {
      const result = await this.query('SHOW TABLES');
      const key = `Tables_in_${this.currentDatabase}`;
      return result.map((row: any) => row[key]);
    } else {
      throw new Error('No database selected. Please specify a database or use useDatabase()');
    }
  }

  /**
   * Get table schema
   */
  async getTableSchema(tableName: string, database?: string): Promise<any> {
    const dbClause = database ? `FROM \`${database}\`` : '';
    const result = await this.query(`DESCRIBE ${dbClause} \`${tableName}\``);
    return result;
  }

  /**
   * Get detailed table information
   */
  async getTableInfo(tableName: string, database?: string): Promise<any> {
    const dbName = database || this.currentDatabase;
    if (!dbName) {
      throw new Error('No database specified');
    }

    const sql = `
      SELECT 
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        COLUMN_KEY,
        COLUMN_DEFAULT,
        EXTRA,
        COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `;
    
    return await this.query(sql, [dbName, tableName]);
  }

  /**
   * Get table row count
   */
  async getTableRowCount(tableName: string, database?: string): Promise<number> {
    const dbPrefix = database ? `\`${database}\`.` : '';
    const result = await this.query(`SELECT COUNT(*) as count FROM ${dbPrefix}\`${tableName}\``);
    return result[0].count;
  }

  /**
   * Execute a safe SELECT query with limits
   */
  async safeSelect(
    tableName: string,
    options: {
      columns?: string[];
      where?: string;
      orderBy?: string;
      limit?: number;
      database?: string;
    } = {}
  ): Promise<any> {
    const {
      columns = ['*'],
      where,
      orderBy,
      limit = 100,
      database
    } = options;

    // Sanitize table name
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      throw new Error('Invalid table name');
    }

    const dbPrefix = database ? `\`${database}\`.` : '';
    const columnsList = columns.join(', ');
    let sql = `SELECT ${columnsList} FROM ${dbPrefix}\`${tableName}\``;
    
    if (where) {
      sql += ` WHERE ${where}`;
    }
    
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }
    
    sql += ` LIMIT ${limit}`;

    return await this.query(sql);
  }

  /**
   * Search across table columns
   */
  async searchTable(
    tableName: string,
    searchTerm: string,
    database?: string,
    limit: number = 50
  ): Promise<any> {
    // Get table schema first
    const schema = await this.getTableInfo(tableName, database);
    
    // Build search conditions for text columns
    const textColumns = schema
      .filter((col: any) => 
        col.COLUMN_TYPE.includes('char') || 
        col.COLUMN_TYPE.includes('text')
      )
      .map((col: any) => col.COLUMN_NAME);

    if (textColumns.length === 0) {
      throw new Error('No searchable text columns found in table');
    }

    const whereConditions = textColumns
      .map((col: string) => `\`${col}\` LIKE ?`)
      .join(' OR ');

    const dbPrefix = database ? `\`${database}\`.` : '';
    const sql = `
      SELECT * FROM ${dbPrefix}\`${tableName}\`
      WHERE ${whereConditions}
      LIMIT ${limit}
    `;

    const params = textColumns.map(() => `%${searchTerm}%`);
    return await this.query(sql, params);
  }

  /**
   * Get recent records from a table
   */
  async getRecentRecords(
    tableName: string,
    options: {
      timestampColumn?: string;
      limit?: number;
      database?: string;
    } = {}
  ): Promise<any> {
    const {
      timestampColumn = 'created_at',
      limit = 50,
      database
    } = options;

    return await this.safeSelect(tableName, {
      orderBy: `${timestampColumn} DESC`,
      limit,
      database
    });
  }

  /**
   * Execute a custom query (read-only, SELECT only)
   */
  async executeReadOnlyQuery(sql: string, params: any[] = []): Promise<any> {
    // Security: Only allow SELECT queries
    const trimmedSql = sql.trim().toLowerCase();
    if (!trimmedSql.startsWith('select') && !trimmedSql.startsWith('show') && !trimmedSql.startsWith('describe')) {
      throw new Error('Only SELECT, SHOW, and DESCRIBE queries are allowed for security reasons');
    }

    return await this.query(sql, params);
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(database?: string): Promise<any> {
    const dbName = database || this.currentDatabase;
    if (!dbName) {
      throw new Error('No database specified');
    }

    const sql = `
      SELECT 
        TABLE_NAME,
        TABLE_ROWS,
        DATA_LENGTH,
        INDEX_LENGTH,
        (DATA_LENGTH + INDEX_LENGTH) as TOTAL_SIZE
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TOTAL_SIZE DESC
    `;

    return await this.query(sql, [dbName]);
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
    console.error('[DEBUG] Database connection pool closed');
  }
}

