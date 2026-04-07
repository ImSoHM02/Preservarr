import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import Header from "@/components/Header";
import { AuthProvider } from "@/lib/auth";
import { Suspense, lazy } from "react";
import LoadingFallback from "@/components/LoadingFallback";
import { ThemeProvider } from "next-themes";

const NotFound = lazy(() => import("@/pages/not-found"));
const LoginPage = lazy(() => import("@/pages/auth/login"));
const SetupPage = lazy(() => import("@/pages/auth/setup"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const PlatformsPage = lazy(() => import("@/pages/platforms"));
const PlatformPage = lazy(() => import("@/pages/platforms/platform"));
const GamePage = lazy(() => import("@/pages/games/game"));
const QualityProfilesPage = lazy(() => import("@/pages/quality-profiles"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const IndexersPage = lazy(() => import("@/pages/indexers"));
const DownloadersPage = lazy(() => import("@/pages/downloaders"));
const DownloadsPage = lazy(() => import("@/pages/downloads"));
const LogsPage = lazy(() => import("@/pages/logs"));
const VersionSourcesPage = lazy(() => import("@/pages/version-sources"));

function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/setup" component={SetupPage} />
        <Route path="/" component={DashboardPage} />
        <Route path="/platforms" component={PlatformsPage} />
        <Route path="/platforms/:slug">{(params) => <PlatformPage slug={params.slug} />}</Route>
        <Route path="/games/:id">{(params) => <GamePage id={params.id} />}</Route>
        <Route path="/quality-profiles" component={QualityProfilesPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/indexers" component={IndexersPage} />
        <Route path="/downloaders" component={DownloadersPage} />
        <Route path="/downloads" component={DownloadsPage} />
        <Route path="/version-sources" component={VersionSourcesPage} />
        <Route path="/logs" component={LogsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [location, navigate] = useLocation();

  const getPageTitle = (path: string) => {
    if (path === "/") return "Dashboard";
    if (path === "/platforms") return "Platforms";
    if (path.startsWith("/platforms/")) return "Platform";
    if (path.startsWith("/games/")) return "Game Details";
    if (path === "/downloads") return "Downloads";
    if (path === "/quality-profiles") return "Quality Profiles";
    if (path === "/settings") return "Settings";
    if (path === "/indexers") return "Indexers";
    if (path === "/downloaders") return "Downloaders";
    if (path === "/version-sources") return "Version Sources";
    if (path === "/logs") return "Logs";
    return "Preservarr";
  };

  // Login/setup pages: simplified layout without sidebar/header
  if (location === "/login" || location === "/setup") {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <AuthProvider>
          <TooltipProvider>
            <SidebarProvider className="app-shell__prop-sidebar-width">
              <div className="app-shell__layout">
                <AppSidebar activeItem={location} onNavigate={navigate} />
                <div className="app-shell__main">
                  <Header title={getPageTitle(location)} />
                  <main className="app-shell__flex-1-overflow-hidden">
                    <Router />
                  </main>
                </div>
              </div>
            </SidebarProvider>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
