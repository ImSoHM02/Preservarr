import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Gamepad2,
  HardDrive,
  Calendar,
  Globe,
  Tag,
  FileBox,
  Search,
  Heart,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";

// ─── Types ────────────────────────────────────────────────────

type GameFile = {
  id: number;
  filename: string;
  path: string;
  sizeBytes: number | null;
  fileFormat: string | null;
  versionStatus: string;
  knownVersion: string | null;
  latestVersion: string | null;
};

type Platform = {
  id: number;
  name: string;
  slug: string;
};

type GameDetail = {
  id: number;
  title: string;
  igdbId: number | null;
  coverUrl: string | null;
  description: string | null;
  region: string | null;
  releaseDate: string | null;
  genres: string[] | null;
  alternateNames: string[] | null;
  titleId: string | null;
  platformId: number;
  platform: Platform | null;
  files: GameFile[];
  wanted: { status: string; monitored: boolean } | null;
};

type SearchResult = {
  title: string;
  link: string;
  size: number;
  seeders: number;
  leechers: number;
  category: string;
  indexerId: number;
  indexerName: string;
  score: number;
  pubDate: string;
};

// ─── Helpers ──────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function versionBadgeColor(status: string) {
  switch (status) {
    case "current":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "outdated":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    default:
      return "bg-gray-500/10 text-gray-400 border-gray-500/20";
  }
}

function scoreBadgeColor(score: number) {
  if (score >= 70) return "bg-green-500/10 text-green-500 border-green-500/20";
  if (score >= 40) return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-red-500/10 text-red-400 border-red-500/20";
}

type DownloadClient = {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
};

// ─── Search Results Dialog ────────────────────────────────────

function SearchResultsDialog({
  open,
  onClose,
  gameTitle,
  gameId,
  initialResults,
  stageUsed,
  searchErrors,
}: {
  open: boolean;
  onClose: () => void;
  gameTitle: string;
  gameId: number;
  initialResults: SearchResult[];
  stageUsed: string | null;
  searchErrors: string[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [manualQuery, setManualQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [results, setResults] = useState(initialResults);
  const [stage, setStage] = useState(stageUsed);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [sendingLink, setSendingLink] = useState<string | null>(null);

  const { data: clients = [] } = useQuery<DownloadClient[]>({
    queryKey: ["/api/download-clients"],
    enabled: open,
  });

  const enabledClients = clients.filter((c) => c.enabled);

  // Auto-select the only client when there's exactly one
  const effectiveClientId =
    selectedClientId ||
    (enabledClients.length === 1 ? String(enabledClients[0].id) : "");

  const researchMutation = useMutation({
    mutationFn: (query: string) =>
      apiRequest("POST", `/api/games/${gameId}/search`, { query: query || undefined }).then(
        (r) => r.json(),
      ),
    onSuccess: (data) => {
      setResults(data.results);
      setStage(data.stageUsed);
    },
    onError: () => toast({ title: "Search failed", variant: "destructive" }),
  });

  const handleSendToClient = async (result: SearchResult) => {
    if (!effectiveClientId) {
      toast({ title: "Select a download client first", variant: "destructive" });
      return;
    }
    setSendingLink(result.link);
    try {
      const resp = await apiRequest("POST", `/api/download-clients/${effectiveClientId}/add`, {
        url: result.link,
        title: result.title,
        gameId,
        indexerId: result.indexerId,
        sizeBytes: result.size,
        seeders: result.seeders,
        score: result.score,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed");
      }
      toast({ title: "Sent to download client" });
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}`] });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSendingLink(null);
    }
  };

  const displayed = showAll ? results : results.filter((r) => r.score >= 30);
  const hiddenCount = results.length - displayed.length;

  // Keep dialog-local state aligned with the latest parent search payload.
  useEffect(() => {
    if (!open) return;
    setResults(initialResults);
    setStage(stageUsed);
    setShowAll(false);
  }, [open, initialResults, stageUsed]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Search Results — {gameTitle}</DialogTitle>
        </DialogHeader>

        {/* Manual override + client picker row */}
        <div className="flex gap-2">
          <Input
            placeholder="Override query..."
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && researchMutation.mutate(manualQuery)}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => researchMutation.mutate(manualQuery)}
            disabled={researchMutation.isPending}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {/* Client selector — only shown when multiple clients exist */}
        {enabledClients.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Send to:</span>
            <Select value={effectiveClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Select client..." />
              </SelectTrigger>
              <SelectContent>
                {enabledClients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {enabledClients.length === 0 && (
          <p className="text-xs text-amber-500">
            No download clients configured. Add one in Downloaders settings.
          </p>
        )}

        {stage && (
          <p className="text-xs text-muted-foreground">
            Query used: <span className="font-mono">{stage}</span>
          </p>
        )}

        {searchErrors.length > 0 && (
          <p className="text-xs text-amber-500">
            Indexer errors: {searchErrors.join("; ")}
          </p>
        )}

        {/* Results list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {displayed.length === 0 && !researchMutation.isPending && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No results found. Try a different query.
            </p>
          )}
          {researchMutation.isPending && (
            <p className="text-sm text-muted-foreground text-center py-6">Searching...</p>
          )}
          {displayed.map((r, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-md border p-3 text-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.title}</p>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  <span>{formatBytes(r.size)}</span>
                  <span>{r.seeders} seeds</span>
                  <span>{r.indexerName}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={`text-[10px] ${scoreBadgeColor(r.score)}`}>
                  {r.score}
                </Badge>
                <Button
                  size="sm"
                  variant={effectiveClientId ? "default" : "ghost"}
                  className="h-7 px-2"
                  disabled={sendingLink === r.link}
                  onClick={() => handleSendToClient(r)}
                  title={effectiveClientId ? "Send to download client" : "No client selected"}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs self-start"
            onClick={() => setShowAll(true)}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Show {hiddenCount} low-score result{hiddenCount !== 1 ? "s" : ""}
          </Button>
        )}
        {showAll && results.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs self-start"
            onClick={() => setShowAll(false)}
          >
            <ChevronUp className="h-3 w-3 mr-1" />
            Collapse
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function GamePage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchStage, setSearchStage] = useState<string | null>(null);
  const [searchErrors, setSearchErrors] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);

  const { data: game, isLoading } = useQuery<GameDetail>({
    queryKey: [`/api/games/${id}`],
  });

  const wantedMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/games/${id}/wanted`, { status: "wanted" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${id}`] });
      toast({ title: "Added to wanted list" });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: msg.includes("already") ? "Already in wanted list" : msg, variant: "destructive" });
    },
  });

  const searchMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/games/${id}/search`).then((r) => r.json()),
    onSuccess: (data) => {
      setSearchResults(data.results ?? []);
      setSearchStage(data.stageUsed ?? null);
      setSearchErrors(data.errors ?? []);
      setSearchOpen(true);
    },
    onError: () => toast({ title: "Search failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (opts: { deleteFiles: boolean }) =>
      apiRequest("DELETE", `/api/games/${id}`, { deleteFiles: opts.deleteFiles }),
    onSuccess: () => {
      toast({ title: "Game removed" });
      if (game?.platform) {
        navigate(`/platforms/${game.platform.slug}`);
      } else {
        navigate("/platforms");
      }
    },
    onError: () => toast({ title: "Failed to remove game", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-6">
          <Skeleton className="w-64 aspect-[3/4] rounded-lg" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <EmptyState
        icon={Gamepad2}
        title="Game Not Found"
        description="The requested game could not be found."
        actionLabel="Back to Platforms"
        actionLink="/platforms"
      />
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            game.platform
              ? navigate(`/platforms/${game.platform.slug}`)
              : navigate("/platforms")
          }
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{game.title}</h2>
          {game.platform && (
            <p className="text-sm text-muted-foreground">{game.platform.name}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {!game.wanted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => wantedMutation.mutate()}
              disabled={wantedMutation.isPending}
            >
              <Heart className="h-4 w-4 mr-2" />
              Add to Wanted
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => searchMutation.mutate()}
            disabled={searchMutation.isPending}
          >
            <Search className={`h-4 w-4 mr-2 ${searchMutation.isPending ? "animate-pulse" : ""}`} />
            {searchMutation.isPending ? "Searching..." : "Search"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setDeleteFiles(false);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Cover art */}
        <div className="w-full md:w-64 shrink-0">
          <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted">
            {game.coverUrl ? (
              <img
                src={game.coverUrl}
                alt={game.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Gamepad2 className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          {game.wanted && (
            <Badge className="mt-3 w-full justify-center" variant="outline">
              Status: {game.wanted.status}
            </Badge>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 space-y-4">
          {game.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{game.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {game.releaseDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{new Date(game.releaseDate).toLocaleDateString()}</span>
              </div>
            )}
            {game.region && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>{game.region}</span>
              </div>
            )}
            {game.igdbId && (
              <div className="flex items-center gap-2 text-sm">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span>IGDB: {game.igdbId}</span>
              </div>
            )}
            {game.titleId && (
              <div className="flex items-center gap-2 text-sm">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span>Title ID: {game.titleId}</span>
              </div>
            )}
          </div>

          {game.genres && game.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {game.genres.map((genre) => (
                <Badge key={genre} variant="secondary" className="text-xs">
                  {genre}
                </Badge>
              ))}
            </div>
          )}

          {game.alternateNames && game.alternateNames.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Alternate Names</p>
              <div className="flex flex-wrap gap-1.5">
                {game.alternateNames.map((name) => (
                  <Badge key={name} variant="outline" className="text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Files */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileBox className="h-4 w-4" />
            Files ({game.files.length})
          </CardTitle>
        </CardHeader>
        {game.files.length > 0 ? (
          <CardContent className="py-0 pb-4">
            <div className="space-y-2">
              {game.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{file.filename}</p>
                      <p className="text-xs text-muted-foreground truncate">{file.path}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {file.sizeBytes && (
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(file.sizeBytes)}
                      </span>
                    )}
                    {file.fileFormat && (
                      <Badge variant="outline" className="text-[10px]">
                        {file.fileFormat.toUpperCase()}
                      </Badge>
                    )}
                    <Badge className={`text-[10px] ${versionBadgeColor(file.versionStatus)}`}>
                      {file.versionStatus}
                      {file.knownVersion && ` v${file.knownVersion}`}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        ) : (
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              No files imported yet. Run a library scan or search to find this game.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Search results dialog */}
      {game && (
        <SearchResultsDialog
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          gameTitle={game.title}
          gameId={game.id}
          initialResults={searchResults}
          stageUsed={searchStage}
          searchErrors={searchErrors}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {game.title}?</DialogTitle>
            <DialogDescription>
              This will remove the game from your library and delete all associated
              data (wanted status, download history, search history).
            </DialogDescription>
          </DialogHeader>
          {game.files.length > 0 && (
            <div className="flex items-center gap-2 py-2">
              <Checkbox
                id="delete-files"
                checked={deleteFiles}
                onCheckedChange={(checked) => setDeleteFiles(checked === true)}
              />
              <Label htmlFor="delete-files" className="text-sm">
                Also delete {game.files.length} file{game.files.length !== 1 ? "s" : ""} from disk
              </Label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate({ deleteFiles })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
