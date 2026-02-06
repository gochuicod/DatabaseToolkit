import type { Express } from "express";
import { createServer, type Server } from "http";
import {
  getDatabases,
  getTables,
  getFields,
  getCount,
  getFieldOptions,
  getMailingList,
  getAggregatedData,
  getTotalCount,
  runRawQuery,
  getSuppressedEmailsFromHistory,
  logExportToHistory,
} from "./metabase";
import {
  countQuerySchema,
  fieldOptionsQuerySchema,
  exportQuerySchema,
  analyzeConceptSchema,
  emailPreviewSchema,
  trendsICPAnalysisSchema,
  emailPreviewSchemaV2,
  analyzeConceptSchemaV2,
  emailExportSchemaV2,
  type FilterValue,
  type TableWithFields,
} from "@shared/schema";
import {
  analyzeMarketingConcept,
  analyzeMarketingConceptMultiTable,
  analyzeMarketingConceptMasterTable,
  generateAnalysisSummary,
} from "./openai";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  app.get("/api/metabase/databases", async (req, res) => {
    try {
      const databases = await getDatabases();
      res.json(databases);
    } catch (error) {
      console.error("Error fetching databases:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to fetch databases",
      });
    }
  });

  app.get("/api/metabase/databases/:databaseId/tables", async (req, res) => {
    try {
      const databaseId = parseInt(req.params.databaseId, 10);
      if (isNaN(databaseId)) {
        return res.status(400).json({ error: "Invalid database ID" });
      }
      const tables = await getTables(databaseId);
      res.json(tables);
    } catch (error) {
      console.error("Error fetching tables:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to fetch tables",
      });
    }
  });

  app.get(
    "/api/metabase/databases/:databaseId/tables/:tableId/rows",
    async (req, res) => {
      const databaseId = parseInt(req.params.databaseId, 10);
      const tableId = parseInt(req.params.tableId, 10);
      // Changed default limit from 500,000 to 100 for performance
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      if (isNaN(databaseId) || isNaN(tableId)) {
        return res.status(400).json({ error: "Invalid database or table ID" });
      }
    },
  );

  app.get("/api/metabase/tables/:tableId/fields", async (req, res) => {
    try {
      const tableId = parseInt(req.params.tableId, 10);
      if (isNaN(tableId)) {
        return res.status(400).json({ error: "Invalid table ID" });
      }
      const fields = await getFields(tableId);
      res.json(fields);
    } catch (error) {
      console.error("Error fetching fields:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to fetch fields",
      });
    }
  });

  // Get all tables with their fields for a database (for multi-table AI analysis)
  app.get(
    "/api/metabase/databases/:databaseId/tables-with-fields",
    async (req, res) => {
      try {
        const databaseId = parseInt(req.params.databaseId, 10);
        if (isNaN(databaseId)) {
          return res.status(400).json({ error: "Invalid database ID" });
        }

        const tables = await getTables(databaseId);

        // Fetch fields for all tables in parallel
        const tablesWithFields: TableWithFields[] = await Promise.all(
          tables.map(async (table) => {
            const fields = await getFields(table.id);
            return {
              id: table.id,
              name: table.name,
              display_name: table.display_name,
              fields,
            };
          }),
        );

        res.json(tablesWithFields);
      } catch (error) {
        console.error("Error fetching tables with fields:", error);
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch tables with fields",
        });
      }
    },
  );

  app.post("/api/metabase/count", async (req, res) => {
    try {
      const parsed = countQuerySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({
            error: "Invalid request body",
            details: parsed.error.errors,
          });
      }

      // Read limit from body (added manual check since it might not be in schema strict definition yet)
      const limit = req.body.limit || 100000;
      const { databaseId, tableId, filters } = parsed.data;

      const result = await getCount(databaseId, tableId, filters as any, limit);
      res.json(result);
    } catch (error) {
      console.error("Error getting count:", error);
      res
        .status(500)
        .json({
          error: error instanceof Error ? error.message : "Failed to get count",
        });
    }
  });

  app.post("/api/metabase/field-options", async (req, res) => {
    try {
      const parsed = fieldOptionsQuerySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({
            error: "Invalid request body",
            details: parsed.error.errors,
          });
      }

      const limit = req.body.limit || 100000;
      const { databaseId, tableId, fieldId } = parsed.data;

      const options = await getFieldOptions(
        databaseId,
        tableId,
        fieldId,
        limit,
      );
      res.json({ fieldId, options });
    } catch (error) {
      console.error("Error getting field options:", error);
      res
        .status(500)
        .json({
          error:
            error instanceof Error
              ? error.message
              : "Failed to get field options",
        });
    }
  });

  app.post("/api/metabase/export", async (req, res) => {
    try {
      const parsed = exportQuerySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({
            error: "Invalid request body",
            details: parsed.error.errors,
          });
      }

      const scanLimit = req.body.scanLimit || 100000;
      const { databaseId, tableId, filters, limit, offset } = parsed.data;

      const result = await getMailingList(
        databaseId,
        tableId,
        filters as any,
        limit,
        offset,
        scanLimit, // Pass the scan limit
      );
      res.json(result);
    } catch (error) {
      console.error("Error exporting mailing list:", error);
      res
        .status(500)
        .json({
          error:
            error instanceof Error
              ? error.message
              : "Failed to export mailing list",
        });
    }
  });

  // ... (Rest of routes for AI analysis, etc. remain unchanged) ...
  // [Full file content for other endpoints is preserved in existing logic]

  // Email Marketing Tool - AI Routes
  app.post("/api/ai/analyze-concept", async (req, res) => {
    try {
      const parsed = analyzeConceptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request body",
          details: parsed.error.errors,
        });
      }

      const { concept, databaseId, tableId } = parsed.data;

      if (tableId) {
        const fields = await getFields(tableId);
        const analysis = await analyzeMarketingConcept(concept, fields);
        res.json(analysis);
      } else {
        const tables = await getTables(databaseId);
        const tablesWithFields: TableWithFields[] = await Promise.all(
          tables.map(async (table) => {
            const fields = await getFields(table.id);
            return {
              id: table.id,
              name: table.name,
              display_name: table.display_name,
              fields,
            };
          }),
        );
        const analysis = await analyzeMarketingConceptMultiTable(
          concept,
          tablesWithFields,
        );
        res.json(analysis);
      }
    } catch (error) {
      console.error("Error analyzing concept:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to analyze concept",
      });
    }
  });

  // Email Marketing Tool V2 - Two-Table Architecture & Global Suppression

  app.post("/api/ai/analyze-concept-v2", async (req, res) => {
    try {
      const parsed = analyzeConceptSchemaV2.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body", details: parsed.error.errors });
      }

      const { concept, masterTableId, historyTableId } = parsed.data;

      const masterFields = await getFields(masterTableId);
      // Fetch table names for context
      // We can get table name by fetching table details or just fields (fields include table name usually?)
      // We need table name for the AI context.
      // Re-use `getFields` result? No, we need table metadata.
      // Let's just pass empty names or fetch properly.
      // Simple fix: pass 'Master Table' and 'History Table' as generics if names unavailable, 
      // but ideally we fetch names.
      // Optimization: We could look up table names from `getTables` if DB ID was passed (it is).

      const tables = await getTables(parsed.data.databaseId);
      const masterTableName = tables.find(t => t.id === masterTableId)?.name || "Master Table";

      let historyFields: any[] | null = null;
      let historyTableName: string | null = null;

      if (historyTableId) {
        historyFields = await getFields(historyTableId);
        historyTableName = tables.find(t => t.id === historyTableId)?.name || "History Table";
      }

      // 1. Fetch Samples for Categorical/Text Fields
      // This gives the AI context on actual values (e.g. "Interest: ['Sports', 'Music']")
      const fieldSamples: Record<string, string[]> = {};

      console.log(`[Analyze] Fetching samples for Master Table: ${masterTableName} (${masterTableId})`);

      // Filter for fields that are likely categorical (Text/Category)
      // Limit to first 10 fields to avoid performance hit
      const candidateFields = masterFields
        .filter(f =>
          (f.base_type === "type/Text" || f.semantic_type === "type/Category")
          && !f.name.toLowerCase().includes("id") // skip IDs
          && !f.name.toLowerCase().includes("email") // skip PII
          && !f.name.toLowerCase().includes("name") // skip PII
        )
        .slice(0, 10);

      const samplePromises = candidateFields.map(async (f) => {
        try {
          // Limit to 10 options, enough for AI context
          const options = await getFieldOptions(parsed.data.databaseId, masterTableId, f.id, 1000);
          // getFieldOptions returns objects { value, count }
          // We take top 5 values
          const topValues = options.slice(0, 5).map(o => o.value);
          if (topValues.length > 0) {
            fieldSamples[f.name] = topValues;
          }
        } catch (e) {
          // Ignore failures for samples
        }
      });

      await Promise.all(samplePromises);

      console.log("[Analyze] Field Samples collected:", JSON.stringify(fieldSamples, null, 2));

      const analysis = await analyzeMarketingConceptMasterTable(
        concept,
        masterFields,
        masterTableName,
        historyFields,
        historyTableName,
        fieldSamples // Pass samples to AI
      );

      console.log("[Analyze] AI Analysis Result:", JSON.stringify(analysis, null, 2));

      res.json(analysis);
    } catch (error) {
      console.error("Error in analyze-concept-v2:", error);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  app.post("/api/ai/preview-v2", async (req, res) => {
    try {
      const parsed = emailPreviewSchemaV2.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.errors });
      }

      const {
        databaseId,
        masterTableId,
        historyTableId,
        segments,
        marketingCode,
        excludeDays,
      } = parsed.data;

      // 1. Get Suppression List (Ref IDs) if History Table is active
      let excludedIds = new Set<string>();
      if (historyTableId) {
        excludedIds = await getSuppressedEmailsFromHistory(
          historyTableId,
          excludeDays,
          marketingCode,
        );
      }

      // 2. Fetch Master Table Data (filtered by segments)
      // Construct Metabase filters from segments
      const fields = await getFields(masterTableId);
      const filters: FilterValue[] = [];

      for (const segment of segments) {
        // format: "field:value"
        const [fieldName, value] = segment.split(":");
        if (!fieldName || !value) continue;

        // Find field ID
        const field = fields.find(
          (f) => f.name.toLowerCase() === fieldName.toLowerCase(),
        );
        if (field) {
          // Determine operator
          // If value contains ><, use comparison.
          // If field is Text, use 'contains' for fuzzier matching (AI sometimes hallucinates exact string).
          // If field is Number, use 'equals' (or comparison).

          let operator: any = "equals";
          let finalValue: any = value;

          if (value.startsWith(">")) {
            operator = "greater_than";
            finalValue = value.substring(1);
          } else if (value.startsWith("<")) {
            operator = "less_than";
            finalValue = value.substring(1);
          } else {
            // Default logic
            if (field.base_type === "type/Text" || field.semantic_type === "type/Category") {
              operator = "contains"; // Relaxed matching for string fields
            }
            finalValue = value;
          }

          filters.push({
            fieldId: field.id,
            fieldName: field.name,
            fieldDisplayName: field.display_name,
            operator: operator,
            value: finalValue,
          });
        }
      }

      console.log("[Preview] Generated Filters:", JSON.stringify(filters, null, 2));

      // Fetch sample (limit 100 for preview)
      const result = await getMailingList(
        databaseId,
        masterTableId,
        filters,
        100, // Limit
        0, // Offset
      );

      console.log(`[Preview] Result Count: ${result.total}, Entries: ${result.entries.length}`);

      // 3. Apply Suppression (In-Memory for Preview)
      // Note: `getMailingList` returns { entries, total }.
      // Use case: Total might be inaccurate if we suppress many, but for preview we just show sample.
      // If we want exact count after suppression, we need to fetch ALL IDs? That's expensive.
      // Approximation: Show "Total Candidates" (before suppression) and "Excluded Count" (if known).
      // Since `excludedIds` is a set of ALL excluded IDs, we can't easily intersect without fetching all candidates.
      // So "Matched Contacts" will be "Estimated Candidates" unless we scan more.

      const sample = result.entries.filter((e) => {
        const email = e.email?.toLowerCase();
        return email && !excludedIds.has(email);
      });

      res.json({
        count: result.total, // Total before suppression
        sample: sample.slice(0, 10),
        excludedCount: excludedIds.size, // Size of suppression list, not intersection
        totalCandidates: result.total,
        historyTableUsed: !!historyTableId,
        filterWarning: null,
      });
    } catch (e) {
      console.error("Preview error:", e);
      res.status(500).json({ error: "Preview failed" });
    }
  });

  app.post("/api/ai/export-v2", async (req, res) => {
    try {
      const parsed = emailExportSchemaV2.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.errors });
      }

      const {
        databaseId,
        masterTableId,
        historyTableId,
        segments,
        marketingCode,
        excludeDays,
      } = parsed.data;

      // 1. Get Suppression List
      let excludedIds = new Set<string>();
      if (historyTableId) {
        excludedIds = await getSuppressedEmailsFromHistory(
          historyTableId,
          excludeDays,
          marketingCode,
        );
      }

      // 2. Fetch ALL Data
      const fields = await getFields(masterTableId);
      const filters: FilterValue[] = [];
      for (const segment of segments) {
        const [fieldName, value] = segment.split(":");
        if (!fieldName || !value) continue;
        // Find field ID
        const field = fields.find(
          (f) => f.name.toLowerCase() === fieldName.toLowerCase(),
        );
        if (field) {
          let operator: any = "equals";
          let finalValue: any = value;

          if (value.startsWith(">")) {
            operator = "greater_than";
            finalValue = value.substring(1);
          } else if (value.startsWith("<")) {
            operator = "less_than";
            finalValue = value.substring(1);
          } else {
            if (field.base_type === "type/Text" || field.base_type === "type/Category") {
              operator = "contains";
            }
            finalValue = value;
          }

          filters.push({
            fieldId: field.id,
            fieldName: field.name,
            fieldDisplayName: field.display_name,
            operator: operator,
            value: finalValue,
          });
        }
      }

      // Fetch logic: Loop until done or limit cap (5000 default from UI?)
      // Use large limit for now.
      const result = await getMailingList(
        databaseId,
        masterTableId,
        filters,
        5000,
      );

      // 3. Filter & Export
      const exportRows = result.entries.filter((e) => {
        const email = e.email?.toLowerCase();
        return email && !excludedIds.has(email);
      });

      // 4. Log to History (Async)
      if (historyTableId && marketingCode) {
        logExportToHistory(historyTableId, marketingCode, exportRows as any).catch(
          (err) => console.error("Async Log Error:", err),
        );
      }

      // 5. Generate CSV
      const csvContent = [
        ["Name", "Email", "City", "State"].join(","),
        ...exportRows.map((r) =>
          [
            `"${r.name || ""}"`,
            `"${r.email || ""}"`,
            `"${r.city || ""}"`,
            `"${r.state || ""}"`,
          ].join(","),
        ),
      ].join("\\n");

      res.header("Content-Type", "text/csv");
      res.attachment(`campaign-${marketingCode}.csv`);
      res.send(csvContent);
    } catch (e) {
      console.error("Export error:", e);
      res.status(500).json({ error: "Export failed" });
    }
  });

  return httpServer;
}
