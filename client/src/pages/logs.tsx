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
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold">Logs</h1>
        <p className="text-muted-foreground">
          Detailed system logs for API calls, indexer/downloader tests, and background services.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Use filters to isolate connection failures and API errors.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-[180px_180px_1fr_1fr_auto] gap-3 items-end">
          <div className="space-y-1">
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

          <div className="space-y-1">
            <Label>Rows</Label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ""))} />
          </div>

          <div className="space-y-1">
            <Label>Module</Label>
            <Input
              placeholder="downloaders, torznab, routes..."
              value={module}
              onChange={(e) => setModule(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Search</Label>
            <Input
              placeholder="econnrefused, auth failed, timeout..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Button onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries</CardTitle>
          <CardDescription>
            {data?.entries.length ?? 0} rows {data?.truncated ? "(tail window)" : ""} •{" "}
            {data?.filePath ?? "server.log"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading logs...</p>}
          {!isLoading && (!data || data.entries.length === 0) && (
            <p className="text-sm text-muted-foreground">No log entries matched your filters.</p>
          )}

          <div className="space-y-2">
            {data?.entries.map((entry, idx) => (
              <div key={`${entry.timestamp}-${idx}`} className="rounded-md border p-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={levelBadgeVariant(entry.level)}>{entry.level.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  {entry.module && (
                    <Badge variant="outline" className="text-xs">
                      {entry.module}
                    </Badge>
                  )}
                  {entry.requestId && (
                    <Badge variant="outline" className="text-xs font-mono">
                      {entry.requestId}
                    </Badge>
                  )}
                </div>
                <p className="text-sm break-words">{entry.message}</p>
                {entry.context && (
                  <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(entry.context, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

