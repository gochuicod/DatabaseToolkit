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
  Eye,
  TriangleAlert,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { CampaignExportDialog } from "@/components/campaign-export-dialog";
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

  // State: Campaign Settings
  const [campaignCode, setCampaignCode] = useState("");
  const [concept, setConcept] = useState("");
  const [birthdayFilter, setBirthdayFilter] = useState("");
  const [excludeDays, setExcludeDays] = useState("7");
  const [contactCap, setContactCap] = useState("10000");

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
      // Do NOT auto-select segments — let user consciously choose which rules to apply
      // This gives control to deselect rules with 0 matches and respects their contactCap choice
      setSelectedSegments([]);
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

  const mappingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/export-mapping-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyDbId: suppressionDbId,
        historyTableId: suppressionTableId,
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
      setExportDialogOpen(false);
      toast({
        title: "Success",
        description: "Export complete and logged to suppression history.",
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

  // Auto-trigger preview when user selects segments or changes constraints
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
  }, [
    selectedSegments,
    selectedDatabaseId,
    selectedMasterTableId,
    contactCap,
    excludeDays,
    birthdayFilter,
  ]);

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

  const exportBlockedByMapping =
    !!suppressionTableId &&
    (mappingMutation.isPending || !exportMapping || !exportMapping.ready);

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
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  AI Targeting Rules
                </h3>
                {previewMutation.isPending && (
                  <div className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Applying filters...
                  </div>
                )}
              </div>
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-3 transition-opacity duration-200 ${previewMutation.isPending ? "opacity-60 pointer-events-none" : ""}`}
              >
                {analysisResult.suggestions.map((suggestion) => {
                  const parsed = parseSegmentFormat(suggestion.segment);
                  const isSelected = selectedSegments.includes(
                    suggestion.segment,
                  );
                  const matchCount =
                    analysisResult.matchCounts?.[suggestion.segment];
                  const hasNoMatches = matchCount === 0;
                  const hasFieldError = matchCount === -1;
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
                      className={`relative flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${
                        hasNoMatches || hasFieldError
                          ? "border-amber-400 bg-amber-50/40 dark:bg-amber-950/20 opacity-75"
                          : isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card hover:border-primary/40"
                      }`}
                      data-testid={`targeting-rule-${parsed.fieldName}`}
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
                        {matchCount !== undefined && (
                          <div className="mt-2">
                            {hasFieldError ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                <TriangleAlert className="h-3 w-3" />
                                Field not found in this table
                              </span>
                            ) : hasNoMatches ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                <TriangleAlert className="h-3 w-3" />0 matches
                                in this table
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" />
                                {matchCount.toLocaleString()} matches
                              </span>
                            )}
                          </div>
                        )}
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
              {!previewResult && !previewMutation.isPending ? (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 opacity-60">
                  <Database className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm">
                    Configure your campaign to generate a preview.
                  </p>
                </div>
              ) : previewMutation.isPending && !previewResult ? (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-muted" />
                    <Loader2 className="h-16 w-16 animate-spin text-primary absolute inset-0" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Applying targeting filters...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Querying database with your selected rules
                    </p>
                  </div>
                </div>
              ) : previewResult ? (
                <div className="relative space-y-6 animate-in fade-in">
                  {previewMutation.isPending && (
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center rounded-lg">
                      <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                      <p className="text-sm font-medium text-foreground">
                        Updating results...
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Re-applying filters
                      </p>
                    </div>
                  )}

                  {/* Zero-results mismatch alert */}
                  {previewResult.count === 0 && previewResult.filterWarning && (
                    <Alert
                      variant="destructive"
                      className="border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                    >
                      <TriangleAlert className="h-4 w-4 !text-amber-600" />
                      <AlertTitle className="text-amber-700 dark:text-amber-300 font-semibold">
                        Campaign concept doesn't fit the selected table
                      </AlertTitle>
                      <AlertDescription className="text-amber-700 dark:text-amber-400 text-xs leading-relaxed mt-1 space-y-2">
                        <p>{previewResult.filterWarning}</p>
                        <p className="font-medium">What to do:</p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>
                            Check the targeting rules on the left — rules marked
                            with a warning have 0 matches and can be unchecked.
                          </li>
                          <li>
                            Click <strong>Generate Targeting Logic</strong>{" "}
                            again to re-analyze with the corrected field values.
                          </li>
                          <li>
                            Try selecting a different table or database that
                            better matches this campaign type.
                          </li>
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Huge Number */}
                  <div className="text-center space-y-1">
                    <div
                      className={`text-5xl font-bold tracking-tighter transition-opacity duration-300 ${previewMutation.isPending ? "opacity-40" : previewResult.count === 0 ? "text-amber-500" : "text-foreground"}`}
                    >
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

                  {/* Mapping Diagnostics */}
                  {(mappingMutation.isPending || exportMapping) && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Suppression Mapping Check
                      </Label>
                      <div className="rounded-lg border bg-muted/10 p-3 space-y-2">
                        {mappingMutation.isPending && (
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Detecting source/suppression column mapping...
                          </div>
                        )}

                        {exportMapping && (
                          <>
                            <div className="text-xs flex items-center gap-2">
                              {exportMapping.ready ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  <span className="text-emerald-600 font-medium">
                                    Mapping ready for export logging
                                  </span>
                                </>
                              ) : (
                                <>
                                  <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
                                  <span className="text-amber-600 font-medium">
                                    Mapping has issues
                                  </span>
                                </>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground space-y-1">
                              <div>
                                Source ref:{" "}
                                <span className="font-mono text-foreground">
                                  {exportMapping.source.refColumn ||
                                    "(not detected)"}
                                </span>
                              </div>
                              <div>
                                Source ref confidence:{" "}
                                <span className="font-mono text-foreground">
                                  {exportMapping.source.refConfidence}%
                                </span>
                              </div>
                              <div>
                                Why source ref:{" "}
                                <span className="text-foreground">
                                  {exportMapping.source.refReason}
                                </span>
                              </div>
                              <div>
                                Source system:{" "}
                                <span className="font-mono text-foreground">
                                  {exportMapping.source.sourceSystemColumn ||
                                    "(derived)"}
                                </span>
                              </div>
                              <div>
                                Source system confidence:{" "}
                                <span className="font-mono text-foreground">
                                  {exportMapping.source.sourceSystemConfidence}%
                                </span>
                              </div>
                              <div>
                                Why source system:{" "}
                                <span className="text-foreground">
                                  {exportMapping.source.sourceSystemReason}
                                </span>
                              </div>
                              <div>
                                Suppression ref/code/source/date:{" "}
                                <span className="font-mono text-foreground">
                                  {[
                                    exportMapping.suppression.refColumn,
                                    exportMapping.suppression
                                      .campaignCodeColumn,
                                    exportMapping.suppression
                                      .sourceSystemColumn,
                                    exportMapping.suppression.sentDateColumn,
                                  ]
                                    .map((v) => v || "?")
                                    .join(" / ")}
                                </span>
                              </div>
                              <div>
                                Suppression confidence (ref/code/source/date):{" "}
                                <span className="font-mono text-foreground">
                                  {[
                                    exportMapping.suppression.refConfidence,
                                    exportMapping.suppression
                                      .campaignCodeConfidence,
                                    exportMapping.suppression
                                      .sourceSystemConfidence,
                                    exportMapping.suppression
                                      .sentDateConfidence,
                                  ]
                                    .map((v) => `${v}%`)
                                    .join(" / ")}
                                </span>
                              </div>
                              <div>
                                Why suppression ref:{" "}
                                <span className="text-foreground">
                                  {exportMapping.suppression.refReason}
                                </span>
                              </div>
                              <div>
                                Why suppression code:{" "}
                                <span className="text-foreground">
                                  {exportMapping.suppression.campaignCodeReason}
                                </span>
                              </div>
                              <div>
                                Why suppression source:{" "}
                                <span className="text-foreground">
                                  {exportMapping.suppression.sourceSystemReason}
                                </span>
                              </div>
                              <div>
                                Why suppression date:{" "}
                                <span className="text-foreground">
                                  {exportMapping.suppression.sentDateReason}
                                </span>
                              </div>
                              {exportMapping.source.sourceSystemSample && (
                                <div>
                                  Sample source value:{" "}
                                  <span className="font-mono text-foreground">
                                    {exportMapping.source.sourceSystemSample}
                                  </span>
                                </div>
                              )}
                            </div>

                            {!exportMapping.ready &&
                              exportMapping.issues.length > 0 && (
                                <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1 pt-1">
                                  {exportMapping.issues
                                    .slice(0, 3)
                                    .map((issue, idx) => (
                                      <div key={idx}>- {issue}</div>
                                    ))}
                                </div>
                              )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sample List */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Sample Records
                    </Label>
                    <ScrollArea className="h-[160px] rounded-md border bg-muted/10">
                      <div className="p-2 space-y-1">
                        {previewResult.sample
                          .slice(0, 10)
                          .map((contact, idx) => (
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
                      onClick={() => setExportDialogOpen(true)}
                      disabled={
                        !previewResult.records ||
                        previewResult.records.length === 0 ||
                        previewMutation.isPending ||
                        exportBlockedByMapping
                      }
                      variant="outline"
                      className="w-full h-12 text-base"
                      data-testid="button-preview-export"
                    >
                      <Eye className="h-5 w-5 mr-2" />
                      Preview All {previewResult.count.toLocaleString()} Records
                    </Button>
                    {!campaignCode.trim() && (
                      <p className="text-xs text-center text-rose-500 font-medium flex items-center justify-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Campaign Code is
                        required to export
                      </p>
                    )}
                    {campaignCode.trim() && exportBlockedByMapping && (
                      <p className="text-xs text-center text-amber-600 dark:text-amber-400 font-medium flex items-center justify-center gap-1">
                        <TriangleAlert className="w-3 h-3" />
                        Resolve suppression mapping issues before export
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
          onExportAndSuppress={() => {
            exportMutation.mutate();
          }}
          isExporting={exportMutation.isPending}
        />
      )}
    </div>
  );
}
