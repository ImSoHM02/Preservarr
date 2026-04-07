import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Search, Plus, Check, Gamepad2, Loader2 } from "lucide-react";

type IgdbResult = {
  igdbId: number;
  name: string;
  summary: string | null;
  coverUrl: string | null;
  releaseDate: string | null;
  rating: number | null;
  platforms: { id: number; name: string }[];
  genres: string[];
};

interface IgdbSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platformId: number;
  platformName: string;
  existingIgdbIds: Set<number>;
}

export default function IgdbSearchModal({
  open,
  onOpenChange,
  platformId,
  platformName,
  existingIgdbIds,
}: IgdbSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IgdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await apiRequest(
        "GET",
        `/api/igdb/search?q=${encodeURIComponent(query.trim())}&platformId=${platformId}`
      );
      const data = await res.json();
      setResults(data);
    } catch {
      toast({
        title: "Search failed",
        description: "Could not search IGDB. Check your credentials in Settings.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async (igdbId: number) => {
      const res = await apiRequest("POST", "/api/igdb/import", { igdbId, platformId });
      return res.json();
    },
    onSuccess: (_data, igdbId) => {
      setImportedIds((prev) => new Set(prev).add(igdbId));
      queryClient.invalidateQueries({ queryKey: [`/api/games?platformId=${platformId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/platforms`] });
      toast({ title: "Game added", description: "Successfully imported from IGDB." });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const isAlreadyAdded = (igdbId: number) => existingIgdbIds.has(igdbId) || importedIds.has(igdbId);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cmp-igdbsearchmodal__dialog-content">
        <DialogHeader>
          <DialogTitle>Add Games — {platformName}</DialogTitle>
        </DialogHeader>

        <div className="cmp-igdbsearchmodal__flex-gap-2">
          <div className="cmp-igdbsearchmodal__flex-1-relative">
            <Search className="cmp-igdbsearchmodal__input-icon" />
            <Input
              placeholder="Search IGDB for games..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="cmp-igdbsearchmodal__padding-left-9"
              autoFocus
            />
          </div>
          <Button onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="cmp-igdbsearchmodal__height-4-width-4-animate-spin" /> : "Search"}
          </Button>
        </div>

        <ScrollArea className="cmp-igdbsearchmodal__min-height-0-flex-1">
          {searching ? (
            <div className="cmp-igdbsearchmodal__padding-y-2-space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="cmp-igdbsearchmodal__flex-gap-3-items-start">
                  <Skeleton className="cmp-igdbsearchmodal__result-thumb" />
                  <div className="cmp-igdbsearchmodal__flex-1-space-y-2">
                    <Skeleton className="cmp-igdbsearchmodal__height-4-width-48" />
                    <Skeleton className="cmp-igdbsearchmodal__height-3-width-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="cmp-igdbsearchmodal__padding-y-2-space-y-1">
              {results.map((game) => {
                const added = isAlreadyAdded(game.igdbId);
                const importing =
                  importMutation.isPending && importMutation.variables === game.igdbId;

                return (
                  <div key={game.igdbId} className="cmp-igdbsearchmodal__result-card">
                    <div className="cmp-igdbsearchmodal__thumb-empty">
                      {game.coverUrl ? (
                        <img
                          src={game.coverUrl}
                          alt={game.name}
                          className="cmp-igdbsearchmodal__cover-image"
                          loading="lazy"
                        />
                      ) : (
                        <div className="cmp-igdbsearchmodal__center-content">
                          <Gamepad2 className="cmp-igdbsearchmodal__icon-muted" />
                        </div>
                      )}
                    </div>

                    <div className="cmp-igdbsearchmodal__min-width-0-flex-1">
                      <p className="cmp-igdbsearchmodal__result-title">{game.name}</p>
                      <div className="cmp-igdbsearchmodal__meta-row">
                        {game.releaseDate && (
                          <span className="cmp-appsidebar__muted-xs">
                            {new Date(game.releaseDate).getFullYear()}
                          </span>
                        )}
                        {game.rating && (
                          <span className="cmp-appsidebar__muted-xs">{game.rating}%</span>
                        )}
                      </div>
                      {game.genres.length > 0 && (
                        <div className="cmp-igdbsearchmodal__result-tags">
                          {game.genres.slice(0, 3).map((g) => (
                            <Badge
                              key={g}
                              variant="secondary"
                              className="cmp-igdbsearchmodal__text-10px-padding-x-1-5-padding-y-0"
                            >
                              {g}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant={added ? "ghost" : "default"}
                      disabled={added || importing}
                      onClick={() => importMutation.mutate(game.igdbId)}
                      className="cmp-igdbsearchmodal__shrink-0"
                    >
                      {added ? (
                        <>
                          <Check className="cmp-igdbsearchmodal__height-3-5-width-3-5-margin-right-1" />
                          Added
                        </>
                      ) : importing ? (
                        <Loader2 className="cmp-igdbsearchmodal__inline-spinner" />
                      ) : (
                        <>
                          <Plus className="cmp-igdbsearchmodal__height-3-5-width-3-5-margin-right-1" />
                          Add
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : query && !searching ? (
            <div className="cmp-igdbsearchmodal__empty-state">
              No results found. Try a different search term.
            </div>
          ) : (
            <div className="cmp-igdbsearchmodal__empty-state">
              Search IGDB to find and add games to {platformName}.
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
