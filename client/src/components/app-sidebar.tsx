import { useLocation } from "wouter";
import { Mail, Filter, BarChart3, Wrench, TrendingUp } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";

const tools = [
  {
    title: "Email Marketing",
    url: "/email-marketing",
    icon: Mail,
    description: "AI-powered email list generation",
  },
  {
    title: "BrainWorks Filtering",
    url: "/brainworks-filtering",
    icon: Filter,
    description: "Filter and export contact lists",
  },
  {
    title: "BrainWorks Analysis",
    url: "/brainworks-analysis",
    icon: BarChart3,
    description: "Multiple analysis models with visualizations",
  },
  {
    title: "Trend & ICP Analysis",
    url: "/trends-icp",
    icon: TrendingUp,
    description: "Trends and Ideal Customer Profile analysis",
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <span className="font-semibold">Marketing Toolkit</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tools.map((tool) => {
                const isActive =
                  location === tool.url ||
                  (tool.url === "/brainworks-filtering" && location === "/");
                return (
                  <SidebarMenuItem key={tool.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={tool.description}
                    >
                      <a
                        href={tool.url}
                        data-testid={`nav-${tool.url.slice(1)}`}
                      >
                        <tool.icon className="h-4 w-4" />
                        <span>{tool.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
