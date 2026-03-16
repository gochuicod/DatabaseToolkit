import { Database, Table, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { MetabaseDatabase, MetabaseTable } from "@shared/schema";

interface DatabaseSelectorProps {
  databases: MetabaseDatabase[];
  tables: MetabaseTable[];
  selectedDatabaseId: number | null;
  selectedTableId: number | null;
  isLoadingDatabases: boolean;
  isLoadingTables: boolean;
  onDatabaseChange: (id: number) => void;
  onTableChange: (id: number) => void;
}

export function DatabaseSelector({
  databases,
  tables,
  selectedDatabaseId,
  selectedTableId,
  isLoadingDatabases,
  isLoadingTables,
  onDatabaseChange,
  onTableChange,
}: DatabaseSelectorProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" />
          Data Source
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1 w-full space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Database
            </label>
            <Select
              value={selectedDatabaseId?.toString() ?? ""}
              onValueChange={(val) => onDatabaseChange(Number(val))}
              disabled={isLoadingDatabases}
            >
              <SelectTrigger className="w-full" data-testid="select-database">
                {isLoadingDatabases ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  <SelectValue placeholder="Select a database" />
                )}
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{db.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground/40 hidden sm:block shrink-0 mt-5" />

          <div className="flex-1 w-full space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Table
            </label>
            <Select
              value={selectedTableId?.toString() ?? ""}
              onValueChange={(val) => onTableChange(Number(val))}
              disabled={!selectedDatabaseId || isLoadingTables}
            >
              <SelectTrigger className="w-full" data-testid="select-table">
                {isLoadingTables ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  <SelectValue
                    placeholder={
                      selectedDatabaseId
                        ? "Select a table"
                        : "Select database first"
                    }
                  />
                )}
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem
                    key={table.id}
                    value={table.id.toString()}
                    className="w-full"
                  >
                    <div className="flex items-center justify-between w-full gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Table className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{table.display_name}</span>
                      </div>
                      {table.row_count !== undefined && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] ml-auto shrink-0 tabular-nums"
                        >
                          {table.row_count.toLocaleString()} rows
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
