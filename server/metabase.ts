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

// Inside server/metabase.ts - Conceptual Query Builder
export async function runMarketingExportAndLog(
  databaseId: number,
  masterTableId: number,
  historyTableId: number,
  campaignCode: string,
  limit: number,
) {
  // 1. Generate the exclusionary SQL
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

  // 2. Run the native query via Metabase API
  const exportData = await runNativeQuery(databaseId, sql);

  // 3. The Write-Back (Log the export)
  if (exportData.rows.length > 0) {
    const values = exportData.rows
      .map((row) => `('${row.email}', '${campaignCode}', CURRENT_DATE)`)
      .join(",");

    const insertSql = `
      INSERT INTO [Tbl Global Campaign History] (Reference_ID, Campaign_Code, Export_Date)
      VALUES ${values};
    `;
    // Execute write-back query quietly in the background
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
  limit: number = 100000, // Default limit
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

  const filterClauses = filters.map(buildFilterClause);
  const combinedFilter =
    filterClauses.length === 1 ? filterClauses[0] : ["and", ...filterClauses];

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
  const findField = (patterns: string[]): number | null => {
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
  ]);
  const emailFieldId = findField([
    "email",
    "mail",
    "e-mail",
    "email_address",
    "メール",
    "eメール",
    "電子メール",
    "email_addr",
    "mailing",
    "used_for_mailing",
  ]);
  const addressFieldId = findField([
    "address",
    "street",
    "address1",
    "street_address",
    "住所",
    "アドレス",
  ]);
  const cityFieldId = findField(["city", "town", "市", "都市"]);
  const stateFieldId = findField([
    "state",
    "province",
    "region",
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

  const colIndexMap: Record<string, number> = {};
  cols.forEach((col: any, index: number) => {
    const name = col.name.toLowerCase();
    if (name.includes("name") && !("name" in colIndexMap))
      colIndexMap.name = index;
    if (
      (name.includes("email") || name.includes("mail")) &&
      !("email" in colIndexMap)
    )
      colIndexMap.email = index;
    if (
      (name.includes("address") || name.includes("street")) &&
      !("address" in colIndexMap)
    )
      colIndexMap.address = index;
    if (name.includes("city") && !("city" in colIndexMap))
      colIndexMap.city = index;
    if (
      (name.includes("state") || name.includes("province")) &&
      !("state" in colIndexMap)
    )
      colIndexMap.state = index;
    if (
      (name.includes("zip") || name.includes("postal")) &&
      !("zipcode" in colIndexMap)
    )
      colIndexMap.zipcode = index;
    if (name.includes("country") && !("country" in colIndexMap))
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

  // NEW: Catch silent Metabase SQL errors and throw them to the frontend!
  if (result.status === "failed" || result.error) {
    const errorMsg = result.error || result.error_type || "Unknown SQL Error";
    console.error("🚨 METABASE SQL ERROR:", errorMsg);

    // This will force the red toast error on your screen so we can read it!
    throw new Error(`SQL Server Error: ${errorMsg}`);
  }

  return {
    rows: result.data?.rows ?? [],
    cols: result.data?.cols ?? [],
    rowCount: result.row_count ?? result.data?.rows?.length ?? 0,
  };
}

// --- MS SQL SERVER V2 FUNCTIONS (APPLICATION-LAYER JOIN) ---

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

  // 1. FETCH SUPPRESSED IDs FIRST (Step 1 of App-Join)
  let suppressedIds = new Set<string>();
  let suppressionRefFieldName: string | null = null;
  if (historyDbId && historyTableId) {
    console.log("Fetching suppression list from DB:", historyDbId, "table:", historyTableId);
    try {
      const suppTables = await getTables(historyDbId);
      const suppTable = suppTables.find((t) => t.id === historyTableId);
      if (suppTable) {
        const suppFields = await getFields(historyTableId);
        const refField = suppFields.find((f: any) =>
          f.semantic_type !== "type/PK" && (
            f.name.toLowerCase().includes("ref") ||
            f.name.toLowerCase().includes("email") ||
            f.name.toLowerCase().includes("mail") ||
            f.name.toLowerCase().includes("customer")
          )
        ) || suppFields.find((f: any) =>
          f.semantic_type !== "type/PK" &&
          f.base_type === "type/Text"
        );
        const dateField = suppFields.find((f: any) =>
          f.base_type === "type/DateTime" || f.base_type === "type/Date"
        );

        if (refField) {
          suppressionRefFieldName = refField.name;
          let suppSql: string;
          if (dateField) {
            suppSql = `SELECT [${refField.name}] FROM [${suppTable.name}] WHERE [${dateField.name}] > DATEADD(day, -${excludeDays}, CAST(GETDATE() AS DATE))`;
          } else {
            suppSql = `SELECT [${refField.name}] FROM [${suppTable.name}]`;
          }

          console.log("Suppression SQL:", suppSql);
          const suppResult = await runNativeQuery(historyDbId, suppSql);
          suppressedIds = new Set(
            suppResult.rows.map((r) => String(r[0]).toLowerCase().trim()),
          );
          console.log(`Loaded ${suppressedIds.size} suppressed IDs (field: ${refField.name}) into memory.`);
        } else {
          console.warn("No suitable reference field found in suppression table");
        }
      }
    } catch (e) {
      console.error("Failed to load suppression list:", e);
    }
  }

  // 2. BUILD THE MASTER QUERY
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

  // We fetch a bit extra to account for people who will be filtered out
  const sql = `SELECT TOP ${contactCap * 3} * FROM [${masterTable.name}] WHERE ${whereClause};`;
  console.log("Executing Master Query:", sql);
  const result = await runNativeQuery(databaseId, sql);

  // 3. APPLY IN-MEMORY FILTERING (Step 2 of App-Join)
  const finalRows = [];
  let excludedCount = 0;

  // Find the best matching field in the master table for suppression join
  // Try to match by: email, customer ref/id, or any field that could be the join key
  const joinFieldIndices: number[] = [];
  if (suppressedIds.size > 0) {
    // Priority 1: email fields
    const emailIdx = result.cols.findIndex(
      (c: any) =>
        c.name.toLowerCase() === "email" ||
        c.name.toLowerCase() === "email_address",
    );
    if (emailIdx !== -1) joinFieldIndices.push(emailIdx);

    // Priority 2: customer ref/id fields (matching suppression ref field pattern)
    const custRefIdx = result.cols.findIndex(
      (c: any) =>
        c.name.toLowerCase().includes("cust") &&
        (c.name.toLowerCase().includes("id") || c.name.toLowerCase().includes("no")),
    );
    if (custRefIdx !== -1 && !joinFieldIndices.includes(custRefIdx)) joinFieldIndices.push(custRefIdx);

    // Priority 3: prospect/reference ID fields
    const prospectIdx = result.cols.findIndex(
      (c: any) =>
        c.name.toLowerCase().includes("prospect") ||
        c.name.toLowerCase().includes("ref_id") ||
        c.name.toLowerCase().includes("reference"),
    );
    if (prospectIdx !== -1 && !joinFieldIndices.includes(prospectIdx)) joinFieldIndices.push(prospectIdx);

    console.log("Suppression join fields:", joinFieldIndices.map(i => result.cols[i].name));
  }

  for (const row of result.rows) {
    if (joinFieldIndices.length > 0) {
      let isSuppressed = false;
      for (const idx of joinFieldIndices) {
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

  const sample = finalRows.slice(0, 50).map((row) => {
    const obj: any = {};
    result.cols.forEach((col: any, i: number) => {
      obj[col.name.toLowerCase()] = row[i];
    });
    return {
      name: obj.name || obj.full_name || "Unknown",
      email: obj.email || obj.mail || obj.email_address || "N/A",
      city: obj.city || "",
      state: obj.state || "",
    };
  });

  return {
    count: finalRows.length,
    sample: sample,
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
  // 1. Fetch exactly like preview
  const previewData = await getMarketingPreviewV2(
    databaseId,
    masterTableId,
    historyDbId,
    historyTableId,
    segments,
    contactCap,
    excludeDays,
  );

  const masterTables = await getTables(databaseId);
  const masterTable = masterTables.find((t) => t.id === masterTableId);
  if (!masterTable) throw new Error("Master table not found");

  // For the actual export, we need all the columns again
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

  // Apply the same suppression logic
  let suppressedIds = new Set<string>();
  if (historyDbId && historyTableId) {
    try {
      const suppTables = await getTables(historyDbId);
      const suppTable = suppTables.find((t) => t.id === historyTableId);
      if (suppTable) {
        const suppFields = await getFields(historyTableId);
        const refField = suppFields.find((f: any) =>
          f.semantic_type !== "type/PK" && (
            f.name.toLowerCase().includes("ref") ||
            f.name.toLowerCase().includes("email") ||
            f.name.toLowerCase().includes("mail") ||
            f.name.toLowerCase().includes("customer")
          )
        ) || suppFields.find((f: any) =>
          f.semantic_type !== "type/PK" &&
          f.base_type === "type/Text"
        );
        const dateField = suppFields.find((f: any) =>
          f.base_type === "type/DateTime" || f.base_type === "type/Date"
        );

        if (refField) {
          let suppSql: string;
          if (dateField) {
            suppSql = `SELECT [${refField.name}] FROM [${suppTable.name}] WHERE [${dateField.name}] > DATEADD(day, -${excludeDays}, CAST(GETDATE() AS DATE))`;
          } else {
            suppSql = `SELECT [${refField.name}] FROM [${suppTable.name}]`;
          }

          const suppResult = await runNativeQuery(historyDbId, suppSql);
          suppressedIds = new Set(
            suppResult.rows.map((r) => String(r[0]).toLowerCase().trim()),
          );
          console.log(`Export: Loaded ${suppressedIds.size} suppressed IDs (field: ${refField.name})`);
        }
      }
    } catch (e) {
      console.error("Failed to load suppression list for export:", e);
    }
  }

  const finalRows = [];

  // Find join fields for suppression matching
  const exportJoinFieldIndices: number[] = [];
  if (suppressedIds.size > 0) {
    const emailIdx = exportData.cols.findIndex(
      (c: any) =>
        c.name.toLowerCase() === "email" ||
        c.name.toLowerCase() === "email_address",
    );
    if (emailIdx !== -1) exportJoinFieldIndices.push(emailIdx);

    const custRefIdx = exportData.cols.findIndex(
      (c: any) =>
        c.name.toLowerCase().includes("cust") &&
        (c.name.toLowerCase().includes("id") || c.name.toLowerCase().includes("no")),
    );
    if (custRefIdx !== -1 && !exportJoinFieldIndices.includes(custRefIdx)) exportJoinFieldIndices.push(custRefIdx);

    const prospectIdx = exportData.cols.findIndex(
      (c: any) =>
        c.name.toLowerCase().includes("prospect") ||
        c.name.toLowerCase().includes("ref_id") ||
        c.name.toLowerCase().includes("reference"),
    );
    if (prospectIdx !== -1 && !exportJoinFieldIndices.includes(prospectIdx)) exportJoinFieldIndices.push(prospectIdx);
  }

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

  const emailIndex = exportData.cols.findIndex(
    (c: any) =>
      c.name.toLowerCase() === "email" ||
      c.name.toLowerCase() === "email_address" ||
      c.name.toLowerCase().includes("mail"),
  );

  // 2. Write-Back to the specific Suppression Database!
  if (historyDbId && historyTableId && finalRows.length > 0 && emailIndex !== -1) {
    try {
      const suppTables = await getTables(historyDbId);
      const suppTable = suppTables.find((t) => t.id === historyTableId);
      if (suppTable) {
        const suppFields = await getFields(historyTableId);
        const refField = suppFields.find((f: any) =>
          f.name.toLowerCase().includes("reference") ||
          f.name.toLowerCase().includes("email") ||
          f.name.toLowerCase().includes("mail")
        );
        const dateField = suppFields.find((f: any) =>
          f.name.toLowerCase().includes("export_date") ||
          f.name.toLowerCase().includes("date") ||
          f.name.toLowerCase().includes("sent")
        );
        const codeField = suppFields.find((f: any) =>
          f.name.toLowerCase().includes("campaign") ||
          f.name.toLowerCase().includes("code")
        );

        if (refField && dateField) {
          const emailsToLog = finalRows
            .map((row) => row[emailIndex])
            .filter((email) => email && email !== "null" && email.trim() !== "");

          if (emailsToLog.length > 0) {
            const columns = codeField
              ? `[${refField.name}], [${codeField.name}], [${dateField.name}]`
              : `[${refField.name}], [${dateField.name}]`;
            const values = emailsToLog
              .map((email) =>
                codeField
                  ? `('${email.replace(/'/g, "''")}', '${campaignCode}', CAST(GETDATE() AS DATE))`
                  : `('${email.replace(/'/g, "''")}', CAST(GETDATE() AS DATE))`
              )
              .join(",");
            const insertSql = `INSERT INTO [${suppTable.name}] (${columns}) VALUES ${values};`;
            try {
              await runNativeQuery(historyDbId, insertSql);
              console.log(`Logged ${emailsToLog.length} emails to suppression list.`);
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
