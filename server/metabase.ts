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

// FIXED: Now safely keeps Japanese text while stripping only spaces, underscores, and hyphens
function normalizeColName(name: string): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[\s_\-]/g, "");
}

// Inside server/metabase.ts - Conceptual Query Builder
export async function runMarketingExportAndLog(
  databaseId: number,
  masterTableId: number,
  historyTableId: number,
  campaignCode: string,
  limit: number,
) {
  const sql = `
    SELECT t1.*
    FROM [Master Table] AS t1
    LEFT JOIN [Tbl Global Campaign History] AS t2 
      ON t1.Email = t2.Reference_ID 
      AND (
          t2.Export_Date > CURRENT_DATE - INTERVAL '7 days' 
          OR t2.Campaign_Code = '${campaignCode}'
      )
    WHERE t2.Reference_ID IS NULL
    LIMIT ${limit};
  `;

  const exportData = await runNativeQuery(databaseId, sql);

  if (exportData.rows.length > 0) {
    const values = exportData.rows
      .map((row) => `('${row.email}', '${campaignCode}', CURRENT_DATE)`)
      .join(",");

    const insertSql = `
      INSERT INTO [Tbl Global Campaign History] (Reference_ID, Campaign_Code, Export_Date)
      VALUES ${values};
    `;
    await runNativeQuery(databaseId, insertSql);
  }

  return exportData;
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
      return ["contains", fieldRef, filter.value];
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

export async function getCount(
  databaseId: number,
  tableId: number,
  filters: FilterValue[],
  limit: number = 100000,
): Promise<{ count: number; total: number; percentage: number }> {
  const sourceQuery: any = { "source-table": tableId };
  if (limit < 999999999) {
    sourceQuery.limit = limit;
  }

  const totalQuery = {
    database: databaseId,
    type: "query",
    query: {
      "source-query": sourceQuery,
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

  const filterClauses = filters.map(buildFilterClause);
  const combinedFilter =
    filterClauses.length === 1 ? filterClauses[0] : ["and", ...filterClauses];

  const countQuery = {
    database: databaseId,
    type: "query",
    query: {
      "source-query": sourceQuery,
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
  limit: number = 100000,
): Promise<FieldOption[]> {
  const sourceQuery: any = { "source-table": tableId };
  if (limit < 999999999) {
    sourceQuery.limit = limit;
  }

  const query = {
    database: databaseId,
    type: "query",
    query: {
      "source-query": sourceQuery,
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
  scanLimit: number = 100000,
): Promise<{ entries: MailingListEntry[]; total: number }> {
  const fields = await getFields(tableId);

  const findField = (patterns: string[]): number | null => {
    for (const pattern of patterns) {
      const cleanPattern = normalizeColName(pattern);
      const field = fields.find((f) => {
        const cleanName = normalizeColName(f.name);
        const cleanDisplayName = normalizeColName(f.display_name);
        return (
          cleanName.includes(cleanPattern) ||
          cleanDisplayName.includes(cleanPattern)
        );
      });
      if (field) return field.id;
    }
    return null;
  };

  const nameFieldId = findField([
    "name",
    "fullname",
    "customername",
    "contactname",
    "氏名",
    "名前",
    "顧客名",
  ]);
  const emailFieldId = findField(["email", "mail", "メール", "eメール"]);
  const addressFieldId = findField([
    "add3",
    "address3",
    "street",
    "banchi",
    "住所",
    "address",
    "番地",
    "町域",
  ]);
  const cityFieldId = findField([
    "add2",
    "address2",
    "city",
    "town",
    "ward",
    "shikuchoson",
    "市区町村",
    "市",
    "区",
  ]);
  const stateFieldId = findField([
    "add1",
    "address1",
    "state",
    "pref",
    "province",
    "todofuken",
    "都道府県",
    "県",
    "州",
    "region",
  ]);
  const zipcodeFieldId = findField(["zip", "postal", "郵便番号"]);
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

  const sourceQuery: any = { "source-table": tableId };
  if (scanLimit < 999999999) {
    sourceQuery.limit = scanLimit;
  }

  const query: any = {
    database: databaseId,
    type: "query",
    query: {
      "source-query": sourceQuery,
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

  const rows = result.data?.rows ?? [];
  const cols = result.data?.cols ?? [];

  const colIndexMap: Record<string, number> = {};
  cols.forEach((col: any, index: number) => {
    const cleanName = normalizeColName(col.name);
    const match = (kws: string[]) => kws.some((kw) => cleanName.includes(kw));

    if (match(["name", "氏名", "名前"]) && !("name" in colIndexMap))
      colIndexMap.name = index;
    if (match(["email", "mail", "メール"]) && !("email" in colIndexMap))
      colIndexMap.email = index;
    if (
      match([
        "add3",
        "address3",
        "street",
        "banchi",
        "住所",
        "address",
        "番地",
        "町域",
      ]) &&
      !("address" in colIndexMap) &&
      !cleanName.includes("add1") &&
      !cleanName.includes("add2")
    )
      colIndexMap.address = index;
    if (
      match([
        "add2",
        "address2",
        "city",
        "town",
        "ward",
        "市区町村",
        "市",
        "区",
      ]) &&
      !("city" in colIndexMap)
    )
      colIndexMap.city = index;
    if (
      match([
        "add1",
        "address1",
        "state",
        "pref",
        "province",
        "todofuken",
        "都道府県",
        "県",
        "州",
        "region",
      ]) &&
      !("state" in colIndexMap)
    )
      colIndexMap.state = index;
    if (match(["zip", "postal", "郵便番号"]) && !("zipcode" in colIndexMap))
      colIndexMap.zipcode = index;
    if (match(["country", "nation", "国"]) && !("country" in colIndexMap))
      colIndexMap.country = index;
  });

  const entries: MailingListEntry[] = rows.map((row: any[]) => ({
    name:
      colIndexMap.name !== undefined ? String(row[colIndexMap.name] ?? "") : "",
    email:
      colIndexMap.email !== undefined
        ? String(row[colIndexMap.email] ?? "")
        : "",
    address:
      colIndexMap.address !== undefined
        ? String(row[colIndexMap.address] ?? "")
        : "",
    city:
      colIndexMap.city !== undefined ? String(row[colIndexMap.city] ?? "") : "",
    state:
      colIndexMap.state !== undefined
        ? String(row[colIndexMap.state] ?? "")
        : "",
    zipcode:
      colIndexMap.zipcode !== undefined
        ? String(row[colIndexMap.zipcode] ?? "")
        : "",
    country:
      colIndexMap.country !== undefined
        ? String(row[colIndexMap.country] ?? "")
        : "",
  }));

  // FIXED: Push entries WITH EMAILS to the very top, then sort by least amount of nulls
  entries.sort((a, b) => {
    const aHasEmail =
      a.email && a.email.trim() !== "null" && a.email.trim() !== "" ? 1 : 0;
    const bHasEmail =
      b.email && b.email.trim() !== "null" && b.email.trim() !== "" ? 1 : 0;

    if (aHasEmail !== bHasEmail) {
      return bHasEmail - aHasEmail; // 1 comes before 0
    }

    const aPop = Object.values(a).filter(
      (v) =>
        v !== null && v !== "" && String(v).trim().toLowerCase() !== "null",
    ).length;
    const bPop = Object.values(b).filter(
      (v) =>
        v !== null && v !== "" && String(v).trim().toLowerCase() !== "null",
    ).length;
    return bPop - aPop;
  });

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

  if (result.status === "failed" || result.error) {
    const errorMsg = result.error || result.error_type || "Unknown SQL Error";
    console.error("🚨 METABASE SQL ERROR:", errorMsg);
    throw new Error(`SQL Server Error: ${errorMsg}`);
  }

  return {
    rows: result.data?.rows ?? [],
    cols: result.data?.cols ?? [],
    rowCount: result.row_count ?? result.data?.rows?.length ?? 0,
  };
}

export async function getTableRowCountsFast(
  databaseId: number,
  tableNames: string[],
): Promise<Record<string, number>> {
  const sql = `
    SELECT t.name AS table_name, SUM(p.rows) AS row_count
    FROM sys.tables t
    JOIN sys.partitions p ON t.object_id = p.object_id
    WHERE p.index_id IN (0, 1)
    GROUP BY t.name
  `;

  try {
    const result = await runNativeQuery(databaseId, sql);
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[String(row[0])] = Number(row[1]) || 0;
    }
    return counts;
  } catch (err) {
    console.error("Fast row count query failed, falling back to metadata:", err);
    return {};
  }
}

// --- MS SQL SERVER V2 FUNCTIONS (OPTIMIZED FOR MILLIONS OF ROWS) ---

export async function getMarketingPreviewV2(
  databaseId: number,
  masterTableId: number,
  historyDbId: number | null,
  historyTableId: number | null,
  segments: string[],
  contactCap: number,
  excludeDays: number,
) {
  const masterTables = await getTables(databaseId);
  const masterTable = masterTables.find((t) => t.id === masterTableId);
  if (!masterTable) throw new Error("Master table not found");

  let whereClause = "1=1";
  if (segments && segments.length > 0) {
    const segmentConditions = segments
      .map((seg) => {
        const parts = seg.split(":");
        if (parts.length === 2) {
          const field = parts[0];
          let val = parts[1];
          let operator = "=";
          if (val.startsWith(">=")) {
            operator = ">=";
            val = val.substring(2);
          } else if (val.startsWith("<=")) {
            operator = "<=";
            val = val.substring(2);
          } else if (val.startsWith(">")) {
            operator = ">";
            val = val.substring(1);
          } else if (val.startsWith("<")) {
            operator = "<";
            val = val.substring(1);
          } else if (val.startsWith("!=")) {
            operator = "!=";
            val = val.substring(2);
          }

          let sqlVal;
          if (!isNaN(Number(val)) && val.trim() !== "") {
            sqlVal = val;
          } else if (val.toLowerCase() === "true") {
            sqlVal = "1";
          } else if (val.toLowerCase() === "false") {
            sqlVal = "0";
          } else {
            sqlVal = `'${val.replace(/'/g, "''")}'`;
          }
          return `[${field}] ${operator} ${sqlVal}`;
        }
        return "";
      })
      .filter(Boolean);

    if (segmentConditions.length > 0)
      whereClause += ` AND (${segmentConditions.join(" OR ")})`;
  }

  const sql = `SELECT TOP ${contactCap * 3} * FROM [${masterTable.name}] WHERE ${whereClause};`;
  console.log("Executing Master Query:", sql);
  const result = await runNativeQuery(databaseId, sql);
  console.log(
    "👉 RAW COLUMNS FROM DB:",
    result.cols.map((c: any) => c.name),
  );

  const finalRows = [];
  let excludedCount = 0;
  let suppressedIds = new Set<string>();

  const exportJoinFieldIndices: number[] = [];
  if (historyDbId && historyTableId) {
    const emailIdx = result.cols.findIndex(
      (c: any) =>
        normalizeColName(c.name).includes("email") ||
        normalizeColName(c.name).includes("mail"),
    );
    if (emailIdx !== -1) exportJoinFieldIndices.push(emailIdx);

    const custRefIdx = result.cols.findIndex(
      (c: any) =>
        normalizeColName(c.name).includes("cust") &&
        (normalizeColName(c.name).includes("id") ||
          normalizeColName(c.name).includes("no")),
    );
    if (custRefIdx !== -1 && !exportJoinFieldIndices.includes(custRefIdx))
      exportJoinFieldIndices.push(custRefIdx);

    if (exportJoinFieldIndices.length > 0) {
      const candidateKeys = new Set<string>();
      result.rows.forEach((row) => {
        exportJoinFieldIndices.forEach((idx) => {
          const val = String(row[idx]).toLowerCase().trim();
          if (val && val !== "null" && val !== "") candidateKeys.add(val);
        });
      });

      if (candidateKeys.size > 0) {
        try {
          const suppTables = await getTables(historyDbId);
          const suppTable = suppTables.find((t) => t.id === historyTableId);

          if (suppTable) {
            const suppFields = await getFields(historyTableId);
            const refField =
              suppFields.find(
                (f: any) =>
                  f.semantic_type !== "type/PK" &&
                  (normalizeColName(f.name).includes("ref") ||
                    normalizeColName(f.name).includes("email") ||
                    normalizeColName(f.name).includes("mail") ||
                    normalizeColName(f.name).includes("customer")),
              ) ||
              suppFields.find(
                (f: any) =>
                  f.semantic_type !== "type/PK" && f.base_type === "type/Text",
              );

            const dateField = suppFields.find(
              (f: any) =>
                f.base_type === "type/DateTime" || f.base_type === "type/Date",
            );

            if (refField) {
              const candidateArray = Array.from(candidateKeys);
              const chunkSize = 2000;

              for (let i = 0; i < candidateArray.length; i += chunkSize) {
                const chunk = candidateArray.slice(i, i + chunkSize);
                const inValues = chunk
                  .map((v) => `'${v.replace(/'/g, "''")}'`)
                  .join(",");

                let suppSql = `SELECT [${refField.name}] FROM [${suppTable.name}] WHERE [${refField.name}] IN (${inValues})`;
                if (dateField) {
                  suppSql += ` AND [${dateField.name}] > DATEADD(day, -${excludeDays}, CAST(GETDATE() AS DATE))`;
                }

                const suppResult = await runNativeQuery(historyDbId, suppSql);
                suppResult.rows.forEach((r) =>
                  suppressedIds.add(String(r[0]).toLowerCase().trim()),
                );
              }
            }
          }
        } catch (e) {
          console.error("Failed to lookup suppression list via IN clause:", e);
        }
      }
    }
  }

  for (const row of result.rows) {
    if (exportJoinFieldIndices.length > 0) {
      let isSuppressed = false;
      for (const idx of exportJoinFieldIndices) {
        const val = String(row[idx]).toLowerCase().trim();
        if (val && val !== "null" && val !== "" && suppressedIds.has(val)) {
          isSuppressed = true;
          break;
        }
      }
      if (isSuppressed) {
        excludedCount++;
        continue;
      }
    }
    finalRows.push(row);
    if (finalRows.length >= contactCap) break;
  }

  // FIXED: Push previews WITH EMAILS to the top, then sort by least nulls
  const emailIndex = result.cols.findIndex((c: any) => {
    const n = normalizeColName(c.name);
    return n.includes("email") || n.includes("mail") || n.includes("メール");
  });

  finalRows.sort((a, b) => {
    const aHasEmail =
      emailIndex !== -1 &&
      a[emailIndex] &&
      String(a[emailIndex]).trim() !== "null" &&
      String(a[emailIndex]).trim() !== ""
        ? 1
        : 0;
    const bHasEmail =
      emailIndex !== -1 &&
      b[emailIndex] &&
      String(b[emailIndex]).trim() !== "null" &&
      String(b[emailIndex]).trim() !== ""
        ? 1
        : 0;

    if (aHasEmail !== bHasEmail) {
      return bHasEmail - aHasEmail; // 1 comes before 0
    }

    const aPop = a.filter(
      (v: any) =>
        v !== null && v !== "" && String(v).trim().toLowerCase() !== "null",
    ).length;
    const bPop = b.filter(
      (v: any) =>
        v !== null && v !== "" && String(v).trim().toLowerCase() !== "null",
    ).length;
    return bPop - aPop;
  });

  const sample = finalRows.slice(0, 50).map((row) => {
    const obj: any = {};
    result.cols.forEach((col: any, i: number) => {
      const cleanKey = normalizeColName(col.name);
      obj[cleanKey] = row[i];
    });

    const findVal = (keywords: string[]) => {
      for (const kw of keywords) {
        if (obj[kw] !== undefined && obj[kw] !== null && obj[kw] !== "")
          return obj[kw];
        const matchingKey = Object.keys(obj).find((k) => k.includes(kw));
        if (matchingKey && obj[matchingKey] !== null && obj[matchingKey] !== "")
          return obj[matchingKey];
      }
      return "";
    };

    return {
      name:
        findVal([
          "name",
          "fullname",
          "customername",
          "contactname",
          "氏名",
          "名前",
          "顧客名",
        ]) || "Unknown",
      email: findVal(["email", "mail", "メール", "eメール"]) || "N/A",
      city: findVal([
        "city",
        "town",
        "add2",
        "address2",
        "ward",
        "shikuchoson",
        "市区町村",
        "市",
        "区",
      ]),
      state: findVal([
        "state",
        "province",
        "pref",
        "add1",
        "address1",
        "region",
        "todofuken",
        "都道府県",
        "県",
        "州",
      ]),
      address: findVal([
        "add3",
        "address3",
        "street",
        "banchi",
        "line1",
        "住所",
        "アドレス",
        "address",
        "番地",
        "町域",
      ]),
    };
  });

  const columns = result.cols.map((c: any) => c.name);
  const allRecords = finalRows.map((row) => {
    const record: Record<string, any> = {};
    columns.forEach((col: string, i: number) => {
      record[col] = row[i];
    });
    return record;
  });

  return {
    count: finalRows.length,
    sample: sample,
    columns,
    records: allRecords,
    excludedCount: excludedCount,
    totalCandidates: result.rowCount,
    historyTableUsed: !!historyDbId,
  };
}

export async function runMarketingExportAndLogV2(
  databaseId: number,
  masterTableId: number,
  historyDbId: number | null,
  historyTableId: number | null,
  segments: string[],
  contactCap: number,
  excludeDays: number,
  campaignCode: string,
): Promise<string> {
  const masterTables = await getTables(databaseId);
  const masterTable = masterTables.find((t) => t.id === masterTableId);
  if (!masterTable) throw new Error("Master table not found");

  let whereClause = "1=1";
  if (segments && segments.length > 0) {
    const segmentConditions = segments
      .map((seg) => {
        const parts = seg.split(":");
        if (parts.length === 2) {
          const field = parts[0];
          let val = parts[1];
          let operator = "=";
          if (val.startsWith(">=")) {
            operator = ">=";
            val = val.substring(2);
          } else if (val.startsWith("<=")) {
            operator = "<=";
            val = val.substring(2);
          } else if (val.startsWith(">")) {
            operator = ">";
            val = val.substring(1);
          } else if (val.startsWith("<")) {
            operator = "<";
            val = val.substring(1);
          } else if (val.startsWith("!=")) {
            operator = "!=";
            val = val.substring(2);
          }

          let sqlVal;
          if (!isNaN(Number(val)) && val.trim() !== "") {
            sqlVal = val;
          } else if (val.toLowerCase() === "true") {
            sqlVal = "1";
          } else if (val.toLowerCase() === "false") {
            sqlVal = "0";
          } else {
            sqlVal = `'${val.replace(/'/g, "''")}'`;
          }
          return `[${field}] ${operator} ${sqlVal}`;
        }
        return "";
      })
      .filter(Boolean);
    if (segmentConditions.length > 0)
      whereClause += ` AND (${segmentConditions.join(" OR ")})`;
  }

  const sql = `SELECT TOP ${contactCap * 3} * FROM [${masterTable.name}] WHERE ${whereClause};`;
  const exportData = await runNativeQuery(databaseId, sql);

  let suppressedIds = new Set<string>();
  const exportJoinFieldIndices: number[] = [];

  if (historyDbId && historyTableId) {
    const emailIdx = exportData.cols.findIndex(
      (c: any) =>
        normalizeColName(c.name).includes("email") ||
        normalizeColName(c.name).includes("mail"),
    );
    if (emailIdx !== -1) exportJoinFieldIndices.push(emailIdx);

    const custRefIdx = exportData.cols.findIndex(
      (c: any) =>
        normalizeColName(c.name).includes("cust") &&
        (normalizeColName(c.name).includes("id") ||
          normalizeColName(c.name).includes("no")),
    );
    if (custRefIdx !== -1 && !exportJoinFieldIndices.includes(custRefIdx))
      exportJoinFieldIndices.push(custRefIdx);

    if (exportJoinFieldIndices.length > 0) {
      const candidateKeys = new Set<string>();
      exportData.rows.forEach((row) => {
        exportJoinFieldIndices.forEach((idx) => {
          const val = String(row[idx]).toLowerCase().trim();
          if (val && val !== "null" && val !== "") candidateKeys.add(val);
        });
      });

      if (candidateKeys.size > 0) {
        try {
          const suppTables = await getTables(historyDbId);
          const suppTable = suppTables.find((t) => t.id === historyTableId);
          if (suppTable) {
            const suppFields = await getFields(historyTableId);
            const refField =
              suppFields.find(
                (f: any) =>
                  f.semantic_type !== "type/PK" &&
                  (normalizeColName(f.name).includes("ref") ||
                    normalizeColName(f.name).includes("email") ||
                    normalizeColName(f.name).includes("mail") ||
                    normalizeColName(f.name).includes("customer")),
              ) ||
              suppFields.find(
                (f: any) =>
                  f.semantic_type !== "type/PK" && f.base_type === "type/Text",
              );

            const dateField = suppFields.find(
              (f: any) =>
                f.base_type === "type/DateTime" || f.base_type === "type/Date",
            );

            if (refField) {
              const candidateArray = Array.from(candidateKeys);
              const chunkSize = 2000;

              for (let i = 0; i < candidateArray.length; i += chunkSize) {
                const chunk = candidateArray.slice(i, i + chunkSize);
                const inValues = chunk
                  .map((v) => `'${v.replace(/'/g, "''")}'`)
                  .join(",");

                let suppSql = `SELECT [${refField.name}] FROM [${suppTable.name}] WHERE [${refField.name}] IN (${inValues})`;
                if (dateField) {
                  suppSql += ` AND [${dateField.name}] > DATEADD(day, -${excludeDays}, CAST(GETDATE() AS DATE))`;
                }

                const suppResult = await runNativeQuery(historyDbId, suppSql);
                suppResult.rows.forEach((r) =>
                  suppressedIds.add(String(r[0]).toLowerCase().trim()),
                );
              }
            }
          }
        } catch (e) {
          console.error("Failed to run chunked lookup for export:", e);
        }
      }
    }
  }

  const finalRows = [];
  for (const row of exportData.rows) {
    if (exportJoinFieldIndices.length > 0) {
      let isSuppressed = false;
      for (const idx of exportJoinFieldIndices) {
        const val = String(row[idx]).toLowerCase().trim();
        if (val && val !== "null" && val !== "" && suppressedIds.has(val)) {
          isSuppressed = true;
          break;
        }
      }
      if (isSuppressed) continue;
    }
    finalRows.push(row);
    if (finalRows.length >= contactCap) break;
  }

  // FIXED: Push exports WITH EMAILS to the top, then sort by least nulls
  const emailIndex = exportData.cols.findIndex((c: any) => {
    const n = normalizeColName(c.name);
    return n.includes("email") || n.includes("mail") || n.includes("メール");
  });

  finalRows.sort((a, b) => {
    const aHasEmail =
      emailIndex !== -1 &&
      a[emailIndex] &&
      String(a[emailIndex]).trim() !== "null" &&
      String(a[emailIndex]).trim() !== ""
        ? 1
        : 0;
    const bHasEmail =
      emailIndex !== -1 &&
      b[emailIndex] &&
      String(b[emailIndex]).trim() !== "null" &&
      String(b[emailIndex]).trim() !== ""
        ? 1
        : 0;

    if (aHasEmail !== bHasEmail) {
      return bHasEmail - aHasEmail; // 1 comes before 0
    }

    const aPop = a.filter(
      (v: any) =>
        v !== null && v !== "" && String(v).trim().toLowerCase() !== "null",
    ).length;
    const bPop = b.filter(
      (v: any) =>
        v !== null && v !== "" && String(v).trim().toLowerCase() !== "null",
    ).length;
    return bPop - aPop;
  });

  if (
    historyDbId &&
    historyTableId &&
    finalRows.length > 0 &&
    emailIndex !== -1
  ) {
    try {
      const suppTables = await getTables(historyDbId);
      const suppTable = suppTables.find((t) => t.id === historyTableId);
      if (suppTable) {
        const suppFields = await getFields(historyTableId);
        const refField = suppFields.find(
          (f: any) =>
            normalizeColName(f.name).includes("reference") ||
            normalizeColName(f.name).includes("email") ||
            normalizeColName(f.name).includes("mail"),
        );
        const dateField = suppFields.find(
          (f: any) =>
            normalizeColName(f.name).includes("exportdate") ||
            normalizeColName(f.name).includes("date") ||
            normalizeColName(f.name).includes("sent"),
        );
        const codeField = suppFields.find(
          (f: any) =>
            normalizeColName(f.name).includes("campaign") ||
            normalizeColName(f.name).includes("code"),
        );

        if (refField && dateField) {
          const emailsToLog = finalRows
            .map((row) => row[emailIndex])
            .filter(
              (email) => email && email !== "null" && email.trim() !== "",
            );

          if (emailsToLog.length > 0) {
            const columns = codeField
              ? `[${refField.name}], [${codeField.name}], [${dateField.name}]`
              : `[${refField.name}], [${dateField.name}]`;
            const values = emailsToLog
              .map((email) =>
                codeField
                  ? `('${email.replace(/'/g, "''")}', '${campaignCode}', CAST(GETDATE() AS DATE))`
                  : `('${email.replace(/'/g, "''")}', CAST(GETDATE() AS DATE))`,
              )
              .join(",");
            const insertSql = `INSERT INTO [${suppTable.name}] (${columns}) VALUES ${values};`;
            try {
              await runNativeQuery(historyDbId, insertSql);
              console.log(
                `Logged ${emailsToLog.length} emails to suppression list.`,
              );
            } catch (e) {
              console.error("Failed to log to suppression list:", e);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to write-back to suppression list:", e);
    }
  }

  const headers = exportData.cols.map((c: any) => c.name).join(",");
  const rows = finalRows
    .map((row) =>
      row.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  return `${headers}\n${rows}`;
}
