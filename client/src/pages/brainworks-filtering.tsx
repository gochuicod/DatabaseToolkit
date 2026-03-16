import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Filter,
  RefreshCw,
  AlertCircle,
  Plus,
  X,
  Search,
  ChevronDown,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Send,
  Code,
  ChevronUp,
  Copy,
  Table2,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { ResultsPanel } from "@/components/results-panel";
import { ExportDialog } from "@/components/export-dialog";
import { DatabaseSelector } from "@/components/database-selector";
import { apiRequest } from "@/lib/queryClient";
import {
  OPERATOR_LABELS,
  BASE_TYPE_OPERATORS,
  DEFAULT_OPERATORS,
} from "@/lib/constants";
import type {
  MetabaseDatabase,
  MetabaseTable,
  MetabaseField,
  FilterValue,
  ActiveFilter,
  CountResponse,
  FieldOption,
  FilterOperator,
} from "@shared/schema";

const MAX_FETCH_LIMIT = 999999999;

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(210, 76%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(35, 92%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(0, 72%, 55%)",
  "hsl(180, 60%, 45%)",
  "hsl(60, 70%, 50%)",
];

interface SQLAnalysisResponse {
  sql: string;
  explanation: string;
  columns: Array<{ name: string; display_name: string; base_type: string }>;
  rows: Array<Record<string, any>>;
  chartConfig: {
    type: "bar" | "line" | "pie" | "table_only";
    xKey: string;
    yKey: string;
    title: string;
  } | null;
  rowCount: number;
}

export default function BrainworksFiltering() {
  const { toast } = useToast();

  const [selectedDatabaseId, setSelectedDatabaseId] = useState<number | null>(
    null,
  );
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Record<number, FilterValue>>({});
  const [fieldOptions, setFieldOptions] = useState<
    Record<number, FieldOption[]>
  >({});
  const [loadingFieldOptions, setLoadingFieldOptions] = useState<
    Record<number, boolean>
  >({});
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [addFilterOpen, setAddFilterOpen] = useState(false);

  // AI Analysis state
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisPrompt, setAnalysisPrompt] = useState("");
  const [analysisResult, setAnalysisResult] =
    useState<SQLAnalysisResponse | null>(null);
  const [showSQL, setShowSQL] = useState(false);
  const [analysisViewMode, setAnalysisViewMode] = useState<"table" | "chart">(
    "table",
  );

  const debouncedFilters = useDebounce(filters, 600);
  const countAbortRef = useRef<AbortController | null>(null);

  const {
    data: databases = [],
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useQuery<MetabaseDatabase[]>({
    queryKey: ["/api/metabase/databases"],
  });

  useEffect(() => {
    if (databases.length > 0 && !selectedDatabaseId) {
      const brainworksDb = databases.find(
        (db) =>
          db.name.toLowerCase().includes("brainworks") ||
          db.name.toLowerCase().includes("brain works"),
      );
      if (brainworksDb) {
        setSelectedDatabaseId(brainworksDb.id);
      } else {
        setSelectedDatabaseId(databases[0].id);
      }
    }
  }, [databases, selectedDatabaseId]);

  const { data: tables = [], isLoading: isLoadingTables } = useQuery<
    MetabaseTable[]
  >({
    queryKey: ["/api/metabase/databases", selectedDatabaseId, "tables"],
    enabled: !!selectedDatabaseId,
  });

  const { data: fastCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/metabase/databases", selectedDatabaseId, "table-counts"],
    enabled: !!selectedDatabaseId,
  });

  const displayTables = useMemo(() => {
    return tables.map((table) => {
      const fastCount = fastCounts[String(table.id)];
      if (fastCount !== undefined) {
        return { ...table, row_count: fastCount };
      }
      return table;
    });
  }, [tables, fastCounts]);

  useEffect(() => {
    if (tables.length > 0 && !selectedTableId) {
      setSelectedTableId(tables[0].id);
    }
  }, [tables, selectedTableId]);

  const { data: fields = [], isLoading: isLoadingFields } = useQuery<
    MetabaseField[]
  >({
    queryKey: ["/api/metabase/tables", selectedTableId, "fields"],
    enabled: !!selectedTableId,
  });

  const activeFilters: ActiveFilter[] = useMemo(() => {
    return Object.entries(filters).map(([fieldId, filter]) => ({
      id: fieldId,
      filter,
    }));
  }, [filters]);

  const countMutation = useMutation<CountResponse>({
    mutationFn: async () => {
      if (!selectedDatabaseId || !selectedTableId) {
        return { count: 0, total: 0, percentage: 0 };
      }
      // Cancel any in-flight count request
      countAbortRef.current?.abort();
      const controller = new AbortController();
      countAbortRef.current = controller;

      const response = await apiRequest(
        "POST",
        "/api/metabase/count",
        {
          databaseId: selectedDatabaseId,
          tableId: selectedTableId,
          filters: Object.values(debouncedFilters),
          limit: MAX_FETCH_LIMIT,
        },
        controller.signal,
      );
      return response.json();
    },
    onError: (error) => {
      // Ignore aborted requests
      if (error instanceof Error && error.name === "AbortError") return;
      toast({
        title: "Count failed",
        description:
          error instanceof Error ? error.message : "Failed to get count",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (selectedDatabaseId && selectedTableId) {
      countMutation.mutate();
    }
  }, [selectedDatabaseId, selectedTableId, debouncedFilters]);

  useEffect(() => {
    if (selectedTableId) {
      setFilters({});
      setFieldOptions({});
      setAnalysisResult(null);
      setAnalysisPrompt("");
    }
  }, [selectedTableId]);

  const analysisMutation = useMutation<SQLAnalysisResponse>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/sql-analysis", {
        prompt: analysisPrompt,
        databaseId: selectedDatabaseId,
        tableId: selectedTableId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      // Auto-switch to chart view if chart config is available
      if (data.chartConfig && data.chartConfig.type !== "table_only") {
        setAnalysisViewMode("chart");
      } else {
        setAnalysisViewMode("table");
      }
    },
    onError: (error) => {
      toast({
        title: "Analysis failed",
        description:
          error instanceof Error ? error.message : "Failed to run analysis",
        variant: "destructive",
      });
    },
  });

  const handleRunAnalysis = useCallback(() => {
    if (!analysisPrompt.trim() || !selectedDatabaseId || !selectedTableId)
      return;
    analysisMutation.mutate();
  }, [analysisPrompt, selectedDatabaseId, selectedTableId, analysisMutation]);

  const handleDatabaseChange = useCallback((id: number) => {
    setSelectedDatabaseId(id);
    setSelectedTableId(null);
    setFilters({});
    setFieldOptions({});
    setAnalysisResult(null);
  }, []);

  const handleTableChange = useCallback((id: number) => {
    setSelectedTableId(id);
  }, []);

  const handleAddFilter = useCallback((field: MetabaseField) => {
    setFilters((prev) => ({
      ...prev,
      [field.id]: {
        fieldId: field.id,
        fieldName: field.name,
        fieldDisplayName: field.display_name,
        operator: "equals" as FilterOperator,
        value: null,
      },
    }));
    setAddFilterOpen(false);
  }, []);

  const handleFilterChange = useCallback(
    (fieldId: number, filter: FilterValue | null) => {
      setFilters((prev) => {
        if (filter === null) {
          const { [fieldId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [fieldId]: filter };
      });
    },
    [],
  );

  const handleRemoveFilter = useCallback((filterId: string) => {
    setFilters((prev) => {
      const { [Number(filterId)]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setFilters({});
  }, []);

  const handleRequestFieldOptions = useCallback(
    async (fieldId: number) => {
      if (fieldOptions[fieldId] || loadingFieldOptions[fieldId]) return;
      if (!selectedDatabaseId || !selectedTableId) return;

      setLoadingFieldOptions((prev) => ({ ...prev, [fieldId]: true }));

      try {
        const response = await apiRequest(
          "POST",
          "/api/metabase/field-options",
          {
            databaseId: selectedDatabaseId,
            tableId: selectedTableId,
            fieldId,
            limit: MAX_FETCH_LIMIT,
          },
        );
        const data = await response.json();
        setFieldOptions((prev) => ({ ...prev, [fieldId]: data.options }));
      } catch (error) {
        toast({
          title: "Failed to load options",
          description: "Could not load field values",
          variant: "destructive",
        });
      } finally {
        setLoadingFieldOptions((prev) => ({ ...prev, [fieldId]: false }));
      }
    },
    [
      selectedDatabaseId,
      selectedTableId,
      fieldOptions,
      loadingFieldOptions,
      toast,
    ],
  );

  const handleExport = useCallback(() => {
    setExportDialogOpen(true);
  }, []);

  const handleRefreshCount = useCallback(() => {
    countMutation.mutate();
  }, [countMutation]);

  const hasConnectionError = databasesError !== null;

  const availableFields = useMemo(() => {
    return fields.filter((f) => !filters[f.id]);
  }, [fields, filters]);

  const groupedAvailableFields = useMemo(() => {
    const groups: Record<string, MetabaseField[]> = {
      Text: [],
      Number: [],
      Date: [],
      Other: [],
    };
    availableFields.forEach((field) => {
      if (field.base_type.includes("Text")) {
        groups.Text.push(field);
      } else if (
        field.base_type.includes("Integer") ||
        field.base_type.includes("Float") ||
        field.base_type.includes("Decimal") ||
        field.base_type.includes("BigInteger")
      ) {
        groups.Number.push(field);
      } else if (
        field.base_type.includes("Date") ||
        field.base_type.includes("Time")
      ) {
        groups.Date.push(field);
      } else {
        groups.Other.push(field);
      }
    });
    return groups;
  }, [availableFields]);

  const activeFilterFields = useMemo(() => {
    return Object.keys(filters)
      .map((fieldId) => {
        return fields.find((f) => f.id === Number(fieldId));
      })
      .filter(Boolean) as MetabaseField[];
  }, [filters, fields]);

  const filterCount = Object.keys(filters).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
            <Filter className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Data Filter
            </h1>
            <p className="text-sm text-muted-foreground">
              Build filters on any table, preview matching records, and export
              to CSV.
            </p>
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshCount}
              disabled={!selectedTableId || countMutation.isPending}
              data-testid="button-refresh-count"
            >
              <RefreshCw
                className={`h-4 w-4 ${countMutation.isPending ? "animate-spin" : ""}`}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh count</TooltipContent>
        </Tooltip>
      </div>

      {hasConnectionError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>
            {databasesError instanceof Error
              ? databasesError.message
              : "Unable to connect to Metabase. Please check your credentials and try again."}
          </AlertDescription>
        </Alert>
      )}

      {/* Data Source */}
      <DatabaseSelector
        databases={databases}
        tables={displayTables}
        selectedDatabaseId={selectedDatabaseId}
        selectedTableId={selectedTableId}
        isLoadingDatabases={isLoadingDatabases}
        isLoadingTables={isLoadingTables}
        onDatabaseChange={handleDatabaseChange}
        onTableChange={handleTableChange}
      />

      {/* AI Analysis Panel */}
      {selectedDatabaseId && selectedTableId && (
        <Collapsible open={analysisOpen} onOpenChange={setAnalysisOpen}>
          <Card className="shadow-sm">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Analysis
                  </div>
                  <div className="flex items-center gap-2">
                    {analysisResult && (
                      <Badge
                        variant="secondary"
                        className="text-xs tabular-nums"
                      >
                        {analysisResult.rowCount} rows
                      </Badge>
                    )}
                    {analysisOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                {/* Prompt input */}
                <div className="flex gap-2">
                  <Textarea
                    placeholder='Ask a question about your data... e.g., "Show me the top 10 customers by order count"'
                    value={analysisPrompt}
                    onChange={(e) => setAnalysisPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleRunAnalysis();
                      }
                    }}
                    className="min-h-[44px] max-h-[120px] text-sm resize-none"
                    rows={2}
                  />
                  <Button
                    onClick={handleRunAnalysis}
                    disabled={
                      !analysisPrompt.trim() || analysisMutation.isPending
                    }
                    size="icon"
                    className="h-[44px] w-[44px] shrink-0"
                  >
                    {analysisMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Loading */}
                {analysisMutation.isPending && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/40">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        Generating analysis...
                      </p>
                      <p className="text-xs text-muted-foreground">
                        AI is writing and executing a SQL query
                      </p>
                    </div>
                  </div>
                )}

                {/* Results */}
                {analysisResult && !analysisMutation.isPending && (
                  <div className="space-y-3">
                    {/* Explanation */}
                    <p className="text-sm text-muted-foreground">
                      {analysisResult.explanation}
                    </p>

                    {/* SQL toggle */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setShowSQL(!showSQL)}
                      >
                        <Code className="h-3 w-3" />
                        {showSQL ? "Hide SQL" : "Show SQL"}
                      </Button>
                      {showSQL && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => {
                            navigator.clipboard.writeText(analysisResult.sql);
                            toast({ title: "SQL copied to clipboard" });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </Button>
                      )}
                    </div>
                    {showSQL && (
                      <pre className="p-3 rounded-lg bg-muted/60 text-xs font-mono overflow-x-auto whitespace-pre-wrap border">
                        {analysisResult.sql}
                      </pre>
                    )}

                    {/* View mode toggle (only if chart config exists) */}
                    {analysisResult.chartConfig &&
                      analysisResult.chartConfig.type !== "table_only" &&
                      analysisResult.rows.length > 0 && (
                        <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-lg w-fit">
                          <Button
                            variant={
                              analysisViewMode === "table"
                                ? "secondary"
                                : "ghost"
                            }
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => setAnalysisViewMode("table")}
                          >
                            <Table2 className="h-3 w-3" />
                            Table
                          </Button>
                          <Button
                            variant={
                              analysisViewMode === "chart"
                                ? "secondary"
                                : "ghost"
                            }
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => setAnalysisViewMode("chart")}
                          >
                            <BarChart3 className="h-3 w-3" />
                            Chart
                          </Button>
                        </div>
                      )}

                    {/* Chart view */}
                    {analysisViewMode === "chart" &&
                      analysisResult.chartConfig &&
                      analysisResult.chartConfig.type !== "table_only" &&
                      analysisResult.rows.length > 0 && (
                        <AnalysisChart
                          rows={analysisResult.rows}
                          chartConfig={analysisResult.chartConfig}
                        />
                      )}

                    {/* Table view */}
                    {(analysisViewMode === "table" ||
                      !analysisResult.chartConfig ||
                      analysisResult.chartConfig.type === "table_only") &&
                      analysisResult.rows.length > 0 && (
                        <AnalysisTable
                          columns={analysisResult.columns}
                          rows={analysisResult.rows}
                        />
                      )}

                    {analysisResult.rows.length === 0 && analysisResult.sql && (
                      <div className="p-4 text-center rounded-lg bg-muted/40">
                        <p className="text-sm text-muted-foreground">
                          Query returned no results.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {!analysisResult && !analysisMutation.isPending && (
                  <div className="py-6 text-center space-y-2">
                    <div className="h-10 w-10 rounded-xl bg-muted/60 flex items-center justify-center mx-auto">
                      <Sparkles className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ask any question about your data. AI will generate and run
                      SQL automatically.
                    </p>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* Filters column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                Filters
              </h2>
              {filterCount > 0 && (
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {filterCount} active
                </Badge>
              )}
            </div>

            <Popover open={addFilterOpen} onOpenChange={setAddFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !selectedTableId ||
                    isLoadingFields ||
                    availableFields.length === 0
                  }
                  data-testid="button-add-filter"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Filter
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search fields..." />
                  <CommandList>
                    <CommandEmpty>No fields found.</CommandEmpty>
                    {Object.entries(groupedAvailableFields).map(
                      ([groupName, groupFields]) => {
                        if (groupFields.length === 0) return null;
                        return (
                          <CommandGroup
                            key={groupName}
                            heading={`${groupName} Fields`}
                          >
                            {groupFields.map((field) => (
                              <CommandItem
                                key={field.id}
                                onSelect={() => handleAddFilter(field)}
                                data-testid={`add-filter-${field.name}`}
                              >
                                <span className="flex-1">
                                  {field.display_name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] ml-2 shrink-0"
                                >
                                  {field.base_type.replace("type/", "")}
                                </Badge>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        );
                      },
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {isLoadingFields ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Loading fields...
                </p>
              </CardContent>
            </Card>
          ) : !selectedTableId ? (
            <Card>
              <CardContent className="py-14 text-center space-y-3">
                <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto">
                  <Filter className="h-7 w-7 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Select a table to get started
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Choose a database and table above, then add filters here.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : activeFilterFields.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center space-y-3">
                <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto">
                  <SlidersHorizontal className="h-7 w-7 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    No filters applied
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Click <strong>Add Filter</strong> to narrow down your data.
                    Without filters, all records are included.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeFilterFields.map((field) => (
                <ActiveFilterCard
                  key={field.id}
                  field={field}
                  filter={filters[field.id]}
                  options={fieldOptions[field.id]}
                  isLoadingOptions={loadingFieldOptions[field.id]}
                  onFilterChange={(filter) =>
                    handleFilterChange(field.id, filter)
                  }
                  onRemove={() => handleRemoveFilter(field.id.toString())}
                  onRequestOptions={() => handleRequestFieldOptions(field.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Results column */}
        <div className="space-y-4">
          <ResultsPanel
            count={countMutation.data ?? null}
            isLoading={countMutation.isPending}
            activeFilters={activeFilters}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
            onExport={handleExport}
            isExporting={false}
          />
        </div>
      </div>

      {selectedDatabaseId && selectedTableId && (
        <ExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          databaseId={selectedDatabaseId}
          tableId={selectedTableId}
          filters={Object.values(filters)}
          totalCount={countMutation.data?.count ?? 0}
        />
      )}
    </div>
  );
}

// Compact active filter card component
function ActiveFilterCard({
  field,
  filter,
  options,
  isLoadingOptions,
  onFilterChange,
  onRemove,
  onRequestOptions,
}: {
  field: MetabaseField;
  filter: FilterValue;
  options?: FieldOption[];
  isLoadingOptions?: boolean;
  onFilterChange: (filter: FilterValue | null) => void;
  onRemove: () => void;
  onRequestOptions: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [valuesOpen, setValuesOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>(
    filter?.values?.map(String) ??
      (filter?.value ? [String(filter.value)] : []),
  );

  const operators = BASE_TYPE_OPERATORS[field.base_type] || DEFAULT_OPERATORS;
  const isNumeric =
    field.base_type.includes("Integer") ||
    field.base_type.includes("Float") ||
    field.base_type.includes("Decimal") ||
    field.base_type.includes("BigInteger");
  const isDate =
    field.base_type.includes("Date") || field.base_type.includes("Time");
  const isTextField = !isNumeric && !isDate;

  useEffect(() => {
    if (isTextField && !options && !isLoadingOptions) {
      onRequestOptions();
    }
  }, [isTextField, options, isLoadingOptions, onRequestOptions]);

  const filteredOptions = useMemo(() => {
    if (!options) return [];
    if (!searchQuery) return options;
    return options.filter((opt) =>
      opt.value.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [options, searchQuery]);

  const handleOperatorChange = (operator: FilterOperator) => {
    onFilterChange({
      ...filter,
      operator,
    });
  };

  const handleValueChange = (value: string) => {
    const parsedValue = isNumeric
      ? value
        ? Number(value)
        : null
      : value || null;
    onFilterChange({
      ...filter,
      value: parsedValue,
    });
  };

  const handleValueToChange = (value: string) => {
    const parsedValue = isNumeric
      ? value
        ? Number(value)
        : null
      : value || null;
    onFilterChange({
      ...filter,
      valueTo: parsedValue,
    });
  };

  const handleMultiSelectToggle = (value: string) => {
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];

    setSelectedValues(newSelected);

    if (newSelected.length === 0) {
      onFilterChange({
        ...filter,
        value: null,
        values: undefined,
      });
    } else {
      onFilterChange({
        ...filter,
        value: newSelected.length === 1 ? newSelected[0] : null,
        values: newSelected,
      });
    }
  };

  const handleValuesOpen = (open: boolean) => {
    setValuesOpen(open);
    if (open && !options && !isLoadingOptions) {
      onRequestOptions();
    }
  };

  const currentOperator = filter?.operator || "equals";
  const showBetween = currentOperator === "between";
  const showValueInput = !["is_null", "is_not_null"].includes(currentOperator);

  const typeLabel = isNumeric ? "Number" : isDate ? "Date" : "Text";
  const typeColor = isNumeric
    ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
    : isDate
      ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800"
      : "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";

  return (
    <Card data-testid={`filter-card-${field.name}`} className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">
            {field.display_name}
          </span>
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeColor}`}
          >
            {typeLabel}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onRemove}
          data-testid={`button-remove-filter-${field.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="p-3 pt-1">
        <div className="flex flex-wrap gap-2.5">
          <div className="min-w-[130px]">
            <Label className="text-[11px] text-muted-foreground mb-1 block">
              Condition
            </Label>
            <Select
              value={currentOperator}
              onValueChange={(val) =>
                handleOperatorChange(val as FilterOperator)
              }
            >
              <SelectTrigger
                className="h-8 text-xs"
                data-testid={`select-operator-${field.name}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op} value={op}>
                    {OPERATOR_LABELS[op]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showValueInput && (
            <div className="flex-1 min-w-[180px]">
              <Label className="text-[11px] text-muted-foreground mb-1 block">
                {showBetween ? "From" : "Value"}
              </Label>

              {isTextField && (options || isLoadingOptions) ? (
                <Popover open={valuesOpen} onOpenChange={handleValuesOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between h-8 font-normal text-xs"
                      data-testid={`button-value-select-${field.name}`}
                    >
                      <span className="truncate">
                        {selectedValues.length > 0
                          ? selectedValues.length === 1
                            ? selectedValues[0]
                            : `${selectedValues.length} selected`
                          : "Select values..."}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 h-7 text-xs"
                          data-testid={`input-search-${field.name}`}
                        />
                      </div>
                    </div>
                    <ScrollArea className="h-56">
                      {isLoadingOptions ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                          Loading values...
                        </div>
                      ) : filteredOptions.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No values found
                        </div>
                      ) : (
                        <div className="p-1.5 space-y-0.5">
                          {filteredOptions.map((option) => (
                            <div
                              key={option.value}
                              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover-elevate cursor-pointer"
                              onClick={() =>
                                handleMultiSelectToggle(option.value)
                              }
                              data-testid={`option-${field.name}-${option.value}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Checkbox
                                  checked={selectedValues.includes(
                                    option.value,
                                  )}
                                  className="shrink-0"
                                />
                                <span className="text-xs truncate">
                                  {option.value}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                {option.count.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              ) : (
                <Input
                  type={isNumeric ? "number" : isDate ? "date" : "text"}
                  placeholder={`Enter ${field.display_name.toLowerCase()}...`}
                  value={filter?.value ?? ""}
                  onChange={(e) => handleValueChange(e.target.value)}
                  className="h-8 text-xs"
                  data-testid={`input-value-${field.name}`}
                />
              )}
            </div>
          )}

          {showBetween && showValueInput && (
            <div className="min-w-[130px]">
              <Label className="text-[11px] text-muted-foreground mb-1 block">
                To
              </Label>
              <Input
                type={isNumeric ? "number" : isDate ? "date" : "text"}
                placeholder={`To...`}
                value={filter?.valueTo ?? ""}
                onChange={(e) => handleValueToChange(e.target.value)}
                className="h-8 text-xs"
                data-testid={`input-value-to-${field.name}`}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Analysis results table ───────────────────────────────────────────
function AnalysisTable({
  columns,
  rows,
}: {
  columns: Array<{ name: string; display_name: string; base_type: string }>;
  rows: Array<Record<string, any>>;
}) {
  const isNumericCol = (col: { base_type: string }) =>
    col.base_type.includes("Integer") ||
    col.base_type.includes("Float") ||
    col.base_type.includes("Decimal") ||
    col.base_type.includes("Number") ||
    col.base_type.includes("BigInteger");

  return (
    <div className="rounded-lg border overflow-hidden">
      <ScrollArea className="max-h-[400px]">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.name}
                  className={`px-3 py-2 font-medium text-muted-foreground whitespace-nowrap ${
                    isNumericCol(col) ? "text-right" : "text-left"
                  }`}
                >
                  {col.display_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-t hover:bg-muted/30 transition-colors"
              >
                {columns.map((col) => {
                  const val = row[col.name];
                  const display =
                    val === null || val === undefined
                      ? "—"
                      : isNumericCol(col)
                        ? Number(val).toLocaleString()
                        : String(val);
                  return (
                    <td
                      key={col.name}
                      className={`px-3 py-2 whitespace-nowrap ${
                        isNumericCol(col)
                          ? "text-right tabular-nums"
                          : "text-left"
                      }`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
      <div className="px-3 py-1.5 border-t bg-muted/30">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {rows.length} row{rows.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

// ── Analysis chart ───────────────────────────────────────────────────
function AnalysisChart({
  rows,
  chartConfig,
}: {
  rows: Array<Record<string, any>>;
  chartConfig: {
    type: "bar" | "line" | "pie" | "table_only";
    xKey: string;
    yKey: string;
    title: string;
  };
}) {
  if (rows.length === 0) return null;

  const chartData = rows.slice(0, 50).map((row) => ({
    ...row,
    [chartConfig.xKey]: row[chartConfig.xKey] ?? "N/A",
    [chartConfig.yKey]: Number(row[chartConfig.yKey]) || 0,
  }));

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {chartConfig.title}
      </p>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartConfig.type === "bar" ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey={chartConfig.xKey}
                tick={{ fontSize: 11 }}
                interval={0}
                angle={chartData.length > 8 ? -35 : 0}
                textAnchor={chartData.length > 8 ? "end" : "middle"}
                height={chartData.length > 8 ? 70 : 30}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                }}
              />
              <Bar
                dataKey={chartConfig.yKey}
                fill={CHART_COLORS[0]}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          ) : chartConfig.type === "line" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey={chartConfig.xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                }}
              />
              <Line
                type="monotone"
                dataKey={chartConfig.yKey}
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS[0] }}
              />
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={chartData}
                dataKey={chartConfig.yKey}
                nameKey={chartConfig.xKey}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) =>
                  `${name} (${(percent * 100).toFixed(0)}%)`
                }
                labelLine={{ strokeWidth: 1 }}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
