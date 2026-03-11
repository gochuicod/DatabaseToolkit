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

function findSuppressionRefField(suppFields: any[]): any | null {
  const nonPk = suppFields.filter((f: any) => f.semantic_type !== "type/PK");
  return (
    nonPk.find((f: any) => {
      const n = normalizeColName(f.name);
      return n === "customerrefid" || n === "customerid";
    }) ||
    nonPk.find((f: any) => {
      const n = normalizeColName(f.name);
      return n.includes("ref") && (n.includes("cust") || n.includes("id"));
    }) ||
    nonPk.find((f: any) => normalizeColName(f.name).includes("ref")) ||
    nonPk.find((f: any) => {
      const n = normalizeColName(f.name);
      return (
        n.includes("customer") && !n.includes("email") && !n.includes("mail")
      );
    }) ||
    nonPk.find(
      (f: any) =>
        f.base_type === "type/Text" &&
        !normalizeColName(f.name).includes("email") &&
        !normalizeColName(f.name).includes("mail"),
    ) ||
    null
  );
}

function findSuppressionFieldByNames(
  suppFields: any[],
  preferred: string[],
): any | null {
  for (const name of preferred) {
    const found = suppFields.find(
      (f: any) => normalizeColName(f.name) === normalizeColName(name),
    );
    if (found) return found;
  }
  return null;
}

function detectSuppressionField(
  suppFields: any[],
  preferred: string[],
  heuristic: (field: any) => boolean,
  label: string,
): { field: any | null; reason: string; confidence: number } {
  const exact = findSuppressionFieldByNames(suppFields, preferred);
  if (exact) {
    return {
      field: exact,
      reason: `${label} matched preferred column name ${exact.name}`,
      confidence: 98,
    };
  }

  const fallback = suppFields.find(heuristic) || null;
  if (fallback) {
    return {
      field: fallback,
      reason: `${label} selected by heuristic match on ${fallback.name}`,
      confidence: 75,
    };
  }

  return {
    field: null,
    reason: `${label} could not be detected`,
    confidence: 0,
  };
}

function detectSourceRef(
  cols: any[],
  rows: any[] = [],
): {
  index: number;
  columnName: string | null;
  confidence: number;
  reason: string;
} {
  if (!cols || cols.length === 0) {
    return {
      index: -1,
      columnName: null,
      confidence: 0,
      reason: "No columns available in sampled source data",
    };
  }

  const sampledRows = rows.slice(0, 500);
  const scored = cols.map((c: any, idx: number) => {
    const n = normalizeColName(c.name);
    let score = 0;
    const reasons: string[] = [];

    if (c.semantic_type === "type/PK") {
      score += 60;
      reasons.push("PK semantic type");
    }

    if (n === "customerrefid" || n === "customerid") {
      score += 120;
      reasons.push("exact customer reference identifier");
    }
    if (
      n.includes("customerref") ||
      n.includes("referenceid") ||
      n.includes("refid")
    ) {
      score += 110;
      reasons.push("reference-id style naming");
    }
    if (
      n.includes("cust") ||
      n.includes("memberid") ||
      n.includes("subscriberid")
    ) {
      score += 90;
      reasons.push("customer/member style naming");
    }
    if (n === "id" || /^id\d+$/.test(n)) {
      score += 50;
      reasons.push("id-like naming");
    }
    if (n.includes("ref") && !n.includes("pref") && !n.includes("address")) {
      score += 40;
      reasons.push("generic reference token");
    }

    if (
      n.includes("email") ||
      n.includes("mail") ||
      n.includes("zip") ||
      n.includes("date") ||
      n.includes("phone") ||
      n.includes("name")
    ) {
      score -= 35;
      reasons.push("penalty for non-reference style field");
    }

    if (sampledRows.length > 0) {
      const nonEmptyValues = sampledRows
        .map((row) => row[idx])
        .filter(
          (v) =>
            v !== null &&
            v !== undefined &&
            String(v).trim() !== "" &&
            String(v).trim().toLowerCase() !== "null",
        );

      const nonEmptyRatio = nonEmptyValues.length / sampledRows.length;
      const uniqueRatio =
        nonEmptyValues.length > 0
          ? new Set(nonEmptyValues.map((v) => String(v).trim())).size /
            nonEmptyValues.length
          : 0;

      score += Math.round(nonEmptyRatio * 20);
      score += Math.round(uniqueRatio * 20);
      reasons.push(
        `data quality nonEmpty=${Math.round(nonEmptyRatio * 100)}% unique=${Math.round(uniqueRatio * 100)}%`,
      );
    }

    return { idx, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];

  if (!winner || winner.score <= 0) {
    return {
      index: -1,
      columnName: null,
      confidence: 0,
      reason: "No source reference candidate reached minimum score",
    };
  }

  const confidence = Math.max(1, Math.min(99, winner.score));
  return {
    index: winner.idx,
    columnName: String(cols[winner.idx]?.name || ""),
    confidence,
    reason: `Selected ${String(cols[winner.idx]?.name || "unknown")} because ${winner.reasons.slice(0, 3).join("; ")}`,
  };
}

function detectSourceSystem(cols: any[]): {
  index: number;
  columnName: string | null;
  confidence: number;
  reason: string;
} {
  if (!cols || cols.length === 0) {
    return {
      index: -1,
      columnName: null,
      confidence: 0,
      reason: "No columns available in sampled source data",
    };
  }

  const preferredTokens = [
    { token: "sourcesystem", score: 98, reason: "exact source system token" },
    { token: "source", score: 88, reason: "source token in column name" },
    { token: "origin", score: 85, reason: "origin token in column name" },
    { token: "marketingsource", score: 92, reason: "marketing source token" },
    { token: "marketingorigin", score: 90, reason: "marketing origin token" },
    { token: "channel", score: 80, reason: "channel token in column name" },
    { token: "listname", score: 75, reason: "list name as source proxy" },
    { token: "segment", score: 70, reason: "segment as source proxy" },
  ];

  for (const item of preferredTokens) {
    const idx = cols.findIndex((c: any) =>
      normalizeColName(c.name).includes(item.token),
    );
    if (idx !== -1) {
      return {
        index: idx,
        columnName: String(cols[idx]?.name || ""),
        confidence: item.score,
        reason: `Selected ${String(cols[idx]?.name || "unknown")} due to ${item.reason}`,
      };
    }
  }

  return {
    index: -1,
    columnName: null,
    confidence: 45,
    reason:
      "No dedicated source-system column detected; provenance will be derived",
  };
}

function findSourceRefIndex(cols: any[], rows: any[] = []): number {
  return detectSourceRef(cols, rows).index;
}

function findSourceSystemIndex(cols: any[]): number {
  return detectSourceSystem(cols).index;
}

function buildSuppressionSourceValue(
  rowSourceValue: string | null,
  databaseId: number,
  tableName: string,
  refColumnName: string,
  sourceColumnName: string | null,
  maxLength: number = 64,
): string {
  const clean = (v: string | null) => (v ? v.replace(/\s+/g, " ").trim() : "");
  const short = (v: string, len: number) =>
    v.length <= len ? v : v.slice(0, Math.max(1, len));

  const sourceVal = clean(rowSourceValue);

  const full = [
    `db:${databaseId}`,
    `table:${tableName}`,
    `ref:${refColumnName}`,
    sourceColumnName ? `col:${sourceColumnName}` : "",
    sourceVal ? `val:${sourceVal}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  if (full.length <= maxLength) {
    return full;
  }

  const compact = [
    `d${databaseId}`,
    `t:${short(tableName, 14)}`,
    `r:${short(refColumnName, 10)}`,
    sourceVal ? `v:${short(sourceVal, 16)}` : "",
  ]
    .filter(Boolean)
    .join("|");

  if (compact.length <= maxLength) {
    return compact;
  }

  const minimal = sourceVal
    ? `d${databaseId}|v:${short(sourceVal, 12)}`
    : `d${databaseId}|t:${short(tableName, 8)}`;
  return short(minimal, maxLength);
}

function getFieldTextMaxLength(field: any): number | null {
  if (!field) return null;

  const dbType = String(
    field.database_type || field.base_type || "",
  ).toLowerCase();
  const isUnicodeTextType =
    dbType.includes("nvarchar") ||
    dbType.includes("nchar") ||
    dbType.includes("ntext");

  const normalizeLength = (raw: number): number | null => {
    if (!isFinite(raw) || isNaN(raw) || raw <= 0) return null;
    if (raw === -1) return null;

    // SQL Server often reports nvarchar/nchar max_length in bytes.
    if (isUnicodeTextType) {
      return Math.max(1, Math.floor(raw / 2));
    }

    return Math.floor(raw);
  };

  const directCandidates = [
    field.max_length,
    field.length,
    field.character_maximum_length,
    field.database_max_length,
  ];

  for (const candidate of directCandidates) {
    const n = normalizeLength(Number(candidate));
    if (n) {
      return n;
    }
  }

  const match = dbType.match(/(?:n?varchar|n?char|text|string)\s*\((\d+)\)/i);
  if (match) {
    const n = normalizeLength(Number(match[1]));
    if (n) {
      return n;
    }
  }

  return null;
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

export async function getTableData(
  databaseId: number,
  tableId: number,
  filters: FilterValue[],
  limit: number = 1000,
  offset: number = 0,
  scanLimit: number = 100000,
): Promise<{
  columns: string[];
  records: Record<string, any>[];
  total: number;
}> {
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
      limit,
    },
  };

  if (offset > 0) {
    (query.query as any).offset = offset;
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

  const columns: string[] = cols.map((c: any) => c.display_name || c.name);
  const rawNames: string[] = cols.map((c: any) => c.name);

  const records = rows.map((row: any[]) => {
    const record: Record<string, any> = {};
    rawNames.forEach((name, i) => {
      record[columns[i]] = row[i];
    });
    return record;
  });

  const countResult = await getCount(databaseId, tableId, filters, scanLimit);

  return {
    columns,
    records,
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

async function getNativeRowCount(
  databaseId: number,
  tableName: string,
  whereClause: string,
): Promise<number> {
  const countSql = `SELECT COUNT(1) AS total_count FROM [${tableName}] WHERE ${whereClause};`;
  const countResult = await runNativeQuery(databaseId, countSql);
  return Number(countResult.rows?.[0]?.[0] ?? 0);
}

async function fetchNativeRowsInBatches(
  databaseId: number,
  tableName: string,
  whereClause: string,
  targetRows: number,
): Promise<{ rows: any[]; cols: any[] }> {
  const rows: any[] = [];
  let cols: any[] = [];
  let offset = 0;
  const batchSize = 2000;

  while (rows.length < targetRows) {
    const remaining = targetRows - rows.length;
    const nextBatch = Math.min(batchSize, remaining);
    const batchSql =
      `SELECT * FROM [${tableName}] ` +
      `WHERE ${whereClause} ` +
      `ORDER BY (SELECT NULL) ` +
      `OFFSET ${offset} ROWS FETCH NEXT ${nextBatch} ROWS ONLY;`;

    const batchResult = await runNativeQuery(databaseId, batchSql);
    if (cols.length === 0) {
      cols = batchResult.cols ?? [];
    }

    const batchRows = batchResult.rows ?? [];
    if (batchRows.length === 0) {
      break;
    }

    rows.push(...batchRows);
    offset += batchRows.length;

    if (batchRows.length < nextBatch) {
      break;
    }
  }

  return { rows, cols };
}

export async function getExportMappingV2(
  databaseId: number,
  masterTableId: number,
  historyDbId: number | null,
  historyTableId: number | null,
  segments: string[],
): Promise<{
  ready: boolean;
  issues: string[];
  source: {
    databaseId: number;
    tableName: string;
    refColumn: string | null;
    refConfidence: number;
    refReason: string;
    sourceSystemColumn: string | null;
    sourceSystemConfidence: number;
    sourceSystemReason: string;
    sourceSystemSample: string | null;
  };
  suppression: {
    databaseId: number | null;
    tableName: string | null;
    refColumn: string | null;
    refReason: string;
    refConfidence: number;
    campaignCodeColumn: string | null;
    campaignCodeReason: string;
    campaignCodeConfidence: number;
    sourceSystemColumn: string | null;
    sourceSystemReason: string;
    sourceSystemConfidence: number;
    sentDateColumn: string | null;
    sentDateReason: string;
    sentDateConfidence: number;
  };
}> {
  const issues: string[] = [];

  const masterTables = await getTables(databaseId);
  const masterTable = masterTables.find((t) => t.id === masterTableId);
  if (!masterTable) {
    throw new Error("Master table not found");
  }

  let whereClause = "1=1";
  if (segments && segments.length > 0) {
    const segmentConditions = segments
      .map((seg) => {
        const colonIdx = seg.indexOf(":");
        if (colonIdx === -1) return "";

        const field = seg.substring(0, colonIdx);
        let val = seg.substring(colonIdx + 1);
        val = val.replace(/^["']+|["']+$/g, "").trim();

        let operator = "=";
        if (val.startsWith(">=")) {
          operator = ">=";
          val = val.substring(2).trim();
        } else if (val.startsWith("<=")) {
          operator = "<=";
          val = val.substring(2).trim();
        } else if (val.startsWith("!=")) {
          operator = "!=";
          val = val.substring(2).trim();
        } else if (val.startsWith(">")) {
          operator = ">";
          val = val.substring(1).trim();
        } else if (val.startsWith("<")) {
          operator = "<";
          val = val.substring(1).trim();
        }

        val = val.replace(/^["']+|["']+$/g, "").trim();

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
      })
      .filter(Boolean);

    if (segmentConditions.length > 0) {
      whereClause += ` AND ${segmentConditions.join(" AND ")}`;
    }
  }

  const sampled = await fetchNativeRowsInBatches(
    databaseId,
    masterTable.name,
    whereClause,
    500,
  );

  const sourceRefDetection = detectSourceRef(sampled.cols, sampled.rows);
  const sourceSystemDetection = detectSourceSystem(sampled.cols);

  const sourceRefIdx = sourceRefDetection.index;
  const sourceSystemIdx = sourceSystemDetection.index;

  const sourceRefColumn =
    sourceRefIdx !== -1 ? String(sampled.cols[sourceRefIdx]?.name || "") : null;
  const sourceSystemColumn =
    sourceSystemIdx !== -1
      ? String(sampled.cols[sourceSystemIdx]?.name || "")
      : null;

  const sourceSystemSample =
    sourceSystemIdx !== -1
      ? String(
          sampled.rows.find(
            (row) =>
              row[sourceSystemIdx] !== null &&
              row[sourceSystemIdx] !== undefined &&
              String(row[sourceSystemIdx]).trim() !== "",
          )?.[sourceSystemIdx] ?? "",
        ) || null
      : null;

  if (sourceRefIdx === -1) {
    issues.push(
      "No reliable source reference column was detected in the selected export table.",
    );
  }

  let suppressionTableName: string | null = null;
  let suppRefColumn: string | null = null;
  let suppCodeColumn: string | null = null;
  let suppSourceColumn: string | null = null;
  let suppDateColumn: string | null = null;
  let suppRefReason = "Suppression reference detection not run";
  let suppRefConfidence = 0;
  let suppCodeReason = "Suppression campaign code detection not run";
  let suppCodeConfidence = 0;
  let suppSourceReason = "Suppression source system detection not run";
  let suppSourceConfidence = 0;
  let suppDateReason = "Suppression sent date detection not run";
  let suppDateConfidence = 0;

  if (historyDbId && historyTableId) {
    const suppressionTables = await getTables(historyDbId);
    const suppressionTable = suppressionTables.find(
      (t) => t.id === historyTableId,
    );
    if (!suppressionTable) {
      issues.push(
        "Suppression table was not found in the configured suppression database.",
      );
    } else {
      suppressionTableName = suppressionTable.name;
      const suppFields = await getFields(historyTableId);

      const refField = findSuppressionRefField(suppFields);
      const codeDetection = detectSuppressionField(
        suppFields,
        ["Campaign_Code"],
        (f: any) =>
          normalizeColName(f.name).includes("campaign") ||
          normalizeColName(f.name).includes("code"),
        "Suppression campaign code",
      );
      const sourceDetection = detectSuppressionField(
        suppFields,
        ["Source_System"],
        (f: any) =>
          normalizeColName(f.name).includes("source") ||
          normalizeColName(f.name).includes("system"),
        "Suppression source system",
      );
      const dateDetection = detectSuppressionField(
        suppFields,
        ["Sent_Date"],
        (f: any) =>
          normalizeColName(f.name).includes("exportdate") ||
          normalizeColName(f.name).includes("date") ||
          normalizeColName(f.name).includes("sent"),
        "Suppression sent date",
      );

      const codeField = codeDetection.field;
      const sourceField = sourceDetection.field;
      const dateField = dateDetection.field;

      suppRefColumn = refField?.name ?? null;
      suppCodeColumn = codeField?.name ?? null;
      suppSourceColumn = sourceField?.name ?? null;
      suppDateColumn = dateField?.name ?? null;

      suppRefReason = refField
        ? `Suppression reference selected as ${refField.name}`
        : "Suppression reference column could not be detected";
      suppRefConfidence = refField ? 95 : 0;
      suppCodeReason = codeDetection.reason;
      suppCodeConfidence = codeDetection.confidence;
      suppSourceReason = sourceDetection.reason;
      suppSourceConfidence = sourceDetection.confidence;
      suppDateReason = dateDetection.reason;
      suppDateConfidence = dateDetection.confidence;

      if (!refField) {
        issues.push(
          "Suppression reference column (Customer Ref ID) was not detected.",
        );
      }
      if (!dateField) {
        issues.push("Suppression date column (Sent Date) was not detected.");
      }
      if (!codeField) {
        issues.push("Suppression campaign code column was not detected.");
      }
      if (!sourceField) {
        issues.push("Suppression source system column was not detected.");
      }
    }
  } else {
    issues.push(
      "Suppression database/table is not configured for this export.",
    );
  }

  return {
    ready: issues.length === 0,
    issues,
    source: {
      databaseId,
      tableName: masterTable.name,
      refColumn: sourceRefColumn,
      refConfidence: sourceRefDetection.confidence,
      refReason: sourceRefDetection.reason,
      sourceSystemColumn,
      sourceSystemConfidence: sourceSystemDetection.confidence,
      sourceSystemReason: sourceSystemDetection.reason,
      sourceSystemSample,
    },
    suppression: {
      databaseId: historyDbId,
      tableName: suppressionTableName,
      refColumn: suppRefColumn,
      refReason: suppRefReason,
      refConfidence: suppRefConfidence,
      campaignCodeColumn: suppCodeColumn,
      campaignCodeReason: suppCodeReason,
      campaignCodeConfidence: suppCodeConfidence,
      sourceSystemColumn: suppSourceColumn,
      sourceSystemReason: suppSourceReason,
      sourceSystemConfidence: suppSourceConfidence,
      sentDateColumn: suppDateColumn,
      sentDateReason: suppDateReason,
      sentDateConfidence: suppDateConfidence,
    },
  };
}

// Runs one lightweight COUNT(*) per suggested segment so the UI can surface match counts
// Returns -1 for a segment when the query errors (e.g. field doesn't exist)
export async function getSegmentMatchCounts(
  databaseId: number,
  tableName: string,
  segments: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  await Promise.all(
    segments.map(async (seg) => {
      const colonIdx = seg.indexOf(":");
      if (colonIdx === -1) {
        counts[seg] = 0;
        return;
      }
      const field = seg.substring(0, colonIdx);
      let val = seg
        .substring(colonIdx + 1)
        .replace(/^["']+|["']+$/g, "")
        .trim();

      let operator = "=";
      if (val.startsWith(">=")) {
        operator = ">=";
        val = val.substring(2).trim();
      } else if (val.startsWith("<=")) {
        operator = "<=";
        val = val.substring(2).trim();
      } else if (val.startsWith("!=")) {
        operator = "!=";
        val = val.substring(2).trim();
      } else if (val.startsWith(">")) {
        operator = ">";
        val = val.substring(1).trim();
      } else if (val.startsWith("<")) {
        operator = "<";
        val = val.substring(1).trim();
      }

      val = val.replace(/^["']+|["']+$/g, "").trim();

      let sqlVal: string;
      if (!isNaN(Number(val)) && val.trim() !== "") {
        sqlVal = val;
      } else if (val.toLowerCase() === "true") {
        sqlVal = "1";
      } else if (val.toLowerCase() === "false") {
        sqlVal = "0";
      } else {
        sqlVal = `'${val.replace(/'/g, "''")}'`;
      }

      try {
        const sql = `SELECT COUNT(*) FROM [${tableName}] WHERE [${field}] ${operator} ${sqlVal};`;
        const result = await runNativeQuery(databaseId, sql);
        counts[seg] = Number(result.rows[0]?.[0] ?? 0);
      } catch {
        counts[seg] = -1; // field doesn't exist in this table
      }
    }),
  );

  return counts;
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
    console.error(
      "Fast row count query failed, falling back to metadata:",
      err,
    );
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
        const colonIdx = seg.indexOf(":");
        if (colonIdx === -1) return "";
        const field = seg.substring(0, colonIdx);
        let val = seg.substring(colonIdx + 1);

        val = val.replace(/^["']+|["']+$/g, "").trim();

        let operator = "=";
        if (val.startsWith(">=")) {
          operator = ">=";
          val = val.substring(2).trim();
        } else if (val.startsWith("<=")) {
          operator = "<=";
          val = val.substring(2).trim();
        } else if (val.startsWith("!=")) {
          operator = "!=";
          val = val.substring(2).trim();
        } else if (val.startsWith(">")) {
          operator = ">";
          val = val.substring(1).trim();
        } else if (val.startsWith("<")) {
          operator = "<";
          val = val.substring(1).trim();
        }

        val = val.replace(/^["']+|["']+$/g, "").trim();

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
      })
      .filter(Boolean);

    if (segmentConditions.length > 0)
      whereClause += ` AND ${segmentConditions.join(" AND ")}`;
  }

  const topLimit = Math.min(Math.max(contactCap * 5, contactCap), 100000);
  console.log("🎯 PREVIEW QUERY DEBUG:", {
    contactCap,
    topLimit,
    whereClause: whereClause.substring(0, 100) + "...",
    tableName: masterTable.name,
  });

  const totalCandidates = await getNativeRowCount(
    databaseId,
    masterTable.name,
    whereClause,
  );

  const { rows: previewRows, cols: previewCols } =
    await fetchNativeRowsInBatches(
      databaseId,
      masterTable.name,
      whereClause,
      topLimit,
    );

  console.log("🎯 PREVIEW DATABASE RESPONSE:", {
    totalCandidates,
    rowsFetchedForPreview: previewRows.length,
    colCount: previewCols.length,
  });
  console.log(
    "👉 RAW COLUMNS FROM DB:",
    previewCols.map((c: any) => c.name),
  );

  const finalRows = [];
  let excludedCount = 0;
  let suppressedIds = new Set<string>();
  let previewRefIndex = -1;

  if (historyDbId && historyTableId) {
    previewRefIndex = findSourceRefIndex(previewCols, previewRows);

    if (previewRefIndex !== -1) {
      const candidateKeys = new Set<string>();
      previewRows.forEach((row) => {
        const val = String(row[previewRefIndex]).toLowerCase().trim();
        if (val && val !== "null" && val !== "") candidateKeys.add(val);
      });

      if (candidateKeys.size > 0) {
        try {
          const suppTables = await getTables(historyDbId);
          const suppTable = suppTables.find((t) => t.id === historyTableId);

          if (suppTable) {
            const suppFields = await getFields(historyTableId);
            const refField = findSuppressionRefField(suppFields);

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
              console.log(
                `Preview exclusion: Found ${suppressedIds.size} suppressed refs using column [${refField.name}]`,
              );
            }
          }
        } catch (e) {
          console.error("Failed to lookup suppression list via IN clause:", e);
        }
      }
    }
  }

  for (const row of previewRows) {
    if (previewRefIndex !== -1 && suppressedIds.size > 0) {
      const val = String(row[previewRefIndex]).toLowerCase().trim();
      if (val && val !== "null" && val !== "" && suppressedIds.has(val)) {
        excludedCount++;
        continue;
      }
    }
    finalRows.push(row);
    if (finalRows.length >= contactCap) break;
  }

  console.log("🎯 PREVIEW FILTERING RESULTS:", {
    totalFetched: previewRows.length,
    suppressedIds: suppressedIds.size,
    excluded: excludedCount,
    finalRowsCount: finalRows.length,
    targetCap: contactCap,
  });

  // FIXED: Push previews WITH EMAILS to the top, then sort by least nulls
  const emailIndex = previewCols.findIndex((c: any) => {
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
    previewCols.forEach((col: any, i: number) => {
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

  const columns = previewCols.map((c: any) => c.name);
  const allRecords = finalRows.map((row) => {
    const record: Record<string, any> = {};
    columns.forEach((col: string, i: number) => {
      record[col] = row[i];
    });
    return record;
  });

  // Build a human-readable warning when no results come back
  let filterWarning: string | null = null;
  if (finalRows.length === 0) {
    if (totalCandidates === 0 && segments.length === 0) {
      filterWarning =
        "The selected table appears to be empty or returned no rows.";
    } else if (totalCandidates === 0 && segments.length > 0) {
      const segmentList = segments.map((s) => `"${s}"`).join(", ");
      filterWarning =
        `None of the targeting rules matched any records in this table. ` +
        `The following filters returned 0 results: ${segmentList}. ` +
        `This usually means the suggested field names or values do not exist in the selected database. ` +
        `Try re-analyzing with a different table, or remove individual filters to isolate which ones have no matches.`;
    } else if (totalCandidates > 0 && excludedCount > 0) {
      filterWarning =
        `${totalCandidates.toLocaleString()} contacts matched the targeting rules, but all ${excludedCount.toLocaleString()} were suppressed. ` +
        `Try increasing the "Exclude Mailed Within" days or selecting a different suppression window.`;
    } else if (totalCandidates > 0) {
      filterWarning =
        `${totalCandidates.toLocaleString()} contacts matched the targeting rules but all were filtered out. ` +
        `Check that the field names and values suggested by the AI exist in this table.`;
    } else {
      filterWarning =
        "No contacts matched the campaign criteria. The AI-suggested targeting rules may not align with the fields available in this table. Try re-analyzing with a clearer campaign description.";
    }
  }

  return {
    count: finalRows.length,
    sample: sample,
    columns,
    records: allRecords,
    excludedCount: excludedCount,
    totalCandidates,
    historyTableUsed: !!historyDbId,
    filterWarning,
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
        const colonIdx = seg.indexOf(":");
        if (colonIdx === -1) return "";
        const field = seg.substring(0, colonIdx);
        let val = seg.substring(colonIdx + 1);

        val = val.replace(/^["']+|["']+$/g, "").trim();

        let operator = "=";
        if (val.startsWith(">=")) {
          operator = ">=";
          val = val.substring(2).trim();
        } else if (val.startsWith("<=")) {
          operator = "<=";
          val = val.substring(2).trim();
        } else if (val.startsWith("!=")) {
          operator = "!=";
          val = val.substring(2).trim();
        } else if (val.startsWith(">")) {
          operator = ">";
          val = val.substring(1).trim();
        } else if (val.startsWith("<")) {
          operator = "<";
          val = val.substring(1).trim();
        }

        val = val.replace(/^["']+|["']+$/g, "").trim();

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
      })
      .filter(Boolean);
    if (segmentConditions.length > 0)
      whereClause += ` AND ${segmentConditions.join(" AND ")}`;
  }

  const topLimit = Math.min(Math.max(contactCap * 5, contactCap), 100000);
  console.log("🎯 EXPORT QUERY DEBUG:", {
    contactCap,
    topLimit,
    tableName: masterTable.name,
  });

  const { rows: exportRows, cols: exportCols } = await fetchNativeRowsInBatches(
    databaseId,
    masterTable.name,
    whereClause,
    topLimit,
  );

  console.log("🎯 EXPORT DATABASE RESPONSE:", {
    rowsFetchedForExport: exportRows.length,
    colCount: exportCols.length,
  });

  let suppressedIds = new Set<string>();
  let exportRefIndex = -1;

  if (historyDbId && historyTableId) {
    exportRefIndex = findSourceRefIndex(exportCols, exportRows);

    if (exportRefIndex !== -1) {
      const candidateKeys = new Set<string>();
      exportRows.forEach((row) => {
        const val = String(row[exportRefIndex]).toLowerCase().trim();
        if (val && val !== "null" && val !== "") candidateKeys.add(val);
      });

      if (candidateKeys.size > 0) {
        try {
          const suppTables = await getTables(historyDbId);
          const suppTable = suppTables.find((t) => t.id === historyTableId);
          if (suppTable) {
            const suppFields = await getFields(historyTableId);
            const refField = findSuppressionRefField(suppFields);

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
              console.log(
                `Exclusion lookup: Found ${suppressedIds.size} suppressed refs in [${suppTable.name}] using column [${refField.name}]`,
              );
            }
          }
        } catch (e) {
          console.error("Failed to run chunked lookup for export:", e);
        }
      }
    }
  }

  const finalRows = [];
  for (const row of exportRows) {
    if (exportRefIndex !== -1 && suppressedIds.size > 0) {
      const val = String(row[exportRefIndex]).toLowerCase().trim();
      if (val && val !== "null" && val !== "" && suppressedIds.has(val)) {
        continue;
      }
    }
    finalRows.push(row);
    if (finalRows.length >= contactCap) break;
  }

  // FIXED: Push exports WITH EMAILS to the top, then sort by least nulls
  const emailIndex = exportCols.findIndex((c: any) => {
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

  if (historyDbId && historyTableId && finalRows.length > 0) {
    try {
      const suppTables = await getTables(historyDbId);
      const suppTable = suppTables.find((t) => t.id === historyTableId);
      if (!suppTable) {
        throw new Error(
          `Suppression write-back failed: history table ID ${historyTableId} was not found in database ${historyDbId}.`,
        );
      }

      const suppFields = await getFields(historyTableId);

      const suppRefField = findSuppressionRefField(suppFields);

      const suppDateField =
        findSuppressionFieldByNames(suppFields, ["Sent_Date"]) ||
        suppFields.find(
          (f: any) =>
            normalizeColName(f.name).includes("exportdate") ||
            normalizeColName(f.name).includes("date") ||
            normalizeColName(f.name).includes("sent"),
        );
      const suppCodeField =
        findSuppressionFieldByNames(suppFields, ["Campaign_Code"]) ||
        suppFields.find(
          (f: any) =>
            normalizeColName(f.name).includes("campaign") ||
            normalizeColName(f.name).includes("code"),
        );
      const suppSourceField =
        findSuppressionFieldByNames(suppFields, ["Source_System"]) ||
        suppFields.find(
          (f: any) =>
            normalizeColName(f.name).includes("source") ||
            normalizeColName(f.name).includes("system"),
        );

      const refSourceIndex = findSourceRefIndex(exportCols, finalRows);
      const sourceSystemIndex = findSourceSystemIndex(exportCols);
      const sourceSystemColName =
        sourceSystemIndex !== -1
          ? String(exportCols[sourceSystemIndex].name)
          : null;
      const suppressionSourceMaxLength = suppSourceField
        ? (getFieldTextMaxLength(suppSourceField) ?? 64)
        : 64;
      if (!suppRefField || !suppDateField || refSourceIndex === -1) {
        throw new Error(
          `Suppression write-back skipped due to missing required mapping. suppRefField=${!!suppRefField}, suppDateField=${!!suppDateField}, refSourceIndex=${refSourceIndex}`,
        );
      }

      const logEntries = finalRows
        .map((row) => {
          const ref = String(row[refSourceIndex]).trim();
          const rowSourceRaw =
            sourceSystemIndex !== -1 &&
            row[sourceSystemIndex] !== undefined &&
            row[sourceSystemIndex] !== null
              ? String(row[sourceSystemIndex]).trim()
              : null;

          return {
            ref,
            rowSourceRaw,
            sourceValue: buildSuppressionSourceValue(
              rowSourceRaw,
              databaseId,
              masterTable.name,
              String(exportCols[refSourceIndex].name),
              sourceSystemColName,
              suppressionSourceMaxLength,
            ),
          };
        })
        .filter(
          (entry) =>
            entry.ref &&
            entry.ref !== "null" &&
            entry.ref !== "" &&
            entry.ref !== "undefined",
        );

      if (logEntries.length === 0) {
        throw new Error(
          `Suppression write-back skipped: no valid customer references were found in source column ${exportCols[refSourceIndex].name}.`,
        );
      }

      const chunkSize = 500;
      let totalLogged = 0;
      let totalFailed = 0;

      console.log(
        `Suppression write-back starting: attempted=${logEntries.length}, sourceRefColumn=${exportCols[refSourceIndex].name}, sourceSystemColumn=${sourceSystemColName || "(derived)"}, targetTable=${suppTable.name}`,
      );

      for (let i = 0; i < logEntries.length; i += chunkSize) {
        const chunk = logEntries.slice(i, i + chunkSize);

        const insertCols: string[] = [`[${suppRefField.name}]`];
        if (suppCodeField) insertCols.push(`[${suppCodeField.name}]`);
        if (suppSourceField) insertCols.push(`[${suppSourceField.name}]`);
        insertCols.push(`[${suppDateField.name}]`);

        const values = chunk
          .map((entry) => {
            const parts: string[] = [
              `'${String(entry.ref).replace(/'/g, "''")}'`,
            ];
            if (suppCodeField) parts.push(`'${campaignCode}'`);
            if (suppSourceField) {
              parts.push(`'${String(entry.sourceValue).replace(/'/g, "''")}'`);
            }
            parts.push(`CAST(GETDATE() AS DATE)`);
            return `(${parts.join(", ")})`;
          })
          .join(",");

        const insertSql =
          `INSERT INTO [${suppTable.name}] (${insertCols.join(", ")}) ` +
          `OUTPUT INSERTED.[${suppRefField.name}] ` +
          `VALUES ${values};`;
        try {
          const insertResult = await runNativeQuery(historyDbId, insertSql);
          const insertedCount =
            insertResult.rows.length > 0
              ? insertResult.rows.length
              : chunk.length;
          totalLogged += insertedCount;
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);

          // Safety fallback: retry once with ultra-compact Source_System values.
          if (
            suppSourceField &&
            /truncated|String or binary data would be truncated/i.test(errMsg)
          ) {
            try {
              const compactValues = chunk
                .map((entry) => {
                  const parts: string[] = [
                    `'${String(entry.ref).replace(/'/g, "''")}'`,
                  ];
                  if (suppCodeField) parts.push(`'${campaignCode}'`);
                  if (suppSourceField) {
                    const compactSource = buildSuppressionSourceValue(
                      entry.rowSourceRaw,
                      databaseId,
                      masterTable.name,
                      String(exportCols[refSourceIndex].name),
                      sourceSystemColName,
                      12,
                    );
                    parts.push(
                      `'${String(compactSource).replace(/'/g, "''")}'`,
                    );
                  }
                  parts.push(`CAST(GETDATE() AS DATE)`);
                  return `(${parts.join(", ")})`;
                })
                .join(",");

              const retrySql =
                `INSERT INTO [${suppTable.name}] (${insertCols.join(", ")}) ` +
                `OUTPUT INSERTED.[${suppRefField.name}] ` +
                `VALUES ${compactValues};`;

              const retryResult = await runNativeQuery(historyDbId, retrySql);
              const retryCount =
                retryResult.rows.length > 0
                  ? retryResult.rows.length
                  : chunk.length;
              totalLogged += retryCount;
              console.warn(
                `Suppression chunk ${i}-${i + chunk.length} retried with compact Source_System due to truncation.`,
              );
            } catch (retryError) {
              totalFailed += chunk.length;
              console.error(
                `Failed to log suppression chunk ${i}-${i + chunk.length} after compact retry:`,
                retryError,
              );
            }
          } else {
            totalFailed += chunk.length;
            console.error(
              `Failed to log suppression chunk ${i}-${i + chunk.length}:`,
              e,
            );
          }
        }
      }

      console.log(
        `Suppression write-back summary: attempted=${logEntries.length}, logged=${totalLogged}, failed=${totalFailed}, table=${suppTable.name}, campaignCode=${campaignCode}`,
      );

      if (totalLogged !== logEntries.length) {
        throw new Error(
          `Suppression write-back incomplete: attempted=${logEntries.length}, logged=${totalLogged}, failed=${totalFailed}.`,
        );
      }
    } catch (e) {
      console.error("Failed to write-back to suppression list:", e);
      const errorMessage =
        e instanceof Error ? e.message : "Unknown suppression write-back error";
      throw new Error(`Export aborted: ${errorMessage}`);
    }
  }

  const headers = exportCols.map((c: any) => c.name).join(",");
  const rows = finalRows
    .map((row) =>
      row.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  return `${headers}\n${rows}`;
}
