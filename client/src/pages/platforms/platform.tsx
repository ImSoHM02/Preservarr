import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Gamepad2, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/EmptyState";
import IgdbSearchModal from "@/components/IgdbSearchModal";
import { useState, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Platform = {
  id: number;
  name: string;
  slug: string;
  fileExtensions: string[];
  namingStandard: string;
  versionSource: string;
  enabled: boolean;
  gameCount: number;
};

type Game = {
  id: number;
  title: string;
  igdbId: number | null;
  coverUrl: string | null;
  region: string | null;
  releaseDate: string | null;
  genres: string[] | null;
  platformId: number;
  wanted: { status: string; monitored: boolean } | null;
  fileCount: number;
};

export default function PlatformPage({ slug }: { slug: string }) {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [igdbModalOpen, setIgdbModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: platform, isLoading: platformLoading } = useQuery<Platform>({
    queryKey: [`/api/platforms/${slug}`],
  });

  const { data: games, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: [`/api/games?platformId=${platform?.id}`],
    enabled: !!platform?.id,
  });

  const filteredGames = games?.filter((g) =>
    g.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const existingIgdbIds = useMemo(
    () => new Set(games?.map((g) => g.igdbId).filter((id): id is number => id !== null) ?? []),
    [games],
  );

  if (platformLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!platform) {
    return (
      <EmptyState
        icon={Gamepad2}
        title="Platform Not Found"
        description="The requested platform could not be found."
        actionLabel="Back to Platforms"
        actionLink="/platforms"
      />
    );
  }

  const statusColor = (status: string | undefined) => {
    switch (status) {
      case "owned":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "wanted":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "searching":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "downloading":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default:
        return "";
    }
  };

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/platforms")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{platform.name}</h2>
          <p className="text-sm text-muted-foreground">
            {platform.gameCount} game{platform.gameCount !== 1 ? "s" : ""} in
            library
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter games..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setIgdbModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Games
        </Button>
      </div>

      {gamesLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      ) : !filteredGames || filteredGames.length === 0 ? (
        <EmptyState
          icon={Gamepad2}
          title="No Games Yet"
          description={
            searchQuery
              ? "No games match your filter."
              : "Add games from IGDB or scan your library to populate this platform."
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filteredGames.map((game) => (
            <Card
              key={game.id}
              className="group cursor-pointer overflow-hidden transition-all hover:ring-2 hover:ring-primary/50"
              onClick={() => navigate(`/games/${game.id}`)}
            >
              <div className="aspect-[3/4] relative bg-muted">
                {game.coverUrl ? (
                  <img
                    src={game.coverUrl}
                    alt={game.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Gamepad2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                {game.wanted && (
                  <Badge
                    className={`absolute top-2 right-2 text-[10px] ${statusColor(game.wanted.status)}`}
                  >
                    {game.wanted.status}
                  </Badge>
                )}
                {game.fileCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="absolute bottom-2 right-2 text-[10px]"
                  >
                    {game.fileCount} file{game.fileCount !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <CardContent className="p-3">
                <h4 className="text-xs font-medium leading-tight line-clamp-2">
                  {game.title}
                </h4>
                {game.releaseDate && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(game.releaseDate).getFullYear()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {platform && (
        <IgdbSearchModal
          open={igdbModalOpen}
          onOpenChange={setIgdbModalOpen}
          platformId={platform.id}
          platformName={platform.name}
          existingIgdbIds={existingIgdbIds}
        />
      )}
    </div>
  );
}
