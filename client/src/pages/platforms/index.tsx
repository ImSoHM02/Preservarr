import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Gamepad2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";

type PlatformWithCount = {
  id: number;
  name: string;
  slug: string;
  fileExtensions: string[];
  namingStandard: string;
  versionSource: string;
  enabled: boolean;
  torznabCategories: string;
  igdbPlatformId: number | null;
  gameCount: number;
};

const platformIcons: Record<string, string> = {
  switch: "Nintendo Switch",
  n64: "Nintendo 64",
  snes: "SNES",
  gb: "Game Boy",
  gbc: "Game Boy Color",
  gba: "Game Boy Advance",
  nds: "Nintendo DS",
  "3ds": "Nintendo 3DS",
  ps1: "PlayStation",
  ps2: "PlayStation 2",
  psp: "PSP",
  genesis: "Sega Genesis",
  dreamcast: "Dreamcast",
};

export default function PlatformsPage() {
  const [, navigate] = useLocation();

  const { data: platforms, isLoading } = useQuery<PlatformWithCount[]>({
    queryKey: ["/api/platforms"],
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

  const enabled = platforms.filter((p) => p.enabled);
  const disabled = platforms.filter((p) => !p.enabled);

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

      <div className="page-platforms-index__platform-grid">
        {enabled.map((platform) => (
          <Card
            key={platform.id}
            className="page-platforms-index__platform-card-hover hover-elevate active-elevate-2"
            onClick={() => navigate(`/platforms/${platform.slug}`)}
          >
            <CardContent className="page-dashboard__stat-content">
              <div className="page-platforms-index__card-header">
                <div className="page-dashboard__stat-icon-wrap">
                  <Gamepad2 className="page-dashboard__stat-icon" />
                </div>
                {platform.gameCount > 0 && (
                  <Badge variant="secondary">{platform.gameCount} games</Badge>
                )}
              </div>
              <h3 className="page-platforms-index__text-sm-font-semibold">{platform.name}</h3>
              <p className="page-platforms-index__card-subtext">
                {platform.fileExtensions.map((ext) => `.${ext}`).join(", ")}
              </p>
              <div className="page-platforms-index__flex-gap-1-5-margin-top-2">
                {platform.versionSource !== "none" && (
                  <Badge variant="outline" className="cmp-igdbsearchmodal__text-10px-padding-x-1-5-padding-y-0">
                    {platform.versionSource}
                  </Badge>
                )}
                {platform.namingStandard !== "none" && (
                  <Badge variant="outline" className="cmp-igdbsearchmodal__text-10px-padding-x-1-5-padding-y-0">
                    {platform.namingStandard}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {disabled.length > 0 && (
        <>
          <h3 className="page-platforms-index__disabled-title">Disabled Platforms</h3>
          <div className="page-platforms-index__disabled-grid">
            {disabled.map((platform) => (
              <Card
                key={platform.id}
                className="page-platforms-index__platform-card-hover hover-elevate active-elevate-2"
                onClick={() => navigate(`/platforms/${platform.slug}`)}
              >
                <CardContent className="page-dashboard__stat-content">
                  <div className="page-platforms-index__card-header">
                    <div className="page-platforms-index__background-muted-padding-2-5-rounded-lg">
                      <Gamepad2 className="page-platforms-index__platform-icon" />
                    </div>
                  </div>
                  <h3 className="page-platforms-index__text-sm-font-semibold">{platform.name}</h3>
                  <p className="page-platforms-index__card-subtext">Disabled</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
