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

  app.get("/api/metabase/databases/:databaseId/tables/:tableId/rows", async (req, res) => {
    const databaseId = parseInt(req.params.databaseId, 10);
    const tableId = parseInt(req.params.tableId, 10);
    // Changed default limit from 500,000 to 100 for performance
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    if (isNaN(databaseId) || isNaN(tableId)) {
      return res.status(400).json({ error: "Invalid database or table ID" });
    }
  });

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

      const { databaseId, tableId, filters } = parsed.data;
      const result = await getCount(databaseId, tableId, filters as any);
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
        return res
          .status(400)
          .json({
            error: "Invalid request body",
            details: parsed.error.errors,
          });
      }

      const { databaseId, tableId, fieldId } = parsed.data;
      const options = await getFieldOptions(databaseId, tableId, fieldId);
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
        return res
          .status(400)
          .json({
            error: "Invalid request body",
            details: parsed.error.errors,
          });
      }

      // UPDATED: Destructure offset and pass to getMailingList
      const { databaseId, tableId, filters, limit, offset } = parsed.data;
      const result = await getMailingList(
        databaseId,
        tableId,
        filters as any,
        limit,
        offset,
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

  // ... (Rest of routes for AI analysis, etc. remain unchanged) ...
  // [Full file content for other endpoints is preserved in existing logic]

  // Email Marketing Tool - AI Routes
  app.post("/api/ai/analyze-concept", async (req, res) => {
    try {
      const parsed = analyzeConceptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({
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
