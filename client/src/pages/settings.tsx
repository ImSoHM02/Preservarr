import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getApiErrorDescription, getApiErrorMessage } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Folder, Plus, Trash2, RefreshCw, Settings2, Key, CheckCircle2, XCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

interface Platform {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
}

interface ScanProgress {
  running: boolean;
  total: number;
  processed: number;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
  currentFile: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

// ─── Settings Page ────────────────────────────────────────────

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: platforms = [] } = useQuery<Platform[]>({
    queryKey: ["platforms"],
    queryFn: () => apiRequest("GET", "/api/platforms").then((r) => r.json()),
  });

  const { data: libraryPaths = {} } = useQuery<Record<string, string>>({
    queryKey: ["library-paths"],
    queryFn: () => apiRequest("GET", "/api/library/paths").then((r) => r.json()),
  });

  const { data: scanStatus } = useQuery<ScanProgress>({
    queryKey: ["scan-status"],
    queryFn: () => apiRequest("GET", "/api/library/scan").then((r) => r.json()),
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  });

  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ["settings"],
    queryFn: () => apiRequest("GET", "/api/settings").then((r) => r.json()),
  });

  const { data: igdbStatus, refetch: recheckIgdb } = useQuery<{
    configured: boolean;
    working: boolean;
  }>({
    queryKey: ["igdb-status"],
    queryFn: () => apiRequest("GET", "/api/igdb/status").then((r) => r.json()),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // ── Library paths state ──
  const [newSlug, setNewSlug] = useState("");
  const [newPath, setNewPath] = useState("");

  const savePathsMutation = useMutation({
    mutationFn: (paths: Record<string, string>) =>
      apiRequest("PUT", "/api/library/paths", paths).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library-paths"] });
      toast({ title: "Library paths saved" });
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to save paths"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/library/scan").then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scan-status"] });
      toast({ title: "Library scan started" });
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Scan failed to start"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const handleAddPath = () => {
    if (!newSlug || !newPath) return;
    const updated = { ...libraryPaths, [newSlug]: newPath };
    savePathsMutation.mutate(updated);
    setNewSlug("");
    setNewPath("");
  };

  const handleRemovePath = (slug: string) => {
    const updated = { ...libraryPaths };
    delete updated[slug];
    savePathsMutation.mutate(updated);
  };

  // ── Prowlarr / IGDB settings ──
  const [igdbClientId, setIgdbClientId] = useState(settings.igdb_client_id ?? "");
  const [igdbClientSecret, setIgdbClientSecret] = useState("");
  const [prowlarrUrl, setProwlarrUrl] = useState(settings.prowlarr_url ?? "");
  const [prowlarrApiKey, setProwlarrApiKey] = useState("");

  // Sync state when settings load
  React.useEffect(() => {
    if (settings.igdb_client_id) setIgdbClientId(settings.igdb_client_id);
    if (settings.prowlarr_url) setProwlarrUrl(settings.prowlarr_url);
  }, [settings]);

  const saveSettingsMutation = useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiRequest("PUT", "/api/settings", data).then((r) => r.json()),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Settings saved" });
      // Re-check IGDB connection if IGDB credentials were saved
      if ("igdb_client_id" in variables || "igdb_client_secret" in variables) {
        setTimeout(() => recheckIgdb(), 500);
      }
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to save settings"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const handleSaveIgdb = () => {
    const data: Record<string, string> = { igdb_client_id: igdbClientId };
    if (igdbClientSecret) data.igdb_client_secret = igdbClientSecret;
    saveSettingsMutation.mutate(data);
  };

  const handleSaveProwlarr = () => {
    const data: Record<string, string> = { prowlarr_url: prowlarrUrl };
    if (prowlarrApiKey) data.prowlarr_api_key = prowlarrApiKey;
    saveSettingsMutation.mutate(data);
  };

  const enabledPlatforms = platforms.filter((p) => p.enabled);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure library paths and external services</p>
      </div>

      {/* ── Library Paths ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            Library Paths
          </CardTitle>
          <CardDescription>
            Configure the directories Preservarr scans for ROM files, one path per platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing paths */}
          {Object.entries(libraryPaths).length > 0 && (
            <div className="space-y-2">
              {Object.entries(libraryPaths).map(([slug, dirPath]) => {
                const platform = platforms.find((p) => p.slug === slug);
                return (
                  <div
                    key={slug}
                    className="flex items-center gap-3 p-3 bg-muted/40 rounded-md"
                  >
                    <Badge variant="secondary" className="shrink-0">
                      {platform?.name ?? slug}
                    </Badge>
                    <span className="font-mono text-sm flex-1 truncate">{dirPath}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => handleRemovePath(slug)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new path */}
          <div className="grid grid-cols-[160px_1fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Platform</Label>
              <Select value={newSlug} onValueChange={setNewSlug}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {enabledPlatforms.map((p) => (
                    <SelectItem key={p.slug} value={p.slug}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Directory path</Label>
              <Input
                placeholder="/mnt/roms/switch"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPath()}
              />
            </div>
            <Button
              onClick={handleAddPath}
              disabled={!newSlug || !newPath || savePathsMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Scan Controls ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Library Scan
          </CardTitle>
          <CardDescription>
            Manually trigger a scan to import new ROM files from the configured paths.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending || scanStatus?.running}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${scanStatus?.running ? "animate-spin" : ""}`} />
              {scanStatus?.running ? "Scanning..." : "Scan Now"}
            </Button>
            {scanStatus?.finishedAt && !scanStatus.running && (
              <p className="text-sm text-muted-foreground">
                Last scan: {new Date(scanStatus.finishedAt).toLocaleString()} —{" "}
                {scanStatus.added} added, {scanStatus.updated} updated, {scanStatus.skipped} skipped
              </p>
            )}
          </div>

          {scanStatus?.running && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{scanStatus.currentFile ?? "Scanning..."}</span>
                <span>
                  {scanStatus.processed} / {scanStatus.total}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: scanStatus.total > 0
                      ? `${(scanStatus.processed / scanStatus.total) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ── IGDB Settings ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            IGDB API
            {igdbStatus?.working ? (
              <Badge className="bg-green-500/10 text-green-500 border-green-500/20 font-normal ml-1">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : igdbStatus && !igdbStatus.working ? (
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20 font-normal ml-1">
                <XCircle className="h-3 w-3 mr-1" />
                Not configured
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            Required for game metadata and cover art. Get credentials from the{" "}
            <a
              href="https://dev.twitch.tv/console"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Twitch Developer Portal
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Client ID</Label>
              <Input
                value={igdbClientId}
                onChange={(e) => setIgdbClientId(e.target.value)}
                placeholder="Twitch Client ID"
              />
            </div>
            <div className="space-y-1">
              <Label>Client Secret</Label>
              <Input
                type="password"
                value={igdbClientSecret}
                onChange={(e) => setIgdbClientSecret(e.target.value)}
                placeholder={settings.igdb_client_secret ? "••••••••" : "Twitch Client Secret"}
              />
            </div>
          </div>
          <Button
            onClick={handleSaveIgdb}
            disabled={saveSettingsMutation.isPending}
            size="sm"
          >
            Save IGDB Settings
          </Button>
        </CardContent>
      </Card>

      {/* ── Prowlarr Settings ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Prowlarr
          </CardTitle>
          <CardDescription>
            Connect to your Prowlarr instance for indexer management.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Prowlarr URL</Label>
              <Input
                value={prowlarrUrl}
                onChange={(e) => setProwlarrUrl(e.target.value)}
                placeholder="http://prowlarr:9696"
              />
              <p className="text-xs text-muted-foreground">
                In Docker, use the container name (e.g. <code>http://prowlarr:9696</code>), not an IP address.
              </p>
            </div>
            <div className="space-y-1">
              <Label>API Key</Label>
              <Input
                type="password"
                value={prowlarrApiKey}
                onChange={(e) => setProwlarrApiKey(e.target.value)}
                placeholder={settings.prowlarr_api_key ? "••••••••" : "Prowlarr API key"}
              />
            </div>
          </div>
          <Button
            onClick={handleSaveProwlarr}
            disabled={saveSettingsMutation.isPending}
            size="sm"
          >
            Save Prowlarr Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnostics</CardTitle>
          <CardDescription>
            Open detailed application logs for request traces, connection tests, and stack errors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <a href="/logs">Open Logs</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
