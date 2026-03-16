import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { Mail, Filter } from "lucide-react";
import NotFound from "@/pages/not-found";
import BrainworksFiltering from "@/pages/brainworks-filtering";
import EmailMarketing from "@/pages/email-marketing";
import BrainworksAnalysis from "@/pages/brainworks-analysis";
import TrendsICP from "@/pages/trends-icp";

const PAGE_META: Record<string, { title: string; icon: typeof Mail }> = {
  "/email-marketing": { title: "Campaign Builder", icon: Mail },
  "/filtering-tool": { title: "Data Filter", icon: Filter },
  "/": { title: "Data Filter", icon: Filter },
};

function PageBreadcrumb() {
  const [location] = useLocation();
  const meta = PAGE_META[location];
  if (!meta) return null;

  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Separator orientation="vertical" className="h-4" />
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">{meta.title}</span>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={BrainworksFiltering} />
      <Route path="/email-marketing" component={EmailMarketing} />
      <Route path="/filtering-tool" component={BrainworksFiltering} />
      <Route path="/brainworks-analysis" component={BrainworksAnalysis} />
      <Route path="/trends-icp" component={TrendsICP} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 min-w-0">
                <header className="flex items-center justify-between h-12 px-4 border-b bg-background shrink-0">
                  <div className="flex items-center gap-2">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                    <PageBreadcrumb />
                  </div>
                  <ThemeToggle />
                </header>
                <main className="flex-1 overflow-auto">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
