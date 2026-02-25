import { Download, Copy, Check, Mail } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MailingListEntry } from "@shared/schema";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: MailingListEntry[];
  total: number;
}

export function ExportDialog({
  open,
  onOpenChange,
  entries,
  total,
}: ExportDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyToClipboard = async () => {
    const header = "Name\tEmail\tAddress\tCity\tState\tZipcode\tCountry";
    const rows = entries.map(
      (e) =>
        `${e.name || ""}\t${e.email || ""}\t${e.address || ""}\t${e.city || ""}\t${e.state || ""}\t${e.zipcode || ""}\t${e.country || ""}`,
    );
    const text = [header, ...rows].join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCSV = () => {
    const header = [
      "Name",
      "Email",
      "Address",
      "City",
      "State",
      "Zipcode",
      "Country",
    ];
    const rows = entries.map((e) => [
      e.name || "",
      e.email || "",
      e.address || "",
      e.city || "",
      e.state || "",
      e.zipcode || "",
      e.country || "",
    ]);

    const csvContent = [
      header.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mailing-list-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Mailing List Generated
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            Successfully exported {total.toLocaleString()} contact
            {total !== 1 ? "s" : ""}
            {entries.length < total && (
              <Badge variant="secondary" className="text-xs">
                Showing first {entries.length}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Using a native div with overflow-auto for reliable 2-axis scrolling. 
           relative + absolute inset-0 trick ensures the scroll area fills the flex parent correctly.
        */}
        <div className="flex-1 min-h-[400px] mt-4 border rounded-md relative overflow-hidden bg-background">
          <div className="absolute inset-0 overflow-auto">
            <Table className="w-max min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 bg-background px-4 shadow-sm z-10 font-bold text-foreground">
                    Name
                  </TableHead>
                  <TableHead className="sticky top-0 bg-background px-4 shadow-sm z-10 font-bold text-foreground">
                    Email
                  </TableHead>
                  <TableHead className="sticky top-0 bg-background px-4 shadow-sm z-10 font-bold text-foreground">
                    Address
                  </TableHead>
                  <TableHead className="sticky top-0 bg-background px-4 shadow-sm z-10 font-bold text-foreground">
                    City
                  </TableHead>
                  <TableHead className="sticky top-0 bg-background px-4 shadow-sm z-10 font-bold text-foreground">
                    State
                  </TableHead>
                  <TableHead className="sticky top-0 bg-background px-4 shadow-sm z-10 font-bold text-foreground">
                    Zipcode
                  </TableHead>
                  <TableHead className="sticky top-0 bg-background px-4 shadow-sm z-10 font-bold text-foreground">
                    Country
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => (
                  <TableRow
                    key={index}
                    data-testid={`row-entry-${index}`}
                    className="hover:bg-muted/50"
                  >
                    <TableCell className="font-medium whitespace-nowrap px-4">
                      {entry.name || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4">
                      {entry.email || "-"}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap px-4 max-w-[300px] truncate"
                      title={entry.address}
                    >
                      {entry.address || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4">
                      {entry.city || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4">
                      {entry.state || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4">
                      {entry.zipcode || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4">
                      {entry.country || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleCopyToClipboard}
            className="flex-1"
            data-testid="button-copy-to-clipboard"
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
            onClick={handleDownloadCSV}
            className="flex-1"
            data-testid="button-download-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
