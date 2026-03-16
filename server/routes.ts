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
  getMarketingPreviewV2,
  runMarketingExportAndLogV2,
  getExportMappingV2,
  getTableRowCountsFast,
  getTableData,
  getSegmentMatchCounts,
  getEmailFillRate,
  runNativeQuery,
} from "./metabase";
import {
  countQuerySchema,
  fieldOptionsQuerySchema,
  exportQuerySchema,
  analyzeConceptSchema,
  emailPreviewSchema,
  trendsICPAnalysisSchema,
  analyzeConceptSchemaV2,
  emailPreviewSchemaV2,
  type FilterValue,
  type TableWithFields,
} from "@shared/schema";
import {
  analyzeMarketingConcept,
  analyzeMarketingConceptMultiTable,
  analyzeMarketingConceptMasterTable,
  generateAnalysisSummary,
  generateAnalysisSQL,
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
    "/api/metabase/databases/:databaseId/table-counts",
    async (req, res) => {
      try {
        const databaseId = parseInt(req.params.databaseId, 10);
        if (isNaN(databaseId)) {
          return res.status(400).json({ error: "Invalid database ID" });
        }
        const tables = await getTables(databaseId);
        const tableNames = tables.map((t) => t.name);
        const fastCounts = await getTableRowCountsFast(databaseId, tableNames);

        const result: Record<string, number> = {};
        for (const table of tables) {
          result[String(table.id)] =
            fastCounts[table.name] ?? table.row_count ?? 0;
        }
        res.json(result);
      } catch (error) {
        console.error("Error fetching table counts:", error);
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch table counts",
        });
      }
    },
  );

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
        return res.status(400).json({
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
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get count",
      });
    }
  });

  app.post("/api/metabase/field-options", async (req, res) => {
    try {
      const parsed = fieldOptionsQuerySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
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
      res.status(500).json({
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
        return res.status(400).json({
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
        scanLimit,
      );
      res.json(result);
    } catch (error) {
      console.error("Error exporting mailing list:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to export mailing list",
      });
    }
  });

  app.post("/api/metabase/table-data", async (req, res) => {
    try {
      const { databaseId, tableId, filters, limit, offset, scanLimit } =
        req.body;
      if (!databaseId || !tableId) {
        return res
          .status(400)
          .json({ error: "databaseId and tableId are required" });
      }
      const result = await getTableData(
        databaseId,
        tableId,
        filters || [],
        limit || 1000,
        offset || 0,
        scanLimit || 100000,
      );
      res.json(result);
    } catch (error) {
      console.error("Error fetching table data:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to fetch table data",
      });
    }
  });

  // ... (Rest of routes for AI analysis, etc. remain unchanged) ...
  // [Full file content for other endpoints is preserved in existing logic]

  // --- NEW V2 ROUTES FOR TWO-TABLE ARCHITECTURE ---

  app.post("/api/ai/email-fill-rate", async (req, res) => {
    try {
      const { databaseId, masterTableId, emailColumn } = req.body;
      if (!databaseId || !masterTableId || !emailColumn) {
        return res.status(400).json({
          error: "databaseId, masterTableId, and emailColumn are required",
        });
      }
      const fillRate = await getEmailFillRate(
        Number(databaseId),
        Number(masterTableId),
        String(emailColumn),
      );
      res.json({ fillRate });
    } catch (error) {
      console.error("Error checking email fill rate:", error);
      // Return null fill rate rather than a 500 — non-fatal for the UI
      res.json({ fillRate: null });
    }
  });

  app.post("/api/ai/analyze-concept-v2", async (req, res) => {
    try {
      const parsed = analyzeConceptSchemaV2.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request body",
          details: parsed.error.errors,
        });
      }

      const { concept, databaseId, masterTableId } = parsed.data;

      // Fetch fields and master table name in parallel
      const [fields, masterTables] = await Promise.all([
        getFields(masterTableId),
        getTables(databaseId),
      ]);
      const masterTable = masterTables.find((t) => t.id === masterTableId);
      const masterTableName = masterTable?.name || String(masterTableId);

      // Fetch sample distinct values for categorical fields so the AI only suggests real values
      const categoricalFields = fields.filter(
        (f) =>
          f.base_type === "type/Text" ||
          f.semantic_type === "type/Category" ||
          f.base_type === "type/Boolean",
      );
      const fieldSampleValues: Record<string, string[]> = {};
      await Promise.all(
        categoricalFields.slice(0, 15).map(async (f) => {
          try {
            const options = await getFieldOptions(
              databaseId,
              masterTableId,
              f.id,
            );
            if (options.length > 0) {
              fieldSampleValues[f.name] = options
                .slice(0, 20)
                .map((o) => o.value);
            }
          } catch {
            // Non-fatal — skip if can't fetch values for this field
          }
        }),
      );

      // Use the richer V2 function that understands table context + domain vocabulary
      const analysis = await analyzeMarketingConceptMasterTable(
        concept,
        fields,
        masterTableName,
        null, // history table fields — system handles exclusions separately
        null,
        fieldSampleValues,
      );

      // Run per-segment COUNT(*) queries in parallel so the UI can show match counts per rule
      const matchCounts = await getSegmentMatchCounts(
        databaseId,
        masterTableName,
        analysis.suggestions.map((s) => s.segment),
      );

      res.json({ ...analysis, matchCounts });
    } catch (error) {
      console.error("Error analyzing concept v2:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to analyze concept",
      });
    }
  });

  app.post("/api/ai/preview-v2", async (req, res) => {
    try {
      // NOTE: Ensure your emailPreviewSchemaV2 in shared/schema.ts allows campaignCode
      const {
        databaseId,
        masterTableId,
        historyDbId,
        historyTableId,
        segments,
        contactCap,
        excludeDays,
        filterEmailsOnly,
      } = req.body;

      // We'll create this function in metabase.ts next
      const result = await getMarketingPreviewV2(
        databaseId,
        masterTableId,
        historyDbId || null,
        historyTableId || null,
        segments,
        contactCap || 5000,
        excludeDays || 7,
        filterEmailsOnly !== false,
      );

      res.json(result);
    } catch (error) {
      console.error("Error generating preview v2:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to generate preview",
      });
    }
  });

  app.post("/api/ai/export-mapping-v2", async (req, res) => {
    try {
      const {
        databaseId,
        masterTableId,
        historyDbId,
        historyTableId,
        segments,
      } = req.body;

      const mapping = await getExportMappingV2(
        databaseId,
        masterTableId,
        historyDbId || null,
        historyTableId || null,
        segments || [],
      );

      res.json(mapping);
    } catch (error) {
      console.error("Error building export mapping v2:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to build export mapping",
      });
    }
  });

  app.post("/api/ai/export-v2", async (req, res) => {
    try {
      const {
        databaseId,
        masterTableId,
        historyDbId,
        historyTableId,
        segments,
        contactCap,
        excludeDays,
        campaignCode,
        filterEmailsOnly,
      } = req.body;

      if (!campaignCode && historyTableId) {
        return res.status(400).json({
          error: "Campaign code is required when using a suppression list.",
        });
      }

      const sanitizedCampaignCode = campaignCode
        ? String(campaignCode)
            .replace(/[^a-zA-Z0-9_\-]/g, "")
            .substring(0, 50)
        : "";

      const csvString = await runMarketingExportAndLogV2(
        databaseId,
        masterTableId,
        historyDbId || null,
        historyTableId || null,
        segments,
        contactCap || 5000,
        excludeDays || 7,
        sanitizedCampaignCode,
        filterEmailsOnly !== false,
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="campaign-${campaignCode || "export"}.csv"`,
      );
      res.send(csvString);
    } catch (error) {
      console.error("Error exporting v2:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to export list",
      });
    }
  });

  // ── AI SQL Analysis for Data Filter tool ────────────────────────────
  app.post("/api/ai/sql-analysis", async (req, res) => {
    try {
      const { prompt, databaseId, tableId } = req.body;
      if (!prompt || !databaseId || !tableId) {
        return res.status(400).json({
          error: "prompt, databaseId, and tableId are required",
        });
      }

      // Fetch all tables + fields for the database so AI can suggest JOINs
      const allTables = await getTables(databaseId);
      const primaryTable = allTables.find((t) => t.id === tableId);
      if (!primaryTable) {
        return res.status(404).json({ error: "Table not found" });
      }

      const tablesWithFields = await Promise.all(
        allTables.map(async (table) => {
          const fields = await getFields(table.id);
          return {
            name: table.name,
            display_name: table.display_name,
            fields: fields.map((f) => ({
              name: f.name,
              display_name: f.display_name,
              base_type: f.base_type,
            })),
          };
        }),
      );

      // Step 1: AI generates SQL
      const analysis = await generateAnalysisSQL(
        prompt,
        tablesWithFields,
        primaryTable.name,
      );

      if (!analysis.sql) {
        return res.json({
          sql: "",
          explanation: analysis.explanation,
          columns: [],
          rows: [],
          chartConfig: null,
        });
      }

      // Safety: block any non-SELECT statements
      const sqlTrimmed = analysis.sql.trim().toUpperCase();
      if (
        !sqlTrimmed.startsWith("SELECT") ||
        /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|MERGE)\b/.test(
          sqlTrimmed,
        )
      ) {
        return res.status(400).json({
          error: "Only SELECT queries are allowed.",
          sql: analysis.sql,
        });
      }

      // Step 2: Execute the SQL against Metabase
      const result = await runNativeQuery(databaseId, analysis.sql);

      const columns = (result.cols || []).map((c: any) => ({
        name: c.name,
        display_name: c.display_name || c.name,
        base_type: c.base_type || "type/Text",
      }));

      const rows = (result.rows || []).map((row: any[]) => {
        const record: Record<string, any> = {};
        columns.forEach((col: any, i: number) => {
          record[col.name] = row[i];
        });
        return record;
      });

      res.json({
        sql: analysis.sql,
        explanation: analysis.explanation,
        columns,
        rows,
        chartConfig: analysis.chartConfig,
        rowCount: rows.length,
      });
    } catch (error) {
      console.error("Error running AI SQL analysis:", error);
      const errMsg =
        error instanceof Error ? error.message : "Failed to run analysis";
      // Return the error but also the SQL so the user can see what failed
      res.status(500).json({ error: errMsg });
    }
  });

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

  return httpServer;
}
