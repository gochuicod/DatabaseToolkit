import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Mail,
  Sparkles,
  Send,
  Download,
  Loader2,
  Users,
  Database,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { MetabaseDatabase, MetabaseTable } from "@shared/schema";

interface SegmentSuggestion {
  segment: string;
  confidence: number;
  reasoning: string;
}

function parseSegmentFormat(segment: string): {
  tableName: string | null;
  fieldName: string;
  value: string;
} {
  const colonIndex = segment.indexOf(":");
  if (colonIndex === -1)
    return { tableName: null, fieldName: segment, value: "" };
  const fieldPart = segment.substring(0, colonIndex);
  const valuePart = segment.substring(colonIndex + 1);
  const dotIndex = fieldPart.indexOf(".");
  if (dotIndex !== -1) {
    return {
      tableName: fieldPart.substring(0, dotIndex),
      fieldName: fieldPart.substring(dotIndex + 1),
      value: valuePart,
    };
  }
  return { tableName: null, fieldName: fieldPart, value: valuePart };
}

interface AIAnalysisResponse {
  suggestions: SegmentSuggestion[];
  suggestedAgeRange: string | null;
  reasoning: string;
}

interface PreviewResponse {
  count: number;
  sample: Array<{
    name: string;
    email: string;
    city?: string;
    state?: string;
    engagementScore?: number;
  }>;
  excludedCount: number;
  totalCandidates: number;
  historyTableUsed: boolean;
  filterWarning?: string | null;
}

export default function EmailMarketing() {
  const { toast } = useToast();

  // State: Source Selection
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<number | null>(
    null,
  );
  const [selectedMasterTableId, setSelectedMasterTableId] = useState<
    number | null
  >(null);

  // State: Auto-detected Global Suppression
  const [suppressionDbId, setSuppressionDbId] = useState<number | null>(null);
  const [suppressionTableId, setSuppressionTableId] = useState<number | null>(
    null,
  );

  // State: Campaign Settings
  const [campaignCode, setCampaignCode] = useState("");
  const [concept, setConcept] = useState("");
  const [birthdayFilter, setBirthdayFilter] = useState("");
  const [excludeDays, setExcludeDays] = useState("7");
  const [contactCap, setContactCap] = useState("5000");

  // State: Results
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] =
    useState<AIAnalysisResponse | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(
    null,
  );

  // 1. Fetch all databases
  const { data: databases, isLoading: isLoadingDatabases } = useQuery<
    MetabaseDatabase[]
  >({
    queryKey: ["/api/metabase/databases"],
  });

  // 2. Auto-detect Global Suppression DB & Table
  useEffect(() => {
    if (databases) {
      const suppDb = databases.find((db) =>
        db.name.toLowerCase().includes("marketing_global_suppression"),
      );
      if (suppDb) setSuppressionDbId(suppDb.id);
    }
  }, [databases]);

  const { data: suppressionTables } = useQuery<MetabaseTable[]>({
    queryKey: ["/api/metabase/databases", suppressionDbId, "tables"],
    enabled: !!suppressionDbId,
  });

  useEffect(() => {
    if (suppressionTables && suppressionTables.length > 0) {
      const suppTable = suppressionTables.find(
        (t) =>
          t.name.toLowerCase().includes("campaign") ||
          t.name.toLowerCase().includes("suppression") ||
          t.name.toLowerCase().includes("history") ||
          t.display_name.toLowerCase().includes("campaign") ||
          t.display_name.toLowerCase().includes("suppression") ||
          t.display_name.toLowerCase().includes("history"),
      );
      if (suppTable) {
        setSuppressionTableId(suppTable.id);
      } else {
        setSuppressionTableId(suppressionTables[0].id);
      }
    }
  }, [suppressionTables]);

  // 3. Fetch tables for chosen Target Database
  const { data: tables, isLoading: isLoadingTables } = useQuery<
    MetabaseTable[]
  >({
    queryKey: ["/api/metabase/databases", selectedDatabaseId, "tables"],
    enabled: !!selectedDatabaseId,
  });

  // Reset states when database changes
  useEffect(() => {
    if (tables && tables.length > 0) {
      setSelectedMasterTableId(null);
      setAnalysisResult(null);
      setPreviewResult(null);
      setSelectedSegments([]);
    }
  }, [selectedDatabaseId, tables]);

  // Mutations
  const analysisMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/analyze-concept-v2", {
        concept,
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyDbId: suppressionDbId,
        historyTableId: suppressionTableId,
        campaignCode,
        birthdayFilter,
        excludeDays: parseInt(excludeDays) || 7,
        contactCap: parseInt(contactCap) || 5000,
      });
      return response.json();
    },
    onSuccess: (data: AIAnalysisResponse) => {
      setAnalysisResult(data);
      setSelectedSegments(data.suggestions.map((s) => s.segment));
    },
    onError: (error) =>
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/preview-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyDbId: suppressionDbId,
        historyTableId: suppressionTableId,
        campaignCode,
        segments: selectedSegments,
        ageRange: analysisResult?.suggestedAgeRange,
        birthdayFilter,
        excludeDays: parseInt(excludeDays) || 7,
        contactCap: parseInt(contactCap) || 5000,
      });
      return response.json();
    },
    onSuccess: (data: PreviewResponse) => setPreviewResult(data),
    onError: (error) =>
      toast({
        title: "Preview failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/export-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyDbId: suppressionDbId,
        historyTableId: suppressionTableId,
        campaignCode,
        segments: selectedSegments,
        ageRange: analysisResult?.suggestedAgeRange,
        birthdayFilter,
        excludeDays: parseInt(excludeDays) || 7,
        contactCap: parseInt(contactCap) || 5000,
      });
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${campaignCode || "campaign"}-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Success",
        description: "Export complete and logged to suppression history.",
      });
    },
    onError: (error) =>
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const handleAnalyze = () => {
    if (!selectedDatabaseId || !selectedMasterTableId)
      return toast({
        title: "Missing target",
        description: "Select an audience source.",
        variant: "destructive",
      });
    if (!concept.trim())
      return toast({
        title: "Missing concept",
        description: "Enter a campaign description.",
        variant: "destructive",
      });
    analysisMutation.mutate();
  };

  // Auto-trigger preview
  useEffect(() => {
    if (
      selectedSegments.length > 0 &&
      selectedDatabaseId &&
      selectedMasterTableId &&
      !previewMutation.isPending
    ) {
      const timer = setTimeout(() => previewMutation.mutate(), 500);
      return () => clearTimeout(timer);
    }
  }, [selectedSegments, selectedDatabaseId, selectedMasterTableId]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 font-sans">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Campaign Builder
            </h1>
            <p className="text-sm text-muted-foreground">
              Define your audience and generate intelligent mailing lists.
            </p>
          </div>
        </div>

        {/* Dynamic Suppression Badge */}
        <div className="flex items-center bg-background border shadow-sm rounded-full px-4 py-1.5 text-sm font-medium">
          {suppressionTableId ? (
            <span className="flex items-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4 mr-2" /> Global Suppression Active
            </span>
          ) : (
            <span className="flex items-center text-amber-600 dark:text-amber-400">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Locating
              Suppression List...
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Form Setup */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Audience Source */}
          <Card className="shadow-sm border-muted/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  1
                </span>
                Audience Source
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Target Database
                  </Label>
                  <Select
                    value={selectedDatabaseId?.toString() || ""}
                    onValueChange={(v) => setSelectedDatabaseId(parseInt(v))}
                    disabled={isLoadingDatabases}
                  >
                    <SelectTrigger className="bg-muted/30">
                      <SelectValue placeholder="Select Database..." />
                    </SelectTrigger>
                    <SelectContent>
                      {databases
                        ?.filter((db) => db.id !== suppressionDbId)
                        .map((db) => (
                          <SelectItem key={db.id} value={db.id.toString()}>
                            {db.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Master Audience Table
                  </Label>
                  <Select
                    value={selectedMasterTableId?.toString() || ""}
                    onValueChange={(v) => setSelectedMasterTableId(parseInt(v))}
                    disabled={isLoadingTables || !selectedDatabaseId}
                  >
                    <SelectTrigger className="bg-muted/30">
                      <SelectValue placeholder="Select Table..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tables?.map((table) => (
                        <SelectItem key={table.id} value={table.id.toString()}>
                          {table.display_name || table.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Campaign Definition */}
          <Card className="shadow-sm border-muted/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    2
                  </span>
                  Campaign Definition
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1.5 md:col-span-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Campaign Code
                  </Label>
                  <Input
                    placeholder="e.g. L003"
                    value={campaignCode}
                    onChange={(e) =>
                      setCampaignCode(e.target.value.toUpperCase())
                    }
                    className="font-mono bg-muted/30"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Campaign Concept
                  </Label>
                  <Textarea
                    placeholder="Describe the campaign target (e.g. 'Luxury travel deals for older demographics...')"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    className="resize-none min-h-[80px] bg-muted/30"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
                  Constraints & Limits
                </Label>
                <div className="flex flex-wrap gap-4 p-4 rounded-lg border bg-muted/10">
                  <div className="flex-1 min-w-[140px] space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Max Contacts
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={contactCap}
                      onChange={(e) => setContactCap(e.target.value)}
                      className="bg-white dark:bg-zinc-950"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px] space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Exclude Mailed Within (Days)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={excludeDays}
                      onChange={(e) => setExcludeDays(e.target.value)}
                      disabled={!suppressionTableId}
                      className="bg-white dark:bg-zinc-950"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px] space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Birthday Filter (Optional)
                    </Label>
                    <Input
                      placeholder="e.g. next month"
                      value={birthdayFilter}
                      onChange={(e) => setBirthdayFilter(e.target.value)}
                      className="bg-white dark:bg-zinc-950"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={
                  analysisMutation.isPending ||
                  !concept.trim() ||
                  !selectedMasterTableId
                }
                className="w-full mt-2"
                size="lg"
              >
                {analysisMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Generate Targeting
                    Logic
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* AI Suggestions (Appears after analysis) */}
          {analysisResult && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                AI Targeting Rules
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analysisResult.suggestions.map((suggestion) => {
                  const parsed = parseSegmentFormat(suggestion.segment);
                  const isSelected = selectedSegments.includes(
                    suggestion.segment,
                  );
                  return (
                    <div
                      key={suggestion.segment}
                      onClick={() =>
                        setSelectedSegments((prev) =>
                          isSelected
                            ? prev.filter((s) => s !== suggestion.segment)
                            : [...prev, suggestion.segment],
                        )
                      }
                      className={`relative flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/40"}`}
                    >
                      <Checkbox
                        checked={isSelected}
                        className="absolute top-4 right-4"
                      />
                      <div className="pr-6">
                        <div className="font-mono text-sm font-medium mb-1">
                          <span className="text-primary">
                            {parsed.fieldName}
                          </span>{" "}
                          ={" "}
                          <span className="text-amber-600 dark:text-amber-400">
                            "{parsed.value || suggestion.segment}"
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {suggestion.reasoning}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Preview & Export */}
        <div className="space-y-6">
          <Card className="shadow-sm border-muted/60 sticky top-6">
            <CardHeader className="pb-4 border-b bg-muted/10">
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  3
                </span>
                Export Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {!previewResult ? (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 opacity-60">
                  <Database className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm">
                    Configure your campaign to generate a preview.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in">
                  {/* Huge Number */}
                  <div className="text-center space-y-1">
                    <div className="text-5xl font-bold tracking-tighter text-foreground">
                      {previewResult.count.toLocaleString()}
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Final Contacts Ready
                    </div>
                  </div>

                  {/* Stat blocks */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/40 text-center">
                      <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">
                        Matched
                      </div>
                      <div className="text-lg font-semibold">
                        {previewResult.totalCandidates?.toLocaleString() ||
                          previewResult.count.toLocaleString()}
                      </div>
                    </div>
                    <div
                      className={`p-3 rounded-lg text-center ${previewResult.excludedCount > 0 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-muted/40"}`}
                    >
                      <div
                        className={`text-xs mb-1 uppercase tracking-wider font-semibold ${previewResult.excludedCount > 0 ? "text-rose-600" : "text-muted-foreground"}`}
                      >
                        Suppressed
                      </div>
                      <div
                        className={`text-lg font-semibold ${previewResult.excludedCount > 0 ? "text-rose-600" : ""}`}
                      >
                        {previewResult.excludedCount.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Sample List */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Sample Records
                    </Label>
                    <ScrollArea className="h-[200px] rounded-md border bg-muted/10">
                      <div className="p-2 space-y-1">
                        {previewResult.sample.map((contact, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between items-center p-2 rounded bg-background shadow-sm text-sm"
                          >
                            <span className="font-medium truncate">
                              {contact.name}
                            </span>
                            <span className="text-xs text-muted-foreground truncate ml-4">
                              {contact.email !== "N/A"
                                ? contact.email
                                : contact.city}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Action */}
                  <div className="space-y-2">
                    <Button
                      onClick={() => exportMutation.mutate()}
                      disabled={
                        exportMutation.isPending || !campaignCode.trim()
                      }
                      className="w-full h-12 text-base"
                    >
                      {exportMutation.isPending ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />{" "}
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="h-5 w-5 mr-2" /> Download CSV
                        </>
                      )}
                    </Button>
                    {!campaignCode.trim() && (
                      <p className="text-xs text-center text-rose-500 font-medium flex items-center justify-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Campaign Code is
                        required to export
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
