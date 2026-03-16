import { useLocation } from "wouter";
import { Mail, Filter, Wrench } from "lucide-react";
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
    title: "Campaign Builder",
    url: "/email-marketing",
    icon: Mail,
    description: "AI-powered mailing list generation",
    shortDesc: "Build & export campaigns",
  },
  {
    title: "Data Filter",
    url: "/filtering-tool",
    icon: Filter,
    description: "Filter and export contact lists",
    shortDesc: "Query & export data",
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Wrench className="h-4 w-4 text-primary" />
          </div>
          <div className="leading-tight">
            <span className="font-semibold text-sm">Database Toolkit</span>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
              Marketing Tools
            </p>
          </div>
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
                  (tool.url === "/filtering-tool" && location === "/");
                return (
                  <SidebarMenuItem key={tool.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={tool.description}
                      className="h-auto py-2"
                    >
                      <a
                        href={tool.url}
                        data-testid={`nav-${tool.url.slice(1)}`}
                      >
                        <tool.icon className="h-4 w-4 shrink-0" />
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium text-sm">
                            {tool.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-normal">
                            {tool.shortDesc}
                          </span>
                        </div>
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
