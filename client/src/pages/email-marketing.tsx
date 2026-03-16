import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Mail,
  Download,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Eye,
  TriangleAlert,
  Sparkles,
  Users,
  ShieldOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CampaignExportDialog } from "@/components/campaign-export-dialog";
import type {
  MetabaseDatabase,
  MetabaseTable,
  MetabaseField,
} from "@shared/schema";

interface SegmentSuggestion {
  segment: string;
  confidence: number;
  reasoning: string;
}

interface AIAnalysisResponse {
  suggestions: SegmentSuggestion[];
  suggestedAgeRange: string | null;
  reasoning: string;
  matchCounts?: Record<string, number>;
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
  columns: string[];
  records: Record<string, any>[];
  excludedCount: number;
  totalCandidates: number;
  historyTableUsed: boolean;
  filterWarning?: string | null;
  emailColumn: string | null;
  emailFilterApplied: boolean;
  totalWithEmail?: number;
  exactMatchCount?: number;
  relaxedCount?: number;
}

interface ExportMappingResponse {
  ready: boolean;
  issues: string[];
  source: {
    databaseId: number;
    tableName: string;
    refColumn: string | null;
    refConfidence: number;
    refReason: string;
    sourceSystemColumn: string | null;
    sourceSystemConfidence: number;
    sourceSystemReason: string;
    sourceSystemSample: string | null;
  };
  suppression: {
    databaseId: number | null;
    tableName: string | null;
    refColumn: string | null;
    refReason: string;
    refConfidence: number;
    campaignCodeColumn: string | null;
    campaignCodeReason: string;
    campaignCodeConfidence: number;
    sourceSystemColumn: string | null;
    sourceSystemReason: string;
    sourceSystemConfidence: number;
    sentDateColumn: string | null;
    sentDateReason: string;
    sentDateConfidence: number;
  };
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

  // Email filter is always on — this is an email marketing tool
  const filterEmailsOnly = true;

  // State: Campaign Settings
  const [campaignCode, setCampaignCode] = useState("");
  const [concept, setConcept] = useState("");
  const [birthdayFilter, setBirthdayFilter] = useState("");
  const [excludeDays, setExcludeDays] = useState("7");
  const [contactCap, setContactCap] = useState("10000");
  const [applySuppression, setApplySuppression] = useState(true);

  // State: Results
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] =
    useState<AIAnalysisResponse | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(
    null,
  );
  const [exportMapping, setExportMapping] =
    useState<ExportMappingResponse | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // 1. Fetch all databases
  const { data: databases, isLoading: isLoadingDatabases } = useQuery<
    MetabaseDatabase[]
  >({
    queryKey: ["/api/metabase/databases"],
  });

  // 2. Auto-detect Global Suppression DB & Table
  useEffect(() => {
    if (databases) {
      const normalizedSearch = (name: string) =>
        name.toLowerCase().replace(/[\s_-]+/g, " ").trim();
      const suppDb =
        databases.find((db) =>
          normalizedSearch(db.name).includes(
            "marketing global suppression",
          ),
        ) ||
        databases.find((db) =>
          normalizedSearch(db.name).includes("suppression"),
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
  const previewMutation = useMutation({
    mutationFn: async (vars?: {
      segments?: string[];
      ageRange?: string | null;
    }) => {
      const response = await apiRequest("POST", "/api/ai/preview-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyDbId: applySuppression ? suppressionDbId : null,
        historyTableId: applySuppression ? suppressionTableId : null,
        campaignCode,
        segments: vars?.segments ?? selectedSegments,
        ageRange:
          vars?.ageRange !== undefined
            ? vars.ageRange
            : analysisResult?.suggestedAgeRange,
        birthdayFilter,
        excludeDays: parseInt(excludeDays) || 7,
        contactCap: parseInt(contactCap) || 5000,
        filterEmailsOnly,
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

  const mappingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/export-mapping-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyDbId: applySuppression ? suppressionDbId : null,
        historyTableId: applySuppression ? suppressionTableId : null,
        segments: selectedSegments,
      });
      return response.json();
    },
    onSuccess: (data: ExportMappingResponse) => setExportMapping(data),
    onError: () => setExportMapping(null),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/export-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyDbId: applySuppression ? suppressionDbId : null,
        historyTableId: applySuppression ? suppressionTableId : null,
        campaignCode,
        segments: selectedSegments,
        ageRange: analysisResult?.suggestedAgeRange,
        birthdayFilter,
        excludeDays: parseInt(excludeDays) || 7,
        contactCap: parseInt(contactCap) || 5000,
        filterEmailsOnly,
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
      setExportDialogOpen(false);
      toast({
        title: "Success",
        description: applySuppression
          ? "Export complete and logged to suppression history."
          : "Export complete (suppression skipped).",
      });
      setConcept("");
      setCampaignCode("");
      setSelectedSegments([]);
      setAnalysisResult(null);
      setPreviewResult(null);
      setExportMapping(null);
      setBirthdayFilter("");
      setExcludeDays("7");
      setContactCap("10000");
      setApplySuppression(true);
    },
    onError: (error) =>
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const directPreviewMutation = useMutation({
    mutationFn: async () => {
      if (!concept.trim()) {
        return { segments: [], ageRange: null, analysisData: null };
      }
      const response = await apiRequest("POST", "/api/ai/analyze-concept-v2", {
        concept,
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyDbId: applySuppression ? suppressionDbId : null,
        historyTableId: applySuppression ? suppressionTableId : null,
        campaignCode,
        birthdayFilter,
        excludeDays: parseInt(excludeDays) || 7,
        contactCap: parseInt(contactCap) || 5000,
      });
      const data = (await response.json()) as AIAnalysisResponse;
      const validSegments = data.suggestions
        .filter((s) => {
          const count = data.matchCounts?.[s.segment];
          return count === undefined || count > 0;
        })
        .map((s) => s.segment);
      return {
        segments: validSegments,
        ageRange: data.suggestedAgeRange,
        analysisData: data,
      };
    },
    onSuccess: async (result) => {
      setAnalysisResult(null);
      setSelectedSegments(result.segments);
      previewMutation.mutate({
        segments: result.segments,
        ageRange: result.ageRange,
      });
    },
    onError: (error) =>
      toast({
        title: "Preview failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const handleDirectPreview = () => {
    if (!selectedDatabaseId || !selectedMasterTableId)
      return toast({
        title: "Missing target",
        description: "Select an audience source.",
        variant: "destructive",
      });
    directPreviewMutation.mutate();
  };

  // Auto-trigger preview when constraints change after initial preview
  useEffect(() => {
    if (
      previewResult &&
      selectedDatabaseId &&
      selectedMasterTableId &&
      !previewMutation.isPending &&
      !directPreviewMutation.isPending
    ) {
      const timer = setTimeout(() => previewMutation.mutate(), 500);
      return () => clearTimeout(timer);
    }
  }, [contactCap, excludeDays, birthdayFilter, applySuppression]);

  useEffect(() => {
    if (
      previewResult &&
      selectedDatabaseId &&
      selectedMasterTableId &&
      suppressionDbId &&
      suppressionTableId
    ) {
      mappingMutation.mutate();
    } else {
      setExportMapping(null);
    }
  }, [
    previewResult,
    selectedDatabaseId,
    selectedMasterTableId,
    suppressionDbId,
    suppressionTableId,
    selectedSegments,
  ]);

  const isProcessing =
    directPreviewMutation.isPending || previewMutation.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Campaign Builder
            </h1>
            <p className="text-xs text-muted-foreground">
              Build and export targeted mailing lists
            </p>
          </div>
        </div>
        <div className="flex items-center bg-background border rounded-full px-3 py-1 text-xs font-medium shrink-0">
          {suppressionTableId && !applySuppression ? (
            <span className="flex items-center text-amber-600 dark:text-amber-400">
              <ShieldOff className="w-3.5 h-3.5 mr-1.5" /> Suppression Off
            </span>
          ) : suppressionTableId ? (
            <span className="flex items-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Suppression Active
            </span>
          ) : suppressionDbId ? (
            <span className="flex items-center text-amber-600 dark:text-amber-400">
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{" "}
              Connecting...
            </span>
          ) : databases && !isLoadingDatabases ? (
            <span className="flex items-center text-muted-foreground">
              <ShieldOff className="w-3.5 h-3.5 mr-1.5" /> No Suppression DB
            </span>
          ) : (
            <span className="flex items-center text-amber-600 dark:text-amber-400">
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Loading...
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Step 1: Audience Source */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm flex items-center gap-2 font-medium">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  1
                </span>
                Audience Source
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Database
                  </Label>
                  <Select
                    value={selectedDatabaseId?.toString() || ""}
                    onValueChange={(v) => setSelectedDatabaseId(parseInt(v))}
                    disabled={isLoadingDatabases}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={
                          isLoadingDatabases
                            ? "Loading..."
                            : "Select database..."
                        }
                      />
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
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Table
                  </Label>
                  <Select
                    value={selectedMasterTableId?.toString() || ""}
                    onValueChange={(v) => setSelectedMasterTableId(parseInt(v))}
                    disabled={isLoadingTables || !selectedDatabaseId}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={
                          !selectedDatabaseId
                            ? "Select database first"
                            : isLoadingTables
                              ? "Loading..."
                              : "Select table..."
                        }
                      />
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

          {/* Step 2: Campaign Details */}
          <Card
            className={`transition-opacity duration-200 ${!selectedMasterTableId ? "opacity-40 pointer-events-none" : ""}`}
          >
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm flex items-center gap-2 font-medium">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${selectedMasterTableId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  2
                </span>
                Campaign Details
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              {/* Campaign Code + Concept side by side */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="space-y-1 sm:w-[140px] shrink-0">
                  <Label className="text-[11px] text-muted-foreground">
                    Campaign Code
                  </Label>
                  <Input
                    placeholder="e.g. L003"
                    value={campaignCode}
                    onChange={(e) =>
                      setCampaignCode(e.target.value.toUpperCase())
                    }
                    className="font-mono h-9"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Campaign Concept{" "}
                    <span className="text-muted-foreground/40">(optional)</span>
                  </Label>
                  <Textarea
                    placeholder="Describe your target audience, e.g. 'High-value customers over 50 in Tokyo interested in luxury travel'"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    className="resize-none min-h-[72px] text-sm"
                  />
                </div>
              </div>

              {/* Constraints row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Max Contacts
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={contactCap}
                    onChange={(e) => setContactCap(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Birthday Filter
                  </Label>
                  <Input
                    placeholder="e.g. next month"
                    value={birthdayFilter}
                    onChange={(e) => setBirthdayFilter(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Exclude Recently Mailed
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      value={excludeDays}
                      onChange={(e) => setExcludeDays(e.target.value)}
                      disabled={!suppressionTableId || !applySuppression}
                      className="h-9 pr-11"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                      days
                    </span>
                  </div>
                </div>
              </div>

              {/* Suppression toggle — inline bar */}
              <div
                className={`flex items-center justify-between rounded-lg border px-4 py-2.5 ${applySuppression ? "bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900" : "bg-muted/30 border-border"}`}
              >
                <div className="flex items-center gap-2">
                  {applySuppression ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <ShieldOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <span
                      className={`text-xs font-medium ${applySuppression ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}
                    >
                      {applySuppression
                        ? "Suppression active"
                        : "Suppression disabled"}
                    </span>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {applySuppression
                        ? "Previously mailed contacts will be excluded"
                        : "All contacts included, including previously mailed"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={applySuppression}
                  onCheckedChange={setApplySuppression}
                  disabled={!suppressionTableId}
                />
              </div>

              {/* Action Button */}
              <Button
                onClick={handleDirectPreview}
                disabled={isProcessing || !selectedMasterTableId}
                className="w-full"
                size="lg"
                data-testid="button-direct-preview"
              >
                {directPreviewMutation.isPending ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                    Analyzing campaign...
                  </>
                ) : previewMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Building mailing list...
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" /> Preview & Export
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Results */}
        <div>
          <Card
            className={`sticky top-6 transition-all duration-300 ${previewResult ? "ring-1 ring-primary/20" : ""}`}
          >
            <CardHeader className="pb-2 pt-4 px-5 border-b bg-muted/10">
              <CardTitle className="text-sm flex items-center gap-2 font-medium">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${previewResult ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  3
                </span>
                Results
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 px-5 pb-5 space-y-4">
              {!previewResult && !isProcessing ? (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                  <div className="h-12 w-12 rounded-xl bg-muted/60 flex items-center justify-center">
                    <Users className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-xs text-muted-foreground/60 max-w-[180px] leading-relaxed">
                    Select a source and click Preview & Export to generate your
                    list.
                  </p>
                </div>
              ) : isProcessing && !previewResult ? (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                  <div className="relative">
                    <div className="h-14 w-14 rounded-full border-4 border-muted" />
                    <Loader2 className="h-14 w-14 animate-spin text-primary absolute inset-0" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {directPreviewMutation.isPending
                        ? "Analyzing..."
                        : "Querying..."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      This may take a moment
                    </p>
                  </div>
                </div>
              ) : previewResult ? (
                <div className="relative space-y-4 animate-in fade-in">
                  {previewMutation.isPending && (
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-lg">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}

                  {/* Zero-results alert */}
                  {previewResult.count === 0 && previewResult.filterWarning && (
                    <Alert
                      variant="destructive"
                      className="border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                    >
                      <TriangleAlert className="h-4 w-4 !text-amber-600" />
                      <AlertTitle className="text-amber-700 dark:text-amber-300 font-semibold text-xs">
                        No matches found
                      </AlertTitle>
                      <AlertDescription className="text-amber-700 dark:text-amber-400 text-[11px] leading-relaxed mt-1">
                        {previewResult.filterWarning}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Count */}
                  <div className="text-center py-1">
                    <div
                      className={`text-4xl font-bold tracking-tighter tabular-nums ${previewResult.count === 0 ? "text-amber-500" : "text-foreground"}`}
                    >
                      {previewResult.count.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      contacts ready
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Exact Match
                      </div>
                      <div className="text-base font-semibold tabular-nums mt-0.5">
                        {(
                          previewResult.exactMatchCount ??
                          previewResult.totalCandidates ??
                          previewResult.count
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div
                      className={`p-2.5 rounded-lg text-center ${previewResult.excludedCount > 0 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-muted/40"}`}
                    >
                      <div
                        className={`text-[10px] uppercase tracking-wider font-semibold ${previewResult.excludedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
                      >
                        Suppressed
                      </div>
                      <div
                        className={`text-base font-semibold tabular-nums mt-0.5 ${previewResult.excludedCount > 0 ? "text-rose-600 dark:text-rose-400" : ""}`}
                      >
                        {previewResult.excludedCount.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {previewResult.relaxedCount != null &&
                    previewResult.relaxedCount > 0 && (
                      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-900 px-3 py-2">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-snug">
                          <span className="font-semibold">
                            {previewResult.relaxedCount.toLocaleString()}
                          </span>{" "}
                          closely related contacts added to reach your cap
                          (matching core demographics, broadened from specific
                          filters)
                        </p>
                      </div>
                    )}

                  <Separator />

                  {/* Sample */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Sample
                    </Label>
                    <ScrollArea className="h-[120px] rounded-md border bg-muted/10">
                      <div className="p-1 space-y-0.5">
                        {previewResult.sample
                          .slice(0, 8)
                          .map((contact, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center px-2 py-1 rounded bg-background text-xs"
                            >
                              <span className="font-medium truncate">
                                {contact.name}
                              </span>
                              <span className="text-[11px] text-muted-foreground truncate ml-2">
                                {contact.email !== "N/A"
                                  ? contact.email
                                  : contact.city}
                              </span>
                            </div>
                          ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Export */}
                  <div className="space-y-1.5">
                    <Button
                      onClick={() => setExportDialogOpen(true)}
                      disabled={
                        !previewResult.records ||
                        previewResult.records.length === 0 ||
                        previewMutation.isPending
                      }
                      className="w-full h-10"
                      data-testid="button-preview-export"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Review & Export {previewResult.count.toLocaleString()}
                    </Button>
                    {!campaignCode.trim() && (
                      <p className="text-[11px] text-center text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Campaign code
                        required to export
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {previewResult && (
        <CampaignExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          columns={previewResult.columns || []}
          records={previewResult.records || []}
          totalCount={previewResult.count}
          excludedCount={previewResult.excludedCount}
          campaignCode={campaignCode}
          onExportAndSuppress={() => exportMutation.mutate()}
          isExporting={exportMutation.isPending}
        />
      )}
    </div>
  );
}
