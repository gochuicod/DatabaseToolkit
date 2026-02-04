import type { MetabaseDatabase, MetabaseTable, MetabaseField, FilterValue, FieldOption, MailingListEntry } from "@shared/schema";

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
    throw new Error("Metabase credentials not configured. Please set METABASE_URL, METABASE_EMAIL, and METABASE_PASSWORD.");
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
  sessionExpiresAt = Date.now() + (13 * 24 * 60 * 60 * 1000);
  
  return sessionToken!;
}

async function metabaseRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
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

export async function getDatabases(): Promise<MetabaseDatabase[]> {
  const data = await metabaseRequest("/api/database");
  return data.data.map((db: any) => ({
    id: db.id,
    name: db.name,
    engine: db.engine,
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
        const orClauses = filter.values.map(v => ["=", fieldRef, v]);
        return ["or", ...orClauses];
      }
      return ["=", fieldRef, filter.value];
    case "not_equals":
      if (filter.values && filter.values.length > 0) {
        const andClauses = filter.values.map(v => ["!=", fieldRef, v]);
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
  filters: FilterValue[]
): Promise<{ count: number; total: number; percentage: number }> {
  const totalQuery = {
    database: databaseId,
    type: "query",
    query: {
      "source-table": tableId,
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
  const combinedFilter = filterClauses.length === 1 
    ? filterClauses[0] 
    : ["and", ...filterClauses];

  const countQuery = {
    database: databaseId,
    type: "query",
    query: {
      "source-table": tableId,
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
  fieldId: number
): Promise<FieldOption[]> {
  const query = {
    database: databaseId,
    type: "query",
    query: {
      "source-table": tableId,
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
  limit: number = 1000
): Promise<{ entries: MailingListEntry[]; total: number }> {
  const fields = await getFields(tableId);
  
  const findField = (patterns: string[]): number | null => {
    for (const pattern of patterns) {
      const field = fields.find(
        (f) =>
          f.name.toLowerCase().includes(pattern) ||
          f.display_name.toLowerCase().includes(pattern)
      );
      if (field) return field.id;
    }
    return null;
  };

  const nameFieldId = findField(["name", "full_name", "fullname", "customer_name", "contact_name", "氏名", "名前", "顧客名"]);
  const emailFieldId = findField(["email", "mail", "e-mail", "email_address", "メール", "eメール", "電子メール", "email_addr", "mailing", "used_for_mailing"]);
  const addressFieldId = findField(["address", "street", "address1", "street_address", "住所", "アドレス"]);
  const cityFieldId = findField(["city", "town", "市", "都市"]);
  const stateFieldId = findField(["state", "province", "region", "都道府県", "県", "州"]);
  const zipcodeFieldId = findField(["zip", "zipcode", "postal", "postal_code", "postcode", "郵便番号"]);
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
  const combinedFilter = filterClauses.length === 0
    ? undefined
    : filterClauses.length === 1
    ? filterClauses[0]
    : ["and", ...filterClauses];

  const query: any = {
    database: databaseId,
    type: "query",
    query: {
      "source-table": tableId,
      fields: breakoutFields.map((id) => ["field", id, null]),
      limit,
    },
  };

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
    const name = col.name.toLowerCase();
    if (name.includes("name") && !("name" in colIndexMap)) colIndexMap.name = index;
    if ((name.includes("email") || name.includes("mail")) && !("email" in colIndexMap)) colIndexMap.email = index;
    if ((name.includes("address") || name.includes("street")) && !("address" in colIndexMap)) colIndexMap.address = index;
    if (name.includes("city") && !("city" in colIndexMap)) colIndexMap.city = index;
    if ((name.includes("state") || name.includes("province")) && !("state" in colIndexMap)) colIndexMap.state = index;
    if ((name.includes("zip") || name.includes("postal")) && !("zipcode" in colIndexMap)) colIndexMap.zipcode = index;
    if (name.includes("country") && !("country" in colIndexMap)) colIndexMap.country = index;
  });

  const entries: MailingListEntry[] = rows.map((row: any[]) => ({
    name: colIndexMap.name !== undefined ? String(row[colIndexMap.name] ?? "") : "",
    email: colIndexMap.email !== undefined ? String(row[colIndexMap.email] ?? "") : "",
    address: colIndexMap.address !== undefined ? String(row[colIndexMap.address] ?? "") : "",
    city: colIndexMap.city !== undefined ? String(row[colIndexMap.city] ?? "") : "",
    state: colIndexMap.state !== undefined ? String(row[colIndexMap.state] ?? "") : "",
    zipcode: colIndexMap.zipcode !== undefined ? String(row[colIndexMap.zipcode] ?? "") : "",
    country: colIndexMap.country !== undefined ? String(row[colIndexMap.country] ?? "") : "",
  }));

  const countResult = await getCount(databaseId, tableId, filters);

  return {
    entries,
    total: countResult.count,
  };
}

// Analysis Functions for BrainWorks Data

export async function runAnalysisQuery(
  databaseId: number,
  tableId: number,
  query: any
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

// Get aggregated data with breakout by a field
export async function getAggregatedData(
  databaseId: number,
  tableId: number,
  breakoutFieldId: number,
  aggregation: any[] = [["count"]],
  limit: number = 20
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

// Get total count for a table
export async function getTotalCount(
  databaseId: number,
  tableId: number
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

// Get sum of a numeric field
export async function getFieldSum(
  databaseId: number,
  tableId: number,
  fieldId: number
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

// Get average of a numeric field
export async function getFieldAverage(
  databaseId: number,
  tableId: number,
  fieldId: number
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

// Run a raw MBQL query
export async function runRawQuery(
  databaseId: number,
  querySpec: any
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

// Run native SQL query directly against the database
export async function runNativeQuery(
  databaseId: number,
  sql: string
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
