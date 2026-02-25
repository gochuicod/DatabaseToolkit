import { Download, Copy, Check, Mail, Loader2, ShieldCheck, Columns3 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CampaignExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: string[];
  records: Record<string, any>[];
  totalCount: number;
  excludedCount: number;
  campaignCode: string;
  onExportAndSuppress: () => void;
  isExporting: boolean;
}

export function CampaignExportDialog({
  open,
  onOpenChange,
  columns,
  records,
  totalCount,
  excludedCount,
  campaignCode,
  onExportAndSuppress,
  isExporting,
}: CampaignExportDialogProps) {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollInfo, setScrollInfo] = useState({ left: 0, top: 0, atEnd: false, atBottom: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      setScrollInfo({
        left: el.scrollLeft,
        top: el.scrollTop,
        atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
        atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
      });
    };
    el.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => el.removeEventListener("scroll", handler);
  }, [open, records]);

  const handleCopyToClipboard = async () => {
    const header = columns.join("\t");
    const rows = records.map((r) =>
      columns.map((col) => String(r[col] ?? "")).join("\t"),
    );
    const text = [header, ...rows].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCell = (val: any): string => {
    if (val == null) return "";
    const s = String(val);
    if (s.toLowerCase() === "null") return "";
    return s;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b bg-background shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Mail className="h-5 w-5 text-primary" />
              Campaign Export Preview
              {campaignCode && (
                <Badge variant="outline" className="font-mono text-xs ml-1">
                  {campaignCode}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex items-center gap-3 flex-wrap text-sm pt-1">
                <span className="font-medium text-foreground">
                  {totalCount.toLocaleString()} contact{totalCount !== 1 ? "s" : ""}
                </span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Columns3 className="h-3.5 w-3.5" />
                  {columns.length} columns
                </span>
                {excludedCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {excludedCount.toLocaleString()} suppressed
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
                  {columns.map((col, i) => (
                    <th
                      key={col}
                      className="sticky top-0 z-20 bg-muted border-b px-3 py-2.5 text-left text-xs font-bold text-foreground whitespace-nowrap select-none"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record, rowIdx) => (
                  <tr
                    key={rowIdx}
                    data-testid={`row-campaign-entry-${rowIdx}`}
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
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-background shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Button
              variant="outline"
              onClick={handleCopyToClipboard}
              className="flex-1"
              data-testid="button-copy-campaign-clipboard"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>
            <Button
              onClick={onExportAndSuppress}
              disabled={isExporting || !campaignCode.trim()}
              className="flex-1"
              data-testid="button-export-and-suppress"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting & Logging...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Download CSV & Log to Suppression
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
