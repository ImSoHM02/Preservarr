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
    g.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const existingIgdbIds = useMemo(
    () => new Set(games?.map((g) => g.igdbId).filter((id): id is number => id !== null) ?? []),
    [games]
  );

  if (platformLoading) {
    return (
      <div className="page-platforms-platform__padding-6-space-y-4">
        <Skeleton className="page-platforms-platform__height-8-width-48" />
        <div className="page-platforms-platform__game-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="page-platforms-platform__aspect-3-4-rounded-lg" />
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
        return "page-games-game__badge-success";
      case "wanted":
        return "page-platforms-platform__status-released";
      case "searching":
        return "page-platforms-platform__status-unreleased";
      case "downloading":
        return "page-platforms-platform__status-repack";
      default:
        return "";
    }
  };

  return (
    <div className="page-platforms-platform__page">
      <div className="app-common__row-gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/platforms")}>
          <ArrowLeft className="cmp-searchbar__height-4-width-4" />
        </Button>
        <div className="cmp-appsidebar__flex-1">
          <h2 className="page-platforms-index__text-lg-font-semibold">{platform.name}</h2>
          <p className="page-downloads__muted-text">
            {platform.gameCount} game{platform.gameCount !== 1 ? "s" : ""} in library
          </p>
        </div>
      </div>

      <div className="app-common__row-gap-3">
        <div className="page-platforms-platform__max-width-sm-flex-1-relative">
          <Search className="cmp-igdbsearchmodal__input-icon" />
          <Input
            placeholder="Filter games..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="cmp-igdbsearchmodal__padding-left-9"
          />
        </div>
        <Button onClick={() => setIgdbModalOpen(true)}>
          <Plus className="page-downloaders__height-4-width-4-margin-right-2" />
          Add Games
        </Button>
      </div>

      {gamesLoading ? (
        <div className="page-platforms-platform__game-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="page-platforms-platform__aspect-3-4-rounded-lg" />
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
        <div className="page-platforms-platform__game-grid">
          {filteredGames.map((game) => (
            <Card
              key={game.id}
              className="page-platforms-platform__game-card-selected hover-elevate active-elevate-2"
              onClick={() => navigate(`/games/${game.id}`)}
            >
              <div className="page-platforms-platform__game-cover">
                {game.coverUrl ? (
                  <img
                    src={game.coverUrl}
                    alt={game.title}
                    className="cmp-igdbsearchmodal__cover-image"
                    loading="lazy"
                  />
                ) : (
                  <div className="cmp-igdbsearchmodal__center-content">
                    <Gamepad2 className="page-platforms-platform__placeholder-icon" />
                  </div>
                )}
                {game.wanted && (
                  <Badge
                    className={`page-platforms-platform__status-badge ${statusColor(game.wanted.status)}`}
                  >
                    {game.wanted.status}
                  </Badge>
                )}
                {game.fileCount > 0 && (
                  <Badge variant="secondary" className="page-platforms-platform__file-count-badge">
                    {game.fileCount} file{game.fileCount !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <CardContent className="page-platforms-platform__padding-3">
                <h4 className="page-platforms-platform__game-title">{game.title}</h4>
                {game.releaseDate && (
                  <p className="page-platforms-platform__release-date">
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
