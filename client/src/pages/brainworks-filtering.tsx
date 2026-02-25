import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Filter,
  RefreshCw,
  AlertCircle,
  Plus,
  X,
  Search,
  Check,
  ChevronDown,
  Loader2,
  ArrowDownCircle,
  Database as DatabaseIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  MailingListEntry,
  FilterOperator,
} from "@shared/schema";

// CONSTANT: A very high limit to represent "Everything"
const MAX_FETCH_LIMIT = 999999999;
// Standard incremental steps for scanning rows
const LIMIT_OPTIONS = [100000, 200000, 300000, 400000, 500000, 1000000];

export default function BrainworksFiltering() {
  const { toast } = useToast();

  const [scanIncrement, setScanIncrement] = useState<number | "all">(100000);
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
  const [exportedEntries, setExportedEntries] = useState<MailingListEntry[]>(
    [],
  );
  const [exportedTotal, setExportedTotal] = useState(0);
  const [addFilterOpen, setAddFilterOpen] = useState(false);

  // Store the true, absolute totals for each table to fix the dropdown UI
  const [absoluteCounts, setAbsoluteCounts] = useState<Record<number, number>>(
    {},
  );

  const debouncedFilters = useDebounce(filters, 300);

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

  // FIXED: Sequential Background Fetching to prevent Browser Network Throttling
  useEffect(() => {
    if (!selectedDatabaseId || tables.length === 0) return;

    let isMounted = true;

    async function fetchBackgroundCountsSequentially() {
      // Prioritize the currently selected table so the UI updates instantly
      const prioritizedTables = [...tables].sort((a, b) => {
        if (a.id === selectedTableId) return -1;
        if (b.id === selectedTableId) return 1;
        return 0;
      });

      for (const table of prioritizedTables) {
        if (!isMounted) break; // Stop if component unmounts

        // Skip if we already successfully fetched this table's count
        if (absoluteCounts[table.id] !== undefined) continue;

        try {
          const res = await apiRequest("POST", "/api/metabase/count", {
            databaseId: selectedDatabaseId,
            tableId: table.id,
            filters: [],
            limit: MAX_FETCH_LIMIT,
          });
          const data = await res.json();

          if (isMounted) {
            setAbsoluteCounts((prev) => ({ ...prev, [table.id]: data.total }));
          }
        } catch (err) {
          console.error(
            `Failed to fetch absolute count for table ${table.id}`,
            err,
          );
        }
      }
    }

    fetchBackgroundCountsSequentially();

    return () => {
      isMounted = false;
    };
  }, [selectedDatabaseId, tables, selectedTableId]);

  // Patch the tables array with the true absolute counts so the dropdown is correct
  const displayTables = useMemo(() => {
    return tables.map((table) => {
      if (absoluteCounts[table.id] !== undefined) {
        return { ...table, row_count: absoluteCounts[table.id] };
      }
      return table;
    });
  }, [tables, absoluteCounts]);

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
      const response = await apiRequest("POST", "/api/metabase/count", {
        databaseId: selectedDatabaseId,
        tableId: selectedTableId,
        filters: Object.values(debouncedFilters),
        limit: scanIncrement === "all" ? MAX_FETCH_LIMIT : scanIncrement, // Increments the panel
      });
      return response.json();
    },
    onError: (error) => {
      toast({
        title: "Count failed",
        description:
          error instanceof Error ? error.message : "Failed to get count",
        variant: "destructive",
      });
    },
  });

  // Export mutation handles limit and offset correctly
  const exportMutation = useMutation<
    { entries: MailingListEntry[]; total: number },
    Error,
    { isLoadMore?: boolean; overrideScanLimit?: number }
  >({
    mutationFn: async ({ isLoadMore = false, overrideScanLimit }) => {
      if (!selectedDatabaseId || !selectedTableId) {
        throw new Error("Please select a table first");
      }

      const offsetToUse = isLoadMore ? exportedEntries.length : 0;
      let limitToUse = overrideScanLimit;
      if (!limitToUse) {
        limitToUse = scanIncrement === "all" ? MAX_FETCH_LIMIT : scanIncrement;
      }

      const response = await apiRequest("POST", "/api/metabase/export", {
        databaseId: selectedDatabaseId,
        tableId: selectedTableId,
        filters: Object.values(filters),
        limit: limitToUse,
        offset: offsetToUse,
        scanLimit: limitToUse,
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      if (variables.isLoadMore) {
        setExportedEntries((prev) => [...prev, ...data.entries]);
        toast({
          title: "More rows exported",
          description: `Added ${data.entries.length.toLocaleString()} rows. Total ready: ${(exportedEntries.length + data.entries.length).toLocaleString()}`,
        });
      } else {
        setExportedEntries(data.entries);
        setExportedTotal(data.total);
        setExportDialogOpen(true);
        toast({
          title: "Data prepared",
          description: `Loaded ${data.entries.length.toLocaleString()} rows for export`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Fetch failed",
        description:
          error instanceof Error ? error.message : "Failed to generate list",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (selectedDatabaseId && selectedTableId) {
      countMutation.mutate();
    }
  }, [selectedDatabaseId, selectedTableId, debouncedFilters, scanIncrement]);

  useEffect(() => {
    if (selectedTableId) {
      setFilters({});
      setFieldOptions({});
      setExportedEntries([]);
      setScanIncrement(100000);
    }
  }, [selectedTableId]);

  const handleDatabaseChange = useCallback((id: number) => {
    setSelectedDatabaseId(id);
    setSelectedTableId(null);
    setFilters({});
    setFieldOptions({});
    setExportedEntries([]);
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
            limit: scanIncrement === "all" ? MAX_FETCH_LIMIT : scanIncrement,
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
      scanIncrement,
    ],
  );

  const handleExport = useCallback(() => {
    exportMutation.mutate({ isLoadMore: false });
  }, [exportMutation]);

  const handleScanNext = useCallback(() => {
    if (scanIncrement === "all") return;

    const currentIndex = LIMIT_OPTIONS.indexOf(scanIncrement);
    const nextLimit =
      currentIndex !== -1 && currentIndex < LIMIT_OPTIONS.length - 1
        ? LIMIT_OPTIONS[currentIndex + 1]
        : scanIncrement + 100000;

    if (!LIMIT_OPTIONS.includes(nextLimit)) {
      LIMIT_OPTIONS.push(nextLimit);
      LIMIT_OPTIONS.sort((a, b) => a - b);
    }

    setScanIncrement(nextLimit);
  }, [scanIncrement]);

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

  const limitReached =
    scanIncrement !== "all" &&
    (countMutation.data?.total || 0) >= scanIncrement;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Filter className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Filtering Tool</h1>
            <p className="text-sm text-muted-foreground">
              Filter and export contact lists from your databases
            </p>
          </div>
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Filters</h2>
              {Object.keys(filters).length > 0 && (
                <Badge variant="secondary">
                  {Object.keys(filters).length} active
                </Badge>
              )}
            </div>

            <Popover open={addFilterOpen} onOpenChange={setAddFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={
                    !selectedTableId ||
                    isLoadingFields ||
                    availableFields.length === 0
                  }
                  data-testid="button-add-filter"
                >
                  <Plus className="h-4 w-4 mr-2" />
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
                                {field.display_name}
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
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Loading fields...
                </p>
              </CardContent>
            </Card>
          ) : !selectedTableId ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Filter className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-muted-foreground">
                  Select a table to start filtering
                </p>
              </CardContent>
            </Card>
          ) : activeFilterFields.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Filter className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-muted-foreground">
                  No filters added yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Add Filter" to start filtering your data
                </p>
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

        <div className="space-y-4">
          <ResultsPanel
            count={countMutation.data ?? null}
            isLoading={countMutation.isPending}
            activeFilters={activeFilters}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
            onExport={handleExport}
            isExporting={
              exportMutation.isPending && !exportMutation.variables?.isLoadMore
            }
          />

          {selectedTableId && (
            <Card className="shadow-sm border-dashed bg-muted/20">
              <CardContent className="p-4 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <DatabaseIcon className="h-4 w-4 shrink-0" />
                    <span>Scan Limit</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={scanIncrement.toString()}
                      onValueChange={(val) =>
                        setScanIncrement(val === "all" ? "all" : Number(val))
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px] bg-background">
                        <SelectValue placeholder="Amount" />
                      </SelectTrigger>
                      <SelectContent>
                        {LIMIT_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt.toString()}>
                            {opt.toLocaleString()} rows
                          </SelectItem>
                        ))}
                        <SelectItem value="all">All Rows</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {limitReached && (
                  <Button
                    variant="secondary"
                    className="w-full bg-secondary/50 hover:bg-secondary"
                    onClick={handleScanNext}
                    disabled={countMutation.isPending}
                  >
                    {countMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4 mr-2" />
                    )}
                    Scan next rows
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {exportedEntries.length > 0 && (
            <div className="text-xs text-center text-muted-foreground">
              Currently prepared: {exportedEntries.length.toLocaleString()} rows
            </div>
          )}
        </div>
      </div>

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        entries={exportedEntries}
        total={exportedTotal}
      />
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

  return (
    <Card data-testid={`filter-card-${field.name}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{field.display_name}</span>
          <Badge variant="outline" className="text-xs">
            {isNumeric ? "Number" : isDate ? "Date" : "Text"}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onRemove}
          data-testid={`button-remove-filter-${field.name}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[140px]">
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Condition
            </Label>
            <Select
              value={currentOperator}
              onValueChange={(val) =>
                handleOperatorChange(val as FilterOperator)
              }
            >
              <SelectTrigger
                className="h-9"
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
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                {showBetween ? "From" : "Value"}
              </Label>

              {isTextField && (options || isLoadingOptions) ? (
                <Popover open={valuesOpen} onOpenChange={handleValuesOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between h-9 font-normal"
                      data-testid={`button-value-select-${field.name}`}
                    >
                      <span className="truncate">
                        {selectedValues.length > 0
                          ? selectedValues.length === 1
                            ? selectedValues[0]
                            : `${selectedValues.length} selected`
                          : "Select values..."}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 h-9"
                          data-testid={`input-search-${field.name}`}
                        />
                      </div>
                    </div>
                    <ScrollArea className="h-64">
                      {isLoadingOptions ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                          Loading options...
                        </div>
                      ) : filteredOptions.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No options found
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {filteredOptions.map((option) => (
                            <div
                              key={option.value}
                              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
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
                                <span className="text-sm truncate">
                                  {option.value}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className="text-xs shrink-0"
                              >
                                {option.count.toLocaleString()}
                              </Badge>
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
                  className="h-9"
                  data-testid={`input-value-${field.name}`}
                />
              )}
            </div>
          )}

          {showBetween && showValueInput && (
            <div className="min-w-[150px]">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                To
              </Label>
              <Input
                type={isNumeric ? "number" : isDate ? "date" : "text"}
                placeholder={`To...`}
                value={filter?.valueTo ?? ""}
                onChange={(e) => handleValueToChange(e.target.value)}
                className="h-9"
                data-testid={`input-value-to-${field.name}`}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
