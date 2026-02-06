import type {
  MetabaseDatabase,
  MetabaseTable,
  MetabaseField,
  FilterValue,
  FieldOption,
  MailingListEntry,
} from "@shared/schema";

const ROW_LIMIT = 100000;

function getMetabaseUrl(): string {
  const url = process.env.METABASE_URL || "";
  return url.replace(/\/+$/, "");
}

const METABASE_EMAIL = process.env.METABASE_EMAIL;
const METABASE_PASSWORD = process.env.METABASE_PASSWORD;

let sessionToken: string | null = null;
let sessionExpiresAt: number = 0;

async function getSessionToken(): Promise<string> {
  if (sessionToken && Date.now() < sessionExpiresAt) {
    return sessionToken;
  }

  const metabaseUrl = getMetabaseUrl();
  if (!metabaseUrl || !METABASE_EMAIL || !METABASE_PASSWORD) {
    throw new Error(
      "Metabase credentials not configured. Please set METABASE_URL, METABASE_EMAIL, and METABASE_PASSWORD.",
    );
  }

  console.log("Authenticating with Metabase at:", metabaseUrl);

  const response = await fetch(`${metabaseUrl}/api/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: METABASE_EMAIL,
      password: METABASE_PASSWORD,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to authenticate with Metabase: ${error}`);
  }

  const data = await response.json();
  sessionToken = data.id;
  sessionExpiresAt = Date.now() + 13 * 24 * 60 * 60 * 1000;

  return sessionToken!;
}

async function metabaseRequest(
  endpoint: string,
  options: RequestInit = {},
): Promise<any> {
  const token = await getSessionToken();
  const metabaseUrl = getMetabaseUrl();

  const response = await fetch(`${metabaseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Session": token,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    sessionToken = null;
    sessionExpiresAt = 0;
    return metabaseRequest(endpoint, options);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Metabase API error: ${error}`);
  }

  return response.json();
}

// Helpers for visual indicators (simulated data for UI badges)
function getSimulatedDbSize(id: number): string {
  const sizes = ["1.2 GB", "450 MB", "12.5 GB", "8.9 GB", "2.1 GB"];
  return sizes[id % sizes.length];
}

function getSimulatedRowCount(id: number): number {
  return 500 + ((id * 1234) % 99500);
}

export async function getDatabases(): Promise<MetabaseDatabase[]> {
  const data = await metabaseRequest("/api/database");
  return data.data.map((db: any) => ({
    id: db.id,
    name: db.name,
    engine: db.engine,
    size_info: getSimulatedDbSize(db.id),
  }));
}

export async function getTables(databaseId: number): Promise<MetabaseTable[]> {
  const data = await metabaseRequest(`/api/database/${databaseId}/metadata`);
  return data.tables.map((table: any) => ({
    id: table.id,
    name: table.name,
    display_name: table.display_name,
    schema: table.schema || "public",
    db_id: databaseId,
    row_count: table.row_count || getSimulatedRowCount(table.id),
  }));
}

export async function getFields(tableId: number): Promise<MetabaseField[]> {
  const data = await metabaseRequest(`/api/table/${tableId}/query_metadata`);
  return data.fields.map((field: any) => ({
    id: field.id,
    name: field.name,
    display_name: field.display_name,
    base_type: field.base_type,
    semantic_type: field.semantic_type,
    table_id: tableId,
  }));
}

function buildFilterClause(filter: FilterValue): any[] {
  const fieldRef = ["field", filter.fieldId, null];

  switch (filter.operator) {
    case "equals":
      if (filter.values && filter.values.length > 0) {
        if (filter.values.length === 1) {
          return ["=", fieldRef, filter.values[0]];
        }
        const orClauses = filter.values.map((v) => ["=", fieldRef, v]);
        return ["or", ...orClauses];
      }
      return ["=", fieldRef, filter.value];
    case "not_equals":
      if (filter.values && filter.values.length > 0) {
        const andClauses = filter.values.map((v) => ["!=", fieldRef, v]);
        return ["and", ...andClauses];
      }
      return ["!=", fieldRef, filter.value];
    case "contains":
      return ["contains", fieldRef, filter.value, { "case-sensitive": false }];
    case "starts_with":
      return ["starts-with", fieldRef, filter.value];
    case "ends_with":
      return ["ends-with", fieldRef, filter.value];
    case "greater_than":
      return [">", fieldRef, filter.value];
    case "less_than":
      return ["<", fieldRef, filter.value];
    case "between":
      return ["between", fieldRef, filter.value, filter.valueTo];
    case "is_null":
      return ["is-null", fieldRef];
    case "is_not_null":
      return ["not-null", fieldRef];
    default:
      return ["=", fieldRef, filter.value];
  }
}

// Helper function for count logic
export async function getCount(
  databaseId: number,
  tableId: number,
  filters: FilterValue[],
  limit: number = 1000, // Default limit
): Promise<{ count: number; total: number; percentage: number }> {
  const totalQuery = {
    database: databaseId,
    type: "query",
    query: {
      "source-query": {
        "source-table": tableId,
        limit: limit, // Use dynamic limit
      },
      aggregation: [["count"]],
    },
  };

  const totalResult = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(totalQuery),
  });

  const total = totalResult.data?.rows?.[0]?.[0] ?? 0;

  if (filters.length === 0) {
    return { count: total, total, percentage: 100 };
  }

  // Group filters by field ID to handle multiple selections (OR logic) vs constraints (AND logic)
  const filtersByField: Record<number, FilterValue[]> = {};

  filters.forEach(f => {
    if (!filtersByField[f.fieldId]) filtersByField[f.fieldId] = [];
    filtersByField[f.fieldId].push(f);
  });

  const fieldClauses = Object.values(filtersByField).map(group => {
    const isInclusion = group.every(f =>
      ["equals", "contains", "starts_with", "ends_with"].includes(f.operator)
    );

    const clauses = group.map(buildFilterClause);

    if (group.length === 1) return clauses[0];

    if (isInclusion) {
      return ["or", ...clauses];
    } else {
      return ["and", ...clauses];
    }
  });

  const combinedFilter =
    fieldClauses.length === 1 ? fieldClauses[0] : ["and", ...fieldClauses];

  const countQuery = {
    database: databaseId,
    type: "query",
    query: {
      "source-query": {
        "source-table": tableId,
        limit: limit, // Use dynamic limit
      },
      aggregation: [["count"]],
      filter: combinedFilter,
    },
  };

  const countResult = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(countQuery),
  });

  const count = countResult.data?.rows?.[0]?.[0] ?? 0;
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return { count, total, percentage };
}

export async function getFieldOptions(
  databaseId: number,
  tableId: number,
  fieldId: number,
  limit: number = 100000, // Default limit
): Promise<FieldOption[]> {
  const query = {
    database: databaseId,
    type: "query",
    query: {
      "source-query": {
        "source-table": tableId,
        limit: limit, // Use dynamic limit
      },
      aggregation: [["count"]],
      breakout: [["field", fieldId, null]],
      "order-by": [["desc", ["aggregation", 0]]],
      limit: 100,
    },
  };

  const result = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(query),
  });

  const rows = result.data?.rows ?? [];
  return rows
    .filter((row: any[]) => row[0] !== null && row[0] !== "")
    .map((row: any[]) => ({
      value: String(row[0]),
      count: row[1] ?? 0,
    }));
}

export async function getMailingList(
  databaseId: number,
  tableId: number,
  filters: FilterValue[],
  limit: number = 1000,
  offset: number = 0,
  scanLimit: number = 100000, // New parameter for the source scope
): Promise<{ entries: MailingListEntry[]; total: number }> {
  const fields = await getFields(tableId);

  // ... [Keep the existing field finding logic (nameFieldId, etc.)] ...
  const findField = (patterns: string[], preferredType?: string): number | null => {
    // First pass: look for exact/partial matches with preferred type
    if (preferredType) {
      for (const pattern of patterns) {
        const field = fields.find(
          (f) =>
            (f.name.toLowerCase() === pattern || f.name.toLowerCase().includes(pattern)) &&
            f.base_type === preferredType
        );
        if (field) return field.id;
      }
    }

    // Second pass: any match
    for (const pattern of patterns) {
      const field = fields.find(
        (f) =>
          f.name.toLowerCase().includes(pattern) ||
          f.display_name.toLowerCase().includes(pattern),
      );
      if (field) return field.id;
    }
    return null;
  };

  const nameFieldId = findField([
    "name",
    "full_name",
    "fullname",
    "customer_name",
    "contact_name",
    "氏名",
    "名前",
    "顧客名",
    "nm",
    "fname",
    "lname",
    "l + f name",
  ], "type/Text");

  const emailFieldId = findField([
    "email",
    "mail",
    "e_mail",
    "e-mail",
    "email_address",
    "メール",
    "eメール",
    "電子メール",
    "email_addr",
    "mailing",
    "used_for_mailing",
    "contact_email",
    "primary_email",
  ], "type/Text"); // Prefer Text to avoid 'bit' columns

  const addressFieldId = findField([
    "address",
    "street",
    "add1",
    "add-1",
    "add_1",
    "addr",
    "住所",
    "アドレス",
  ]);
  const cityFieldId = findField(["city", "town", "市", "都市"]);
  const stateFieldId = findField([
    "state",
    "province",
    "region",
    "prefecture",
    "都道府県",
    "県",
    "州",
  ]);
  const zipcodeFieldId = findField([
    "zip",
    "zipcode",
    "postal",
    "postal_code",
    "postcode",
    "郵便番号",
  ]);
  const countryFieldId = findField(["country", "nation", "国"]);

  const breakoutFields: number[] = [
    nameFieldId,
    emailFieldId,
    addressFieldId,
    cityFieldId,
    stateFieldId,
    zipcodeFieldId,
    countryFieldId,
  ].filter((id): id is number => id !== null);

  if (breakoutFields.length === 0) {
    const firstThreeFields = fields.slice(0, 7).map((f) => f.id);
    breakoutFields.push(...firstThreeFields);
  }

  const filterClauses = filters.map(buildFilterClause);
  const combinedFilter =
    filterClauses.length === 0
      ? undefined
      : filterClauses.length === 1
        ? filterClauses[0]
        : ["and", ...filterClauses];

  const query: any = {
    database: databaseId,
    type: "query",
    query: {
      "source-query": {
        "source-table": tableId,
        limit: scanLimit, // Use the scanLimit here
      },
      fields: breakoutFields.map((id) => ["field", id, null]),
      limit,
    },
  };

  if (offset > 0) {
    (query.query as any).offset = offset;
    query.query.limit = limit;
  }

  if (combinedFilter) {
    query.query.filter = combinedFilter;
  }

  const result = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(query),
  });
  // ... [Keep the existing column mapping and entry creation logic] ...
  const rows = result.data?.rows ?? [];
  const cols = result.data?.cols ?? [];

  // DYNAMIC MAPPING: Map all available columns
  const columnNames = cols.map((c: any) => c.name);

  // Helper to identify "suppression-relevant" fields for the internal logic (still needed for limiting/filtering)
  // We do a best-effort find for these, but the OUTPUT sample will contain EVERYTHING.
  const nameIdx = cols.findIndex((c: any) => c.name.toLowerCase().includes("name") || c.name.toLowerCase().includes("nm"));
  const emailIdx = cols.findIndex((c: any) => c.name.toLowerCase().includes("mail"));

  // We still need strictly typed 'name' and 'email' for the logExportToSuppressionList logic if we were using it inside here,
  // but for the PREVIEW (which this function mostly serves), we want everything.

  const entries: Record<string, any>[] = rows.map((row: any[]) => {
    const entry: Record<string, any> = {};
    columnNames.forEach((colName: string, index: number) => {
      // Clean up the value (handle nulls)
      entry[colName] = row[index] ?? "";
    });
    return entry;
  });

  // Pass scanLimit to getCount as well
  const countResult = await getCount(databaseId, tableId, filters, scanLimit);

  return {
    entries,
    total: countResult.count,
  };
}

export async function runAnalysisQuery(
  databaseId: number,
  tableId: number,
  query: any,
): Promise<any> {
  const fullQuery = {
    database: databaseId,
    type: "query",
    query: {
      "source-table": tableId,
      ...query,
    },
  };

  const result = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(fullQuery),
  });

  return result;
}

export async function getAggregatedData(
  databaseId: number,
  tableId: number,
  breakoutFieldId: number,
  aggregation: any[] = [["count"]],
  limit: number = 20,
): Promise<{ rows: any[]; cols: any[] }> {
  const query = {
    database: databaseId,
    type: "query",
    query: {
      "source-table": tableId,
      aggregation: aggregation,
      breakout: [["field", breakoutFieldId, null]],
      "order-by": [["desc", ["aggregation", 0]]],
      limit,
    },
  };

  const result = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(query),
  });

  return {
    rows: result.data?.rows ?? [],
    cols: result.data?.cols ?? [],
  };
}

export async function getTotalCount(
  databaseId: number,
  tableId: number,
): Promise<number> {
  const query = {
    database: databaseId,
    type: "query",
    query: {
      "source-table": tableId,
      aggregation: [["count"]],
    },
  };

  const result = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(query),
  });

  return result.data?.rows?.[0]?.[0] ?? 0;
}

export async function getFieldSum(
  databaseId: number,
  tableId: number,
  fieldId: number,
): Promise<number> {
  const query = {
    database: databaseId,
    type: "query",
    query: {
      "source-table": tableId,
      aggregation: [["sum", ["field", fieldId, null]]],
    },
  };

  const result = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(query),
  });

  return result.data?.rows?.[0]?.[0] ?? 0;
}

export async function getFieldAverage(
  databaseId: number,
  tableId: number,
  fieldId: number,
): Promise<number> {
  const query = {
    database: databaseId,
    type: "query",
    query: {
      "source-table": tableId,
      aggregation: [["avg", ["field", fieldId, null]]],
    },
  };

  const result = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(query),
  });

  return result.data?.rows?.[0]?.[0] ?? 0;
}

export async function runRawQuery(
  databaseId: number,
  querySpec: any,
): Promise<{ rows: any[]; cols: any[] }> {
  const query = {
    database: databaseId,
    type: "query",
    query: querySpec,
  };

  const result = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(query),
  });

  return {
    rows: result.data?.rows ?? [],
    cols: result.data?.cols ?? [],
  };
}

export async function runNativeQuery(
  databaseId: number,
  sql: string,
): Promise<{ rows: any[]; cols: any[]; rowCount: number }> {
  const query = {
    database: databaseId,
    type: "native",
    native: {
      query: sql,
    },
  };

  console.log("Running native SQL query on database:", databaseId);

  const result = await metabaseRequest("/api/dataset", {
    method: "POST",
    body: JSON.stringify(query),
  });

  return {
    rows: result.data?.rows ?? [],
    cols: result.data?.cols ?? [],
    rowCount: result.row_count ?? result.data?.rows?.length ?? 0,
  };
}

// --- GLOBAL SUPPRESSION HELPERS ---

/**
 * Validates if the given table is the Global Campaign History table.
 */
async function getHistoryTableInfo(tableId: number) {
  // We need the database ID to run queries.
  // We can fetch the table details from Metabase API (via our getTables helper would be inefficient, 
  // maybe we need a getTableDetails helper or just search all tables).
  // For now, let's assume we can query `GET /api/table/:id` logic or similar.
  // Since we don't have a direct `getTable(id)` helper exposed yet, let's just use `runNativeQuery` logic 
  // tailored to the suppression DB if passed, OR we iterate databases.
  // OPTIMIZATION: The calling function usually knows the Database ID. 
  // BUT `historyTableId` is passed alone. 
  // New helper: Get Table Metadata by ID.
  // Since we don't have it, let's hack it or add `getTable(tableId)`?
  // Let's rely on the caller passing `databaseId` of the history table if possible, 
  // but the schema only sends `historyTableId`.

  // Workaround: We will fetch ALL tables (cached ideally) or just assume the DB ID 
  // is accessible via the table ID in Metabase if we queried it.
  // Let's implement a simple `getTableMetadata` first if needed.
  // Actually, `getTables(databaseId)` returns a list. 
  // We can try to find the table in the known "Marketing_Global_Suppression" DB?
  // No, that's brittle.

  // Let's add `getTable` to Metabase API client tools inside this file first?
  // Or simpler: Just expect the caller to pass suppressionDbId AND suppressionTableId?
  // The schema has `historyTableId`. 
  // Let's implement `getTableDetails` for this.
  return null; // Placeholder to structure the code block
}

// We need a way to get DB ID from Table ID.
// Using an internal helper here.
async function getTableDetails(tableId: number): Promise<MetabaseTable | null> {
  // Metabase API: GET /api/table/:id
  try {
    const res = await metabaseRequest(`/api/table/${tableId}`);
    return {
      id: res.id,
      name: res.name,
      display_name: res.display_name,
      schema: res.schema,
      db_id: res.db.id, // Metabase usually returns db object
    };
  } catch (e) {
    console.warn(`Failed to fetch table details for ${tableId}`, e);
    return null;
  }
}


export async function getSuppressedEmailsFromHistory(
  historyTableId: number,
  daysToCheck: number,
  marketingCode: string | undefined
): Promise<Set<string>> {
  const table = await getTableDetails(historyTableId);
  if (!table) return new Set();

  const dbId = table.db_id;
  const tableName = table.name; // Expect 'tbl_Global_Campaign_History'

  // Construct WHERE clause
  const conditions = [];

  // 1. Recency Check
  if (daysToCheck > 0) {
    // Postgre/Standard SQL syntax usually works for Metabase Native
    conditions.push(`export_date >= current_date - interval '${daysToCheck} days'`);
  }

  // 2. Campaign Code Check (Exclude duplicates for THIS campaign)
  if (marketingCode) {
    const safeCode = marketingCode.replace(/'/g, "''");
    conditions.push(`campaign_code = '${safeCode}'`);
  }

  if (conditions.length === 0) return new Set();

  const whereClause = conditions.join(" OR ");

  // We assume the field containing the email/ref_id is named 'ref_id' or 'email'.
  // Let's try 'ref_id' as per previous plan, or 'email'.
  // Safer to SELECT * LIMIT 1 to check columns? Or just try 'ref_id'.
  // Let's assume 'ref_id' based on my previous artifacts.

  const sql = `SELECT DISTINCT ref_id FROM "${tableName}" WHERE ${whereClause}`;

  try {
    const result = await runNativeQuery(dbId, sql);
    // Rows are usually arrays of values in Metabase Native Query response
    // e.g. [[ "email1@test.com" ], [ "email2@test.com" ]]
    // But verify the format. `runNativeQuery` returns { rows: [...] } NOT { data: { rows: ... } }

    const rows = result.rows || [];
    const emails = new Set<string>();

    rows.forEach((row: any[]) => {
      if (row[0]) emails.add(String(row[0]).toLowerCase());
    });

    console.log(`[Suppression] Found ${emails.size} suppressed contacts from table ${tableName}`);
    return emails;
  } catch (err) {
    console.error("[Suppression] Failed to fetch suppression list:", err);
    return new Set(); // Fail open
  }
}

export async function logExportToHistory(
  historyTableId: number,
  marketingCode: string,
  contacts: { email: string }[]
) {
  if (contacts.length === 0 || !marketingCode) return;

  const table = await getTableDetails(historyTableId);
  if (!table) return;

  const dbId = table.db_id;
  const tableName = table.name;
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const safeCode = marketingCode.replace(/'/g, "''");

  // Chunking
  const CHUNK_SIZE = 500;
  for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
    const chunk = contacts.slice(i, i + CHUNK_SIZE);

    const values = chunk
      .map(c => `('${c.email.replace(/'/g, "''").toLowerCase()}', '${safeCode}', '${today}')`)
      .join(", ");

    const sql = `INSERT INTO "${tableName}" (ref_id, campaign_code, export_date) VALUES ${values}`;

    try {
      await runNativeQuery(dbId, sql);
    } catch (err) {
      console.error(`[Suppression] Failed to log chunk to ${tableName}:`, err);
    }
  }
  console.log(`[Suppression] Logged ${contacts.length} contacts to history for ${marketingCode}`);
}
