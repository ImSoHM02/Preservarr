import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getApiErrorDescription, getApiErrorMessage } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Folder,
  Plus,
  Trash2,
  RefreshCw,
  Settings2,
  Key,
  CheckCircle2,
  XCircle,
  EyeOff,
} from "lucide-react";
import { PLATFORM_CATALOG_BY_SLUG, type PlatformImageCategory } from "@shared/platform-catalog";

interface Platform {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
  hidden: boolean;
}

type PlatformCategoryFilter = "all" | PlatformImageCategory | "unknown";
type PlatformWithMeta = Platform & { category: PlatformImageCategory | "unknown" };

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

  const [newSlug, setNewSlug] = useState("");
  const [newPath, setNewPath] = useState("");
  const [platformSearch, setPlatformSearch] = useState("");
  const [platformCategory, setPlatformCategory] = useState<PlatformCategoryFilter>("all");

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

  const updatePlatformVisibilityMutation = useMutation({
    mutationFn: ({ platformId, hidden }: { platformId: number; hidden: boolean }) =>
      apiRequest("PATCH", `/api/platforms/${platformId}`, { hidden }).then((r) => r.json()),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platforms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-platforms"] });
      toast({ title: variables.hidden ? "Platform hidden" : "Platform shown" });
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to update platform visibility"),
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

  const [igdbClientId, setIgdbClientId] = useState(settings.igdb_client_id ?? "");
  const [igdbClientSecret, setIgdbClientSecret] = useState("");
  const [prowlarrUrl, setProwlarrUrl] = useState(settings.prowlarr_url ?? "");
  const [prowlarrApiKey, setProwlarrApiKey] = useState("");

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

  const platformsWithMeta = useMemo<PlatformWithMeta[]>(() => {
    return platforms.map((platform) => {
      const catalogEntry = PLATFORM_CATALOG_BY_SLUG.get(platform.slug);
      return {
        ...platform,
        category: catalogEntry?.category ?? "unknown",
      };
    });
  }, [platforms]);

  const filteredVisibilityPlatforms = useMemo(() => {
    const search = platformSearch.trim().toLowerCase();
    return platformsWithMeta
      .filter((platform) => {
        const matchesSearch =
          search.length === 0 ||
          platform.name.toLowerCase().includes(search) ||
          platform.slug.toLowerCase().includes(search);
        const matchesCategory =
          platformCategory === "all" || platform.category === platformCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (a.hidden !== b.hidden) {
          return a.hidden ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [platformsWithMeta, platformSearch, platformCategory]);

  const hiddenCount = platformsWithMeta.filter((platform) => platform.hidden).length;

  return (
    <div className="page-settings__page">
      <div>
        <h1 className="page-auth-login__text-2xl-font-bold">Settings</h1>
        <p className="page-downloaders__text-muted-foreground">
          Configure library behavior, visibility, and service integrations.
        </p>
      </div>

      <section className="page-settings__section">
        <div className="page-settings__section-header">
          <h2 className="page-settings__section-title">Library</h2>
          <p className="page-settings__section-description">
            Paths, platform visibility, and scanning controls.
          </p>
        </div>

        <div className="page-settings__section-cards">
          <Card>
            <CardHeader>
              <CardTitle className="cmp-appsidebar__flex-gap-2-items-center">
                <Folder className="cmp-pathbrowser__height-5-width-5" />
                Library Paths
              </CardTitle>
              <CardDescription>
                Configure the directories Preservarr scans for ROM files, one path per platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="page-auth-login__space-y-4">
              {Object.entries(libraryPaths).length > 0 && (
                <div className="cmp-loadingfallback__space-y-2">
                  {Object.entries(libraryPaths).map(([slug, dirPath]) => {
                    const platform = platforms.find((p) => p.slug === slug);
                    return (
                      <div key={slug} className="page-settings__path-item">
                        <Badge variant="secondary" className="cmp-igdbsearchmodal__shrink-0">
                          {platform?.name ?? slug}
                        </Badge>
                        <span className="page-settings__path-text">{dirPath}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="page-settings__remove-path-button"
                          onClick={() => handleRemovePath(slug)}
                        >
                          <Trash2 className="page-games-game__height-3-5-width-3-5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="page-settings__path-form-grid">
                <div className="app-common__stack-xs">
                  <Label className="app-common__text-xs">Platform</Label>
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
                <div className="app-common__stack-xs">
                  <Label className="app-common__text-xs">Directory path</Label>
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
                  <Plus className="page-settings__height-4-width-4-margin-right-1" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="cmp-appsidebar__flex-gap-2-items-center">
                <EyeOff className="cmp-pathbrowser__height-5-width-5" />
                Platform Visibility
              </CardTitle>
              <CardDescription>
                Hide platforms from the Platforms page. {hiddenCount} currently hidden.
              </CardDescription>
            </CardHeader>
            <CardContent className="page-auth-login__space-y-4">
              <div className="page-settings__platform-filter-row">
                <Input
                  value={platformSearch}
                  onChange={(event) => setPlatformSearch(event.target.value)}
                  placeholder="Search platforms..."
                />
                <Select
                  value={platformCategory}
                  onValueChange={(value) => setPlatformCategory(value as PlatformCategoryFilter)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="consoles">Consoles</SelectItem>
                    <SelectItem value="handhelds">Handhelds</SelectItem>
                    <SelectItem value="computers">Computers</SelectItem>
                    <SelectItem value="arcade">Arcade</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="page-settings__platform-list">
                {filteredVisibilityPlatforms.length === 0 ? (
                  <p className="page-settings__platform-list-empty">No platforms match the current filter.</p>
                ) : (
                  filteredVisibilityPlatforms.map((platform) => {
                    const isUpdating =
                      updatePlatformVisibilityMutation.isPending &&
                      updatePlatformVisibilityMutation.variables?.platformId === platform.id;

                    return (
                      <div key={platform.id} className="page-settings__platform-row">
                        <div className="app-common__stack-xs">
                          <p className="page-settings__platform-name">{platform.name}</p>
                          <p className="page-settings__platform-meta">{platform.slug}</p>
                        </div>

                        <div className="page-settings__platform-controls">
                          <Badge variant={platform.hidden ? "secondary" : "outline"}>
                            {platform.hidden ? "Hidden" : "Visible"}
                          </Badge>
                          <Switch
                            checked={platform.hidden}
                            disabled={isUpdating}
                            aria-label={platform.hidden ? "Show platform" : "Hide platform"}
                            onCheckedChange={(checked) => {
                              updatePlatformVisibilityMutation.mutate({
                                platformId: platform.id,
                                hidden: checked,
                              });
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="cmp-appsidebar__flex-gap-2-items-center">
                <RefreshCw className="cmp-pathbrowser__height-5-width-5" />
                Library Scan
              </CardTitle>
              <CardDescription>
                Manually trigger a scan to import new ROM files from the configured paths.
              </CardDescription>
            </CardHeader>
            <CardContent className="page-auth-login__space-y-4">
              <div className="cmp-header__flex-gap-4-items-center">
                <Button
                  onClick={() => scanMutation.mutate()}
                  disabled={scanMutation.isPending || scanStatus?.running}
                >
                  <RefreshCw
                    className={
                      scanStatus?.running
                        ? "page-downloads__spinner"
                        : "page-downloaders__height-4-width-4-margin-right-2"
                    }
                  />
                  {scanStatus?.running ? "Scanning..." : "Scan Now"}
                </Button>
                {scanStatus?.finishedAt && !scanStatus.running && (
                  <p className="page-downloads__muted-text">
                    Last scan: {new Date(scanStatus.finishedAt).toLocaleString()} 
                    {" — "}
                    {scanStatus.added} added, {scanStatus.updated} updated, {scanStatus.skipped} skipped
                  </p>
                )}
              </div>

              {scanStatus?.running && (
                <div className="app-common__stack-xs">
                  <div className="page-settings__progress-row">
                    <span>{scanStatus.currentFile ?? "Scanning..."}</span>
                    <span>
                      {scanStatus.processed} / {scanStatus.total}
                    </span>
                  </div>
                  <Progress
                    className="page-settings__height-2"
                    value={scanStatus.total > 0 ? (scanStatus.processed / scanStatus.total) * 100 : 0}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="page-settings__section">
        <div className="page-settings__section-header">
          <h2 className="page-settings__section-title">Integrations</h2>
          <p className="page-settings__section-description">
            External services used for metadata and indexer management.
          </p>
        </div>

        <div className="page-settings__section-cards">
          <Card>
            <CardHeader>
              <CardTitle className="cmp-appsidebar__flex-gap-2-items-center">
                <Key className="cmp-pathbrowser__height-5-width-5" />
                IGDB API
                {igdbStatus?.working ? (
                  <Badge className="page-settings__health-ok-badge">
                    <CheckCircle2 className="page-games-game__height-3-width-3-margin-right-1" />
                    Connected
                  </Badge>
                ) : igdbStatus && !igdbStatus.working ? (
                  <Badge className="page-settings__health-error-badge">
                    <XCircle className="page-games-game__height-3-width-3-margin-right-1" />
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
                  className="page-settings__underline"
                >
                  Twitch Developer Portal
                </a>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="cmp-loadingfallback__space-y-3">
              <div className="page-downloaders__grid-gap-3-grid-cols-2">
                <div className="app-common__stack-xs">
                  <Label>Client ID</Label>
                  <Input
                    value={igdbClientId}
                    onChange={(e) => setIgdbClientId(e.target.value)}
                    placeholder="Twitch Client ID"
                  />
                </div>
                <div className="app-common__stack-xs">
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    value={igdbClientSecret}
                    onChange={(e) => setIgdbClientSecret(e.target.value)}
                    placeholder={settings.igdb_client_secret ? "••••••••" : "Twitch Client Secret"}
                  />
                </div>
              </div>
              <Button onClick={handleSaveIgdb} disabled={saveSettingsMutation.isPending} size="sm">
                Save IGDB Settings
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="cmp-appsidebar__flex-gap-2-items-center">
                <Settings2 className="cmp-pathbrowser__height-5-width-5" />
                Prowlarr
              </CardTitle>
              <CardDescription>
                Connect to your Prowlarr instance for indexer management.
              </CardDescription>
            </CardHeader>
            <CardContent className="cmp-loadingfallback__space-y-3">
              <div className="page-downloaders__grid-gap-3-grid-cols-2">
                <div className="app-common__stack-xs">
                  <Label>Prowlarr URL</Label>
                  <Input
                    value={prowlarrUrl}
                    onChange={(e) => setProwlarrUrl(e.target.value)}
                    placeholder="http://prowlarr:9696"
                  />
                  <p className="cmp-appsidebar__muted-xs">
                    In Docker, use the container name (e.g. <code>http://prowlarr:9696</code>), not an
                    IP address.
                  </p>
                </div>
                <div className="app-common__stack-xs">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={prowlarrApiKey}
                    onChange={(e) => setProwlarrApiKey(e.target.value)}
                    placeholder={settings.prowlarr_api_key ? "••••••••" : "Prowlarr API key"}
                  />
                </div>
              </div>
              <Button onClick={handleSaveProwlarr} disabled={saveSettingsMutation.isPending} size="sm">
                Save Prowlarr Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="page-settings__section">
        <div className="page-settings__section-header">
          <h2 className="page-settings__section-title">System</h2>
          <p className="page-settings__section-description">Diagnostics and troubleshooting tools.</p>
        </div>

        <div className="page-settings__section-cards">
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
      </section>
    </div>
  );
}
