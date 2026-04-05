import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      toast({ title: "Search failed", description: "Could not search IGDB. Check your credentials in Settings.", variant: "destructive" });
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

  const isAlreadyAdded = (igdbId: number) =>
    existingIgdbIds.has(igdbId) || importedIds.has(igdbId);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Games — {platformName}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search IGDB for games..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9"
              autoFocus
            />
          </div>
          <Button onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          {searching ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <Skeleton className="w-12 h-16 rounded shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-1 py-2">
              {results.map((game) => {
                const added = isAlreadyAdded(game.igdbId);
                const importing = importMutation.isPending && importMutation.variables === game.igdbId;

                return (
                  <div
                    key={game.igdbId}
                    className="flex gap-3 items-start p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-12 h-16 rounded overflow-hidden bg-muted shrink-0">
                      {game.coverUrl ? (
                        <img
                          src={game.coverUrl}
                          alt={game.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">
                        {game.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {game.releaseDate && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(game.releaseDate).getFullYear()}
                          </span>
                        )}
                        {game.rating && (
                          <span className="text-xs text-muted-foreground">
                            {game.rating}%
                          </span>
                        )}
                      </div>
                      {game.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {game.genres.slice(0, 3).map((g) => (
                            <Badge key={g} variant="secondary" className="text-[10px] px-1.5 py-0">
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
                      className="shrink-0"
                    >
                      {added ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Added
                        </>
                      ) : importing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : query && !searching ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No results found. Try a different search term.
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Search IGDB to find and add games to {platformName}.
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
