import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, Sparkles, Send, Download, Loader2, Users, Database, Layers, History, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { MetabaseDatabase, MetabaseTable, TableWithFields } from "@shared/schema";

interface SegmentSuggestion {
  segment: string;
  confidence: number;
  reasoning: string;
  tableId?: number;
  tableName?: string;
  fieldName?: string;
  value?: string;
}

// Parse segment format: "table_name.field_name:value" or "field_name:value"
function parseSegmentFormat(segment: string): { tableName: string | null; fieldName: string; value: string } {
  const colonIndex = segment.indexOf(":");
  if (colonIndex === -1) {
    return { tableName: null, fieldName: segment, value: "" };
  }
  
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
  matchedSegments?: string[];
  unmatchedSegments?: string[];
  filterWarning?: string | null;
}

// Recommended database/table for email marketing (has email field with large dataset)
const RECOMMENDED_DB_PATTERN = /astro.?db|astro db data/i;

export default function EmailMarketing() {
  const { toast } = useToast();
  
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<number | null>(null);
  const [selectedMasterTableId, setSelectedMasterTableId] = useState<number | null>(null);
  const [selectedHistoryTableId, setSelectedHistoryTableId] = useState<number | null>(null);
  const [concept, setConcept] = useState("");
  const [birthdayFilter, setBirthdayFilter] = useState("");
  const [excludeDays, setExcludeDays] = useState("7");
  const [contactCap, setContactCap] = useState("5000");
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResponse | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [showValidation, setShowValidation] = useState(false);

  // Fetch databases
  const { data: databases, isLoading: isLoadingDatabases } = useQuery<MetabaseDatabase[]>({
    queryKey: ["/api/metabase/databases"],
  });

  // Auto-select recommended database when available
  useEffect(() => {
    if (databases && databases.length > 0 && !selectedDatabaseId) {
      const recommended = databases.find(db => RECOMMENDED_DB_PATTERN.test(db.name));
      if (recommended) {
        setSelectedDatabaseId(recommended.id);
      }
    }
  }, [databases, selectedDatabaseId]);

  // Fetch tables when database is selected
  const { data: tables, isLoading: isLoadingTables } = useQuery<MetabaseTable[]>({
    queryKey: ["/api/metabase/databases", selectedDatabaseId, "tables"],
    enabled: !!selectedDatabaseId,
  });

  // Fetch fields for master table (T1)
  const { data: masterTableFields } = useQuery<Array<{ id: number; name: string; display_name?: string; base_type: string }>>({
    queryKey: ["/api/metabase/tables", selectedMasterTableId, "fields"],
    enabled: !!selectedMasterTableId,
  });

  // Fetch fields for history table (T2)
  const { data: historyTableFields } = useQuery<Array<{ id: number; name: string; display_name?: string; base_type: string }>>({
    queryKey: ["/api/metabase/tables", selectedHistoryTableId, "fields"],
    enabled: !!selectedHistoryTableId,
  });

  // Auto-detect tables based on field patterns
  useEffect(() => {
    if (tables && tables.length > 0) {
      // Reset selections when database changes
      setSelectedMasterTableId(null);
      setSelectedHistoryTableId(null);
      setAnalysisResult(null);
      setPreviewResult(null);
      setSelectedSegments([]);
    }
  }, [selectedDatabaseId, tables]);

  // Check if master table has email field (expanded patterns to include used_for_mailing)
  const hasEmailField = masterTableFields?.some((f: any) => 
    /email|e[-_]?mail|メール|mail.*address|mailing|used.?for.?mail/i.test(f.name) || /email|e[-_]?mail|メール|mailing|used.?for.?mail/i.test(f.display_name || "")
  );

  // Check if history table has sent date field
  const hasSentDateField = historyTableFields?.some((f: any) =>
    /sent|send|mail.*date|campaign.*date|配信日/i.test(f.name) || /sent|send|mail.*date|配信日/i.test(f.display_name || "")
  );

  const analysisMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/analyze-concept-v2", {
        concept,
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyTableId: selectedHistoryTableId,
        birthdayFilter,
        excludeDays: parseInt(excludeDays) || 7,
        contactCap: parseInt(contactCap) || 5000,
      });
      return response.json();
    },
    onSuccess: (data: AIAnalysisResponse) => {
      setAnalysisResult(data);
      setSelectedSegments(data.suggestions.map(s => s.segment));
      toast({
        title: "Analysis complete",
        description: `Found ${data.suggestions.length} suggested segments`,
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to analyze concept",
        variant: "destructive",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/preview-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyTableId: selectedHistoryTableId,
        segments: selectedSegments,
        ageRange: analysisResult?.suggestedAgeRange,
        birthdayFilter,
        excludeDays: parseInt(excludeDays) || 7,
        contactCap: parseInt(contactCap) || 5000,
      });
      return response.json();
    },
    onSuccess: (data: PreviewResponse) => {
      setPreviewResult(data);
      toast({
        title: "Preview ready",
        description: `Found ${data.count.toLocaleString()} matching contacts`,
      });
    },
    onError: (error) => {
      toast({
        title: "Preview failed",
        description: error instanceof Error ? error.message : "Failed to generate preview",
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/export-v2", {
        databaseId: selectedDatabaseId,
        masterTableId: selectedMasterTableId,
        historyTableId: selectedHistoryTableId,
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
      a.download = `email-campaign-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Export complete",
        description: "Your mailing list has been downloaded",
      });
    },
    onError: (error) => {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export list",
        variant: "destructive",
      });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/email-marketing/validate-table", {
        databaseId: selectedDatabaseId,
        tableId: selectedMasterTableId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setValidationResult(data);
      setShowValidation(true);
      toast({
        title: "Table validated",
        description: `Found ${data.totalCount.toLocaleString()} records with ${data.fieldCount} fields`,
      });
    },
    onError: (error) => {
      toast({
        title: "Validation failed",
        description: error instanceof Error ? error.message : "Failed to validate table",
        variant: "destructive",
      });
    },
  });

  const handleSegmentToggle = (segment: string) => {
    setSelectedSegments(prev =>
      prev.includes(segment)
        ? prev.filter(s => s !== segment)
        : [...prev, segment]
    );
  };

  // Auto-trigger preview when segments are selected/changed
  useEffect(() => {
    if (selectedSegments.length > 0 && selectedDatabaseId && selectedMasterTableId && !previewMutation.isPending) {
      const timer = setTimeout(() => {
        previewMutation.mutate();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [selectedSegments, selectedDatabaseId, selectedMasterTableId]);

  const handleAnalyze = () => {
    if (!selectedDatabaseId) {
      toast({
        title: "Missing database",
        description: "Please select a database first",
        variant: "destructive",
      });
      return;
    }
    if (!selectedMasterTableId) {
      toast({
        title: "Missing master table",
        description: "Please select T1 (Master Email List) table",
        variant: "destructive",
      });
      return;
    }
    if (!concept.trim()) {
      toast({
        title: "Missing concept",
        description: "Please enter a campaign concept description",
        variant: "destructive",
      });
      return;
    }
    analysisMutation.mutate();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Mail className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Email Marketing Tool</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered email list generation with two-table architecture
          </p>
        </div>
      </div>

      {/* Architecture Info Banner */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-300">Two-Table Architecture</p>
              <p className="text-blue-700 dark:text-blue-400 text-xs mt-1">
                <strong>T1 (Master List):</strong> Contains contact data (Email, Name, DOB, Segment, Source)<br/>
                <strong>T2 (History Log):</strong> Contains behavior data (Email, CampaignID, SentDate, Opened, Clicked) - used for exclusions and engagement scoring
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          {/* Data Source Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Source Configuration
              </CardTitle>
              <CardDescription>
                Select the database and configure the two-table architecture
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Database Selection */}
              <div className="space-y-2">
                <Label>Database</Label>
                <Select
                  value={selectedDatabaseId?.toString() || ""}
                  onValueChange={(v) => setSelectedDatabaseId(parseInt(v))}
                  disabled={isLoadingDatabases}
                >
                  <SelectTrigger data-testid="select-database">
                    <SelectValue placeholder={isLoadingDatabases ? "Loading..." : "Select database"} />
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

              {tables && tables.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* T1: Master Email List */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        T1: Master Email List
                      </Label>
                      <Badge variant="destructive" className="text-xs">Required</Badge>
                    </div>
                    <Select
                      value={selectedMasterTableId?.toString() || ""}
                      onValueChange={(v) => setSelectedMasterTableId(parseInt(v))}
                      disabled={isLoadingTables}
                    >
                      <SelectTrigger data-testid="select-master-table">
                        <SelectValue placeholder="Select master table (T1)" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.map((table) => (
                          <SelectItem key={table.id} value={table.id.toString()}>
                            {table.display_name || table.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedMasterTableId && (
                      <div className="flex items-center gap-2">
                        <div className={`text-xs p-2 rounded-md flex items-center gap-1 flex-1 ${hasEmailField ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'}`}>
                          {hasEmailField ? (
                            <><CheckCircle2 className="h-3 w-3" /> Email field detected</>
                          ) : (
                            <><AlertCircle className="h-3 w-3" /> No email field - will use name/address</>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => validateMutation.mutate()}
                          disabled={validateMutation.isPending}
                          data-testid="button-validate-table"
                        >
                          {validateMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Validate"
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* T2: History/Behavior Log */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="flex items-center gap-1">
                        <History className="h-4 w-4" />
                        T2: History/Behavior Log
                      </Label>
                      <Badge variant="secondary" className="text-xs">Optional</Badge>
                    </div>
                    <Select
                      value={selectedHistoryTableId?.toString() || "none"}
                      onValueChange={(v) => setSelectedHistoryTableId(v === "none" ? null : parseInt(v))}
                      disabled={isLoadingTables}
                    >
                      <SelectTrigger data-testid="select-history-table">
                        <SelectValue placeholder="Select history table (T2)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No history table</SelectItem>
                        {tables.map((table) => (
                          <SelectItem key={table.id} value={table.id.toString()}>
                            {table.display_name || table.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedHistoryTableId && (
                      <div className={`text-xs p-2 rounded-md flex items-center gap-1 ${hasSentDateField ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'}`}>
                        {hasSentDateField ? (
                          <><CheckCircle2 className="h-3 w-3" /> SentDate field detected - exclusions enabled</>
                        ) : (
                          <><AlertCircle className="h-3 w-3" /> No SentDate field found</>
                        )}
                      </div>
                    )}
                    {!selectedHistoryTableId && (
                      <div className="text-xs p-2 rounded-md bg-muted/50 text-muted-foreground">
                        Without T2, the "Exclude Recently Sent" filter will not work
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Validation Results Panel */}
          {showValidation && validationResult && (
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Table Validation Results
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowValidation(false)}
                  >
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="p-2 rounded-md bg-muted/50">
                    <div className="text-muted-foreground text-xs">Total Records</div>
                    <div className="font-bold text-lg">{validationResult.totalCount?.toLocaleString() || 0}</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50">
                    <div className="text-muted-foreground text-xs">Fields</div>
                    <div className="font-bold text-lg">{validationResult.fieldCount || 0}</div>
                  </div>
                  <div className={`p-2 rounded-md ${validationResult.emailFieldDetected ? 'bg-green-50 dark:bg-green-950/30' : 'bg-amber-50 dark:bg-amber-950/30'}`}>
                    <div className="text-muted-foreground text-xs">Email Field</div>
                    <div className="font-bold">{validationResult.emailFieldDetected ? validationResult.emailFieldName : "Not Found"}</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50">
                    <div className="text-muted-foreground text-xs">Sample Rows</div>
                    <div className="font-bold text-lg">{validationResult.sampleRowCount || 0}</div>
                  </div>
                </div>
                
                {validationResult.totalCount === 0 && (
                  <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                    <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <strong>No data found in this table!</strong> This could mean:
                        <ul className="mt-1 ml-4 list-disc text-xs">
                          <li>The table is empty</li>
                          <li>Permission issues accessing the data</li>
                          <li>The query is failing silently</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                
                {validationResult.sampleData && validationResult.sampleData.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Sample Data (First 3 Rows)</Label>
                    <ScrollArea className="h-32 border rounded-md p-2">
                      <pre className="text-xs">{JSON.stringify(validationResult.sampleData, null, 2)}</pre>
                    </ScrollArea>
                  </div>
                )}
                
                {validationResult.fields && validationResult.fields.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Available Fields ({validationResult.fields.length})</Label>
                    <div className="flex flex-wrap gap-1">
                      {validationResult.fields.slice(0, 20).map((f: any) => (
                        <Badge key={f.id} variant="outline" className="text-xs">
                          {f.name}
                        </Badge>
                      ))}
                      {validationResult.fields.length > 20 && (
                        <Badge variant="secondary" className="text-xs">
                          +{validationResult.fields.length - 20} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Campaign Concept */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Campaign Concept
              </CardTitle>
              <CardDescription>
                Describe your campaign and the AI will suggest relevant customer segments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="concept">Campaign Description (Fuzzy Input)</Label>
                <Textarea
                  id="concept"
                  placeholder='e.g., "We are running a Sakura Season early bird travel promotion focused on luxury packages for older demographics interested in cultural events."'
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  className="min-h-32 resize-none"
                  data-testid="input-concept"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-medium">Hard Filters (Explicit Constraints)</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="birthday" className="text-xs text-muted-foreground">Birthday Filter</Label>
                    <Input
                      id="birthday"
                      placeholder="e.g., next month"
                      value={birthdayFilter}
                      onChange={(e) => setBirthdayFilter(e.target.value)}
                      data-testid="input-birthday-filter"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="exclude" className="text-xs text-muted-foreground">
                      Exclude Recently Sent (days)
                      {!selectedHistoryTableId && <span className="text-amber-600"> *requires T2</span>}
                    </Label>
                    <Input
                      id="exclude"
                      type="number"
                      min="0"
                      value={excludeDays}
                      onChange={(e) => setExcludeDays(e.target.value)}
                      disabled={!selectedHistoryTableId}
                      data-testid="input-exclude-days"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cap" className="text-xs text-muted-foreground">Contact Cap</Label>
                    <Input
                      id="cap"
                      type="number"
                      min="1"
                      value={contactCap}
                      onChange={(e) => setContactCap(e.target.value)}
                      data-testid="input-contact-cap"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={analysisMutation.isPending || !concept.trim() || !selectedDatabaseId || !selectedMasterTableId}
                className="w-full"
                data-testid="button-analyze"
              >
                {analysisMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing with AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyze Concept with AI
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* AI Suggestions */}
          {analysisResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  AI-Suggested Targeting Logic
                </CardTitle>
                <CardDescription>
                  {analysisResult.reasoning}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
                  <div className="text-xs font-medium text-primary mb-2 flex items-center gap-1">
                    <Database className="h-3 w-3" />
                    Targeting Filters (based on T1 schema analysis)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    AI analyzed your Master List schema and suggests these filters. Real data will be fetched from Metabase when you generate preview.
                  </div>
                </div>

                <div className="space-y-2">
                  {analysisResult.suggestions.map((suggestion) => {
                    const parsed = parseSegmentFormat(suggestion.segment);
                    return (
                      <div
                        key={suggestion.segment}
                        className="flex items-start gap-3 p-3 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                        onClick={() => handleSegmentToggle(suggestion.segment)}
                        data-testid={`segment-${suggestion.segment.replace(/[^a-zA-Z0-9]/g, '-')}`}
                      >
                        <Checkbox
                          checked={selectedSegments.includes(suggestion.segment)}
                          className="shrink-0 mt-0.5"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {parsed.tableName && (
                              <Badge variant="outline" className="text-xs font-mono">
                                {parsed.tableName}
                              </Badge>
                            )}
                            <span className="font-medium text-sm">{parsed.fieldName}</span>
                            <span className="text-muted-foreground">=</span>
                            <Badge className="text-xs">
                              {parsed.value || suggestion.segment}
                            </Badge>
                            <Badge variant="secondary" className="text-xs ml-auto">
                              {Math.round(suggestion.confidence * 100)}% match
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {suggestion.reasoning}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedSegments.length > 0 && (
                  <div className="p-3 rounded-md bg-muted/30 border">
                    <div className="text-xs font-medium mb-2">Selected Query Logic:</div>
                    <div className="font-mono text-xs text-muted-foreground space-y-1">
                      {selectedSegments.map((seg, idx) => {
                        const parsed = parseSegmentFormat(seg);
                        return (
                          <div key={seg} className="flex items-center gap-1">
                            {idx > 0 && <span className="text-primary font-bold">OR</span>}
                            <span>
                              {parsed.tableName && <span className="text-blue-500">{parsed.tableName}.</span>}
                              <span className="text-green-600">{parsed.fieldName}</span>
                              <span> = </span>
                              <span className="text-amber-600">"{parsed.value}"</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {selectedHistoryTableId && (
                      <div className="mt-2 pt-2 border-t font-mono text-xs text-red-600 dark:text-red-400">
                        EXCLUDE: T2.SentDate &gt; NOW() - {excludeDays} days
                      </div>
                    )}
                  </div>
                )}

                {analysisResult.suggestedAgeRange && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Suggested age range:</span>
                    <Badge>{analysisResult.suggestedAgeRange}</Badge>
                  </div>
                )}

                <Button
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending || selectedSegments.length === 0}
                  className="w-full"
                  data-testid="button-generate-preview"
                >
                  {previewMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Fetching Real Data...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Generate Preview (Query Database)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Preview & Export Panel */}
        <div className="space-y-6">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Preview & Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!previewResult ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    Select T1 table, enter a campaign concept and click "Analyze" to get started
                  </p>
                </div>
              ) : (
                <>
                  {/* Stats Summary */}
                  <div className="text-center py-4 px-4 rounded-lg bg-muted/50">
                    <span className="text-4xl font-bold" data-testid="text-preview-count">
                      {previewResult.count.toLocaleString()}
                    </span>
                    <p className="text-sm text-muted-foreground mt-1">
                      final matching contacts
                    </p>
                  </div>

                  {/* Detailed Stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-md bg-muted/30 text-center">
                      <div className="font-medium text-muted-foreground">Total Candidates</div>
                      <div className="font-bold">{previewResult.totalCandidates?.toLocaleString() || previewResult.count.toLocaleString()}</div>
                    </div>
                    <div className={`p-2 rounded-md text-center ${previewResult.excludedCount > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/30'}`}>
                      <div className="font-medium text-muted-foreground">Excluded (Recently Sent)</div>
                      <div className={`font-bold ${previewResult.excludedCount > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                        {previewResult.excludedCount.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {previewResult.filterWarning && (
                    <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
                        <AlertCircle className="h-3 w-3" />
                        {previewResult.filterWarning}
                      </div>
                    </div>
                  )}

                  {previewResult.historyTableUsed && (
                    <div className="p-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        T2 History table used for exclusions
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Sample Contacts (Real Data from Metabase)</Label>
                    {previewResult.sample.every(c => c.email === "N/A") && (
                      <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        No email field detected in T1. Names and addresses are available for mailing.
                      </div>
                    )}
                    <ScrollArea className="h-48">
                      <div className="space-y-2">
                        {previewResult.sample.map((contact, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-md bg-muted/30 text-xs"
                            data-testid={`sample-contact-${idx}`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="font-medium truncate">{contact.name}</p>
                              {contact.engagementScore !== undefined && (
                                <Badge variant="outline" className="text-xs shrink-0">
                                  Score: {contact.engagementScore}
                                </Badge>
                              )}
                            </div>
                            {contact.email && contact.email !== "N/A" && (
                              <p className="text-muted-foreground truncate">{contact.email}</p>
                            )}
                            {contact.city && (
                              <p className="text-muted-foreground truncate">
                                {contact.city}{contact.state ? `, ${contact.state}` : ""}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  <Button
                    onClick={() => exportMutation.mutate()}
                    disabled={exportMutation.isPending}
                    className="w-full"
                    data-testid="button-export-csv"
                  >
                    {exportMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV ({previewResult.count.toLocaleString()} contacts)
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
