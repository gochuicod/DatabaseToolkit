import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Mail,
  Sparkles,
  Download,
  Loader2,
  Users,
  Database,
  History,
  ChevronRight,
  ChevronLeft,
  Send,
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
import { Step } from "@/components/ui/stepper";

interface SegmentSuggestion {
  segment: string;
  confidence: number;
  reasoning: string;
}

interface PreviewResponse {
  count: number;
  sample: Array<{
    name: string;
    email: string;
    city?: string;
    state?: string;
  }>;
  excludedCount: number;
  totalCandidates: number;
  historyTableUsed: boolean;
  filterWarning?: string | null;
}

export default function EmailMarketing() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);

  // Data Source State
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<number | null>(
    null,
  );
  const [selectedMasterTableId, setSelectedMasterTableId] = useState<
    number | null
  >(null);
  const [selectedHistoryTableId, setSelectedHistoryTableId] = useState<
    number | null
  >(null);

  // Campaign State
  const [concept, setConcept] = useState("");
  const [marketingCode, setMarketingCode] = useState("");
  const [birthdayFilter, setBirthdayFilter] = useState("");
  const [excludeDays, setExcludeDays] = useState("7");
  const [contactCap, setContactCap] = useState("5000");

  // Results State
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(
    null,
  );

  const isStep1Complete = !!selectedDatabaseId && !!selectedMasterTableId;
  const isStep2Complete =
    isStep1Complete &&
    concept.trim().length > 0 &&
    marketingCode.trim().length > 0;

  // Queries
  const { data: databases, isLoading: isLoadingDatabases } = useQuery<
    MetabaseDatabase[]
  >({
    queryKey: ["/api/metabase/databases"],
  });

  const { data: tables } = useQuery<MetabaseTable[]>({
    queryKey: ["/api/metabase/databases", selectedDatabaseId, "tables"],
    enabled: !!selectedDatabaseId,
  });

  // Mutations
  const analysisMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/analyze-concept-v2", {
        concept,
        marketingCode,
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyTableId: selectedHistoryTableId,
        birthdayFilter,
        excludeDays: parseInt(excludeDays) || 7,
        contactCap: parseInt(contactCap) || 5000,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      setSelectedSegments(data.suggestions.map((s: any) => s.segment));
      toast({
        title: "Analysis complete",
        description: "AI suggested segments are ready.",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/preview-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        segments: selectedSegments,
        marketingCode,
      });
      return res.json();
    },
    onSuccess: (data) => setPreviewResult(data),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/export-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        marketingCode,
        segments: selectedSegments,
      });
      return res.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign-${marketingCode || "export"}.csv`;
      a.click();
    },
  });

  const handleSegmentToggle = (segment: string) => {
    setSelectedSegments((prev) =>
      prev.includes(segment)
        ? prev.filter((s) => s !== segment)
        : [...prev, segment],
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page Header (Static) */}
      <div className="flex items-center gap-3 mb-6">
        <Mail className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Email Marketing Tool</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered email list generation with two-table architecture
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-6">
          {/* Main Wizard Card */}
          <Card className="shadow-md border-primary/10 overflow-hidden">
            {/* Stepper Header */}
            <CardHeader className="border-b bg-muted/30 py-4">
              <div className="flex items-center justify-center gap-12">
                <Step
                  number={1}
                  title="Data Source"
                  isActive={currentStep === 1}
                  isCompleted={isStep1Complete && currentStep !== 1}
                />
                <div className="h-px w-16 bg-border" />
                <Step
                  number={2}
                  title="Campaign Concept"
                  isActive={currentStep === 2}
                  isCompleted={isStep2Complete}
                />
              </div>
            </CardHeader>

            <CardContent className="pt-6 min-h-[400px]">
              {currentStep === 1 ? (
                /* STEP 1: DATA SOURCE */
                <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                  <div className="space-y-2">
                    <Label>Metabase Database</Label>
                    <Select
                      value={selectedDatabaseId?.toString() || ""}
                      onValueChange={(v) => setSelectedDatabaseId(parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select database" />
                      </SelectTrigger>
                      <SelectContent>
                        {databases?.map((db) => (
                          <SelectItem key={db.id} value={db.id.toString()}>
                            {db.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedDatabaseId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          T1: Master List{" "}
                          <Badge
                            variant="destructive"
                            className="h-4 px-1 text-[10px]"
                          >
                            Required
                          </Badge>
                        </Label>
                        <Select
                          value={selectedMasterTableId?.toString() || ""}
                          onValueChange={(v) =>
                            setSelectedMasterTableId(parseInt(v))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select master table" />
                          </SelectTrigger>
                          <SelectContent>
                            {tables?.map((t) => (
                              <SelectItem key={t.id} value={t.id.toString()}>
                                {t.display_name || t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          T2: History/Behavior{" "}
                          <Badge
                            variant="secondary"
                            className="h-4 px-1 text-[10px]"
                          >
                            Optional
                          </Badge>
                        </Label>
                        <Select
                          value={selectedHistoryTableId?.toString() || "none"}
                          onValueChange={(v) =>
                            setSelectedHistoryTableId(
                              v === "none" ? null : parseInt(v),
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select history table" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              No history table
                            </SelectItem>
                            {tables?.map((t) => (
                              <SelectItem key={t.id} value={t.id.toString()}>
                                {t.display_name || t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-6 border-t mt-auto">
                    <Button
                      disabled={!isStep1Complete}
                      onClick={() => setCurrentStep(2)}
                      className="gap-2"
                    >
                      Next: Define Concept <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                /* STEP 2: CAMPAIGN CONCEPT */
                <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label>Campaign Description (Fuzzy Input)</Label>
                      <Textarea
                        placeholder="e.g. Luxury travel promotion for middle-aged customers..."
                        value={concept}
                        onChange={(e) => setConcept(e.target.value)}
                        className="min-h-[100px]"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Marketing Code</Label>
                      <Input
                        placeholder="e.g. CAMPAIGN-2026-01"
                        value={marketingCode}
                        onChange={(e) => setMarketingCode(e.target.value)}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-muted-foreground">
                        Birthday
                      </Label>
                      <Input
                        value={birthdayFilter}
                        onChange={(e) => setBirthdayFilter(e.target.value)}
                        placeholder="March"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-muted-foreground">
                        Exclusion (Days)
                      </Label>
                      <Input
                        type="number"
                        value={excludeDays}
                        onChange={(e) => setExcludeDays(e.target.value)}
                        disabled={!selectedHistoryTableId}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-muted-foreground">
                        Cap
                      </Label>
                      <Input
                        type="number"
                        value={contactCap}
                        onChange={(e) => setContactCap(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-6 border-t mt-auto">
                    <Button
                      variant="ghost"
                      onClick={() => setCurrentStep(1)}
                      className="gap-2"
                    >
                      <ChevronLeft className="h-4 w-4" /> Back to Setup
                    </Button>
                    <Button
                      onClick={() => analysisMutation.mutate()}
                      disabled={analysisMutation.isPending || !isStep2Complete}
                      className="gap-2 min-w-[180px]"
                    >
                      {analysisMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Analyze Concept
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Results (Shows below the wizard after analysis) */}
          {analysisResult && (
            <Card className="animate-in slide-in-from-bottom-4 duration-500 border-primary/20">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  AI Suggested Targeting Logic
                </CardTitle>
                <CardDescription>{analysisResult.reasoning}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {analysisResult.suggestions.map((s: any) => (
                    <div
                      key={s.segment}
                      className="flex items-center gap-3 p-3 bg-muted/30 border rounded-lg hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => handleSegmentToggle(s.segment)}
                    >
                      <Checkbox
                        checked={selectedSegments.includes(s.segment)}
                      />
                      <div className="flex-1 text-sm">
                        <p className="font-semibold">{s.segment}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {s.reasoning}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {Math.round(s.confidence * 100)}% Match
                      </Badge>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => previewMutation.mutate()}
                  disabled={
                    previewMutation.isPending || selectedSegments.length === 0
                  }
                  className="w-full"
                  variant="outline"
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Generate Preview from Database
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Static Sidebar: Preview & Export */}
        <div className="sticky top-6">
          <Card className="border-t-4 border-t-primary shadow-lg h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Preview & Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!previewResult ? (
                <div className="text-center py-12 px-4 space-y-4 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto opacity-20" />
                  <p className="text-xs leading-relaxed">
                    Set up your data and campaign concept to generate a mailing
                    list.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="text-center py-6 bg-primary/5 rounded-xl border border-primary/10">
                    <p className="text-4xl font-black text-primary">
                      {previewResult.count.toLocaleString()}
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">
                      Matched Contacts
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase text-muted-foreground">
                      Sample Data
                    </Label>
                    <ScrollArea className="h-[280px] rounded-lg border bg-muted/10 p-2">
                      {previewResult.sample.map((c, i) => (
                        <div
                          key={i}
                          className="mb-2 p-2 rounded bg-background border shadow-sm text-[11px]"
                        >
                          <p className="font-bold truncate">{c.name}</p>
                          <p className="text-muted-foreground truncate">
                            {c.email}
                          </p>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>

                  <Button
                    onClick={() => exportMutation.mutate()}
                    disabled={exportMutation.isPending}
                    className="w-full h-12 text-lg font-bold"
                  >
                    {exportMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-5 w-5" />
                    )}
                    Export CSV
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
