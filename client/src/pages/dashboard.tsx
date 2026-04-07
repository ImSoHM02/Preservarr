import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { getApiErrorDescription, getApiErrorMessage } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  Download,
  HardDrive,
  LibraryBig,
  ListTodo,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

type PlatformWithCount = {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
  gameCount: number;
};

type PlatformStats = {
  wantedGames: number;
};

type DownloadStatus = {
  id: string;
  name: string;
  status: string;
  progress: number;
  [key: string]: unknown;
};

type ClientQueue = {
  clientId: number;
  clientName: string;
  downloads: DownloadStatus[];
};

type Indexer = {
  id: number;
  enabled: boolean;
};

type DownloadClient = {
  id: number;
  enabled: boolean;
};

type ScanProgress = {
  running: boolean;
  total: number;
  processed: number;
};

type HealthResponse = {
  status: string;
  timestamp: string;
};

type LogEntry = {
  timestamp: string;
  level: string;
  module?: string;
  message: string;
};

type LogsResponse = {
  entries: LogEntry[];
};

function normalizeProgress(progress: unknown): number {
  const value = typeof progress === "number" ? progress : Number(progress);
  if (Number.isNaN(value) || value < 0) return 0;
  if (value <= 1) return value * 100;
  if (value > 100) return 100;
  return value;
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toLowerCase()) {
    case "downloading":
    case "downloading_metadata":
      return "default";
    case "done":
    case "completed":
    case "seeding":
      return "secondary";
    case "error":
    case "stalled":
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function formatTimeAgo(isoTime: string): string {
  const eventTime = new Date(isoTime).getTime();
  if (Number.isNaN(eventTime)) return "just now";

  const diffSeconds = Math.floor((Date.now() - eventTime) / 1000);
  if (diffSeconds < 60) return "just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: platforms = [], isLoading: platformsLoading } = useQuery<PlatformWithCount[]>({
    queryKey: ["dashboard-platforms"],
    queryFn: () => apiRequest("GET", "/api/platforms").then((r) => r.json()),
  });

  const enabledPlatforms = platforms.filter((p) => p.enabled);
  const totalGames = enabledPlatforms.reduce((sum, p) => sum + p.gameCount, 0);

  const { data: platformStats = [] } = useQuery<PlatformStats[]>({
    queryKey: ["dashboard-platform-stats", enabledPlatforms.map((p) => p.slug).join(",")],
    enabled: enabledPlatforms.length > 0,
    queryFn: async () => {
      const stats = await Promise.all(
        enabledPlatforms.map(async (platform) => {
          try {
            const res = await apiRequest("GET", `/api/platforms/${platform.slug}/stats`);
            const payload = await res.json();
            return {
              wantedGames:
                typeof payload.wantedGames === "number" ? payload.wantedGames : 0,
            };
          } catch {
            return { wantedGames: 0 };
          }
        }),
      );
      return stats;
    },
  });

  const { data: queues = [], isLoading: queueLoading } = useQuery<ClientQueue[]>({
    queryKey: ["dashboard-queue"],
    queryFn: () => apiRequest("GET", "/api/download-clients/queue/all").then((r) => r.json()),
    refetchInterval: 10000,
  });

  const { data: indexers = [] } = useQuery<Indexer[]>({
    queryKey: ["dashboard-indexers"],
    queryFn: () => apiRequest("GET", "/api/indexers").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: downloadClients = [] } = useQuery<DownloadClient[]>({
    queryKey: ["dashboard-download-clients"],
    queryFn: () => apiRequest("GET", "/api/download-clients").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: scanStatus } = useQuery<ScanProgress>({
    queryKey: ["dashboard-scan-status"],
    queryFn: () => apiRequest("GET", "/api/library/scan").then((r) => r.json()),
    refetchInterval: (query) => (query.state.data?.running ? 2000 : 15000),
  });

  const { data: apiHealth } = useQuery<HealthResponse>({
    queryKey: ["dashboard-api-health"],
    queryFn: () => apiRequest("GET", "/api/health").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: logsData, isLoading: eventsLoading } = useQuery<LogsResponse>({
    queryKey: ["dashboard-events"],
    queryFn: () => apiRequest("GET", "/api/logs?limit=8").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/library/scan").then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-scan-status"] });
      toast({ title: "Library scan started" });
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to start library scan"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/indexers/prowlarr/sync").then((r) => r.json()),
    onSuccess: (result: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-indexers"] });
      toast({ title: result.message ?? "Indexer sync complete" });
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Indexer sync failed"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const queueItems = queues.flatMap((queue) =>
    queue.downloads.map((download) => ({
      ...download,
      clientName: queue.clientName,
    })),
  );

  const queueCount = queueItems.length;
  const downloadingCount = queueItems.filter((item) =>
    ["downloading", "downloading_metadata"].includes(item.status.toLowerCase()),
  ).length;
  const completedCount = queueItems.filter((item) =>
    ["done", "completed", "seeding"].includes(item.status.toLowerCase()),
  ).length;
  const failedCount = queueItems.filter((item) =>
    ["error", "failed", "stalled"].includes(item.status.toLowerCase()),
  ).length;
  const wantedCount = platformStats.reduce((sum, stats) => sum + stats.wantedGames, 0);

  const enabledIndexerCount = indexers.filter((indexer) => indexer.enabled).length;
  const enabledClientCount = downloadClients.filter((client) => client.enabled).length;

  const recentEvents = logsData?.entries ?? [];

  return (
    <div className="page-dashboard__container">
      <div className="page-dashboard__ops-kpi-grid">
        <StatCard
          title="Platforms"
          value={platformsLoading ? null : enabledPlatforms.length}
          subtitle="enabled"
          icon={LibraryBig}
        />
        <StatCard
          title="Games"
          value={platformsLoading ? null : totalGames}
          subtitle="in library"
          icon={HardDrive}
        />
        <StatCard
          title="Wanted"
          value={platformsLoading ? null : wantedCount}
          subtitle="pending"
          icon={ListTodo}
        />
        <StatCard title="Queued" value={queueLoading ? null : queueCount} subtitle="active" icon={Clock3} />
        <StatCard
          title="Downloading"
          value={queueLoading ? null : downloadingCount}
          subtitle="in progress"
          icon={Download}
        />
        <StatCard
          title="Completed"
          value={queueLoading ? null : completedCount}
          subtitle="in queue"
          icon={ShieldCheck}
        />
        <StatCard
          title="Failed"
          value={queueLoading ? null : failedCount}
          subtitle="needs attention"
          icon={AlertTriangle}
        />
      </div>

      <div className="page-dashboard__ops-main-grid">
        <Card>
          <CardHeader className="page-dashboard__platform-header">
            <CardTitle className="page-dashboard__ops-section-title">Activity Queue</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="app-common__text-xs"
              onClick={() => navigate("/downloads")}
            >
              Open downloads <ArrowRight className="page-dashboard__view-all-icon" />
            </Button>
          </CardHeader>
          <CardContent className="page-dashboard__queue-card-content">
            {queueLoading ? (
              <div className="page-dashboard__loading-list">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="page-dashboard__queue-loading-row" />
                ))}
              </div>
            ) : queueItems.length === 0 ? (
              <p className="page-dashboard__empty-message">Queue is empty across all enabled download clients.</p>
            ) : (
              queueItems.slice(0, 8).map((item) => (
                <div key={`${item.clientName}-${item.id}`} className="page-dashboard__queue-item">
                  <div className="page-dashboard__queue-item-top">
                    <div className="app-common__stack-xs">
                      <p className="page-dashboard__queue-title">{item.name}</p>
                      <p className="page-dashboard__queue-client">{item.clientName}</p>
                    </div>
                    <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
                  </div>
                  <div className="page-dashboard__queue-progress-row">
                    <Progress value={normalizeProgress(item.progress)} className="page-dashboard__queue-progress" />
                    <span className="page-dashboard__queue-progress-value">
                      {Math.round(normalizeProgress(item.progress))}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="page-dashboard__ops-side-stack">
          <Card>
            <CardHeader className="page-dashboard__ops-side-header">
              <CardTitle className="page-dashboard__ops-section-title">System Health</CardTitle>
            </CardHeader>
            <CardContent className="page-dashboard__ops-side-content">
              <div className="page-dashboard__health-row">
                <span>API Service</span>
                <Badge variant={apiHealth?.status === "ok" ? "secondary" : "destructive"}>
                  {apiHealth?.status === "ok" ? "Healthy" : "Unavailable"}
                </Badge>
              </div>
              <div className="page-dashboard__health-row">
                <span>Indexers</span>
                <span className="page-dashboard__health-value">
                  {enabledIndexerCount}/{indexers.length} enabled
                </span>
              </div>
              <div className="page-dashboard__health-row">
                <span>Download Clients</span>
                <span className="page-dashboard__health-value">
                  {enabledClientCount}/{downloadClients.length} enabled
                </span>
              </div>
              <div className="page-dashboard__health-row">
                <span>Library Scan</span>
                <Badge variant={scanStatus?.running ? "default" : "outline"}>
                  {scanStatus?.running ? "Running" : "Idle"}
                </Badge>
              </div>
              {scanStatus?.running && (
                <p className="page-dashboard__health-subtext">
                  {scanStatus.processed}/{scanStatus.total} files processed
                </p>
              )}
              <div className="page-dashboard__health-row">
                <span>Last API Ping</span>
                <span className="page-dashboard__health-value">
                  {apiHealth?.timestamp ? formatTimeAgo(apiHealth.timestamp) : "unknown"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="page-dashboard__ops-side-header">
              <CardTitle className="page-dashboard__ops-section-title">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="page-dashboard__quick-actions-grid">
              <Button variant="outline" onClick={() => navigate("/downloads")}>
                View Queue
              </Button>
              <Button variant="outline" onClick={() => navigate("/indexers")}>
                Manage Indexers
              </Button>
              <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? (
                  <RefreshCw className="page-downloads__spinner" />
                ) : (
                  <ShieldCheck className="page-downloaders__height-4-width-4-margin-right-2" />
                )}
                Sync Indexers
              </Button>
              <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
                {scanMutation.isPending ? (
                  <RefreshCw className="page-downloads__spinner" />
                ) : (
                  <Search className="page-downloaders__height-4-width-4-margin-right-2" />
                )}
                Run Scan
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="page-dashboard__platform-header">
          <CardTitle className="page-dashboard__ops-section-title">Recent Events</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="app-common__text-xs"
            onClick={() => navigate("/logs")}
          >
            View logs <ArrowRight className="page-dashboard__view-all-icon" />
          </Button>
        </CardHeader>
        <CardContent className="page-dashboard__events-content">
          {eventsLoading ? (
            <div className="page-dashboard__loading-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="page-dashboard__event-loading-row" />
              ))}
            </div>
          ) : recentEvents.length === 0 ? (
            <p className="page-dashboard__empty-message">No recent events found.</p>
          ) : (
            recentEvents.map((event, index) => (
              <div key={`${event.timestamp}-${index}`} className="page-dashboard__event-row">
                <div className="page-dashboard__event-row-top">
                  <Badge variant={statusBadgeVariant(event.level)}>{event.level}</Badge>
                  <span className="page-dashboard__event-time">{formatTimeAgo(event.timestamp)}</span>
                </div>
                <p className="page-dashboard__event-message">{event.message}</p>
                {event.module && <p className="page-dashboard__event-module">module: {event.module}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: number | null;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="page-dashboard__stat-content">
        <div className="page-dashboard__stat-row">
          <div>
            <p className="page-dashboard__stat-label">{title}</p>
            {value !== null ? (
              <p className="page-dashboard__stat-value">{value}</p>
            ) : (
              <Skeleton className="page-dashboard__stat-skeleton" />
            )}
            <p className="page-dashboard__stat-subtitle">{subtitle}</p>
          </div>
          <div className="page-dashboard__stat-icon-wrap">
            <Icon className="page-dashboard__stat-icon" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
