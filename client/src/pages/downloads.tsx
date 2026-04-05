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
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Downloads</h1>
          <p className="text-muted-foreground">
            {totalDownloads} active download{totalDownloads !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading download queue...</p>}

      {!isLoading && queues.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Download className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium mb-1">No download clients configured</p>
            <p className="text-sm text-muted-foreground">
              Add a download client in the Downloaders settings.
            </p>
          </CardContent>
        </Card>
      )}

      {queues.map((clientQueue) => (
        <Card key={clientQueue.clientId}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" />
              {clientQueue.clientName}
              <Badge variant="secondary" className="ml-auto text-xs">
                {clientQueue.downloads.length} item{clientQueue.downloads.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {clientQueue.downloads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Queue is empty</p>
            ) : (
              clientQueue.downloads.map((dl) => (
                <div key={dl.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium flex-1 truncate">{dl.name}</span>
                    <Badge variant={statusBadgeVariant(dl.status)} className="text-xs shrink-0">
                      {dl.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={dl.progress * 100} className="flex-1 h-1.5" />
                    <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">
                      {Math.round(dl.progress * 100)}%
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {typeof dl.size === "number" && (
                      <span>{formatBytes(dl.size)}</span>
                    )}
                    {typeof dl.dlspeed === "number" && dl.dlspeed > 0 && (
                      <span>↓ {formatBytes(dl.dlspeed)}/s</span>
                    )}
                    {typeof dl.upspeed === "number" && dl.upspeed > 0 && (
                      <span>↑ {formatBytes(dl.upspeed)}/s</span>
                    )}
                    {typeof dl.num_seeds === "number" && (
                      <span>{dl.num_seeds} seeds</span>
                    )}
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
