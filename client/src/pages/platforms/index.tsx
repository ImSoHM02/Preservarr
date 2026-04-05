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
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
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
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {enabled.length} Platform{enabled.length !== 1 ? "s" : ""} Active
          </h2>
          <p className="text-sm text-muted-foreground">
            Select a platform to browse its game library
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {enabled.map((platform) => (
          <Card
            key={platform.id}
            className="cursor-pointer transition-colors hover:bg-accent/50"
            onClick={() => navigate(`/platforms/${platform.slug}`)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="bg-primary/10 p-2.5 rounded-lg">
                  <Gamepad2 className="h-5 w-5 text-primary" />
                </div>
                {platform.gameCount > 0 && (
                  <Badge variant="secondary">{platform.gameCount} games</Badge>
                )}
              </div>
              <h3 className="font-semibold text-sm">{platform.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {platform.fileExtensions
                  .map((ext) => `.${ext}`)
                  .join(", ")}
              </p>
              <div className="flex gap-1.5 mt-2">
                {platform.versionSource !== "none" && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {platform.versionSource}
                  </Badge>
                )}
                {platform.namingStandard !== "none" && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
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
          <h3 className="text-sm font-medium text-muted-foreground pt-2">
            Disabled Platforms
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-50">
            {disabled.map((platform) => (
              <Card
                key={platform.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => navigate(`/platforms/${platform.slug}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="bg-muted p-2.5 rounded-lg">
                      <Gamepad2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-sm">{platform.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Disabled
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
