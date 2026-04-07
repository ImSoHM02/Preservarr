import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, RefreshCw, Server } from "lucide-react";

interface DownloadStatus {
  id: string;
  name: string;
  status: string;
  progress: number;
  [key: string]: unknown;
}

interface ClientQueue {
  clientId: number;
  clientName: string;
  downloads: DownloadStatus[];
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status?.toLowerCase()) {
    case "downloading":
    case "downloading_metadata":
      return "default";
    case "seeding":
    case "completed":
    case "done":
      return "secondary";
    case "error":
    case "stalled":
      return "destructive";
    default:
      return "outline";
  }
}

function formatBytes(bytes: unknown): string {
  const n = typeof bytes === "number" ? bytes : Number(bytes);
  if (!n || isNaN(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(1)} KB`;
}

export default function DownloadsPage() {
  const {
    data: queues = [],
    isLoading,
    refetch,
    isFetching,
  } = useQuery<ClientQueue[]>({
    queryKey: ["download-queue"],
    queryFn: () => apiRequest("GET", "/api/download-clients/queue/all").then((r) => r.json()),
    refetchInterval: 10000, // auto-refresh every 10s
  });

  const { data: history = [] } = useQuery<unknown[]>({
    queryKey: ["download-history"],
    queryFn: () => apiRequest("GET", "/api/settings").then(() => []), // placeholder
    enabled: false,
  });

  const totalDownloads = queues.reduce((sum, q) => sum + q.downloads.length, 0);

  return (
    <div className="page-downloaders__page">
      <div className="page-dashboard__stat-row">
        <div>
          <h1 className="page-auth-login__text-2xl-font-bold">Downloads</h1>
          <p className="page-downloaders__text-muted-foreground">
            {totalDownloads} active download{totalDownloads !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "page-downloads__spinner" : "page-downloaders__height-4-width-4-margin-right-2"} />
          Refresh
        </Button>
      </div>

      {isLoading && <p className="page-downloaders__muted-text">Loading download queue...</p>}

      {!isLoading && queues.length === 0 && (
        <Card>
          <CardContent className="page-downloaders__text-center-padding-y-12">
            <Download className="page-downloaders__empty-icon" />
            <p className="page-downloaders__font-medium-margin-bottom-1">No download clients configured</p>
            <p className="page-downloads__muted-text">Add a download client in the Downloaders settings.</p>
          </CardContent>
        </Card>
      )}

      {queues.map((clientQueue) => (
        <Card key={clientQueue.clientId}>
          <CardHeader className="page-downloads__padding-bottom-3">
            <CardTitle className="page-downloads__card-title-row">
              <Server className="cmp-searchbar__height-4-width-4" />
              {clientQueue.clientName}
              <Badge variant="secondary" className="page-downloads__text-xs-margin-left-auto">
                {clientQueue.downloads.length} item{clientQueue.downloads.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="cmp-loadingfallback__space-y-3">
            {clientQueue.downloads.length === 0 ? (
              <p className="page-downloads__empty-text">Queue is empty</p>
            ) : (
              clientQueue.downloads.map((dl) => (
                <div key={dl.id} className="page-downloads__space-y-1-5">
                  <div className="cmp-appsidebar__flex-gap-2-items-center">
                    <span className="page-downloads__queue-item-name">{dl.name}</span>
                    <Badge variant={statusBadgeVariant(dl.status)} className="page-downloads__text-xs-shrink-0">
                      {dl.status}
                    </Badge>
                  </div>
                  <div className="app-common__row-gap-3">
                    <Progress value={dl.progress * 100} className="page-downloads__height-1-5-flex-1" />
                    <span className="page-downloads__progress-percent">{Math.round(dl.progress * 100)}%</span>
                  </div>
                  <div className="page-downloads__meta-row">
                    {typeof dl.size === "number" && <span>{formatBytes(dl.size)}</span>}
                    {typeof dl.dlspeed === "number" && dl.dlspeed > 0 && (
                      <span>↓ {formatBytes(dl.dlspeed)}/s</span>
                    )}
                    {typeof dl.upspeed === "number" && dl.upspeed > 0 && (
                      <span>↑ {formatBytes(dl.upspeed)}/s</span>
                    )}
                    {typeof dl.num_seeds === "number" && <span>{dl.num_seeds} seeds</span>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
