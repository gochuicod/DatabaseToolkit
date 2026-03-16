import OpenAI from "openai";
import type { MetabaseField, TableWithFields } from "@shared/schema";

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface AnalysisResult {
  suggestions: Array<{
    segment: string;
    confidence: number;
    reasoning: string;
    tableId?: number;
  }>;
  suggestedAgeRange: string | null;
  reasoning: string;
}

// Analyze with a single table's fields
export async function analyzeMarketingConcept(
  concept: string,
  fields: MetabaseField[],
): Promise<AnalysisResult> {
  const fieldDescriptions = fields
    .map((f) => `- ${f.display_name || f.name} (${f.name}): ${f.base_type}`)
    .join("\n");

  const systemPrompt = `You are a marketing data analyst. Your job is to analyze campaign concepts and suggest relevant customer segments based on the available database fields.

The user has a customer database with these fields:
${fieldDescriptions}

Based on the campaign description and available fields, identify:
1. Specific field-value combinations that would target the right customers
2. Suggested age range if demographic targeting is implied
3. Your reasoning

For each segment suggestion, use the actual field name from the database and suggest specific values or conditions.

Respond with a JSON object containing:
{
  "suggestions": [
    {
      "segment": "field_name:value or field_name:condition",
      "confidence": 0.0-1.0,
      "reasoning": "why this segment matches the campaign"
    }
  ],
  "suggestedAgeRange": ">50" or "25-40" or null,
  "reasoning": "overall analysis explanation"
}

Examples of segment formats:
- "interest:luxury_travel" for filtering by an interest field
- "status:VIP" for filtering by customer status
- "location:California" for geographic targeting
- "age:>50" for age-based targeting`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this campaign concept and suggest matching customer segments based on the available database fields:\n\n${concept}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {
      suggestions: [],
      suggestedAgeRange: null,
      reasoning: "Failed to parse AI response",
    };
  }
}

// Analyze with ALL tables in a database
export async function analyzeMarketingConceptMultiTable(
  concept: string,
  tablesWithFields: TableWithFields[],
): Promise<AnalysisResult> {
  // Create a description of all tables and their fields
  const tableDescriptions = tablesWithFields
    .map((table) => {
      const fieldList = table.fields
        .map(
          (f) =>
            `    - ${f.display_name || f.name} (${f.name}): ${f.base_type}`,
        )
        .join("\n");
      return `TABLE: ${table.display_name || table.name} (id: ${table.id})\n${fieldList}`;
    })
    .join("\n\n");

  // Check if the recommended email table exists
  const hasRecommendedTable = tablesWithFields.some(
    (t) =>
      t.name.toLowerCase().includes("acquired_rpt_hj") ||
      t.name.toLowerCase().includes("jason_2005_2006") ||
      t.name.toLowerCase().includes("galaxy_individual") ||
      t.name.toLowerCase().includes("galaxy individual"),
  );

  const galaxyTable = tablesWithFields.find(
    (t) =>
      t.name.toLowerCase().includes("galaxy_individual") ||
      t.name.toLowerCase().includes("galaxy individual"),
  );

  const recommendedTableNote = hasRecommendedTable
    ? `
PRIORITY TABLE FOR EMAIL CAMPAIGNS:
${
  galaxyTable
    ? `The table "${galaxyTable.name}" (galaxy_individual) is the PRIMARY customer master table. It contains all contact records with LTV fields (GL_LTV, TSI_LTV, SY_LTV, MD_LTV), demographics (ddob, gender, prefecture), and source/origin fields. Always prioritize segments from this table.`
    : `The table "Acquired Rpt Hj Rpt Jason 2005 2006" (or similar name containing "acquired_rpt_hj" or "jason_2005_2006") contains the PRIMARY email data with a large dataset.`
}
When building email marketing campaigns, ALWAYS include at least one segment from this table as it has verified email addresses.
Look for the "email" field in this table and prioritize segments that can filter this table.
`
    : "";

  const systemPrompt = `You are a marketing data analyst. Your job is to analyze campaign concepts and suggest relevant customer segments based on the available database tables and fields.

The user has a customer database with these tables:

${tableDescriptions}
${recommendedTableNote}
Based on the campaign description and available fields across ALL tables, identify:
1. Specific table.field-value combinations that would target the right customers
2. Which table(s) contain the most relevant data for this campaign
3. Suggested age range if demographic targeting is implied
4. Your reasoning

IMPORTANT: For each segment suggestion, include the table name in the format "table_name.field_name:value". This tells us which table to query.
IMPORTANT: Prioritize tables that have email fields for email marketing campaigns.

Respond with a JSON object containing:
{
  "suggestions": [
    {
      "segment": "table_name.field_name:value or table_name.field_name:condition",
      "tableId": <numeric table id>,
      "confidence": 0.0-1.0,
      "reasoning": "why this segment matches the campaign"
    }
  ],
  "suggestedAgeRange": ">50" or "25-40" or null,
  "reasoning": "overall analysis explanation including which tables are most relevant"
}

Examples of segment formats:
- "customers.interest:luxury_travel" for filtering by interest field in customers table
- "contacts.status:VIP" for filtering by customer status in contacts table
- "orders.total:>1000" for filtering by order total`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this campaign concept and suggest matching customer segments based on ALL available database tables and fields:\n\n${concept}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {
      suggestions: [],
      suggestedAgeRange: null,
      reasoning: "Failed to parse AI response",
    };
  }
}

// V2: Analyze concept against a single master table (T1)
export async function analyzeMarketingConceptMasterTable(
  concept: string,
  masterTableFields: MetabaseField[],
  masterTableName: string,
  historyTableFields: MetabaseField[] | null,
  historyTableName: string | null,
  fieldSampleValues?: Record<string, string[]>,
): Promise<AnalysisResult> {
  // Create a description of T1 fields, including real sample values where available
  const masterFieldList = masterTableFields
    .map((f) => {
      const base = `    - ${f.display_name || f.name} (${f.name}): ${f.base_type}`;
      const samples = fieldSampleValues?.[f.name];
      if (samples && samples.length > 0) {
        return `${base}  [known values: ${samples
          .slice(0, 20)
          .map((v) => `"${v}"`)
          .join(", ")}]`;
      }
      return base;
    })
    .join("\n");

  // Create a description of T2 fields if available
  const historySection =
    historyTableFields && historyTableName
      ? `

T2: HISTORY/BEHAVIOR LOG TABLE: ${historyTableName}
This table contains email campaign history with fields like:
${historyTableFields.map((f) => `    - ${f.display_name || f.name} (${f.name}): ${f.base_type}`).join("\n")}

The History table (T2) will be used to:
1. EXCLUDE contacts who received emails recently (based on SentDate)
2. Calculate engagement scores (based on Opened, Clicked fields)
3. Prioritize highly engaged users for campaigns`
      : `

NOTE: No History table (T2) is configured. The system will not be able to exclude recently-sent contacts or calculate engagement scores.`;

  const isGalaxyTable =
    masterTableName.toLowerCase().includes("galaxy_individual") ||
    masterTableName.toLowerCase().includes("galaxy individual");

  const galaxySchemaHints = isGalaxyTable
    ? `

GALAXY INDIVIDUAL TABLE SCHEMA HINTS:
This is the main customer master table for a direct mail business. Key field patterns:
- GL_LTV, TSI_LTV, SY_LTV, MD_LTV: Lifetime value per brand (GL=Gloria, TSI=True Spirit/Takeshi-i, SY=Sunny, MD=Modern Direct). A value > 0 means the contact is a buyer for that brand.
- ddob: Date of birth (use for age targeting)
- gender: Gender field
- prefecture: Japanese prefecture (geographic targeting)
- Source or OS fields: List origin codes — these often hold OSL (Outside Source List) category values, source codes, and acquisition flags
- Email field: presence of email address
- Mobile field: 1 = has mobile number

When a campaign targets Gloria customers: filter GL_LTV > 0
When a campaign targets TSI customers: filter TSI_LTV > 0
When a campaign targets buyers (any brand): filter on LTV fields > 0
For age-based targeting: use ddob with DATEDIFF
`
    : "";

  const domainGlossary = `
DIRECT MAIL INDUSTRY DOMAIN KNOWLEDGE:
- OSL (Outside Source List): A rented or exchanged mailing list from an outside source. Contacts in an OSL category are likely to respond to similar offers.
- Gloria OSL: Contacts from the Gloria brand's outside source lists — typically older demographics who have responded to spiritual, esoteric, or metaphysical direct mail products.
- MD / MD After 2009: Contacts acquired via direct mail after 2009. "MD" as a source code means mail-acquired. "MD After 2009" means only recent mail acquisitions.
- LTV (Lifetime Value): Total revenue a contact has generated. Higher LTV = higher value buyer.
- RFM: Recency, Frequency, Monetary — classic direct mail segmentation. Contacts with recent, frequent, high-value purchases are the best targets.
- Source codes: Short codes stored in Source/OS fields identifying how a contact was acquired (e.g., "GL_OSL", "TSI_DM", "MD_2010").

ESO/SPIRITUAL PRODUCT DOMAIN KNOWLEDGE:
When a campaign concept mentions "fortune", "luck", "astrology", "spiritual", "esoteric", "metaphysical", "feng shui", "psychic", "Gloria OSL", "astrology hotline", "lucky charm", "fortune-bringing", "religious goods", "esoteric merchandise", "astrology newsletter", "spiritual self-improvement":
- These are PRODUCT CATEGORIES: look for product type fields, category fields, source fields, or campaign response fields
- "Gloria OSL" is a SOURCE CATEGORY: map to Source, OS, or list-origin fields
- Target contacts who are GL_LTV > 0 (bought Gloria products) and/or have a matching Source value
- "Belief-driven purchasing" and "faith-based" = look for source/category fields that indicate spiritual or metaphysical product response
- "Direct mail respondents" = contacts with non-null Source fields from DM sources, or MD_ prefixed source codes
- "After 2009" or "MD After 2009" = look for acquisition date fields or source codes with year indicators
`;

  const systemPrompt = `You are a senior marketing data analyst specializing in direct mail campaigns. Your job is to analyze campaign concepts and suggest ONLY targeting rules that use REAL field names and REAL values from the actual database.

CRITICAL RULES:
1. ONLY suggest field names that appear in the field list below — never invent field names
2. ONLY suggest values that appear in the "known values" list for that field — never invent values. Use the EXACT value string from the known values list (e.g., if gender known values are "M  ", "F  ", use "M  " not "Male" or "M").
3. If you cannot find a matching field for a concept, say so in the reasoning instead of hallucinating a field name
4. Use format "field_name:value" (no table prefix) — the field_name must EXACTLY match the database field name shown in parentheses
5. For numeric comparisons (age, LTV, etc.), use operators in the value: "field_name:>=40" or "field_name:>0" — supported operators are >=, <=, >, <, !=
6. When the campaign says "aged X and above", output "age:>=X" (NOT "age:X"). When it says "high value buyers", output an LTV field with ">0".
${domainGlossary}${galaxySchemaHints}
T1: MASTER EMAIL LIST TABLE: ${masterTableName}
This table contains the primary contact data with these fields (ONLY use these field names):
${masterFieldList}
${historySection}

Based on the campaign description and available fields in T1:
1. Suggest field-value combinations that would target the right customers
2. For each suggestion, the field name MUST be from the list above, and the value MUST be from the "known values" list if provided
3. Include an age range suggestion if demographic targeting is implied

Respond with a JSON object:
{
  "suggestions": [
    {
      "segment": "field_name:value",
      "confidence": 0.0-1.0,
      "reasoning": "why this segment matches — if no matching field exists, explain that here"
    }
  ],
  "suggestedAgeRange": ">50" or "25-40" or null,
  "reasoning": "overall strategy explanation, including any limitations based on available fields"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this campaign concept and suggest matching customer segments from the Master Table (T1):\n\n${concept}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {
      suggestions: [],
      suggestedAgeRange: null,
      reasoning: "Failed to parse AI response",
    };
  }
}

interface TrendData {
  period: string;
  value: number;
  change: number;
}

interface ICPSegment {
  name: string;
  size: number;
  percentage: number;
  avgValue: number;
  characteristics: string[];
  score: number;
}

interface TrendsICPResult {
  trends: TrendData[];
  icpSegments: ICPSegment[];
  summary: string;
  totalRecords: number;
  mailedExcluded: number;
}

export async function runTrendsICPAnalysis(
  fields: MetabaseField[],
  excludeMailed: boolean,
): Promise<TrendsICPResult> {
  const fieldDescriptions = fields
    .map((f) => `- ${f.display_name || f.name} (${f.name}): ${f.base_type}`)
    .join("\n");

  const systemPrompt = `You are a marketing data analyst specializing in Trend Analysis and Ideal Customer Profile (ICP) identification.

The user has a customer database with these fields:
${fieldDescriptions}

${excludeMailed ? "NOTE: The user wants to EXCLUDE customers who have already been mailed. Factor this into your analysis and reflect it in the mailedExcluded count." : ""}

Your job is to:
1. Generate realistic TREND data showing customer activity over recent periods (months or quarters)
2. Identify 3-5 ICP SEGMENTS based on the available data fields
3. Provide insightful analysis summary

For ICP segments, identify customer groups based on:
- Value/revenue contribution
- Engagement patterns
- Demographics or location if available
- Purchase behavior indicators
- Response/conversion likelihood

Respond with a JSON object:
{
  "trends": [
    { "period": "Q4 2025", "value": <customer_count>, "change": <percent_change_from_previous> },
    { "period": "Q3 2025", "value": <customer_count>, "change": <percent_change> },
    { "period": "Q2 2025", "value": <customer_count>, "change": <percent_change> },
    { "period": "Q1 2025", "value": <customer_count>, "change": <percent_change> }
  ],
  "icpSegments": [
    {
      "name": "Segment Name",
      "size": <number_of_customers>,
      "percentage": <percent_of_total>,
      "avgValue": <average_customer_value>,
      "characteristics": ["trait1", "trait2", "trait3"],
      "score": <0-100_icp_match_score>
    }
  ],
  "summary": "Executive summary of trends and ICP insights...",
  "totalRecords": <total_records_analyzed>,
  "mailedExcluded": <number_excluded_if_filter_applied_else_0>
}

Generate realistic mock data that would make sense for a marketing database.
The ICP segments should have actionable characteristics based on the available fields.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Generate a comprehensive Trend & ICP Analysis for this customer database. ${excludeMailed ? "Exclude customers who have already been mailed from the analysis." : "Include all customers in the analysis."}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {
      trends: [],
      icpSegments: [],
      summary: "Failed to parse AI response",
      totalRecords: 0,
      mailedExcluded: 0,
    };
  }
}

// AI Summary for Trends & ICP Analysis (uses pre-aggregated data only)
interface SnapshotData {
  totalCustomers: number;
  glBuyers: number;
  tsiBuyers: number;
  syBuyers: number;
  mdBuyers: number;
  glTsiOverlap: number;
  glMdOverlap: number;
  syGlOverlap: number;
}

interface ICPSegmentData {
  gender: string;
  ageGroup: string;
  location: string;
  customerCount: number;
  avgTotalLtv: number;
  mobileRate: number;
  emailRate: number;
}

interface AnalysisSummaryResult {
  summary: string;
  topDemographic: string;
  crossSellOpportunity: string;
  contactabilityWarning: string;
}

export async function generateAnalysisSummary(
  snapshot: SnapshotData,
  icpSegments: ICPSegmentData[],
): Promise<AnalysisSummaryResult> {
  const systemPrompt = `You are a Marketing Data Analyst. You will receive pre-aggregated customer data (NOT raw database rows).

Your job is to analyze this data and provide a brief, actionable summary for marketing teams.

Generate exactly 3 insights:
1. TOP PERFORMING DEMOGRAPHIC: Which Age/Location combination has the highest LTV
2. CROSS-SELL OPPORTUNITY: Which brand overlap suggests the biggest cross-sell potential  
3. CONTACTABILITY WARNING: Any high-LTV segment with low Email or Mobile coverage

Respond with JSON:
{
  "summary": "A brief 2-3 sentence executive summary combining all insights",
  "topDemographic": "One sentence about the top performing demographic",
  "crossSellOpportunity": "One sentence about the best cross-sell opportunity",
  "contactabilityWarning": "One sentence warning about contactability gaps (or 'No significant contactability concerns' if rates are good)"
}

Keep each insight to ONE sentence. Be specific with numbers.`;

  const userContent = `Analyze this aggregated customer data:

CUSTOMER SNAPSHOT:
- Total Customers: ${snapshot.totalCustomers.toLocaleString()}
- GL Buyers: ${snapshot.glBuyers.toLocaleString()}
- TSI Buyers: ${snapshot.tsiBuyers.toLocaleString()}  
- SY Buyers: ${snapshot.syBuyers.toLocaleString()}
- MD Buyers: ${snapshot.mdBuyers.toLocaleString()}

CROSS-SELL OVERLAPS:
- GL + TSI Overlap: ${snapshot.glTsiOverlap.toLocaleString()} customers buy both
- GL + MD Overlap: ${snapshot.glMdOverlap.toLocaleString()} customers buy both
- SY + GL Overlap: ${snapshot.syGlOverlap.toLocaleString()} customers buy both

TOP 10 ICP SEGMENTS (by Avg Total LTV):
${icpSegments
  .slice(0, 10)
  .map(
    (s, i) =>
      `${i + 1}. ${s.gender || "Unknown"} / ${s.ageGroup} / ${s.location}: ${s.customerCount.toLocaleString()} customers, Avg LTV ¥${s.avgTotalLtv.toLocaleString()}, Email: ${(s.emailRate * 100).toFixed(1)}%, Mobile: ${(s.mobileRate * 100).toFixed(1)}%`,
  )
  .join("\n")}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {
      summary: "Unable to generate summary. Please try again.",
      topDemographic: "Analysis unavailable",
      crossSellOpportunity: "Analysis unavailable",
      contactabilityWarning: "Analysis unavailable",
    };
  }
}

interface CustomAnalysisResult {
  query: string;
  results: Array<Record<string, any>>;
  summary: string;
}

export async function runCustomAnalysis(
  prompt: string,
): Promise<CustomAnalysisResult> {
  return runCustomAnalysisWithData(prompt, null, null, []);
}

export async function runCustomAnalysisWithData(
  prompt: string,
  tableSchema: any[] | null,
  realData: any | null,
  sampleData: any[],
): Promise<CustomAnalysisResult> {
  let systemPrompt: string;
  let userContent: string;

  if (tableSchema && realData) {
    // We have real data - analyze it
    systemPrompt = `You are a marketing data analyst working with real BrainWorks customer data. You have access to actual database information.

DATABASE SCHEMA:
${JSON.stringify(tableSchema, null, 2)}

AGGREGATED DATA:
${JSON.stringify(realData, null, 2)}

SAMPLE RECORDS (first 20):
${JSON.stringify(sampleData.slice(0, 10), null, 2)}

The user will describe an analysis they want to perform. Your job is to:
1. Analyze the REAL data provided above
2. Generate insights based on the actual numbers and distributions
3. Create results that reflect the real data (don't make up numbers - use the actual data)
4. Write a summary explaining the insights

Respond with a JSON object containing:
{
  "query": "Description of what analysis was performed on the real data",
  "results": [
    { "column1": "value1", "column2": "value2", ... },
    ...
  ],
  "summary": "A brief summary of the key insights from this analysis based on the real data",
  "dataSource": "real"
}

Use the actual data from the database. Include relevant columns and real values from the provided data.`;

    userContent = prompt;
  } else {
    // No real data - use mock data approach
    systemPrompt = `You are a marketing data analyst. The user will describe an analysis they want to perform.

NOTE: No database connection is available. Generate example results to demonstrate what the analysis would show.

Respond with a JSON object containing:
{
  "query": "Description of what query/analysis would be run",
  "results": [
    { "column1": "value1", "column2": "value2", ... },
    ...
  ],
  "summary": "A brief summary of what insights this analysis would provide",
  "dataSource": "example"
}

Generate 5-10 example results with appropriate column names.`;

    userContent = prompt;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  const aiContent = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(aiContent);
  } catch {
    return {
      query: "Failed to generate query",
      results: [],
      summary:
        "Failed to parse AI response. Please try again with a different prompt.",
    };
  }
}

// ── AI SQL Analysis for Data Filter tool ─────────────────────────────

export interface SQLAnalysisResult {
  sql: string;
  explanation: string;
  chartConfig: {
    type: "bar" | "line" | "pie" | "table_only";
    xKey: string;
    yKey: string;
    title: string;
  } | null;
}

export async function generateAnalysisSQL(
  prompt: string,
  allTables: Array<{
    name: string;
    display_name: string;
    fields: Array<{ name: string; display_name: string; base_type: string }>;
  }>,
  primaryTableName: string,
): Promise<SQLAnalysisResult> {
  const tableDescriptions = allTables
    .map((table) => {
      const fieldList = table.fields
        .map(
          (f) =>
            `    - [${f.name}] (${f.display_name}): ${f.base_type.replace("type/", "")}`,
        )
        .join("\n");
      const marker = table.name === primaryTableName ? " ← SELECTED TABLE" : "";
      return `TABLE: [${table.name}]${marker}\n${fieldList}`;
    })
    .join("\n\n");

  const systemPrompt = `You are a SQL Server analyst. The user will describe an analysis in natural language. Generate a T-SQL query that answers their question.

DATABASE SCHEMA (all tables in the same database):
${tableDescriptions}

RULES:
1. Write valid T-SQL (Microsoft SQL Server syntax)
2. Always use bracket notation for table/column names: [table_name], [column_name]
3. The user has selected [${primaryTableName}] as their primary table. Focus queries on this table, but JOIN other tables when the question requires it.
4. For JOINs, infer relationships from matching column names across tables (e.g., same ID columns)
5. Limit results to at most 100 rows unless the user asks for more
6. Use TOP, GROUP BY, ORDER BY, aggregate functions as needed
7. Do NOT use CTEs or temp tables — keep it to a single SELECT statement
8. Do NOT include any DDL (CREATE, ALTER, DROP) or DML (INSERT, UPDATE, DELETE) statements
9. If the question cannot be answered with the available fields, explain why in the "explanation" field and provide the closest possible query

Also suggest a chart configuration if the results would benefit from visualization.

Respond with JSON:
{
  "sql": "SELECT ... FROM [table] ...",
  "explanation": "Brief explanation of what this query does and what insights it provides",
  "chartConfig": {
    "type": "bar" | "line" | "pie" | "table_only",
    "xKey": "column_name_for_x_axis",
    "yKey": "column_name_for_y_axis",
    "title": "Chart title"
  }
}

Set chartConfig to null if the result is best viewed as a table only (e.g., detail rows, text-heavy results).
Use "bar" for categorical comparisons, "line" for time series, "pie" for proportions with few categories.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {
      sql: "",
      explanation:
        "Failed to parse AI response. Please try a different prompt.",
      chartConfig: null,
    };
  }
}
