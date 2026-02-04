import { X, ChevronDown, Search, Check, Loader2 } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import type { MetabaseField, FilterValue, FieldOption, FilterOperator } from "@shared/schema";
import { OPERATOR_LABELS, BASE_TYPE_OPERATORS, DEFAULT_OPERATORS } from "@/lib/constants";

interface FilterCardProps {
  field: MetabaseField;
  filter?: FilterValue;
  options?: FieldOption[];
  isLoadingOptions?: boolean;
  onFilterChange: (filter: FilterValue | null) => void;
  onRequestOptions?: () => void;
}

export function FilterCard({
  field,
  filter,
  options,
  isLoadingOptions,
  onFilterChange,
  onRequestOptions,
}: FilterCardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>(
    filter?.values?.map(String) ?? (filter?.value ? [String(filter.value)] : [])
  );

  const operators = BASE_TYPE_OPERATORS[field.base_type] || DEFAULT_OPERATORS;
  const isNumeric = field.base_type.includes("Integer") || 
                    field.base_type.includes("Float") || 
                    field.base_type.includes("Decimal") ||
                    field.base_type.includes("BigInteger");
  const isDate = field.base_type.includes("Date") || field.base_type.includes("Time");
  const isTextField = !isNumeric && !isDate;

  useEffect(() => {
    if (isTextField && !options && !isLoadingOptions && onRequestOptions) {
      onRequestOptions();
    }
  }, [isTextField, options, isLoadingOptions, onRequestOptions]);

  const filteredOptions = useMemo(() => {
    if (!options) return [];
    if (!searchQuery) return options;
    return options.filter((opt) =>
      opt.value.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [options, searchQuery]);

  const handleOperatorChange = (operator: FilterOperator) => {
    onFilterChange({
      fieldId: field.id,
      fieldName: field.name,
      fieldDisplayName: field.display_name,
      operator,
      value: filter?.value ?? null,
      valueTo: filter?.valueTo,
    });
  };

  const handleValueChange = (value: string) => {
    const parsedValue = isNumeric ? (value ? Number(value) : null) : value || null;
    onFilterChange({
      fieldId: field.id,
      fieldName: field.name,
      fieldDisplayName: field.display_name,
      operator: filter?.operator || "equals",
      value: parsedValue,
      valueTo: filter?.valueTo,
    });
  };

  const handleValueToChange = (value: string) => {
    const parsedValue = isNumeric ? (value ? Number(value) : null) : value || null;
    onFilterChange({
      fieldId: field.id,
      fieldName: field.name,
      fieldDisplayName: field.display_name,
      operator: filter?.operator || "between",
      value: filter?.value ?? null,
      valueTo: parsedValue,
    });
  };

  const handleMultiSelectToggle = (value: string) => {
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];
    
    setSelectedValues(newSelected);
    
    if (newSelected.length === 0) {
      onFilterChange(null);
    } else {
      onFilterChange({
        fieldId: field.id,
        fieldName: field.name,
        fieldDisplayName: field.display_name,
        operator: "equals",
        value: newSelected.length === 1 ? newSelected[0] : null,
        values: newSelected,
      });
    }
  };

  const handleClear = () => {
    setSelectedValues([]);
    onFilterChange(null);
  };

  const handlePopoverOpen = (open: boolean) => {
    setIsOpen(open);
    if (open && !options && onRequestOptions) {
      onRequestOptions();
    }
  };

  const isActive = filter !== undefined;
  const currentOperator = filter?.operator || "equals";
  const showBetween = currentOperator === "between";
  const showValueInput = !["is_null", "is_not_null"].includes(currentOperator);

  const sampleValues = useMemo(() => {
    if (!options || options.length === 0) return [];
    return options.slice(0, 5);
  }, [options]);

  return (
    <Card className={`transition-all duration-200 ${isActive ? "ring-2 ring-primary/20" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate" title={field.display_name}>
            {field.display_name}
          </span>
          {isActive && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Active
            </Badge>
          )}
        </div>
        {isActive && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleClear}
            data-testid={`button-clear-filter-${field.name}`}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </CardHeader>

      {isTextField && (
        <div className="px-4 pb-2">
          {isLoadingOptions ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading values...</span>
            </div>
          ) : sampleValues.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {sampleValues.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className="text-xs cursor-pointer"
                  onClick={() => handleMultiSelectToggle(opt.value)}
                  data-testid={`sample-${field.name}-${opt.value}`}
                >
                  {opt.value}
                  {selectedValues.includes(opt.value) && (
                    <Check className="h-3 w-3 ml-1" />
                  )}
                </Badge>
              ))}
              {options && options.length > 5 && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  +{options.length - 5} more
                </Badge>
              )}
            </div>
          ) : null}
        </div>
      )}
      <CardContent className="p-4 pt-2 space-y-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Condition</Label>
          <Select
            value={currentOperator}
            onValueChange={(val) => handleOperatorChange(val as FilterOperator)}
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
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {showBetween ? "From" : "Value"}
            </Label>
            
            {options || isLoadingOptions ? (
              <Popover open={isOpen} onOpenChange={handlePopoverOpen}>
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
                            onClick={() => handleMultiSelectToggle(option.value)}
                            data-testid={`option-${field.name}-${option.value}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Checkbox
                                checked={selectedValues.includes(option.value)}
                                className="shrink-0"
                              />
                              <span className="text-sm truncate">{option.value}</span>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0">
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
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type={isNumeric ? "number" : isDate ? "date" : "text"}
              placeholder={`Enter ${field.display_name.toLowerCase()}...`}
              value={filter?.valueTo ?? ""}
              onChange={(e) => handleValueToChange(e.target.value)}
              className="h-9"
              data-testid={`input-value-to-${field.name}`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
