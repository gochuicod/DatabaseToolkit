import sql from "mssql";

// ── Direct SQL Server connection pool ────────────────────────────────
// Bypasses Metabase HTTP overhead for data-heavy queries.
// Credentials loaded from environment variables (see .env).

let pool: sql.ConnectionPool | null = null;

function getConfig(): sql.config {
  return {
    server: process.env.MSSQL_SERVER || "127.0.0.1",
    port: parseInt(process.env.MSSQL_PORT || "1483", 10),
    user: process.env.MSSQL_USER || "sa",
    password: process.env.MSSQL_PASSWORD || "",
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
    connectionTimeout: 30000,
    requestTimeout: 120000,
    pool: {
      min: 1,
      max: 10,
      idleTimeoutMillis: 60000,
    },
  };
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  if (pool) {
    try {
      await pool.close();
    } catch {
      /* ignore */
    }
    pool = null;
  }
  pool = await sql.connect(getConfig());
  pool.on("error", (err) => {
    console.error("MSSQL pool error:", err);
    pool = null;
  });
  return pool;
}

export interface DirectQueryResult {
  columns: Array<{ name: string; type?: string }>;
  rows: any[][];
  rowCount: number;
}

/**
 * Run a raw SQL query directly against SQL Server.
 * Returns columns + rows in the same shape as Metabase's runNativeQuery.
 */
export async function runDirectQuery(
  querySql: string,
): Promise<DirectQueryResult> {
  const p = await getPool();
  const result = await p.request().query(querySql);

  const recordset = result.recordset ?? [];
  const columnMeta = result.recordset?.columns
    ? Object.entries(result.recordset.columns).map(
        ([name, meta]: [string, any]) => ({
          name,
          type: meta?.type?.declaration ?? "text",
        }),
      )
    : [];

  const rows = recordset.map((record: Record<string, any>) =>
    columnMeta.map((col) => record[col.name] ?? null),
  );

  return { columns: columnMeta, rows, rowCount: rows.length };
}

/**
 * Test whether the direct connection is reachable.
 */
export async function testDirectConnection(): Promise<boolean> {
  try {
    const result = await runDirectQuery("SELECT 1 AS ok");
    return result.rows[0]?.[0] === 1;
  } catch {
    return false;
  }
}
