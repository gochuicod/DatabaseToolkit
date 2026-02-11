import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Metabase Database Types
export interface MetabaseDatabase {
  id: number;
  name: string;
  engine: string;
  size_info?: string; // Optional: Added size info
  table_count?: number; // Optional
}

export interface MetabaseTable {
  id: number;
  name: string;
  display_name: string;
  schema: string;
  db_id: number;
  row_count?: number; // Optional: Added row count
}

export interface MetabaseField {
  id: number;
  name: string;
  display_name: string;
  base_type: string;
  semantic_type: string | null;
  table_id: number;
}

// Filter Types
export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "between"
  | "is_null"
  | "is_not_null";

export interface FilterValue {
  fieldId: number;
  fieldName: string;
  fieldDisplayName: string;
  operator: FilterOperator;
  value: string | number | null;
  values?: (string | number)[]; // For multi-select "in" operator
  valueTo?: string | number | null; // For "between" operator
}

export interface ActiveFilter {
  id: string;
  filter: FilterValue;
}

// Field Options (for dropdowns)
export interface FieldOption {
  value: string;
  count: number;
}

// Mailing List Result
export interface MailingListEntry {
  name: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  country?: string;
}

// API Response Types
export interface CountResponse {
  count: number;
  total: number;
  percentage: number;
}

export interface FieldOptionsResponse {
  fieldId: number;
  options: FieldOption[];
}

export interface MailingListResponse {
  entries: MailingListEntry[];
  total: number;
}

// Filter Schema for API validation
export const filterValueSchema = z.object({
  fieldId: z.number(),
  fieldName: z.string(),
  fieldDisplayName: z.string(),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "starts_with",
    "ends_with",
    "greater_than",
    "less_than",
    "between",
    "is_null",
    "is_not_null",
  ]),
  value: z.union([z.string(), z.number(), z.null()]),
  values: z.array(z.union([z.string(), z.number()])).optional(),
  valueTo: z.union([z.string(), z.number(), z.null()]).optional(),
});

export const countQuerySchema = z.object({
  databaseId: z.number(),
  tableId: z.number(),
  filters: z.array(filterValueSchema),
});

export const fieldOptionsQuerySchema = z.object({
  databaseId: z.number(),
  tableId: z.number(),
  fieldId: z.number(),
});

// UPDATED: Added offset support
export const exportQuerySchema = z.object({
  databaseId: z.number(),
  tableId: z.number(),
  filters: z.array(filterValueSchema),
  limit: z.number().optional().default(1000),
  offset: z.number().optional().default(0), // Added offset
});

export type FiltersQuery = z.infer<typeof countQuerySchema>;

// Email Marketing Tool Types
export interface SegmentSuggestion {
  segment: string;
  confidence: number;
  reasoning: string;
}

export interface AIAnalysisResponse {
  suggestions: SegmentSuggestion[];
  suggestedAgeRange: string | null;
  reasoning: string;
}

export interface EmailMarketingPreviewContact {
  name: string;
  email: string;
  city?: string;
  state?: string;
}

export interface EmailMarketingPreviewResponse {
  count: number;
  sample: EmailMarketingPreviewContact[];
  excludedCount: number;
}

// Table with fields structure for multi-table analysis
export interface TableWithFields {
  id: number;
  name: string;
  display_name: string;
  fields: MetabaseField[];
}

// Email Marketing Schemas for API validation
export const analyzeConceptSchema = z.object({
  concept: z.string().min(1, "Campaign concept is required"),
  databaseId: z.number(),
  tableId: z.number().optional(), // Optional - if not provided, analyze all tables
  birthdayFilter: z.string().optional(),
  excludeDays: z.number().min(0).default(7),
  contactCap: z.number().min(1).default(5000),
});

export const emailPreviewSchema = z.object({
  databaseId: z.number(),
  tableId: z.number().optional(), // Optional for multi-table mode
  segments: z.array(z.string()), // Format: "table_name.field_name:value" or "field_name:value"
  ageRange: z.string().nullable().optional(),
  birthdayFilter: z.string().optional(),
  excludeDays: z.number().min(0).default(7),
  contactCap: z.number().min(1).default(5000),
});

export type AnalyzeConceptRequest = z.infer<typeof analyzeConceptSchema>;
export type EmailPreviewRequest = z.infer<typeof emailPreviewSchema>;

// Email Marketing V2 Schemas (Two-Table Architecture)
export const analyzeConceptSchemaV2 = z.object({
  concept: z.string().min(1, "Campaign concept is required"),
  databaseId: z.number(),
  masterTableId: z.number(), // T1: Master Email List (required)
  historyTableId: z.number().nullable().optional(), // T2: History/Behavior Log (optional)
  birthdayFilter: z.string().optional(),
  excludeDays: z.number().min(0).default(7),
  contactCap: z.number().min(1).default(5000),
});

export const emailPreviewSchemaV2 = z.object({
  databaseId: z.number(),
  masterTableId: z.number(), // T1: Master Email List (required)
  historyTableId: z.number().nullable().optional(), // T2: History/Behavior Log (optional)
  segments: z.array(z.string()), // Format: "field_name:value"
  ageRange: z.string().nullable().optional(),
  birthdayFilter: z.string().optional(),
  excludeDays: z.number().min(0).default(7),
  contactCap: z.number().min(1).default(5000),
});

export type AnalyzeConceptRequestV2 = z.infer<typeof analyzeConceptSchemaV2>;
export type EmailPreviewRequestV2 = z.infer<typeof emailPreviewSchemaV2>;

// Trend & ICP Analysis Schema
export const trendsICPAnalysisSchema = z.object({
  databaseId: z.number(),
  tableId: z.number(),
  excludeMailed: z.boolean().default(false),
});

export type TrendsICPAnalysisRequest = z.infer<typeof trendsICPAnalysisSchema>;
