import { Users, Download, Trash2, Loader2, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ActiveFilter, CountResponse } from "@shared/schema";
import { OPERATOR_LABELS } from "@/lib/constants";

interface ResultsPanelProps {
  count: CountResponse | null;
  isLoading: boolean;
  activeFilters: ActiveFilter[];
  onRemoveFilter: (filterId: string) => void;
  onClearAll: () => void;
  onExport: () => void;
  isExporting: boolean;
}

export function ResultsPanel({
  count,
  isLoading,
  activeFilters,
  onRemoveFilter,
  onClearAll,
  onExport,
  isExporting,
}: ResultsPanelProps) {
  const matchCount = count?.count ?? 0;
  const totalCount = count?.total ?? 0;
  const percentage = count?.percentage ?? 0;

  const formatValue = (filter: ActiveFilter) => {
    const { operator, value, values, valueTo } = filter.filter;
    if (operator === "is_null") return "is empty";
    if (operator === "is_not_null") return "is not empty";
    if (operator === "between") return `${value} to ${valueTo}`;
    if (values && values.length > 0) {
      if (values.length <= 2) return values.join(", ");
      return `${values.length} values`;
    }
    return String(value ?? "");
  };

  return (
    <Card className="h-fit sticky top-4">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5 text-primary" />
          Selection Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center py-6 px-4 rounded-lg bg-muted/50">
          <div className="relative inline-flex items-center justify-center">
            {isLoading ? (
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            ) : (
              <span 
                className="text-5xl font-bold text-foreground tabular-nums"
                data-testid="text-match-count"
              >
                {matchCount.toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {isLoading ? "Calculating..." : "matching contacts"}
          </p>
          {!isLoading && totalCount > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {percentage.toFixed(1)}% of {totalCount.toLocaleString()} total
              </Badge>
            </div>
          )}
        </div>

        {activeFilters.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Active Filters</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearAll}
                  className="h-7 text-xs text-muted-foreground"
                  data-testid="button-clear-all-filters"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear all
                </Button>
              </div>
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {activeFilters.map((filter) => (
                    <div
                      key={filter.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">
                          {filter.filter.fieldDisplayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {OPERATOR_LABELS[filter.filter.operator]}: {formatValue(filter)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => onRemoveFilter(filter.id)}
                        data-testid={`button-remove-filter-${filter.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={onExport}
            disabled={matchCount === 0 || isLoading || isExporting}
            data-testid="button-generate-mailing-list"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Generate Mailing List
              </>
            )}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            {matchCount === 0
              ? "Apply filters to select contacts"
              : `Export ${matchCount.toLocaleString()} contact${matchCount !== 1 ? "s" : ""}`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
