import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelNumber: number;
  module?: string;
  message: string;
  requestId?: string;
  source?: string;
  context?: Record<string, unknown>;
}

interface LogsResponse {
  filePath: string;
  truncated: boolean;
  entries: LogEntry[];
}

const LEVEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All levels" },
  { value: "error", label: "Error only" },
  { value: "warn,error,fatal", label: "Warn + Error" },
  { value: "info,warn,error,fatal", label: "Info+" },
  { value: "debug,info,warn,error,fatal", label: "Debug+" },
];

function levelBadgeVariant(level: LogLevel): "default" | "destructive" | "secondary" | "outline" {
  if (level === "error" || level === "fatal") return "destructive";
  if (level === "warn") return "secondary";
  if (level === "debug" || level === "trace") return "outline";
  return "default";
}

export default function LogsPage() {
  const [levels, setLevels] = useState("warn,error,fatal");
  const [module, setModule] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("200");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", limit || "200");
    if (levels !== "all") params.set("levels", levels);
    if (module.trim()) params.set("module", module.trim());
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [levels, module, search, limit]);

  const { data, isLoading, refetch, isFetching } = useQuery<LogsResponse>({
    queryKey: ["logs", queryString],
    queryFn: () => apiRequest("GET", `/api/logs?${queryString}`).then((r) => r.json()),
    refetchInterval: 5000,
  });

  return (
    <div className="page-downloaders__page">
      <div>
        <h1 className="page-auth-login__text-2xl-font-bold">Logs</h1>
        <p className="page-downloaders__text-muted-foreground">
          Detailed system logs for API calls, indexer/downloader tests, and background services.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Use filters to isolate connection failures and API errors.
          </CardDescription>
        </CardHeader>
        <CardContent className="page-logs__filters-grid">
          <div className="app-common__stack-xs">
            <Label>Level</Label>
            <Select value={levels} onValueChange={setLevels}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="app-common__stack-xs">
            <Label>Rows</Label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ""))} />
          </div>

          <div className="app-common__stack-xs">
            <Label>Module</Label>
            <Input
              placeholder="downloaders, torznab, routes..."
              value={module}
              onChange={(e) => setModule(e.target.value)}
            />
          </div>

          <div className="app-common__stack-xs">
            <Label>Search</Label>
            <Input
              placeholder="econnrefused, auth failed, timeout..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Button onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "page-downloads__spinner" : "page-downloaders__height-4-width-4-margin-right-2"} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="page-logs__text-base">Entries</CardTitle>
          <CardDescription>
            {data?.entries.length ?? 0} rows {data?.truncated ? "(tail window)" : ""} •{" "}
            {data?.filePath ?? "server.log"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="page-downloads__muted-text">Loading logs...</p>}
          {!isLoading && (!data || data.entries.length === 0) && (
            <p className="page-downloads__muted-text">No log entries matched your filters.</p>
          )}

          <div className="cmp-loadingfallback__space-y-2">
            {data?.entries.map((entry, idx) => (
              <div key={`${entry.timestamp}-${idx}`} className="page-logs__entry-card">
                <div className="page-logs__entry-header">
                  <Badge variant={levelBadgeVariant(entry.level)}>
                    {entry.level.toUpperCase()}
                  </Badge>
                  <span className="cmp-appsidebar__muted-xs">{new Date(entry.timestamp).toLocaleString()}</span>
                  {entry.module && (
                    <Badge variant="outline" className="app-common__text-xs">
                      {entry.module}
                    </Badge>
                  )}
                  {entry.requestId && (
                    <Badge variant="outline" className="page-logs__text-xs-font-mono">
                      {entry.requestId}
                    </Badge>
                  )}
                </div>
                <p className="page-logs__text-sm-break-words">{entry.message}</p>
                {entry.context && (
                  <pre className="page-logs__context-json">{JSON.stringify(entry.context, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
