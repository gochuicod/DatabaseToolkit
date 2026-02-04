import { useState, useEffect } from "react";
import { TrendingUp, Users, Target, BarChart3, RefreshCw, Download, ChevronDown, ChevronUp, Sparkles, AlertTriangle, ArrowUpRight, MapPin, Eye, FileDown, ChevronLeft, ChevronRight, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SnapshotData {
  totalCustomers: number;
  buyers: {
    GL: number;
    TSI: number;
    SY: number;
    MD: number;
  };
  overlap: {
    GL_TSI: number;
    GL_MD: number;
    SY_GL: number;
  };
  queryTime: string;
}

interface ICPSegment {
  rank: number;
  gender: string;
  ageGroup: string;
  location: string;
  customerCount: number;
  avgTotalLTV: number;
  hasMobile: number;
  hasEmail: number;
  mobileRate: number;
  emailRate: number;
}

interface ICPData {
  segments: ICPSegment[];
  totalSegments: number;
  queryTime: string;
}

interface AISummary {
  summary: string;
  topDemographic: string;
  crossSellOpportunity: string;
  contactabilityWarning: string;
}

interface Customer {
  customerId: string;
  gender: string;
  dateOfBirth: string | null;
  prefecture: string;
  glLtv: number;
  tsiLtv: number;
  syLtv: number;
  mdLtv: number;
  totalLtv: number;
  hasMobile: boolean;
  hasEmail: boolean;
}

interface CustomersResponse {
  customers: Customer[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
  segment: {
    gender: string;
    ageGroup: string;
    location: string;
  };
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toLocaleString();
}

function formatCurrency(num: number): string {
  return "¥" + num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function TrendsICP() {
  const [showAllSegments, setShowAllSegments] = useState(false);
  const [excludeMailed, setExcludeMailed] = useState(false);
  const [viewCustomersOpen, setViewCustomersOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<ICPSegment | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [exportingSegment, setExportingSegment] = useState<string | null>(null);

  const snapshotQuery = useQuery<SnapshotData>({
    queryKey: ["/api/analysis/snapshot"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const icpQuery = useQuery<ICPData>({
    queryKey: ["/api/analysis/icp"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // AI Summary mutation - triggered when both data sources are loaded
  const aiSummaryMutation = useMutation<AISummary, Error, { snapshot: SnapshotData; icpSegments: ICPSegment[] }>({
    mutationFn: async ({ snapshot, icpSegments }) => {
      const response = await apiRequest("POST", "/api/analysis/ai-summary", {
        snapshot,
        icpSegments,
      });
      return response.json();
    },
  });

  // Auto-trigger AI summary when both data sources are loaded
  useEffect(() => {
    if (snapshotQuery.data && icpQuery.data && !aiSummaryMutation.data && !aiSummaryMutation.isPending) {
      aiSummaryMutation.mutate({
        snapshot: snapshotQuery.data,
        icpSegments: icpQuery.data.segments,
      });
    }
  }, [snapshotQuery.data, icpQuery.data]);

  // Customers mutation for viewing segment customers with pagination
  const customersMutation = useMutation<CustomersResponse, Error, { segment: ICPSegment; page: number }>({
    mutationFn: async ({ segment, page }) => {
      const response = await apiRequest("POST", "/api/analysis/icp/customers", {
        gender: segment.gender,
        ageGroup: segment.ageGroup,
        location: segment.location,
        page,
        excludeMailed,
      });
      return response.json();
    },
  });

  const handleRefresh = () => {
    snapshotQuery.refetch();
    icpQuery.refetch();
    aiSummaryMutation.reset();
  };

  const handleViewCustomers = (segment: ICPSegment) => {
    setSelectedSegment(segment);
    setCurrentPage(1);
    setViewCustomersOpen(true);
    customersMutation.mutate({ segment, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    if (selectedSegment) {
      setCurrentPage(newPage);
      customersMutation.mutate({ segment: selectedSegment, page: newPage });
    }
  };

  const handleExportSegment = async (segment: ICPSegment) => {
    const segmentKey = `${segment.gender}-${segment.ageGroup}-${segment.location}`;
    setExportingSegment(segmentKey);
    
    try {
      const params = new URLSearchParams({
        gender: segment.gender,
        ageGroup: segment.ageGroup,
        location: segment.location,
        excludeMailed: excludeMailed.toString(),
      });
      
      const response = await fetch(`/api/analysis/icp/export?${params}`);
      
      if (!response.ok) {
        throw new Error("Export failed");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `icp_segment_${segment.gender}_${segment.ageGroup}_${segment.location}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setExportingSegment(null);
    }
  };

  const handleExportCSV = () => {
    if (!icpQuery.data) return;
    
    const headers = ["Rank", "Gender", "Age Group", "Location", "Customer Count", "Avg Total LTV", "Mobile Rate %", "Email Rate %"];
    const rows = icpQuery.data.segments.map(seg => [
      seg.rank,
      seg.gender,
      seg.ageGroup,
      seg.location,
      seg.customerCount,
      seg.avgTotalLTV,
      seg.mobileRate,
      seg.emailRate
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `icp_segments_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayedSegments = showAllSegments 
    ? icpQuery.data?.segments 
    : icpQuery.data?.segments.slice(0, 10);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Trends & ICP Analysis</h1>
            <p className="text-sm text-muted-foreground">
              Cross-sell overlap and ideal customer profile insights from GalaxyMaster
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="exclude-mailed"
              checked={excludeMailed}
              onCheckedChange={setExcludeMailed}
              data-testid="switch-exclude-mailed"
            />
            <Label htmlFor="exclude-mailed" className="text-sm cursor-pointer">
              Exclude mailed contacts
            </Label>
          </div>
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={snapshotQuery.isFetching || icpQuery.isFetching}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${snapshotQuery.isFetching || icpQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* AI Analysis Summary Card */}
      <Card className="mb-8" data-testid="card-ai-summary">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Analysis Summary</CardTitle>
            {aiSummaryMutation.isPending && (
              <Badge variant="secondary" className="animate-pulse">Analyzing...</Badge>
            )}
          </div>
          <CardDescription>Key insights from your customer data</CardDescription>
        </CardHeader>
        <CardContent>
          {aiSummaryMutation.isPending ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          ) : aiSummaryMutation.error ? (
            <p className="text-destructive text-sm" data-testid="text-ai-error">
              Failed to generate summary: {aiSummaryMutation.error.message}
            </p>
          ) : aiSummaryMutation.data ? (
            <div className="space-y-4">
              {/* Executive Summary */}
              <p className="text-sm text-muted-foreground" data-testid="text-ai-summary">
                {aiSummaryMutation.data.summary}
              </p>
              
              {/* Three Key Insights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {/* Top Demographic */}
                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <MapPin className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Top Demographic</p>
                    <p className="text-sm" data-testid="text-top-demographic">{aiSummaryMutation.data.topDemographic}</p>
                  </div>
                </div>
                
                {/* Cross-sell Opportunity */}
                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <ArrowUpRight className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Cross-sell Opportunity</p>
                    <p className="text-sm" data-testid="text-cross-sell">{aiSummaryMutation.data.crossSellOpportunity}</p>
                  </div>
                </div>
                
                {/* Contactability Warning */}
                <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Contactability</p>
                    <p className="text-sm" data-testid="text-contactability">{aiSummaryMutation.data.contactabilityWarning}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : !snapshotQuery.data || !icpQuery.data ? (
            <p className="text-sm text-muted-foreground">
              Waiting for data to load before generating AI insights...
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Snapshot Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Customer Snapshot</h2>
          {snapshotQuery.data && (
            <Badge variant="secondary" className="ml-2">
              {formatNumber(snapshotQuery.data.totalCustomers)} total customers
            </Badge>
          )}
        </div>

        {snapshotQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-4 bg-muted rounded w-20" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted rounded w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : snapshotQuery.error ? (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive" data-testid="text-snapshot-error">
                Failed to load snapshot: {(snapshotQuery.error as Error).message}
              </p>
            </CardContent>
          </Card>
        ) : snapshotQuery.data ? (
          <>
            {/* Brand Buyers */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">GL Buyers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-gl-buyers">
                    {formatNumber(snapshotQuery.data.buyers.GL)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {((snapshotQuery.data.buyers.GL / snapshotQuery.data.totalCustomers) * 100).toFixed(1)}% of total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">TSI Buyers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-tsi-buyers">
                    {formatNumber(snapshotQuery.data.buyers.TSI)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {((snapshotQuery.data.buyers.TSI / snapshotQuery.data.totalCustomers) * 100).toFixed(1)}% of total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">SY Buyers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-sy-buyers">
                    {formatNumber(snapshotQuery.data.buyers.SY)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {((snapshotQuery.data.buyers.SY / snapshotQuery.data.totalCustomers) * 100).toFixed(1)}% of total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">MD Buyers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-md-buyers">
                    {formatNumber(snapshotQuery.data.buyers.MD)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {((snapshotQuery.data.buyers.MD / snapshotQuery.data.totalCustomers) * 100).toFixed(1)}% of total
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Cross-sell Overlap */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cross-sell Overlap</CardTitle>
                <CardDescription>Customers who have purchased from multiple brands</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">GL + TSI</p>
                      <p className="text-xs text-muted-foreground">Cross-brand buyers</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold" data-testid="text-gl-tsi-overlap">
                        {formatNumber(snapshotQuery.data.overlap.GL_TSI)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">GL + MD</p>
                      <p className="text-xs text-muted-foreground">Cross-brand buyers</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold" data-testid="text-gl-md-overlap">
                        {formatNumber(snapshotQuery.data.overlap.GL_MD)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">SY + GL</p>
                      <p className="text-xs text-muted-foreground">Cross-brand buyers</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold" data-testid="text-sy-gl-overlap">
                        {formatNumber(snapshotQuery.data.overlap.SY_GL)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* ICP Segments Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Top ICP Segments</h2>
            {icpQuery.data && (
              <Badge variant="secondary" className="ml-2">
                Top {icpQuery.data.totalSegments} by Avg LTV
              </Badge>
            )}
          </div>
          {icpQuery.data && (
            <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>

        {icpQuery.isLoading ? (
          <Card className="animate-pulse">
            <CardContent className="pt-6">
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 bg-muted rounded" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : icpQuery.error ? (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive" data-testid="text-icp-error">
                Failed to load ICP segments: {(icpQuery.error as Error).message}
              </p>
            </CardContent>
          </Card>
        ) : icpQuery.data && icpQuery.data.segments.length > 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Age Group</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Customers</TableHead>
                      <TableHead className="text-right">Avg Total LTV</TableHead>
                      <TableHead className="text-right">Mobile %</TableHead>
                      <TableHead className="text-right">Email %</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedSegments?.map((segment) => {
                      const segmentKey = `${segment.gender}-${segment.ageGroup}-${segment.location}`;
                      return (
                        <TableRow key={segment.rank} data-testid={`row-icp-segment-${segment.rank}`}>
                          <TableCell className="font-medium">
                            {segment.rank <= 3 ? (
                              <Badge variant={segment.rank === 1 ? "default" : "secondary"}>
                                #{segment.rank}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">#{segment.rank}</span>
                            )}
                          </TableCell>
                          <TableCell>{segment.gender}</TableCell>
                          <TableCell>{segment.ageGroup}</TableCell>
                          <TableCell>{segment.location}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatNumber(segment.customerCount)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                            {formatCurrency(segment.avgTotalLTV)}
                          </TableCell>
                          <TableCell className="text-right">{segment.mobileRate}%</TableCell>
                          <TableCell className="text-right">{segment.emailRate}%</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewCustomers(segment)}
                                data-testid={`button-view-customers-${segment.rank}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleExportSegment(segment)}
                                disabled={exportingSegment === segmentKey}
                                data-testid={`button-export-segment-${segment.rank}`}
                              >
                                {exportingSegment === segmentKey ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <FileDown className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {icpQuery.data.segments.length > 10 && (
                <div className="mt-4 text-center">
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowAllSegments(!showAllSegments)}
                    data-testid="button-toggle-segments"
                  >
                    {showAllSegments ? (
                      <>
                        <ChevronUp className="h-4 w-4 mr-2" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-2" />
                        Show All {icpQuery.data.segments.length} Segments
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No ICP segments found</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Query Time Info */}
      {(snapshotQuery.data || icpQuery.data) && (
        <div className="mt-6 text-center text-xs text-muted-foreground">
          Data retrieved at: {snapshotQuery.data?.queryTime || icpQuery.data?.queryTime}
        </div>
      )}

      {/* View Customers Modal */}
      <Dialog open={viewCustomersOpen} onOpenChange={setViewCustomersOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customers in Segment
            </DialogTitle>
            {selectedSegment && (
              <DialogDescription>
                {selectedSegment.gender} · {selectedSegment.ageGroup} · {selectedSegment.location}
                {excludeMailed && (
                  <Badge variant="secondary" className="ml-2">Excluding mailed</Badge>
                )}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {customersMutation.isPending ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : customersMutation.error ? (
              <div className="text-center py-12 text-destructive">
                Failed to load customers: {customersMutation.error.message}
              </div>
            ) : customersMutation.data ? (
              <>
                <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
                  <span data-testid="text-customer-count">
                    Showing {customersMutation.data.customers.length} of {formatNumber(customersMutation.data.pagination.totalCount)} customers
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedSegment && handleExportSegment(selectedSegment)}
                    disabled={exportingSegment !== null}
                    data-testid="button-export-modal"
                  >
                    {exportingSegment ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4 mr-2" />
                    )}
                    Export All to CSV
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer ID</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>DOB</TableHead>
                      <TableHead>Prefecture</TableHead>
                      <TableHead className="text-right">GL LTV</TableHead>
                      <TableHead className="text-right">TSI LTV</TableHead>
                      <TableHead className="text-right">SY LTV</TableHead>
                      <TableHead className="text-right">MD LTV</TableHead>
                      <TableHead className="text-right">Total LTV</TableHead>
                      <TableHead className="text-center">Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customersMutation.data.customers.map((customer, index) => (
                      <TableRow key={customer.customerId || index} data-testid={`row-customer-${index}`}>
                        <TableCell className="font-mono text-xs">{customer.customerId}</TableCell>
                        <TableCell>{customer.gender}</TableCell>
                        <TableCell>{customer.dateOfBirth ? new Date(customer.dateOfBirth).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>{customer.prefecture}</TableCell>
                        <TableCell className="text-right">{formatCurrency(customer.glLtv)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(customer.tsiLtv)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(customer.syLtv)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(customer.mdLtv)}</TableCell>
                        <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(customer.totalLtv)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {customer.hasMobile && <Badge variant="secondary" className="text-xs">M</Badge>}
                            {customer.hasEmail && <Badge variant="secondary" className="text-xs">E</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination Controls */}
                {customersMutation.data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Page {currentPage} of {customersMutation.data.pagination.totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage <= 1 || customersMutation.isPending}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={!customersMutation.data.pagination.hasMore || customersMutation.isPending}
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
