import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  TrendingUp, 
  AlertCircle, 
  Loader2, 
  Users, 
  Target, 
  BarChart3, 
  Calendar,
  Mail,
  MailX,
  Play,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Minus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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

interface TrendData {
  period: string;
  value: number;
  change: number;
}

interface ICPSegment {
  name: string;
  size: number;
  percentage: number;
  avgValue: number;
  characteristics: string[];
  score: number;
}

interface AnalysisResult {
  trends: TrendData[];
  icpSegments: ICPSegment[];
  summary: string;
  totalRecords: number;
  mailedExcluded: number;
}

export default function TrendsICPAnalysis() {
  const { toast } = useToast();
  
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<number | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [excludeMailed, setExcludeMailed] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState("trends");

  const { 
    data: databases = [], 
    isLoading: isLoadingDatabases,
    error: databasesError 
  } = useQuery<MetabaseDatabase[]>({
    queryKey: ["/api/metabase/databases"],
  });

  // Find GalaxyMaster or Astro database
  const galaxyAstroDb = useMemo(() => {
    return databases.find(db => 
      db.name.toLowerCase().includes("galaxy") || 
      db.name.toLowerCase().includes("astro")
    );
  }, [databases]);

  // Auto-select GalaxyMaster or Astro database
  useEffect(() => {
    if (galaxyAstroDb && !selectedDatabaseId) {
      setSelectedDatabaseId(galaxyAstroDb.id);
    }
  }, [galaxyAstroDb, selectedDatabaseId]);

  const noGalaxyAstroDb = databases.length > 0 && !galaxyAstroDb;

  const { 
    data: tables = [], 
    isLoading: isLoadingTables 
  } = useQuery<MetabaseTable[]>({
    queryKey: ["/api/metabase/databases", selectedDatabaseId, "tables"],
    enabled: !!selectedDatabaseId,
  });

  // Auto-select first table when tables load
  useEffect(() => {
    if (tables.length > 0 && !selectedTableId) {
      setSelectedTableId(tables[0].id);
    }
  }, [tables, selectedTableId]);

  const handleTableChange = useCallback((id: number) => {
    setSelectedTableId(id);
    setAnalysisResult(null);
  }, []);

  // Analysis mutation - generates analysis using AI
  const analysisMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDatabaseId || !selectedTableId) {
        throw new Error("Please select a table first");
      }
      
      const response = await apiRequest("POST", "/api/ai/trends-icp-analysis", {
        databaseId: selectedDatabaseId,
        tableId: selectedTableId,
        excludeMailed,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: "Analysis Complete",
        description: "Trend and ICP analysis has been generated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to run analysis",
        variant: "destructive",
      });
    },
  });

  const handleRunAnalysis = useCallback(() => {
    analysisMutation.mutate();
  }, [analysisMutation]);

  const hasConnectionError = databasesError !== null;
  const selectedDatabase = galaxyAstroDb;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Trend & ICP Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Analyze trends and identify your Ideal Customer Profile from {selectedDatabase?.name || "GalaxyMaster/Astro"} Data
          </p>
        </div>
      </div>

      {hasConnectionError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>
            {databasesError instanceof Error 
              ? databasesError.message 
              : "Unable to connect to Metabase. Please check your credentials and try again."}
          </AlertDescription>
        </Alert>
      )}

      {noGalaxyAstroDb && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Database Not Found</AlertTitle>
          <AlertDescription>
            GalaxyMaster or Astro database was not found. This tool requires access to the GalaxyMaster or Astro database for Trend & ICP Analysis.
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Analysis Configuration</CardTitle>
          <CardDescription>Select your data source and configure filters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Table Selector */}
            <div className="space-y-2">
              <Label>Data Table</Label>
              <Select
                value={selectedTableId?.toString() ?? ""}
                onValueChange={(val) => handleTableChange(Number(val))}
                disabled={isLoadingTables || tables.length === 0}
              >
                <SelectTrigger data-testid="select-table">
                  <SelectValue placeholder={isLoadingTables ? "Loading tables..." : "Select a table"} />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((table) => (
                    <SelectItem key={table.id} value={table.id.toString()}>
                      {table.display_name || table.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mailed Filter */}
            <div className="space-y-2">
              <Label>Mailing Filter</Label>
              <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                <div className="flex items-center gap-2">
                  {excludeMailed ? (
                    <MailX className="h-4 w-4 text-orange-500" />
                  ) : (
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm">
                    {excludeMailed ? "Exclude mailed contacts" : "Include all contacts"}
                  </span>
                </div>
                <Switch
                  checked={excludeMailed}
                  onCheckedChange={setExcludeMailed}
                  data-testid="switch-exclude-mailed"
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleRunAnalysis}
            disabled={!selectedTableId || analysisMutation.isPending || noGalaxyAstroDb}
            className="w-full md:w-auto"
            data-testid="button-run-analysis"
          >
            {analysisMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Analysis
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Results Section */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{analysisResult.totalRecords.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Records Analyzed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {excludeMailed && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <MailX className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{analysisResult.mailedExcluded.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Mailed Contacts Excluded</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Target className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{analysisResult.icpSegments.length}</p>
                    <p className="text-xs text-muted-foreground">ICP Segments Identified</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AI Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">AI Analysis Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {analysisResult.summary}
              </p>
            </CardContent>
          </Card>

          {/* Tabbed Results */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="trends" data-testid="tab-trends">
                <BarChart3 className="h-4 w-4 mr-2" />
                Trend Analysis
              </TabsTrigger>
              <TabsTrigger value="icp" data-testid="tab-icp">
                <Target className="h-4 w-4 mr-2" />
                ICP Segments
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trends" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Period-over-Period Trends
                  </CardTitle>
                  <CardDescription>
                    Customer activity and value trends over recent periods
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysisResult.trends.map((trend, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{trend.period}</Badge>
                          <span className="font-medium">{trend.value.toLocaleString()} customers</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {trend.change > 0 ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                              <ArrowUp className="h-3 w-3 mr-1" />
                              +{trend.change}%
                            </Badge>
                          ) : trend.change < 0 ? (
                            <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
                              <ArrowDown className="h-3 w-3 mr-1" />
                              {trend.change}%
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Minus className="h-3 w-3 mr-1" />
                              0%
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="icp" className="mt-4">
              <div className="grid gap-4">
                {analysisResult.icpSegments.map((segment, index) => (
                  <Card key={index}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{segment.name}</CardTitle>
                        <Badge variant="secondary">
                          Score: {segment.score}/100
                        </Badge>
                      </div>
                      <CardDescription>
                        {segment.size.toLocaleString()} customers ({segment.percentage}% of total)
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Segment Size</span>
                          <span className="font-medium">{segment.percentage}%</span>
                        </div>
                        <Progress value={segment.percentage} className="h-2" />
                      </div>
                      
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Avg. Customer Value</p>
                        <p className="text-xl font-bold">${segment.avgValue.toLocaleString()}</p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Key Characteristics</p>
                        <div className="flex flex-wrap gap-2">
                          {segment.characteristics.map((char, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {char}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Empty State */}
      {!analysisResult && !analysisMutation.isPending && (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="font-medium text-muted-foreground">Ready to Analyze</p>
            <p className="text-sm text-muted-foreground mt-1">
              Select a table and click "Run Analysis" to identify trends and your Ideal Customer Profile
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {analysisMutation.isPending && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
            <p className="font-medium">Running Analysis...</p>
            <p className="text-sm text-muted-foreground mt-1">
              AI is analyzing your data to identify trends and ICP segments
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
