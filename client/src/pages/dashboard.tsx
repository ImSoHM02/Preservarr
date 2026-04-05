import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Gamepad2,
  HardDrive,
  Download,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type PlatformWithCount = {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
  gameCount: number;
};

export default function DashboardPage() {
  const [, navigate] = useLocation();

  const { data: platforms, isLoading } = useQuery<PlatformWithCount[]>({
    queryKey: ["/api/platforms"],
  });

  const enabledPlatforms = platforms?.filter((p) => p.enabled) ?? [];
  const totalGames = enabledPlatforms.reduce(
    (sum, p) => sum + p.gameCount,
    0,
  );
  const activePlatforms = enabledPlatforms.filter(
    (p) => p.gameCount > 0,
  );

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Platforms"
          value={isLoading ? null : enabledPlatforms.length}
          subtitle="enabled"
          icon={Gamepad2}
        />
        <StatCard
          title="Games"
          value={isLoading ? null : totalGames}
          subtitle="in library"
          icon={HardDrive}
        />
        <StatCard
          title="Wanted"
          value={isLoading ? null : 0}
          subtitle="pending"
          icon={Clock}
        />
        <StatCard
          title="Downloads"
          value={isLoading ? null : 0}
          subtitle="completed"
          icon={Download}
        />
      </div>

      {/* Platform overview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-sm font-medium">
            Platform Overview
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => navigate("/platforms")}
          >
            View all <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="pb-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : enabledPlatforms.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No platforms configured yet.
            </p>
          ) : (
            <div className="space-y-1">
              {enabledPlatforms.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => navigate(`/platforms/${platform.slug}`)}
                  className="flex items-center justify-between w-full rounded-md px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                    <span>{platform.name}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {platform.gameCount} game
                    {platform.gameCount !== 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: number | null;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            {value !== null ? (
              <p className="text-2xl font-bold mt-1">{value}</p>
            ) : (
              <Skeleton className="h-8 w-12 mt-1" />
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className="bg-primary/10 p-2.5 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
