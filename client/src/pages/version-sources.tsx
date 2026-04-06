import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage, getApiErrorDescription } from "@/lib/api-errors";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  FileCheck,
  Upload,
  Trash2,
  RefreshCw,
  Info,
  ExternalLink,
  CheckCircle,
  Download,
  Loader2,
  Gamepad2,
} from "lucide-react";
import { useRef, useState } from "react";

interface Platform {
  id: number;
  name: string;
  slug: string;
  versionSource: string;
  existingSource: VersionSource | null;
}

interface VersionSource {
  id: number;
  platformId: number;
  sourceType: string;
  filePath: string | null;
  lastSyncedAt: string | null;
  entryCount: number | null;
  platform?: { id: number; name: string; slug: string } | null;
}

interface UploadResult {
  source: VersionSource;
  parsed: { name: string; description: string; entryCount: number };
  matched: { total: number; matched: number; unmatched: number };
}

interface TitledbStatus {
  synced: boolean;
  platform: { id: number; name: string; slug: string } | null;
  source?: VersionSource;
  entryCount?: number;
}

interface TitledbSyncResult {
  entryCount: number;
  updated: number;
  outdated: number;
}

export default function VersionSourcesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const [titledbRegion, setTitledbRegion] = useState("US");
  const [titledbSyncing, setTitledbSyncing] = useState(false);
  const [titledbResult, setTitledbResult] = useState<TitledbSyncResult | null>(null);

  const { data: titledbStatus } = useQuery<TitledbStatus>({
    queryKey: ["titledb-status"],
    queryFn: () =>
      apiRequest("GET", "/api/version-sources/titledb/status").then((r) => r.json()),
  });

  const { data: titledbRegions = [] } = useQuery<string[]>({
    queryKey: ["titledb-regions"],
    queryFn: () =>
      apiRequest("GET", "/api/version-sources/titledb/regions").then((r) => r.json()),
  });

  const handleTitledbSync = async () => {
    setTitledbSyncing(true);
    setTitledbResult(null);
    try {
      const res = await apiRequest("POST", "/api/version-sources/titledb/sync", {
        region: titledbRegion,
      });
      const result: TitledbSyncResult = await res.json();
      setTitledbResult(result);
      queryClient.invalidateQueries({ queryKey: ["titledb-status"] });
      queryClient.invalidateQueries({ queryKey: ["version-sources"] });
      toast({
        title: "titledb synced",
        description: `${result.entryCount.toLocaleString()} titles loaded, ${result.outdated} with updates available`,
      });
    } catch (error) {
      toast({
        title: getApiErrorMessage(error, "titledb sync failed"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      });
    } finally {
      setTitledbSyncing(false);
    }
  };

  const handleTitledbRecheck = async () => {
    try {
      const res = await apiRequest("POST", "/api/version-sources/titledb/check");
      const result = await res.json();
      toast({
        title: "Version check complete",
        description: `${result.updated} files checked, ${result.outdated} outdated`,
      });
    } catch (error) {
      toast({
        title: getApiErrorMessage(error, "Version check failed"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      });
    }
  };

  const { data: platforms = [] } = useQuery<Platform[]>({
    queryKey: ["version-sources-platforms"],
    queryFn: () =>
      apiRequest("GET", "/api/version-sources/platforms").then((r) => r.json()),
  });

  const { data: sources = [], isLoading } = useQuery<VersionSource[]>({
    queryKey: ["version-sources"],
    queryFn: () =>
      apiRequest("GET", "/api/version-sources").then((r) => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/version-sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["version-sources"] });
      queryClient.invalidateQueries({ queryKey: ["version-sources-platforms"] });
      toast({ title: "Version source removed" });
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to delete"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const rematchMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/version-sources/${id}/rematch`).then((r) =>
        r.json()
      ),
    onSuccess: (data: { total: number; matched: number; unmatched: number }) => {
      queryClient.invalidateQueries({ queryKey: ["version-sources"] });
      toast({
        title: "Re-match complete",
        description: `${data.matched} of ${data.total} files matched`,
      });
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Re-match failed"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPlatformId) return;

    setUploading(true);
    setLastResult(null);

    try {
      const content = await file.text();
      const res = await apiRequest("POST", "/api/version-sources/upload", {
        platformId: parseInt(selectedPlatformId),
        content,
        filename: file.name,
      });
      const result: UploadResult = await res.json();
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ["version-sources"] });
      queryClient.invalidateQueries({ queryKey: ["version-sources-platforms"] });
      toast({
        title: "DAT file imported",
        description: `${result.parsed.entryCount} entries parsed, ${result.matched.matched} files matched`,
      });
    } catch (error) {
      toast({
        title: getApiErrorMessage(error, "Failed to import DAT file"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Version Sources</h1>
          <p className="text-muted-foreground mt-1">
            Sync titledb for Switch version tracking, or import No-Intro and Redump DAT
            files to enable ROM verification for retro platforms.
          </p>
        </div>

        {/* titledb (Nintendo Switch) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5" />
              Nintendo Switch — titledb
              {titledbStatus?.synced && (
                <Badge variant="default" className="ml-2">Synced</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Sync the community-maintained{" "}
              <a
                href="https://github.com/blawar/titledb"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline inline-flex items-center gap-1"
              >
                titledb
                <ExternalLink className="h-3 w-3" />
              </a>{" "}
              database to track Switch game versions, updates, and DLC. This runs automatically every day at 02:00.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium">Region</label>
                <Select value={titledbRegion} onValueChange={setTitledbRegion}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {titledbRegions.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleTitledbSync} disabled={titledbSyncing}>
                {titledbSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {titledbSyncing ? "Syncing..." : "Sync Now"}
              </Button>
              {titledbStatus?.synced && (
                <Button variant="outline" onClick={handleTitledbRecheck}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-check Versions
                </Button>
              )}
            </div>

            {titledbStatus?.synced && titledbStatus.source && (
              <div className="text-sm text-muted-foreground space-x-3">
                <span>{(titledbStatus.entryCount ?? 0).toLocaleString()} titles</span>
                <span>|</span>
                <span>Last synced: {formatDate(titledbStatus.source.lastSyncedAt)}</span>
              </div>
            )}

            {titledbResult && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">Sync complete</p>
                  <p className="text-sm">
                    {titledbResult.entryCount.toLocaleString()} titles loaded.{" "}
                    {titledbResult.updated > 0 ? (
                      <>
                        {titledbResult.updated} game files checked —{" "}
                        {titledbResult.outdated > 0 ? (
                          <strong>{titledbResult.outdated} with updates available.</strong>
                        ) : (
                          "all up to date."
                        )}
                      </>
                    ) : (
                      "No Switch game files with Title IDs to check yet."
                    )}
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Instructions */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p className="font-medium">How to get DAT files</p>
            <p className="text-sm">
              DAT files contain checksums for every known verified ROM dump.
              After importing a DAT, Preservarr can verify your ROM files and
              detect when newer revisions are available.
            </p>
            <div className="text-sm space-y-1 mt-2">
              <p>
                <strong>No-Intro</strong> (cartridge-based systems: GBA, SNES,
                N64, DS, etc.)
              </p>
              <ol className="list-decimal list-inside ml-2 space-y-0.5">
                <li>
                  Go to{" "}
                  <a
                    href="https://datomatic.no-intro.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline inline-flex items-center gap-1"
                  >
                    datomatic.no-intro.org
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Create a free account and log in</li>
                <li>
                  Navigate to <strong>Download</strong> and select the system
                  (e.g. "Nintendo - Game Boy Advance")
                </li>
                <li>
                  Choose <strong>Standard DAT</strong> format and download the
                  XML file
                </li>
              </ol>
            </div>
            <div className="text-sm space-y-1 mt-2">
              <p>
                <strong>Redump</strong> (disc-based systems: PS1, PS2,
                Dreamcast, etc.)
              </p>
              <ol className="list-decimal list-inside ml-2 space-y-0.5">
                <li>
                  Go to{" "}
                  <a
                    href="http://redump.org/downloads/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline inline-flex items-center gap-1"
                  >
                    redump.org/downloads
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  Find the system you want (e.g. "Sony - PlayStation") and
                  download the DAT file
                </li>
              </ol>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              DAT files are typically updated monthly. Re-import to check for
              new revisions.
            </p>
          </AlertDescription>
        </Alert>

        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import DAT File
            </CardTitle>
            <CardDescription>
              Select a platform and upload its No-Intro or Redump DAT file
              (.dat/.xml). If a DAT already exists for the platform, it will be
              replaced.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Platform</label>
                <Select
                  value={selectedPlatformId}
                  onValueChange={setSelectedPlatformId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a platform..." />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                        <span className="text-muted-foreground ml-2">
                          ({p.versionSource})
                        </span>
                        {p.existingSource && (
                          <span className="text-muted-foreground ml-1">
                            — has DAT
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".dat,.xml"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedPlatformId || uploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? "Importing..." : "Upload DAT"}
                </Button>
              </div>
            </div>

            {lastResult && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">Import successful</p>
                  <p className="text-sm">
                    <strong>{lastResult.parsed.name}</strong>:{" "}
                    {lastResult.parsed.entryCount.toLocaleString()} entries
                    imported.{" "}
                    {lastResult.matched.total > 0 ? (
                      <>
                        {lastResult.matched.matched} of{" "}
                        {lastResult.matched.total} library files matched.
                      </>
                    ) : (
                      "No library files to match against yet."
                    )}
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Imported sources */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Imported DAT Files</h2>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : sources.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No DAT files imported yet.</p>
                <p className="text-sm mt-1">
                  Upload a DAT file above to enable version tracking for a
                  platform.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sources.map((source) => (
                <Card key={source.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {source.platform?.name ?? `Platform #${source.platformId}`}
                          </span>
                          <Badge variant="outline">{source.sourceType}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-x-3">
                          <span>
                            {(source.entryCount ?? 0).toLocaleString()} entries
                          </span>
                          <span>|</span>
                          <span>File: {source.filePath ?? "—"}</span>
                          <span>|</span>
                          <span>
                            Imported: {formatDate(source.lastSyncedAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rematchMutation.mutate(source.id)}
                          disabled={rematchMutation.isPending}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Re-match
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteMutation.mutate(source.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
