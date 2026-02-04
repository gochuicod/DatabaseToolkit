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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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

// CONSTANT: Hard limit for fetches set to 1,000,000 as requested
const FETCH_LIMIT = 100000;

export default function BrainworksFiltering() {
  const { toast } = useToast();

  const [scanLimit, setScanLimit] = useState<number>(FETCH_LIMIT);
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

  // State for "Load More" functionality
  const [hasMoreData, setHasMoreData] = useState<boolean>(true);

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
        limit: scanLimit,
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

  // Export mutation handles limit and offset
  const exportMutation = useMutation<
    { entries: MailingListEntry[]; total: number },
    Error,
    { isLoadMore?: boolean; overrideScanLimit?: number } // Add override type
  >({
    mutationFn: async ({ isLoadMore = false, overrideScanLimit }) => {
      if (!selectedDatabaseId || !selectedTableId) {
        throw new Error("Please select a table first");
      }

      const offsetToUse = isLoadMore ? exportedEntries.length : 0;
      // Use override if provided (for immediate button click), otherwise state
      const limitToUse = overrideScanLimit || scanLimit;

      const response = await apiRequest("POST", "/api/metabase/export", {
        databaseId: selectedDatabaseId,
        tableId: selectedTableId,
        filters: Object.values(filters),
        limit: FETCH_LIMIT,
        offset: offsetToUse,
        scanLimit: limitToUse, // Pass scanLimit
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      if (variables.isLoadMore) {
        // Append new entries
        setExportedEntries((prev) => [...prev, ...data.entries]);
        toast({
          title: "More rows loaded",
          description: `Added ${data.entries.length.toLocaleString()} rows. Total: ${(exportedEntries.length + data.entries.length).toLocaleString()}`,
        });
      } else {
        // Replace entries (New fetch)
        setExportedEntries(data.entries);
        setExportedTotal(data.total);
        setExportDialogOpen(true);
        toast({
          title: "Data loaded",
          description: `Loaded first ${data.entries.length.toLocaleString()} rows`,
        });
      }

      // Check if we reached the end (if returned data is less than limit, no more data)
      if (data.entries.length < FETCH_LIMIT) {
        setHasMoreData(false);
      } else {
        setHasMoreData(true);
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
  }, [selectedDatabaseId, selectedTableId, debouncedFilters, scanLimit]);

  // Reset logic when table changes
  useEffect(() => {
    if (selectedTableId) {
      setFilters({});
      setFieldOptions({});
      setExportedEntries([]);
      setHasMoreData(true);
      setScanLimit(FETCH_LIMIT);
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
            limit: scanLimit,
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

  // Initial Fetch
  const handleExport = useCallback(() => {
    setHasMoreData(true);
    exportMutation.mutate({ isLoadMore: false });
  }, [exportMutation]);

  // Load More Button Handler
  const handleLoadMore = useCallback(() => {
    // Increment the limit by FETCH_LIMIT (100,000)
    const newLimit = scanLimit + FETCH_LIMIT;
    setScanLimit(newLimit);

    // Trigger fetch with the new limit immediately
    exportMutation.mutate({ isLoadMore: true, overrideScanLimit: newLimit });
  }, [exportMutation, scanLimit]);

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

  const hitScanLimit = (countMutation.data?.total || 0) >= scanLimit;
  const showLoadMore =
    hitScanLimit || (hasMoreData && exportedEntries.length > 0);

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
        tables={tables}
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

          {/* LOAD MORE BUTTON */}
          {showLoadMore && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleLoadMore}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending &&
              exportMutation.variables?.isLoadMore ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowDownCircle className="h-4 w-4 mr-2" />
              )}
              {hitScanLimit
                ? `Scan Next 100,000 Rows (Current Limit: ${scanLimit.toLocaleString()})`
                : `Load More (+${FETCH_LIMIT.toLocaleString()})`}
            </Button>
          )}

          {exportedEntries.length > 0 && (
            <div className="text-xs text-center text-muted-foreground">
              Currently loaded: {exportedEntries.length.toLocaleString()} rows
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
