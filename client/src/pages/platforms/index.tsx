import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Gamepad2 } from "lucide-react";
import { useTheme } from "next-themes";
import EmptyState from "@/components/EmptyState";
import { getPlatformIconSrc } from "@/lib/platform-icons";
import { PLATFORM_CATALOG_BY_SLUG, type PlatformImageCategory } from "@shared/platform-catalog";

type PlatformWithCount = {
  id: number;
  name: string;
  slug: string;
  fileExtensions: string[];
  namingStandard: string;
  versionSource: string;
  enabled: boolean;
  hidden: boolean;
  torznabCategories: string;
  igdbPlatformId: number | null;
  gameCount: number;
};

type PlatformWithMeta = PlatformWithCount & { category: PlatformImageCategory | "unknown" };
type PlatformCategoryFilter = "all" | PlatformImageCategory | "unknown";

export default function PlatformsPage() {
  const [, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isLightTheme = resolvedTheme === "light";
  const [categoryFilter, setCategoryFilter] = useState<PlatformCategoryFilter>("all");

  const { data: platforms, isLoading } = useQuery<PlatformWithCount[]>({
    queryKey: ["/api/platforms"],
    queryFn: () => apiRequest("GET", "/api/platforms").then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="page-platforms-index__padding-6">
        <div className="page-platforms-index__platform-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="page-platforms-index__height-32-rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!platforms || platforms.length === 0) {
    return (
      <EmptyState
        icon={Gamepad2}
        title="No Platforms"
        description="No platforms have been configured yet. Check your database migrations."
      />
    );
  }

  const platformsWithMeta = useMemo<PlatformWithMeta[]>(() => {
    return platforms.map((platform) => {
      const catalogEntry = PLATFORM_CATALOG_BY_SLUG.get(platform.slug);
      return {
        ...platform,
        category: catalogEntry?.category ?? "unknown",
      };
    });
  }, [platforms]);

  const filteredPlatforms = platformsWithMeta.filter(
    (platform) =>
      !platform.hidden && (categoryFilter === "all" || platform.category === categoryFilter)
  );

  const enabled = filteredPlatforms.filter((p) => p.enabled);
  const disabled = filteredPlatforms.filter((p) => !p.enabled);
  const hiddenCount = platformsWithMeta.filter((p) => p.hidden).length;

  const renderPlatformCard = (platform: PlatformWithMeta) => {
    const iconSrc = getPlatformIconSrc(platform.slug, isLightTheme);

    return (
      <Card
        key={platform.id}
        className="page-platforms-index__platform-card-hover hover-elevate active-elevate-2"
        onClick={() => navigate(`/platforms/${platform.slug}`)}
      >
        <CardContent className="page-platforms-index__card-content">
          <div className="page-platforms-index__logo-wrap">
            {iconSrc ? (
              <img
                src={iconSrc}
                alt={`${platform.name} icon`}
                className="page-platforms-index__platform-logo"
                loading="lazy"
              />
            ) : (
              <Gamepad2 className="page-dashboard__stat-icon" />
            )}
          </div>
          <p className="page-platforms-index__games-count">
            {platform.gameCount} game{platform.gameCount === 1 ? "" : "s"}
          </p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="page-dashboard__container">
      <div className="page-dashboard__stat-row">
        <div>
          <h2 className="page-platforms-index__text-lg-font-semibold">
            {enabled.length} Platform{enabled.length !== 1 ? "s" : ""} Active
          </h2>
          <p className="page-downloads__muted-text">Select a platform to browse its game library</p>
        </div>
      </div>

      <div className="page-platforms-index__manager-bar">
        <div className="page-platforms-index__manager-controls">
          <Select
            value={categoryFilter}
            onValueChange={(value) => setCategoryFilter(value as PlatformCategoryFilter)}
          >
            <SelectTrigger className="page-platforms-index__manager-select">
              <SelectValue placeholder="Filter by category" />
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

        <div className="page-platforms-index__selection-actions">
          <p className="page-platforms-index__manager-meta">{hiddenCount} hidden in settings</p>
          <Button type="button" size="sm" variant="outline" onClick={() => navigate("/settings")}>
            Manage Visibility
          </Button>
        </div>
      </div>

      <div className="page-platforms-index__platform-grid">{enabled.map(renderPlatformCard)}</div>

      {disabled.length > 0 && (
        <>
          <h3 className="page-platforms-index__disabled-title">Disabled Platforms</h3>
          <div className="page-platforms-index__disabled-grid">
            {disabled.map(renderPlatformCard)}
          </div>
        </>
      )}
    </div>
  );
}
