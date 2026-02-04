import { Search, Filter, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilterCard } from "./filter-card";
import type { MetabaseField, FilterValue, FieldOption } from "@shared/schema";

interface FilterPanelProps {
  fields: MetabaseField[];
  filters: Record<number, FilterValue>;
  fieldOptions: Record<number, FieldOption[]>;
  loadingFieldOptions: Record<number, boolean>;
  isLoading: boolean;
  onFilterChange: (fieldId: number, filter: FilterValue | null) => void;
  onRequestFieldOptions: (fieldId: number) => void;
}

export function FilterPanel({
  fields,
  filters,
  fieldOptions,
  loadingFieldOptions,
  isLoading,
  onFilterChange,
  onRequestFieldOptions,
}: FilterPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const activeCount = Object.keys(filters).length;

  const filteredFields = useMemo(() => {
    if (!searchQuery) return fields;
    return fields.filter(
      (field) =>
        field.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        field.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [fields, searchQuery]);

  const groupedFields = useMemo(() => {
    const groups: Record<string, MetabaseField[]> = {
      Text: [],
      Number: [],
      Date: [],
      Other: [],
    };

    filteredFields.forEach((field) => {
      if (field.base_type.includes("Text")) {
        groups.Text.push(field);
      } else if (
        field.base_type.includes("Integer") ||
        field.base_type.includes("Float") ||
        field.base_type.includes("Decimal") ||
        field.base_type.includes("BigInteger")
      ) {
        groups.Number.push(field);
      } else if (field.base_type.includes("Date") || field.base_type.includes("Time")) {
        groups.Date.push(field);
      } else {
        groups.Other.push(field);
      }
    });

    return groups;
  }, [filteredFields]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p className="text-sm">Loading fields...</p>
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Filter className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm font-medium">No fields available</p>
        <p className="text-xs mt-1">Select a database and table to see available filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-fields"
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {filteredFields.length} field{filteredFields.length !== 1 ? "s" : ""}
          </Badge>
          {activeCount > 0 && (
            <Badge variant="default">
              {activeCount} active
            </Badge>
          )}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-320px)]">
        <div className="space-y-6 pr-4">
          {Object.entries(groupedFields).map(([groupName, groupFields]) => {
            if (groupFields.length === 0) return null;
            return (
              <div key={groupName} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {groupName} Fields
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {groupFields.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {groupFields.map((field) => (
                    <FilterCard
                      key={field.id}
                      field={field}
                      filter={filters[field.id]}
                      options={fieldOptions[field.id]}
                      isLoadingOptions={loadingFieldOptions[field.id]}
                      onFilterChange={(filter) => onFilterChange(field.id, filter)}
                      onRequestOptions={() => onRequestFieldOptions(field.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
