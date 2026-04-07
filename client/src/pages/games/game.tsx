import { useEffect, useRef, useState } from "react";
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
      return "page-games-game__badge-success";
    case "outdated":
      return "page-games-game__badge-warning";
    default:
      return "page-games-game__badge-neutral";
  }
}

function scoreBadgeColor(score: number) {
  if (score >= 70) return "page-games-game__badge-success";
  if (score >= 40) return "page-games-game__badge-warning";
  return "page-games-game__badge-error";
}

type DownloadClient = {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
};

const SEARCH_RESULTS_PAGE_SIZE = 25;

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
  const [visibleResultsCount, setVisibleResultsCount] = useState(SEARCH_RESULTS_PAGE_SIZE);
  const resultsListRef = useRef<HTMLDivElement | null>(null);

  const { data: clients = [] } = useQuery<DownloadClient[]>({
    queryKey: ["/api/download-clients"],
    enabled: open,
  });

  const enabledClients = clients.filter((c) => c.enabled);

  // Auto-select the only client when there's exactly one
  const effectiveClientId =
    selectedClientId || (enabledClients.length === 1 ? String(enabledClients[0].id) : "");

  const researchMutation = useMutation({
    mutationFn: (query: string) =>
      apiRequest("POST", `/api/games/${gameId}/search`, { query: query || undefined }).then((r) =>
        r.json()
      ),
    onSuccess: (data) => {
      setResults(data.results);
      setStage(data.stageUsed);
      setVisibleResultsCount(SEARCH_RESULTS_PAGE_SIZE);
      if (resultsListRef.current) {
        resultsListRef.current.scrollTop = 0;
      }
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
  const paginatedResults = displayed.slice(0, visibleResultsCount);

  const handleResultsScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 40;
    if (nearBottom && visibleResultsCount < displayed.length) {
      setVisibleResultsCount((previous) =>
        Math.min(previous + SEARCH_RESULTS_PAGE_SIZE, displayed.length)
      );
    }
  };

  // Keep dialog-local state aligned with the latest parent search payload.
  useEffect(() => {
    if (!open) return;
    setResults(initialResults);
    setStage(stageUsed);
    setShowAll(false);
    setVisibleResultsCount(SEARCH_RESULTS_PAGE_SIZE);
    if (resultsListRef.current) {
      resultsListRef.current.scrollTop = 0;
    }
  }, [open, initialResults, stageUsed]);

  useEffect(() => {
    setVisibleResultsCount(SEARCH_RESULTS_PAGE_SIZE);
    if (resultsListRef.current) {
      resultsListRef.current.scrollTop = 0;
    }
  }, [showAll]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="page-games-game__search-dialog-content">
        <DialogHeader>
          <DialogTitle>Search Results — {gameTitle}</DialogTitle>
        </DialogHeader>

        {/* Manual override + client picker row */}
        <div className="cmp-igdbsearchmodal__flex-gap-2">
          <Input
            placeholder="Override query..."
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && researchMutation.mutate(manualQuery)}
            className="cmp-appsidebar__flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => researchMutation.mutate(manualQuery)}
            disabled={researchMutation.isPending}
          >
            <Search className="cmp-searchbar__height-4-width-4" />
          </Button>
        </div>

        {/* Client selector — only shown when multiple clients exist */}
        {enabledClients.length > 1 && (
          <div className="cmp-appsidebar__flex-gap-2-items-center">
            <span className="page-games-game__sendto-label">Send to:</span>
            <Select value={effectiveClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="page-games-game__text-xs-height-8-flex-1">
                <SelectValue placeholder="Select client..." />
              </SelectTrigger>
              <SelectContent>
                {enabledClients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)} className="app-common__text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {enabledClients.length === 0 && (
          <p className="page-games-game__text-amber-500-text-xs">
            No download clients configured. Add one in Downloaders settings.
          </p>
        )}

        {stage && (
          <p className="cmp-appsidebar__muted-xs">
            Query used: <span className="page-games-game__font-mono">{stage}</span>
          </p>
        )}

        {searchErrors.length > 0 && (
          <p className="page-games-game__text-amber-500-text-xs">Indexer errors: {searchErrors.join("; ")}</p>
        )}

        {/* Results list */}
        <div
          ref={resultsListRef}
          className="page-games-game__results-list"
          onScroll={handleResultsScroll}
        >
          {displayed.length === 0 && !researchMutation.isPending && (
            <p className="page-dashboard__empty-message">No results found. Try a different query.</p>
          )}
          {researchMutation.isPending && <p className="page-dashboard__empty-message">Searching...</p>}
          {paginatedResults.map((r, i) => (
            <div key={i} className="page-games-game__result-row">
              <div className="page-games-game__result-main">
                <p className="page-games-game__font-medium-truncate">{r.title}</p>
                <div className="page-games-game__result-meta">
                  <span>{formatBytes(r.size)}</span>
                  <span>{r.seeders} seeds</span>
                  <span>{r.indexerName}</span>
                </div>
              </div>
              <div className="page-downloaders__actions-row">
                <Badge className={`page-games-game__text-10px ${scoreBadgeColor(r.score)}`}>
                  {r.score}
                </Badge>
                <Button
                  size="sm"
                  variant={effectiveClientId ? "default" : "ghost"}
                  className="page-games-game__height-7-padding-x-2"
                  disabled={sendingLink === r.link}
                  onClick={() => handleSendToClient(r)}
                  title={effectiveClientId ? "Send to download client" : "No client selected"}
                >
                  <Download className="page-games-game__height-3-5-width-3-5" />
                </Button>
              </div>
            </div>
          ))}
          {displayed.length > visibleResultsCount && (
            <p className="page-games-game__results-pagination-hint">Scroll down to load more results…</p>
          )}
        </div>
        {!researchMutation.isPending && displayed.length > 0 && (
          <p className="page-games-game__results-pagination-count">
            Showing {Math.min(visibleResultsCount, displayed.length)} of {displayed.length} results
          </p>
        )}

        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="page-games-game__text-xs-self-start"
            onClick={() => setShowAll(true)}
          >
            <ChevronDown className="page-games-game__height-3-width-3-margin-right-1" />
            Show {hiddenCount} low-score result{hiddenCount !== 1 ? "s" : ""}
          </Button>
        )}
        {showAll && results.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="page-games-game__text-xs-self-start"
            onClick={() => setShowAll(false)}
          >
            <ChevronUp className="page-games-game__height-3-width-3-margin-right-1" />
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchStage, setSearchStage] = useState<string | null>(null);
  const [searchErrors, setSearchErrors] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);

  const { data: game, isLoading } = useQuery<GameDetail>({
    queryKey: [`/api/games/${id}`],
  });

  const searchMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/games/${id}/search`).then((r) => r.json()),
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
      <div className="page-games-game__padding-6-space-y-6">
        <Skeleton className="page-games-game__height-8-width-64" />
        <div className="page-games-game__flex-gap-6">
          <Skeleton className="page-games-game__cover-skeleton" />
          <div className="page-games-game__flex-1-space-y-4">
            <Skeleton className="page-games-game__height-6-width-48" />
            <Skeleton className="page-games-game__height-20-width-full" />
            <Skeleton className="page-games-game__height-6-width-32" />
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
    <div className="page-dashboard__container">
      {/* Header */}
      <div className="app-common__row-gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            game.platform ? navigate(`/platforms/${game.platform.slug}`) : navigate("/platforms")
          }
        >
          <ArrowLeft className="cmp-searchbar__height-4-width-4" />
        </Button>
        <div className="cmp-igdbsearchmodal__min-width-0-flex-1">
          <h2 className="page-games-game__game-title">{game.title}</h2>
          {game.platform && <p className="page-downloads__muted-text">{game.platform.name}</p>}
        </div>
        <div className="page-games-game__flex-gap-2-shrink-0">
          <Button
            size="sm"
            onClick={() => searchMutation.mutate()}
            disabled={searchMutation.isPending}
          >
            <Search
              className={
                searchMutation.isPending
                  ? "page-games-game__pulsing-icon"
                  : "page-downloaders__height-4-width-4-margin-right-2"
              }
            />
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
            <Trash2 className="page-downloaders__height-4-width-4-margin-right-2" />
            Remove
          </Button>
        </div>
      </div>

      <div className="page-games-game__content-layout">
        {/* Cover art */}
        <div className="page-games-game__width-64-width-full-shrink-0">
          <div className="page-games-game__cover-frame">
            {game.coverUrl ? (
              <img src={game.coverUrl} alt={game.title} className="cmp-igdbsearchmodal__cover-image" />
            ) : (
              <div className="cmp-igdbsearchmodal__center-content">
                <Gamepad2 className="page-games-game__placeholder-icon" />
              </div>
            )}
          </div>
          {game.wanted && (
            <Badge className="page-games-game__width-full-justify-center-margin-top-3" variant="outline">
              Status: {game.wanted.status}
            </Badge>
          )}
        </div>

        {/* Details */}
        <div className="page-games-game__flex-1-space-y-4">
          {game.description && <p className="page-games-game__description">{game.description}</p>}

          <div className="page-downloaders__grid-gap-3-grid-cols-2">
            {game.releaseDate && (
              <div className="page-games-game__meta-item">
                <Calendar className="cmp-igdbsearchmodal__icon-muted" />
                <span>{new Date(game.releaseDate).toLocaleDateString()}</span>
              </div>
            )}
            {game.region && (
              <div className="page-games-game__meta-item">
                <Globe className="cmp-igdbsearchmodal__icon-muted" />
                <span>{game.region}</span>
              </div>
            )}
            {game.igdbId && (
              <div className="page-games-game__meta-item">
                <Tag className="cmp-igdbsearchmodal__icon-muted" />
                <span>IGDB: {game.igdbId}</span>
              </div>
            )}
            {game.titleId && (
              <div className="page-games-game__meta-item">
                <Tag className="cmp-igdbsearchmodal__icon-muted" />
                <span>Title ID: {game.titleId}</span>
              </div>
            )}
          </div>

          {game.genres && game.genres.length > 0 && (
            <div className="page-games-game__flex-gap-1-5-flex-wrap">
              {game.genres.map((genre) => (
                <Badge key={genre} variant="secondary" className="app-common__text-xs">
                  {genre}
                </Badge>
              ))}
            </div>
          )}

          {game.alternateNames && game.alternateNames.length > 0 && (
            <div>
              <p className="page-games-game__alt-names-label">Alternate Names</p>
              <div className="page-games-game__flex-gap-1-5-flex-wrap">
                {game.alternateNames.map((name) => (
                  <Badge key={name} variant="outline" className="app-common__text-xs">
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
        <CardHeader className="page-downloaders__padding-y-4">
          <CardTitle className="page-games-game__section-title-row">
            <FileBox className="cmp-searchbar__height-4-width-4" />
            Files ({game.files.length})
          </CardTitle>
        </CardHeader>
        {game.files.length > 0 ? (
          <CardContent className="page-games-game__padding-y-0-padding-bottom-4">
            <div className="cmp-loadingfallback__space-y-2">
              {game.files.map((file) => (
                <div key={file.id} className="page-games-game__file-row">
                  <div className="page-games-game__file-info">
                    <HardDrive className="page-games-game__file-icon" />
                    <div className="page-games-game__min-width-0">
                      <p className="page-games-game__font-medium-truncate">{file.filename}</p>
                      <p className="page-games-game__file-path">{file.path}</p>
                    </div>
                  </div>
                  <div className="page-games-game__file-actions">
                    {file.sizeBytes && (
                      <span className="cmp-appsidebar__muted-xs">
                        {formatBytes(file.sizeBytes)}
                      </span>
                    )}
                    {file.fileFormat && (
                      <Badge variant="outline" className="page-games-game__text-10px">
                        {file.fileFormat.toUpperCase()}
                      </Badge>
                    )}
                    <Badge
                      className={`page-games-game__text-10px ${versionBadgeColor(file.versionStatus)}`}
                    >
                      {file.versionStatus}
                      {file.knownVersion && ` v${file.knownVersion}`}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        ) : (
          <CardContent className="page-downloaders__padding-y-4">
            <p className="page-games-game__empty-text">
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
              This will remove the game from your library and delete all associated data (wanted
              status, download history, search history).
            </DialogDescription>
          </DialogHeader>
          {game.files.length > 0 && (
            <div className="page-games-game__transfer-row">
              <Checkbox
                id="delete-files"
                checked={deleteFiles}
                onCheckedChange={(checked) => setDeleteFiles(checked === true)}
              />
              <Label htmlFor="delete-files" className="page-games-game__text-sm">
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
