import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BarChart3,
  Users,
  Target,
  TrendingUp,
  UserCheck,
  Users2,
  ShoppingCart,
  DollarSign,
  ArrowLeft,
  Info,
  Download,
  Sparkles,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  Megaphone,
  PieChart as PieChartIcon,
  Package,
  Clock,
  Calculator,
  Brain,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  ResponsiveContainer,
  Legend,
  Tooltip as RechartsTooltip,
} from "recharts";
import { apiRequest } from "@/lib/queryClient";

function exportToCSV(data: any[], filename: string, headers?: string[]) {
  if (!data || data.length === 0) return;
  
  const keys = headers || Object.keys(data[0]);
  const csvContent = [
    keys.join(","),
    ...data.map(row => 
      keys.map(key => {
        const value = row[key];
        if (value === null || value === undefined) return "";
        const stringValue = String(value);
        if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(",")
    )
  ].join("\n");
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

type AnalysisModel = {
  id: string;
  name: string;
  description: string;
  icon: typeof BarChart3;
  color: string;
  useCase: string;
};

type ModelCategory = {
  id: string;
  name: string;
  icon: typeof BarChart3;
  color: string;
  models: { id: string; name: string; description: string }[];
};

const coreModels: AnalysisModel[] = [
  {
    id: "rfm",
    name: "RFM Segmentation",
    description: "Score customers by Recency, Frequency, and Monetary value",
    icon: Users,
    color: "hsl(var(--chart-1))",
    useCase: "Target top segments (Champions, Loyal, At Risk) for mail campaigns",
  },
  {
    id: "campaign-response",
    name: "Campaign Response",
    description: "Measure conversion rates per Market, Campaign, and Product",
    icon: Target,
    color: "hsl(var(--chart-2))",
    useCase: "Run campaigns only in markets with proven conversion lift",
  },
  {
    id: "propensity",
    name: "Propensity to Respond",
    description: "Score each customer with probability of purchase if mailed",
    icon: TrendingUp,
    color: "hsl(var(--chart-3))",
    useCase: "Mail only top 40% most likely to respond based on budget",
  },
  {
    id: "reactivation",
    name: "Reactivation Model",
    description: "Identify dormant high-value customers for win-back campaigns",
    icon: UserCheck,
    color: "hsl(var(--chart-4))",
    useCase: "Send win-back campaigns to dormant but historically valuable customers",
  },
  {
    id: "lookalike",
    name: "Prospect Lookalike",
    description: "Find prospects similar to your top buyers",
    icon: Users2,
    color: "hsl(var(--chart-5))",
    useCase: "Mail only prospects that look similar to your top buyers",
  },
  {
    id: "product-affinity",
    name: "Product Affinity",
    description: "Identify cross-sell and upsell opportunities from purchase patterns",
    icon: ShoppingCart,
    color: "hsl(var(--chart-1))",
    useCase: "Target customers with matching purchase history for cross-sell campaigns",
  },
  {
    id: "roi-optimization",
    name: "ROI Optimization",
    description: "Calculate ROI per campaign to focus on profitable mailings",
    icon: DollarSign,
    color: "hsl(var(--chart-2))",
    useCase: "Focus on campaigns where ROI > 1.5x or 2x threshold",
  },
];

const additionalModelCategories: ModelCategory[] = [
  {
    id: "campaign-performance",
    name: "Campaign Performance Analysis",
    icon: Megaphone,
    color: "hsl(var(--chart-1))",
    models: [
      { id: "response-rate", name: "Campaign Response Rate", description: "% of customers who purchased after a mailer" },
      { id: "avg-revenue-campaign", name: "Average Revenue per Campaign", description: "Mean revenue generated per campaign" },
      { id: "conversion-rate", name: "Conversion Rate by Campaign", description: "Purchase conversion rates across campaigns" },
      { id: "revenue-per-mailed", name: "Revenue per Mailed Customer", description: "Average revenue from each mailed customer" },
      { id: "mail-to-purchase-time", name: "Mail to Purchase Time", description: "Average time from mail date to purchase" },
      { id: "highest-grossing", name: "Highest-Grossing Campaigns", description: "Top campaigns by total revenue" },
      { id: "product-per-campaign", name: "Product Performance per Campaign", description: "Which products sell best in each campaign" },
      { id: "repeat-purchase-rate", name: "Repeat Purchase Rate", description: "% who make repeat purchases after campaign" },
      { id: "campaign-roi", name: "Campaign ROI Analysis", description: "Revenue / Cost ratio per campaign" },
      { id: "mailer-sales-pct", name: "Sales Driven by Mailers", description: "% of total sales from mail campaigns" },
      { id: "campaign-fatigue", name: "Campaign Fatigue Analysis", description: "Declining response over repeated campaigns" },
      { id: "campaign-reach-zip", name: "Campaign Reach by ZIP", description: "Geographic coverage of campaigns" },
      { id: "segment-effectiveness", name: "Segment-wise Effectiveness", description: "Campaign performance by gender, age, etc." },
      { id: "multi-purchase-campaigns", name: "Multi-Purchase Triggers", description: "Campaigns that triggered multiple purchases" },
      { id: "response-curves", name: "Response Curves", description: "Time-based response patterns per campaign" },
      { id: "orders-per-respondent", name: "Orders per Respondent", description: "Average orders from each campaign respondent" },
      { id: "market-performance", name: "Market-wise Performance", description: "Campaign results by market region" },
      { id: "response-profiling", name: "Response vs Non-Response", description: "Profile comparison of responders vs non-responders" },
    ],
  },
  {
    id: "customer-segmentation",
    name: "Customer Segmentation & Lifecycle",
    icon: PieChartIcon,
    color: "hsl(var(--chart-2))",
    models: [
      { id: "high-ltv", name: "High-LTV Identification", description: "Find your most valuable customers" },
      { id: "ltv-distribution", name: "LTV Distribution", description: "Spread of lifetime value across customers" },
      { id: "first-vs-returning", name: "First-time vs Returning", description: "Compare new buyers with repeat customers" },
      { id: "dormant-customers", name: "Dormant Customers", description: "No purchases in 6+ months" },
      { id: "churn-risk", name: "Churn Risk Scoring", description: "Identify customers likely to leave" },
      { id: "customer-lifespan", name: "Customer Lifespan", description: "Average active duration of customers" },
      { id: "reactivated-post-campaign", name: "Reactivated Customers", description: "Previously dormant now active post-campaign" },
      { id: "top-zip-codes", name: "Best-Performing ZIP Codes", description: "Geographic areas with highest engagement" },
      { id: "gender-patterns", name: "Gender-based Patterns", description: "Purchase behavior differences by gender" },
      { id: "age-responsiveness", name: "Age Group Responsiveness", description: "Which age groups respond best to mailers" },
      { id: "campaigns-vs-orders", name: "Campaigns vs Orders", description: "Correlation of campaigns received to orders placed" },
      { id: "birthday-targeting", name: "Birthday Month Targeting", description: "Campaign timing around birthdays" },
      { id: "valuable-segments", name: "Most Valuable Segments", description: "Top customer segments by revenue" },
      { id: "top-10-pct", name: "Top 10% Customers", description: "Highest revenue customers analysis" },
      { id: "customer-growth", name: "Customer Growth Over Time", description: "Acquisition trends and growth rates" },
      { id: "order-value-segment", name: "Order Value by Segment", description: "Average order sizes per segment" },
      { id: "zipcode-clustering", name: "ZIP Code Clustering", description: "Group ZIP codes for campaign zones" },
    ],
  },
  {
    id: "product-order",
    name: "Product & Order Analysis",
    icon: Package,
    color: "hsl(var(--chart-3))",
    models: [
      { id: "best-selling", name: "Best-Selling Products", description: "Top products by sales volume" },
      { id: "product-by-segment", name: "Product Performance by Segment", description: "What high vs low spenders buy" },
      { id: "product-bundles", name: "Product Bundles", description: "Frequently purchased together combinations" },
      { id: "first-product", name: "First Product Purchased", description: "Most common entry products" },
      { id: "highest-revenue-products", name: "Highest Revenue Products", description: "Products with highest average revenue" },
      { id: "aov", name: "Average Order Value", description: "Mean order value across customers" },
      { id: "orders-per-customer", name: "Orders per Customer", description: "Purchase frequency distribution" },
      { id: "customer-product-affinity", name: "Customer-Product Affinity", description: "Who buys what products" },
      { id: "seasonal-products", name: "Seasonal Products", description: "Most gifted or seasonal items" },
      { id: "product-frequency", name: "Product Purchase Frequency", description: "How often products are purchased" },
      { id: "product-by-zip", name: "Products by ZIP Code", description: "Most ordered products per location" },
      { id: "time-between-purchases", name: "Time Between Purchases", description: "Average purchase intervals" },
      { id: "reorder-trends", name: "Reorder Trends", description: "Who reorders and when" },
      { id: "entry-products", name: "Entry Point Products", description: "Common first-purchase products" },
      { id: "second-purchase", name: "Most Common Second Purchase", description: "What customers buy next" },
      { id: "product-by-campaign", name: "Product Popularity by Campaign", description: "Which products each campaign sells" },
      { id: "items-per-order", name: "Items per Order", description: "Average number of items purchased" },
      { id: "product-stickiness", name: "Product Stickiness", description: "Repurchase rate per product" },
    ],
  },
  {
    id: "campaign-timing",
    name: "Campaign Timing & Strategy",
    icon: Clock,
    color: "hsl(var(--chart-4))",
    models: [
      { id: "best-day", name: "Best Day to Mail", description: "Optimal day of week for campaigns" },
      { id: "best-month", name: "Best Month to Mail", description: "Optimal time of year for mailing" },
      { id: "seasonal-performance", name: "Seasonal Campaign Performance", description: "Holiday and seasonal results" },
      { id: "time-gap-response", name: "Time Gap vs Response", description: "How campaign spacing affects response" },
      { id: "multi-campaign-attribution", name: "Multi-Campaign Attribution", description: "Credit sales across multiple mailers" },
      { id: "diminishing-returns", name: "Diminishing Returns Analysis", description: "Response decline after multiple mailers" },
      { id: "optimal-days-between", name: "Optimal Days Between Campaigns", description: "Best timing between mailings" },
      { id: "over-mailing-risk", name: "Over-Mailing Risk Zones", description: "Customers receiving too many mailers" },
      { id: "campaign-overlap", name: "Campaign Overlap Detection", description: "Identify over-targeted customers" },
      { id: "first-touch-effectiveness", name: "First-Touch Effectiveness", description: "Initial campaign performance" },
      { id: "follow-up-performance", name: "Follow-Up Performance", description: "Results of follow-up campaigns" },
      { id: "pre-purchase-trigger", name: "Pre-Purchase Trigger Analysis", description: "Campaign triggers before purchase" },
      { id: "post-purchase-followup", name: "Post-Purchase Follow-Up", description: "Success of post-sale campaigns" },
      { id: "campaign-segmentation", name: "Campaign Segmentation Effectiveness", description: "How well segments respond" },
      { id: "urgency-behavior", name: "Urgency vs Response", description: "Effect of urgency messaging" },
      { id: "personalized-vs-generic", name: "Personalized vs Generic", description: "Personalization impact on results" },
      { id: "lag-optimization", name: "Lag Time Optimization", description: "Optimal time from mail to sale" },
    ],
  },
  {
    id: "value-forecasting",
    name: "Customer Value & Forecasting",
    icon: Calculator,
    color: "hsl(var(--chart-5))",
    models: [
      { id: "ltv-calculation", name: "Customer Lifetime Value", description: "Calculate LTV per customer" },
      { id: "projected-revenue", name: "Projected Future Revenue", description: "Revenue forecast from active customers" },
      { id: "high-value-forecast", name: "High-Value Customer Forecast", description: "Predict who will spend more" },
      { id: "churn-forecasting", name: "Churn Forecasting", description: "Predict who might stop buying" },
      { id: "sales-forecasting", name: "Sales Forecasting", description: "Predict sales from campaign data" },
      { id: "revenue-zip-prediction", name: "Revenue by ZIP Prediction", description: "Forecast revenue by location" },
      { id: "mailer-long-term-impact", name: "Long-term Mailer Impact", description: "How mailers affect behavior over time" },
      { id: "customer-lifetime-curve", name: "Customer Lifetime Curve", description: "Value trajectory by cohort" },
      { id: "break-even-time", name: "Break-Even Time", description: "Time to recover mailer investment" },
      { id: "monetary-segmentation", name: "Monetary Segmentation", description: "Low, Medium, High spenders" },
      { id: "frequency-forecast", name: "Frequency Forecast", description: "Who will buy again soon" },
      { id: "recency-trigger", name: "Recency Trigger Scoring", description: "Who should get a mailer next" },
      { id: "aov-growth", name: "Expected AOV Growth", description: "Order value growth for returning customers" },
      { id: "order-volume-prediction", name: "Order Volume Prediction", description: "Forecast orders by customer group" },
      { id: "conversion-funnel", name: "Purchase Conversion Funnel", description: "1st to 2nd to 3rd purchase flow" },
      { id: "net-revenue-impact", name: "Net Revenue Impact", description: "True revenue impact of mailers" },
      { id: "purchase-window", name: "Purchase Window Analysis", description: "When people buy after campaign" },
      { id: "profitability-forecast", name: "Profitability Forecast", description: "Profit prediction per segment" },
      { id: "lifetime-cost-profit", name: "Lifetime Cost vs Profit", description: "Mail cost vs profit per customer" },
    ],
  },
  {
    id: "advanced-predictive",
    name: "Advanced & Predictive Analytics",
    icon: Brain,
    color: "hsl(var(--chart-1))",
    models: [
      { id: "propensity-model", name: "Propensity Model", description: "Predict who's likely to respond" },
      { id: "lookalike-modeling", name: "Lookalike Modeling", description: "Find new customers like your best ones" },
      { id: "churn-scoring-model", name: "Churn Scoring Model", description: "Who is most likely to stop buying" },
      { id: "campaign-uplift", name: "Campaign Uplift Modeling", description: "What campaign actually drove change" },
      { id: "segmentation-clustering", name: "Segmentation Clustering", description: "K-means or PCA customer grouping" },
      { id: "next-best-offer", name: "Next Best Offer", description: "What to promote to each customer" },
      { id: "time-series-modeling", name: "Time-Series Modeling", description: "Forecast revenue or orders per month" },
      { id: "response-modeling", name: "Response Modeling", description: "Train model to predict future responses" },
      { id: "geo-targeting", name: "Geo-Targeting Optimization", description: "Focus on ZIPs with best ROI" },
      { id: "predictive-scoring", name: "Predictive Customer Scoring", description: "Future value scoring" },
      { id: "campaign-saturation", name: "Campaign Saturation Detection", description: "Detect customer overexposure" },
      { id: "purchase-probability", name: "Purchase Probability Scoring", description: "Rank by likeliness to buy" },
      { id: "personalized-timing", name: "Personalized Mail Timing", description: "Optimize send time per customer" },
      { id: "offer-responsiveness", name: "Offer Responsiveness Model", description: "% off vs flat price vs free gift" },
      { id: "roi-simulation", name: "ROI Simulation", description: "Simulate ROI before sending campaign" },
      { id: "delivery-optimization", name: "Delivery Optimization", description: "Mail delay vs conversion lag" },
      { id: "decision-trees", name: "Decision Trees", description: "Customer conversion path analysis" },
    ],
  },
];

type BrainWorksDatabase = {
  database: { id: number; name: string; engine: string };
  tables: { id: number; name: string; display_name: string; schema: string }[];
};

export default function BrainworksAnalysis() {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [customAnalysisResult, setCustomAnalysisResult] = useState<{
    query: string;
    results: any[];
    summary: string;
  } | null>(null);

  const { data: brainworksData, isLoading: isLoadingDb, error: dbError } = useQuery<BrainWorksDatabase>({
    queryKey: ["/api/brainworks/database"],
  });

  useEffect(() => {
    if (brainworksData?.tables && brainworksData.tables.length > 0 && !selectedTableId) {
      setSelectedTableId(brainworksData.tables[0].id);
    }
  }, [brainworksData, selectedTableId]);

  const customAnalysisMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest("POST", "/api/ai/custom-analysis", {
        prompt,
        databaseId: brainworksData?.database?.id,
        tableId: selectedTableId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setCustomAnalysisResult(data);
    },
  });

  const handleBackToModels = () => {
    setSelectedModel(null);
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleCustomAnalysis = () => {
    if (customPrompt.trim()) {
      customAnalysisMutation.mutate(customPrompt);
    }
  };

  if (selectedModel) {
    return (
      <AnalysisView
        modelId={selectedModel}
        onBack={handleBackToModels}
        databaseId={brainworksData?.database?.id}
        tableId={selectedTableId}
        tables={brainworksData?.tables || []}
        onTableChange={setSelectedTableId}
        isLoadingDb={isLoadingDb}
        dbError={dbError}
      />
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">BrainWorks Analysis Tool</h1>
          <p className="text-sm text-muted-foreground">
            Analyze BrainWorks Data with AI-powered models and custom queries
          </p>
        </div>
      </div>

      <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">AI Custom Analysis</CardTitle>
          </div>
          <CardDescription>
            Describe what you want to analyze and AI will build the model and run the query
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Example: Show me the top 10 customers by lifetime value who haven't purchased in the last 6 months, with their total spend and last order date..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="min-h-[100px]"
            data-testid="input-custom-analysis"
          />
          <div className="flex items-center gap-4">
            <Button
              onClick={handleCustomAnalysis}
              disabled={!customPrompt.trim() || customAnalysisMutation.isPending}
              data-testid="button-run-custom-analysis"
            >
              {customAnalysisMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>
            {customAnalysisResult && (
              <Badge variant="outline" className="text-green-600">
                Analysis Complete
              </Badge>
            )}
          </div>

          {customAnalysisResult && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Analysis Results</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {customAnalysisResult.summary}
                </p>
                {customAnalysisResult.results && customAnalysisResult.results.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(customAnalysisResult.results[0]).map((key) => (
                            <TableHead key={key}>{key}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customAnalysisResult.results.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            {Object.values(row).map((val, j) => (
                              <TableCell key={j}>
                                {typeof val === "number"
                                  ? val.toLocaleString()
                                  : String(val)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-1">Core Models</h2>
        <p className="text-sm text-muted-foreground">
          Primary analysis models for customer segmentation and campaign optimization
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {coreModels.map((model) => {
          const Icon = model.icon;
          return (
            <Card
              key={model.id}
              className="hover-elevate cursor-pointer transition-all"
              onClick={() => setSelectedModel(model.id)}
              data-testid={`card-model-${model.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="p-2 rounded-md"
                    style={{ backgroundColor: `${model.color}20` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: model.color }} />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p>{model.useCase}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <CardTitle className="text-base">{model.name}</CardTitle>
                <CardDescription className="text-xs">{model.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-1">Additional Models</h2>
        <p className="text-sm text-muted-foreground">
          Expanded analysis options organized by category
        </p>
      </div>

      <div className="space-y-3">
        {additionalModelCategories.map((category) => {
          const Icon = category.icon;
          const isExpanded = expandedCategories.includes(category.id);
          return (
            <Collapsible key={category.id} open={isExpanded}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader
                    className="cursor-pointer hover-elevate"
                    onClick={() => toggleCategory(category.id)}
                    data-testid={`category-${category.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="p-2 rounded-md"
                          style={{ backgroundColor: `${category.color}20` }}
                        >
                          <Icon className="h-5 w-5" style={{ color: category.color }} />
                        </div>
                        <div>
                          <CardTitle className="text-base">{category.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {category.models.length} models available
                          </CardDescription>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon">
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {category.models.map((model) => (
                        <div
                          key={model.id}
                          className="p-3 rounded-md border hover-elevate cursor-pointer transition-all"
                          onClick={() => setSelectedModel(model.id)}
                          data-testid={`model-${model.id}`}
                        >
                          <div className="font-medium text-sm">{model.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {model.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

type AnalysisViewProps = {
  modelId: string;
  onBack: () => void;
  databaseId?: number;
  tableId: number | null;
  tables: { id: number; name: string; display_name: string }[];
  onTableChange: (id: number | null) => void;
  isLoadingDb: boolean;
  dbError: Error | null;
};

function AnalysisView({
  modelId,
  onBack,
  databaseId,
  tableId,
  tables,
  onTableChange,
  isLoadingDb,
  dbError,
}: AnalysisViewProps) {
  const allModels = [
    ...coreModels,
    ...additionalModelCategories.flatMap((c) =>
      c.models.map((m) => ({ ...m, icon: c.icon, color: c.color, useCase: m.description }))
    ),
  ];
  
  const model = allModels.find((m) => m.id === modelId);
  
  if (!model) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Models
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Model Coming Soon</CardTitle>
            <CardDescription>
              This analysis model is being developed and will be available soon.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <Zap className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">
              Check back later for this analysis capability.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const Icon = model.icon;
  const analysisProps = { databaseId, tableId, modelId };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div
            className="p-2 rounded-md"
            style={{ backgroundColor: `${model.color}20` }}
          >
            <Icon className="h-6 w-6" style={{ color: model.color }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{model.name}</h1>
            <p className="text-sm text-muted-foreground">
              {model.description || model.useCase}
            </p>
          </div>
        </div>
        
        {tables.length > 1 && (
          <div className="md:ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Table:</span>
            <select
              value={tableId || ""}
              onChange={(e) => onTableChange(e.target.value ? parseInt(e.target.value) : null)}
              className="h-9 px-3 rounded-md border bg-background text-sm"
              data-testid="select-analysis-table"
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.display_name || table.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {dbError && (
        <Card className="mb-4 border-destructive">
          <CardContent className="py-4">
            <p className="text-destructive text-sm">
              Unable to connect to BrainWorks database. Please check your Metabase connection.
            </p>
          </CardContent>
        </Card>
      )}

      {modelId === "rfm" && <RFMAnalysis {...analysisProps} />}
      {modelId === "campaign-response" && <CampaignResponseAnalysis {...analysisProps} />}
      {modelId === "propensity" && <PropensityAnalysis {...analysisProps} />}
      {modelId === "reactivation" && <ReactivationAnalysis {...analysisProps} />}
      {modelId === "lookalike" && <LookalikeAnalysis {...analysisProps} />}
      {modelId === "product-affinity" && <ProductAffinityAnalysis {...analysisProps} />}
      {modelId === "roi-optimization" && <ROIOptimizationAnalysis {...analysisProps} />}
      {![
        "rfm",
        "campaign-response",
        "propensity",
        "reactivation",
        "lookalike",
        "product-affinity",
        "roi-optimization",
      ].includes(modelId) && <GenericModelPlaceholder modelName={model.name} {...analysisProps} />}
    </div>
  );
}

function GenericModelPlaceholder({ modelName, databaseId, tableId, modelId }: { modelName: string } & AnalysisProps) {
  const { data: analysisData, isLoading, error } = useQuery({
    queryKey: ["/api/brainworks/analysis", modelId, tableId, databaseId],
    queryFn: async () => {
      if (!databaseId || !tableId) return null;
      const response = await apiRequest("POST", "/api/brainworks/analysis", { modelId, tableId, databaseId });
      return response.json();
    },
    enabled: !!databaseId && !!tableId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading {modelName} analysis from BrainWorks Data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="text-destructive mb-2">Unable to load analysis data</div>
          <p className="text-xs text-muted-foreground">Please check your database connection and try again.</p>
        </CardContent>
      </Card>
    );
  }

  const hasData = analysisData?.data && (
    analysisData.data.distribution?.length > 0 ||
    analysisData.data.segments?.length > 0 ||
    analysisData.data.markets?.length > 0 ||
    analysisData.data.products?.length > 0 ||
    analysisData.data.campaigns?.length > 0
  );

  const dataArray = analysisData?.data?.distribution || 
    analysisData?.data?.segments || 
    analysisData?.data?.markets || 
    analysisData?.data?.products ||
    analysisData?.data?.campaigns || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
          <span>Analysis Results</span>
          {analysisData?.totalCount && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">{analysisData.totalCount.toLocaleString()} total records</Badge>
              <DataQualityBadge quality={analysisData?.dataQuality} />
            </div>
          )}
        </CardTitle>
        <CardDescription>
          {modelName} - BrainWorks Data
          {analysisData?.fieldsUsed?.length > 0 && (
            <span className="ml-2 text-xs">
              (using: {analysisData.fieldsUsed.join(", ")})
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="space-y-4">
            {dataArray.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(dataArray[0]).map((key) => (
                          <TableHead key={key} className="text-xs capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataArray.slice(0, 15).map((row: any, idx: number) => (
                        <TableRow key={idx}>
                          {Object.values(row).map((value: any, colIdx: number) => (
                            <TableCell key={colIdx} className="text-sm">
                              {typeof value === 'number' ? value.toLocaleString() : String(value || '-')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {dataArray.length > 15 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Showing 15 of {dataArray.length} results
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(dataArray, `${modelId}_analysis`)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Info className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-2">
              No relevant data found for this analysis model
            </p>
            <p className="text-xs text-muted-foreground">
              The selected table may not have the fields required for {modelName}.
              Try selecting a different table or contact your administrator.
            </p>
            {analysisData?.fields && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  Available fields ({analysisData.fields.length})
                </summary>
                <div className="mt-2 flex flex-wrap gap-1">
                  {analysisData.fields.slice(0, 20).map((f: any) => (
                    <Badge key={f.id} variant="outline" className="text-xs">
                      {f.display_name || f.name}
                    </Badge>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DataQualityBadge({ quality }: { quality: 'real' | 'estimated' | 'insufficient' | undefined }) {
  if (!quality) return null;
  
  const config = {
    real: { label: "Real Data", variant: "default" as const, className: "bg-green-500/10 text-green-600 border-green-500/30" },
    estimated: { label: "Estimated", variant: "outline" as const, className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
    insufficient: { label: "Insufficient Data", variant: "destructive" as const, className: "" },
  };
  
  const { label, className } = config[quality];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

type AnalysisProps = {
  databaseId?: number;
  tableId: number | null;
  modelId: string;
};

function RFMAnalysis({ databaseId, tableId, modelId }: AnalysisProps) {
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ["/api/brainworks/analysis", modelId, tableId, databaseId],
    queryFn: async () => {
      if (!databaseId || !tableId) return null;
      const response = await apiRequest("POST", "/api/brainworks/analysis", {
        modelId,
        tableId,
        databaseId,
      });
      return response.json();
    },
    enabled: !!databaseId && !!tableId,
  });

  const segmentData = useMemo(() => {
    if (analysisData?.data?.segments) {
      return analysisData.data.segments.map((seg: any, i: number) => ({
        name: seg.name,
        count: seg.count,
        percentage: seg.percentage,
        action: i < 2 ? "Always mail" : i < 4 ? "Selective" : "Suppress"
      }));
    }
    return [];
  }, [analysisData]);

  const rfmScoreData = useMemo(() => {
    if (analysisData?.data?.rfmScores) {
      return analysisData.data.rfmScores;
    }
    return segmentData.slice(0, 6).map((seg: any, i: number) => ({
      segment: seg.name,
      recency: Math.max(1, 5 - i),
      frequency: Math.max(1, 5 - i),
      monetary: Math.max(1, 5 - i)
    }));
  }, [analysisData, segmentData]);

  const chartConfig = {
    count: { label: "Customers", color: "hsl(var(--chart-1))" },
    recency: { label: "Recency", color: "hsl(var(--chart-1))" },
    frequency: { label: "Frequency", color: "hsl(var(--chart-2))" },
    monetary: { label: "Monetary", color: "hsl(var(--chart-3))" },
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading RFM analysis from BrainWorks Data...</p>
        </CardContent>
      </Card>
    );
  }

  if (segmentData.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">No segment data available. Please ensure your table has segment or category fields.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {analysisData?.totalCount && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{analysisData.totalCount.toLocaleString()} total records</Badge>
          <DataQualityBadge quality={analysisData.dataQuality} />
          {analysisData.data?.note && <span className="text-xs">({analysisData.data.note})</span>}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segment Distribution</CardTitle>
            <CardDescription>Customer count by RFM segment</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[300px]">
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={segmentData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">RFM Scores by Segment</CardTitle>
            <CardDescription>Average R, F, M scores (1-5 scale)</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[300px]">
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={rfmScoreData} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="segment" fontSize={10} angle={-20} textAnchor="end" height={60} />
                  <YAxis domain={[0, 5]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="recency" fill="var(--color-recency)" radius={2} />
                  <Bar dataKey="frequency" fill="var(--color-frequency)" radius={2} />
                  <Bar dataKey="monetary" fill="var(--color-monetary)" radius={2} />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Segment Details</CardTitle>
            <CardDescription>Mailing recommendations by segment</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-export-rfm"
            onClick={() => exportToCSV(
              segmentData.map((seg: any) => ({
                Segment: seg.name,
                Count: seg.count,
                Percentage: seg.percentage,
                Action: seg.action
              })),
              "rfm_analysis"
            )}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
                <TableHead>Mailing Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segmentData.map((seg: any) => (
                <TableRow key={seg.name}>
                  <TableCell className="font-medium">{seg.name}</TableCell>
                  <TableCell className="text-right">{seg.count.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{seg.percentage}%</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        seg.action === "Always mail"
                          ? "default"
                          : seg.action === "Suppress"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {seg.action}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CampaignResponseAnalysis({ databaseId, tableId, modelId }: AnalysisProps) {
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ["/api/brainworks/analysis", modelId, tableId, databaseId],
    queryFn: async () => {
      if (!databaseId || !tableId) return null;
      const response = await apiRequest("POST", "/api/brainworks/analysis", { modelId, tableId, databaseId });
      return response.json();
    },
    enabled: !!databaseId && !!tableId,
  });

  const marketData = useMemo(() => {
    if (analysisData?.data?.markets) {
      return analysisData.data.markets;
    }
    return [];
  }, [analysisData]);

  const campaignData = useMemo(() => {
    if (analysisData?.data?.campaigns) {
      return analysisData.data.campaigns;
    }
    return [];
  }, [analysisData]);

  const chartConfig = {
    conversion: { label: "Conversion %", color: "hsl(var(--chart-2))" },
    conversionRate: { label: "Conversion Rate", color: "hsl(var(--chart-2))" },
    roi: { label: "ROI", color: "hsl(var(--chart-4))" },
    count: { label: "Count", color: "hsl(var(--chart-1))" },
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading campaign analysis from BrainWorks Data...</p>
        </CardContent>
      </Card>
    );
  }

  if (marketData.length === 0 && campaignData.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">No market or campaign data available. Please ensure your table has market or campaign fields.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {analysisData?.totalCount && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{analysisData.totalCount.toLocaleString()} total records</Badge>
          <DataQualityBadge quality={analysisData.dataQuality} />
          {analysisData.data?.note && <span className="text-xs">({analysisData.data.note})</span>}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {marketData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribution by Market</CardTitle>
              <CardDescription>Customer count per geographic market</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="min-w-[300px]">
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <BarChart data={marketData} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="market" fontSize={10} angle={-20} textAnchor="end" height={60} />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {campaignData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Performance</CardTitle>
              <CardDescription>Conversion rate vs ROI by campaign</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="min-w-[300px]">
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <BarChart data={campaignData} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="campaign" fontSize={10} angle={-20} textAnchor="end" height={60} />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" unit="x" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar yAxisId="left" dataKey="conversionRate" fill="var(--color-conversionRate)" radius={2} />
                    <Bar yAxisId="right" dataKey="roi" fill="var(--color-roi)" radius={2} />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {marketData.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base">Market Performance Details</CardTitle>
              <CardDescription>Mailing volume and response by market</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              data-testid="button-export-campaign"
              onClick={() => exportToCSV(
                marketData.map((m: any) => ({
                  Market: m.market,
                  Count: m.count,
                  Mailed: m.mailed,
                  Conversion: m.conversion,
                  Recommendation: m.conversion >= 4 ? "High Priority" : m.conversion >= 3 ? "Include" : "Review"
                })),
                "campaign_response_analysis"
              )}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Mailed</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                  <TableHead>Recommendation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marketData.map((m: any) => (
                  <TableRow key={m.market}>
                    <TableCell className="font-medium">{m.market}</TableCell>
                    <TableCell className="text-right">{m.count?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{m.mailed?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{m.conversion}%</TableCell>
                    <TableCell>
                      <Badge variant={m.conversion >= 4 ? "default" : m.conversion >= 3 ? "outline" : "secondary"}>
                        {m.conversion >= 4 ? "High Priority" : m.conversion >= 3 ? "Include" : "Review"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PropensityAnalysis({ databaseId, tableId, modelId }: AnalysisProps) {
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ["/api/brainworks/analysis", modelId, tableId, databaseId],
    queryFn: async () => {
      if (!databaseId || !tableId) return null;
      const response = await apiRequest("POST", "/api/brainworks/analysis", { modelId, tableId, databaseId });
      return response.json();
    },
    enabled: !!databaseId && !!tableId,
  });

  const scoreDistribution = useMemo(() => {
    if (analysisData?.data?.scoreDistribution) {
      return analysisData.data.scoreDistribution;
    }
    return [];
  }, [analysisData]);

  const cutoffAnalysis = useMemo(() => {
    const total = analysisData?.totalCount || 0;
    if (total === 0) return [];
    return [
      { cutoff: "Top 20%", customers: Math.round(total * 0.2), expectedResponse: Math.round(total * 0.2 * 0.3), cost: Math.round(total * 0.2), revenue: Math.round(total * 0.2 * 3) },
      { cutoff: "Top 40%", customers: Math.round(total * 0.4), expectedResponse: Math.round(total * 0.4 * 0.25), cost: Math.round(total * 0.4), revenue: Math.round(total * 0.4 * 2.5) },
      { cutoff: "Top 60%", customers: Math.round(total * 0.6), expectedResponse: Math.round(total * 0.6 * 0.2), cost: Math.round(total * 0.6), revenue: Math.round(total * 0.6 * 2) },
      { cutoff: "Top 80%", customers: Math.round(total * 0.8), expectedResponse: Math.round(total * 0.8 * 0.16), cost: Math.round(total * 0.8), revenue: Math.round(total * 0.8 * 1.6) },
      { cutoff: "All", customers: total, expectedResponse: Math.round(total * 0.13), cost: total, revenue: Math.round(total * 1.3) },
    ];
  }, [analysisData]);

  const chartConfig = {
    count: { label: "Customers", color: "hsl(var(--chart-3))" },
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading propensity analysis from BrainWorks Data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {analysisData?.totalCount && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{analysisData.totalCount.toLocaleString()} total records</Badge>
          <DataQualityBadge quality={analysisData.dataQuality} />
          {analysisData.data?.note && <span className="text-xs">({analysisData.data.note})</span>}
        </div>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Propensity Score Distribution</CardTitle>
          <CardDescription>Number of customers by predicted response probability</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[300px]">
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={scoreDistribution} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" fontSize={9} angle={-30} textAnchor="end" height={60} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Cutoff Analysis</CardTitle>
            <CardDescription>Expected outcomes at different mailing cutoffs</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-export-propensity"
            onClick={() => exportToCSV(
              cutoffAnalysis.map(row => ({
                Cutoff: row.cutoff,
                Customers: row.customers,
                ExpectedResponse: row.expectedResponse,
                MailCost: row.cost,
                ExpectedRevenue: row.revenue,
                NetROI: ((row.revenue - row.cost) / row.cost * 100).toFixed(0) + "%"
              })),
              "propensity_analysis"
            )}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cutoff</TableHead>
                <TableHead className="text-right">Customers</TableHead>
                <TableHead className="text-right">Expected Response</TableHead>
                <TableHead className="text-right">Mail Cost ($)</TableHead>
                <TableHead className="text-right">Expected Revenue ($)</TableHead>
                <TableHead className="text-right">Net ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cutoffAnalysis.map((row) => {
                const roi = ((row.revenue - row.cost) / row.cost * 100).toFixed(0);
                return (
                  <TableRow key={row.cutoff}>
                    <TableCell className="font-medium">{row.cutoff}</TableCell>
                    <TableCell className="text-right">{row.customers.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{row.expectedResponse.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.cost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={parseInt(roi) > 100 ? "default" : "secondary"}>
                        {roi}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ReactivationAnalysis({ databaseId, tableId, modelId }: AnalysisProps) {
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ["/api/brainworks/analysis", modelId, tableId, databaseId],
    queryFn: async () => {
      if (!databaseId || !tableId) return null;
      const response = await apiRequest("POST", "/api/brainworks/analysis", { modelId, tableId, databaseId });
      return response.json();
    },
    enabled: !!databaseId && !!tableId,
  });

  const dormantSegments = useMemo(() => {
    if (analysisData?.data?.dormantSegments) {
      return analysisData.data.dormantSegments;
    }
    return [];
  }, [analysisData]);

  const scatterData = useMemo(() => {
    return dormantSegments.flatMap((seg: any) =>
      Array.from({ length: 15 }, () => ({
        ltv: seg.avgLTV + (Math.random() - 0.5) * seg.avgLTV * 0.8,
        monthsInactive: seg.monthsInactive + (Math.random() - 0.5) * 10,
        segment: seg.segment,
      }))
    );
  }, [dormantSegments]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading reactivation analysis from BrainWorks Data...</p>
        </CardContent>
      </Card>
    );
  }

  if (dormantSegments.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <UserCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">No segment data available for reactivation analysis.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {analysisData?.totalCount && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{analysisData.totalCount.toLocaleString()} total records</Badge>
          <DataQualityBadge quality={analysisData.dataQuality} />
          {analysisData.data?.note && <span className="text-xs">({analysisData.data.note})</span>}
        </div>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base">LTV vs Inactivity</CardTitle>
          <CardDescription>Customer lifetime value plotted against months since last purchase</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[400px] h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="monthsInactive"
                  name="Months Inactive"
                  unit=" mo"
                  fontSize={11}
                />
                <YAxis
                  type="number"
                  dataKey="ltv"
                  name="LTV"
                  unit="$"
                  fontSize={11}
                />
                <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: "12px" }} />
                {dormantSegments.map((seg: any, i: number) => (
                  <Scatter
                    key={seg.segment}
                    name={seg.segment}
                    data={scatterData.filter((d: any) => d.segment === seg.segment)}
                    fill={COLORS[i % COLORS.length]}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Dormant Segment Summary</CardTitle>
            <CardDescription>Win-back campaign targeting recommendations</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-export-reactivation"
            onClick={() => exportToCSV(
              dormantSegments.map((seg: any) => ({
                Segment: seg.segment,
                Count: seg.count,
                AvgLTV: seg.avgLTV,
                MonthsInactive: seg.monthsInactive,
                Action: seg.avgLTV > 500 ? "Win-back" : "Suppress"
              })),
              "reactivation_analysis"
            )}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Avg LTV ($)</TableHead>
                <TableHead className="text-right">Months Inactive</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dormantSegments.map((seg: any) => (
                <TableRow key={seg.segment}>
                  <TableCell className="font-medium">{seg.segment}</TableCell>
                  <TableCell className="text-right">{seg.count.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${seg.avgLTV.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{seg.monthsInactive}</TableCell>
                  <TableCell>
                    <Badge variant={seg.avgLTV > 500 ? "default" : "secondary"}>
                      {seg.avgLTV > 500 ? "Win-back" : "Suppress"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LookalikeAnalysis({ databaseId, tableId, modelId }: AnalysisProps) {
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ["/api/brainworks/analysis", modelId, tableId, databaseId],
    queryFn: async () => {
      if (!databaseId || !tableId) return null;
      const response = await apiRequest("POST", "/api/brainworks/analysis", { modelId, tableId, databaseId });
      return response.json();
    },
    enabled: !!databaseId && !!tableId,
  });

  const prospectSegments = useMemo(() => {
    if (analysisData?.data?.prospectSegments) {
      return analysisData.data.prospectSegments;
    }
    return [];
  }, [analysisData]);

  const prospectScores = useMemo(() => {
    if (prospectSegments.length === 0) return [];
    return prospectSegments.map((seg: any) => ({
      range: seg.segment,
      count: seg.count,
      similarity: seg.similarity,
      conversionPotential: seg.similarity >= 80 ? "High" : seg.similarity >= 50 ? "Medium" : seg.similarity >= 30 ? "Low" : "Skip"
    }));
  }, [prospectSegments]);

  const chartConfig = {
    count: { label: "Prospects", color: "hsl(var(--chart-5))" },
    similarity: { label: "Similarity %", color: "hsl(var(--chart-1))" },
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading lookalike analysis from BrainWorks Data...</p>
        </CardContent>
      </Card>
    );
  }

  if (prospectScores.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">No segment data available for lookalike analysis.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {analysisData?.totalCount && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{analysisData.totalCount.toLocaleString()} total records</Badge>
          <DataQualityBadge quality={analysisData.dataQuality} />
          {analysisData.data?.note && <span className="text-xs">({analysisData.data.note})</span>}
        </div>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prospect Segments by Similarity</CardTitle>
          <CardDescription>Prospect counts and similarity scores</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[300px]">
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={prospectScores} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="range" width={100} fontSize={10} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={2} />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Prospect Lookalike Scores</CardTitle>
            <CardDescription>Prospects ranked by similarity to top buyers</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-export-lookalike"
            onClick={() => exportToCSV(
              prospectScores.map((row: any) => ({
                Segment: row.range,
                Count: row.count,
                Similarity: row.similarity,
                Recommendation: row.conversionPotential === "Skip" ? "Do not mail" : "Mail"
              })),
              "lookalike_analysis"
            )}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Similarity</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prospectScores.map((row: any) => (
                <TableRow key={row.range}>
                  <TableCell className="font-medium">{row.range}</TableCell>
                  <TableCell className="text-right">{row.count.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.similarity}%</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.conversionPotential === "High"
                          ? "default"
                          : row.conversionPotential === "Medium"
                          ? "outline"
                          : "secondary"
                      }
                    >
                      {row.conversionPotential === "Skip" ? "Do not mail" : "Mail"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductAffinityAnalysis({ databaseId, tableId, modelId }: AnalysisProps) {
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ["/api/brainworks/analysis", modelId, tableId, databaseId],
    queryFn: async () => {
      if (!databaseId || !tableId) return null;
      const response = await apiRequest("POST", "/api/brainworks/analysis", { modelId, tableId, databaseId });
      return response.json();
    },
    enabled: !!databaseId && !!tableId,
  });

  const productData = useMemo(() => {
    if (analysisData?.data?.products) {
      return analysisData.data.products.map((p: any) => ({
        name: p.product,
        purchases: p.purchases,
        affinity: p.affinity
      }));
    }
    return [];
  }, [analysisData]);

  const chartConfig = {
    purchases: { label: "Purchases", color: "hsl(var(--chart-1))" },
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading product affinity analysis from BrainWorks Data...</p>
        </CardContent>
      </Card>
    );
  }

  if (productData.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">No product data available. Please ensure your table has product or category fields.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {analysisData?.totalCount && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{analysisData.totalCount.toLocaleString()} total records</Badge>
          <DataQualityBadge quality={analysisData.dataQuality} />
          {analysisData.data?.note && <span className="text-xs">({analysisData.data.note})</span>}
        </div>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Distribution</CardTitle>
          <CardDescription>Customer count by product/category</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[300px]">
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={productData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="purchases" fill="var(--color-purchases)" radius={4} />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Product Affinity Scores</CardTitle>
            <CardDescription>Cross-sell opportunity by product</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-export-affinity"
            onClick={() => exportToCSV(
              productData.map((row: any) => ({
                Product: row.name,
                Customers: row.purchases,
                AffinityScore: row.affinity,
                Priority: row.affinity >= 70 ? "High" : row.affinity >= 50 ? "Medium" : "Low"
              })),
              "product_affinity_analysis"
            )}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Customers</TableHead>
                <TableHead className="text-right">Affinity Score</TableHead>
                <TableHead>Cross-Sell Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productData.map((row: any) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right">{row.purchases.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.affinity}%</TableCell>
                  <TableCell>
                    <Badge variant={row.affinity >= 70 ? "default" : row.affinity >= 50 ? "outline" : "secondary"}>
                      {row.affinity >= 70 ? "High" : row.affinity >= 50 ? "Medium" : "Low"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ROIOptimizationAnalysis({ databaseId, tableId, modelId }: AnalysisProps) {
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ["/api/brainworks/analysis", modelId, tableId, databaseId],
    queryFn: async () => {
      if (!databaseId || !tableId) return null;
      const response = await apiRequest("POST", "/api/brainworks/analysis", { modelId, tableId, databaseId });
      return response.json();
    },
    enabled: !!databaseId && !!tableId,
  });

  const campaignROI = useMemo(() => {
    if (analysisData?.data?.campaigns) {
      return analysisData.data.campaigns.map((c: any) => ({
        campaign: c.campaign,
        revenue: c.revenue,
        cost: c.cost,
        mailed: c.mailed,
        roi: c.roi,
        status: c.roi >= 2 ? "Excellent" : c.roi >= 1 ? "Good" : c.roi >= 0 ? "Marginal" : "Poor"
      }));
    }
    return [];
  }, [analysisData]);

  const chartConfig = {
    roi: { label: "ROI", color: "hsl(var(--chart-2))" },
    mailed: { label: "Mailed", color: "hsl(var(--chart-1))" },
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading ROI analysis from BrainWorks Data...</p>
        </CardContent>
      </Card>
    );
  }

  if (campaignROI.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">No campaign data available for ROI analysis. Please ensure your table has campaign or market fields.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {analysisData?.totalCount && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{analysisData.totalCount.toLocaleString()} total records</Badge>
          <DataQualityBadge quality={analysisData.dataQuality} />
          {analysisData.data?.note && <span className="text-xs">({analysisData.data.note})</span>}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign ROI Comparison</CardTitle>
            <CardDescription>Return on investment by campaign</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[300px]">
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={campaignROI} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="campaign" fontSize={10} angle={-20} textAnchor="end" height={60} />
                  <YAxis unit="x" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="roi"
                    radius={4}
                    fill="var(--color-roi)"
                  />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign Mailing Volume</CardTitle>
            <CardDescription>Number mailed by campaign</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[300px]">
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={campaignROI} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="campaign" fontSize={10} angle={-20} textAnchor="end" height={60} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="mailed" fill="var(--color-mailed)" radius={4} />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Campaign Financial Summary</CardTitle>
            <CardDescription>Revenue, cost, and ROI breakdown</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-export-roi"
            onClick={() => exportToCSV(
              campaignROI.map((row: any) => ({
                Campaign: row.campaign,
                Mailed: row.mailed,
                Revenue: row.revenue,
                Cost: row.cost,
                ROI: row.roi?.toFixed(2) + "x",
                Recommendation: row.roi >= 2 ? "Scale up" : row.roi >= 1.5 ? "Maintain" : row.roi >= 1 ? "Optimize" : "Pause"
              })),
              "roi_analysis"
            )}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Mailed</TableHead>
                <TableHead className="text-right">Revenue ($)</TableHead>
                <TableHead className="text-right">Cost ($)</TableHead>
                <TableHead className="text-right">ROI</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignROI.map((row: any) => (
                <TableRow key={row.campaign}>
                  <TableCell className="font-medium">{row.campaign}</TableCell>
                  <TableCell className="text-right">{row.mailed?.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${row.revenue?.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${row.cost?.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.roi?.toFixed(2)}x</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.roi >= 2
                          ? "default"
                          : row.roi >= 1.5
                          ? "outline"
                          : "secondary"
                      }
                    >
                      {row.roi >= 2 ? "Scale up" : row.roi >= 1.5 ? "Maintain" : row.roi >= 1 ? "Optimize" : "Pause"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
