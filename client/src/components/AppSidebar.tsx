import {
  Home,
  Gamepad2,
  Download,
  Settings,
  Database,
  HardDrive,
  SlidersHorizontal,
  FileCheck,
  ScrollText,
  LogOut,
  User,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import pkg from "../../../package.json";

const navigation = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    title: "Platforms",
    url: "/platforms",
    icon: Gamepad2,
  },
  {
    title: "Downloads",
    url: "/downloads",
    icon: Download,
  },
];

const management = [
  {
    title: "Indexers",
    url: "/indexers",
    icon: Database,
  },
  {
    title: "Downloaders",
    url: "/downloaders",
    icon: HardDrive,
  },
  {
    title: "Quality Profiles",
    url: "/quality-profiles",
    icon: SlidersHorizontal,
  },
  {
    title: "Version Sources",
    url: "/version-sources",
    icon: FileCheck,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
  {
    title: "Logs",
    url: "/logs",
    icon: ScrollText,
  },
];

interface AppSidebarProps {
  activeItem?: string;
  onNavigate?: (url: string) => void;
}

export default function AppSidebar({ activeItem = "/", onNavigate }: AppSidebarProps) {
  const { logout, user } = useAuth();

  const handleNavigation = (url: string) => {
    onNavigate?.(url);
  };

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="cmp-appsidebar__padding-4">
        <div className="cmp-appsidebar__flex-gap-2-items-center">
          <div>
            <span className="cmp-appsidebar__font-semibold-truncate">Preservarr</span>
            <p className="cmp-appsidebar__muted-xs">ROM Management</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeItem === item.url}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <button
                      onClick={() => handleNavigation(item.url)}
                      className="cmp-appsidebar__platform-button hover-elevate active-elevate"
                    >
                      <item.icon className="cmp-appsidebar__height-4-width-4" />
                      <span>{item.title}</span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {management.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeItem === item.url}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <button
                      onClick={() => handleNavigation(item.url)}
                      className="cmp-appsidebar__platform-button hover-elevate active-elevate"
                    >
                      <item.icon className="cmp-appsidebar__height-4-width-4" />
                      <span>{item.title}</span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="cmp-appsidebar__flex-1" />
        <div className="cmp-appsidebar__footer-separator" />
        <div className="cmp-appsidebar__footer-meta">
          <span>Preservarr v{pkg.version}</span>
        </div>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => logout()}
              className="cmp-appsidebar__width-full-cursor-pointer hover-elevate active-elevate"
              tooltip="Log out"
            >
              <div className="cmp-appsidebar__logo-badge">
                <User className="cmp-appsidebar__size-4" />
              </div>
              <div className="cmp-appsidebar__game-meta">
                <span className="cmp-appsidebar__font-semibold-truncate">{user?.username || "User"}</span>
                <span className="cmp-appsidebar__text-xs-truncate">Logged in</span>
              </div>
              <LogOut className="cmp-appsidebar__margin-left-auto-size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
