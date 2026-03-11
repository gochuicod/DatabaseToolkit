import {
  Download,
  Copy,
  Check,
  Loader2,
  Columns3,
  ChevronDown,
  FileSpreadsheet,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Zap,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import type { FilterValue } from "@shared/schema";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseId: number;
  tableId: number;
  filters: FilterValue[];
  tableName?: string;
  totalCount?: number;
}

type SortDirection = "asc" | "desc" | null;
type LimitMode = "maximum" | "custom";

const BATCH_SIZE = 5000;

export function ExportDialog({
  open,
  onOpenChange,
  databaseId,
  tableId,
  filters,
  tableName,
  totalCount,
}: ExportDialogProps) {
  const [copied, setCopied] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isFetchingForExport, setIsFetchingForExport] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollInfo, setScrollInfo] = useState({ left: 0, atEnd: false });

  const [limitMode, setLimitMode] = useState<LimitMode>("maximum");
  const [customLimit, setCustomLimit] = useState("2000");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const recordsRef = useRef<Record<string, any>[]>([]);
  recordsRef.current = records;

  const fetchBatch = useCallback(
    async (offset: number, limit: number): Promise<{ records: Record<string, any>[]; columns: string[]; total: number }> => {
      const response = await apiRequest("POST", "/api/metabase/table-data", {
        databaseId,
        tableId,
        filters,
        limit,
        offset,
        scanLimit: 999999999,
      });
      return response.json();
    },
    [databaseId, tableId, filters],
  );

  const fetchInitial = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchBatch(0, BATCH_SIZE);
      setColumns(data.columns);
      setTotal(data.total);
      setRecords(data.records);
      recordsRef.current = data.records;
    } catch (err) {
      console.error("Failed to fetch table data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchBatch]);

  const loadMore = useCallback(async (count: number) => {
    setIsLoadingMore(true);
    try {
      const data = await fetchBatch(recordsRef.current.length, count);
      const updated = [...recordsRef.current, ...data.records];
      setRecords(updated);
      recordsRef.current = updated;
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to load more:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchBatch]);

  const fetchAllAndReturn = useCallback(async (targetCount: number): Promise<Record<string, any>[]> => {
    let allRecords = [...recordsRef.current];
    if (allRecords.length >= targetCount) return allRecords;

    setIsFetchingForExport(true);
    let currentOffset = allRecords.length;

    while (currentOffset < targetCount) {
      try {
        const batchLimit = Math.min(10000, targetCount - currentOffset);
        const data = await fetchBatch(currentOffset, batchLimit);
        if (data.records.length === 0) break;
        allRecords = [...allRecords, ...data.records];
        setRecords(allRecords);
        recordsRef.current = allRecords;
        currentOffset += data.records.length;
        if (currentOffset >= data.total) break;
      } catch (err) {
        console.error("Failed to fetch batch:", err);
        break;
      }
    }
    setIsFetchingForExport(false);
    return allRecords;
  }, [fetchBatch]);

  const loadAllRemaining = useCallback(async () => {
    if (isFetchingForExport) return;
    setIsFetchingForExport(true);
    let allRecords = [...recordsRef.current];
    let currentOffset = allRecords.length;

    while (true) {
      try {
        const data = await fetchBatch(currentOffset, 10000);
        if (data.records.length === 0) break;
        allRecords = [...allRecords, ...data.records];
        setRecords(allRecords);
        recordsRef.current = allRecords;
        currentOffset += data.records.length;
        if (currentOffset >= data.total) break;
      } catch (err) {
        console.error("Failed to fetch batch:", err);
        break;
      }
    }
    setIsFetchingForExport(false);
  }, [fetchBatch, isFetchingForExport]);

  useEffect(() => {
    if (open) {
      setRecords([]);
      recordsRef.current = [];
      setColumns([]);
      setTotal(0);
      setSortColumn(null);
      setSortDirection(null);
      setLimitMode("maximum");
      setCustomLimit("2000");
      fetchInitial();
    }
  }, [open, fetchInitial]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      setScrollInfo({
        left: el.scrollLeft,
        atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
      });
    };
    el.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => el.removeEventListener("scroll", handler);
  }, [open, records]);

  const handleColumnSort = (col: string) => {
    if (sortColumn === col) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const applySorting = useCallback((recs: Record<string, any>[]) => {
    if (!sortColumn || !sortDirection) return recs;

    return [...recs].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === "asc" ? 1 : -1;
      if (bVal == null) return sortDirection === "asc" ? -1 : 1;

      const aStr = String(aVal);
      const bStr = String(bVal);

      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum) && aStr !== "" && bStr !== "") {
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }

      const cmp = aStr.localeCompare(bStr, undefined, { sensitivity: "base" });
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [sortColumn, sortDirection]);

  const sortedRecords = useMemo(() => applySorting(records), [records, applySorting]);

  const parsedLimit = parseInt(customLimit, 10);
  const targetExportCount = limitMode === "custom" && !isNaN(parsedLimit) && parsedLimit >= 1
    ? Math.min(parsedLimit, total || Infinity)
    : records.length;
  const displayRecords = limitMode === "custom" && !isNaN(parsedLimit) && parsedLimit >= 1
    ? sortedRecords.slice(0, Math.min(parsedLimit, sortedRecords.length))
    : sortedRecords;
  const needsMoreData = limitMode === "custom" && targetExportCount > records.length;

  const handleCopyToClipboard = async () => {
    let exportRecords: Record<string, any>[];

    if (needsMoreData) {
      const allData = await fetchAllAndReturn(targetExportCount);
      exportRecords = applySorting(allData).slice(0, targetExportCount);
    } else {
      exportRecords = sortedRecords.slice(0, targetExportCount);
    }

    const header = columns.join("\t");
    const rows = exportRecords.map((r) =>
      columns.map((col) => {
        const val = r[col];
        if (val == null || String(val).toLowerCase() === "null") return "";
        return String(val);
      }).join("\t"),
    );
    const text = [header, ...rows].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCSV = async () => {
    let exportRecords: Record<string, any>[];

    if (needsMoreData) {
      const allData = await fetchAllAndReturn(targetExportCount);
      exportRecords = applySorting(allData).slice(0, targetExportCount);
    } else {
      exportRecords = sortedRecords.slice(0, targetExportCount);
    }

    const csvContent = [
      columns.join(","),
      ...exportRecords.map((r) =>
        columns
          .map((col) => {
            const val = r[col];
            const s = val == null || String(val).toLowerCase() === "null" ? "" : String(val);
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tableName || "table"}-export-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatCell = (val: any): string => {
    if (val == null) return "";
    const s = String(val);
    if (s.toLowerCase() === "null") return "";
    return s;
  };

  const hasMore = records.length < total;
  const isAnyLoading = isLoadingMore || isFetchingForExport;

  const getSortIcon = (col: string) => {
    if (sortColumn !== col) return <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />;
    if (sortDirection === "asc") return <ArrowUp className="h-3 w-3 text-primary" />;
    return <ArrowDown className="h-3 w-3 text-primary" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b bg-background shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {tableName || "Table"} Data
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex items-center gap-3 flex-wrap text-sm pt-1">
                <span className="font-medium text-foreground">
                  {total.toLocaleString()} total record{total !== 1 ? "s" : ""}
                </span>
                {columns.length > 0 && (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Columns3 className="h-3.5 w-3.5" />
                    {columns.length} columns
                  </span>
                )}
                <Badge variant="secondary" className="text-xs">
                  Loaded {records.length.toLocaleString()} of {total.toLocaleString()}
                </Badge>
                {sortColumn && (
                  <Badge variant="outline" className="text-xs">
                    Sorted by {sortColumn} {sortDirection === "asc" ? "↑" : "↓"}
                  </Badge>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 relative">
          {!scrollInfo.atEnd && scrollInfo.left < 20 && columns.length > 8 && (
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/10 to-transparent z-20 pointer-events-none" />
          )}
          {scrollInfo.left > 20 && (
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black/10 to-transparent z-20 pointer-events-none" />
          )}

          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Loading table data...</p>
              </div>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="absolute inset-0 overflow-auto scroll-smooth"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <table className="border-collapse w-max min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 left-0 z-30 bg-muted border-b border-r px-3 py-2.5 text-xs font-bold text-muted-foreground text-center w-[52px] min-w-[52px]">
                      #
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="sticky top-0 z-20 bg-muted border-b px-3 py-2.5 text-left text-xs font-bold text-foreground whitespace-nowrap select-none cursor-pointer hover:bg-muted/80 transition-colors group"
                        onClick={() => handleColumnSort(col)}
                        data-testid={`sort-column-${col}`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {col}
                          {getSortIcon(col)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRecords.map((record, rowIdx) => (
                    <tr
                      key={rowIdx}
                      data-testid={`row-entry-${rowIdx}`}
                      className={`${rowIdx % 2 === 0 ? "bg-background" : "bg-muted/30"} hover:bg-primary/5 transition-colors`}
                    >
                      <td className="sticky left-0 z-10 bg-inherit border-r px-3 py-2 text-xs text-muted-foreground text-center font-mono tabular-nums">
                        {rowIdx + 1}
                      </td>
                      {columns.map((col) => {
                        const val = formatCell(record[col]);
                        return (
                          <td
                            key={col}
                            className="px-3 py-2 whitespace-nowrap max-w-[280px] truncate"
                            title={val}
                          >
                            {val || <span className="text-muted-foreground/40">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {hasMore && !isFetchingForExport && (
                <div className="sticky left-0 flex items-center justify-center gap-3 py-4 border-t bg-muted/20">
                  <Button
                    variant="secondary"
                    onClick={() => loadMore(BATCH_SIZE)}
                    disabled={isAnyLoading}
                    data-testid="button-load-more-rows"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-2" />
                        Load next {Math.min(BATCH_SIZE, total - records.length).toLocaleString()} rows
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={loadAllRemaining}
                    disabled={isAnyLoading}
                    data-testid="button-load-all-rows"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Load all {(total - records.length).toLocaleString()} remaining
                  </Button>
                </div>
              )}

              {isFetchingForExport && (
                <div className="sticky left-0 flex items-center justify-center gap-3 py-4 border-t bg-muted/20">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Loading rows... {records.length.toLocaleString()} of {(limitMode === "custom" ? targetExportCount : total).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-background shrink-0">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="limitMode"
                  checked={limitMode === "maximum"}
                  onChange={() => setLimitMode("maximum")}
                  className="accent-primary"
                  data-testid="radio-show-maximum"
                />
                <span className="font-medium">Show maximum (first {records.length.toLocaleString()})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="limitMode"
                  checked={limitMode === "custom"}
                  onChange={() => setLimitMode("custom")}
                  className="accent-primary"
                  data-testid="radio-pick-limit"
                />
                <span className="font-medium">Pick a limit</span>
                {limitMode === "custom" && (
                  <Input
                    type="number"
                    min="1"
                    max={total}
                    value={customLimit}
                    onChange={(e) => setCustomLimit(e.target.value)}
                    className="h-7 w-24"
                    data-testid="input-custom-limit"
                  />
                )}
              </label>
              <span className="text-xs text-muted-foreground ml-auto">
                {needsMoreData ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    Will fetch {(targetExportCount - records.length).toLocaleString()} more rows on export
                  </span>
                ) : (
                  <>Showing first {displayRecords.length.toLocaleString()} rows</>
                )}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button
                variant="outline"
                onClick={handleCopyToClipboard}
                disabled={displayRecords.length === 0 || isFetchingForExport}
                className="flex-1"
                data-testid="button-copy-to-clipboard"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied {targetExportCount.toLocaleString()} rows!
                  </>
                ) : isFetchingForExport ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Fetching data...
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
              <Button
                onClick={handleDownloadCSV}
                disabled={displayRecords.length === 0 || isFetchingForExport}
                className="flex-1"
                data-testid="button-download-csv"
              >
                {isFetchingForExport ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Fetching {targetExportCount.toLocaleString()} rows...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV ({targetExportCount.toLocaleString()} rows)
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
