import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gamepad2, HardDrive, Download, Clock, ArrowRight } from "lucide-react";
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
  const totalGames = enabledPlatforms.reduce((sum, p) => sum + p.gameCount, 0);
  const activePlatforms = enabledPlatforms.filter((p) => p.gameCount > 0);

  return (
    <div className="page-dashboard__container">
      {/* Stats cards */}
      <div className="page-dashboard__stats-grid">
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
        <StatCard title="Wanted" value={isLoading ? null : 0} subtitle="pending" icon={Clock} />
        <StatCard
          title="Downloads"
          value={isLoading ? null : 0}
          subtitle="completed"
          icon={Download}
        />
      </div>

      {/* Platform overview */}
      <Card>
        <CardHeader className="page-dashboard__platform-header">
          <CardTitle className="page-dashboard__section-title">Platform Overview</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="app-common__text-xs"
            onClick={() => navigate("/platforms")}
          >
            View all <ArrowRight className="page-dashboard__view-all-icon" />
          </Button>
        </CardHeader>
        <CardContent className="page-dashboard__platform-content">
          {isLoading ? (
            <div className="page-dashboard__loading-list">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="page-dashboard__loading-row" />
              ))}
            </div>
          ) : enabledPlatforms.length === 0 ? (
            <p className="page-dashboard__empty-message">No platforms configured yet.</p>
          ) : (
            <div className="app-common__stack-xs">
              {enabledPlatforms.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => navigate(`/platforms/${platform.slug}`)}
                  className="page-dashboard__platform-row hover-elevate active-elevate"
                >
                  <div className="app-common__row-gap-3">
                    <Gamepad2 className="page-dashboard__platform-icon" />
                    <span>{platform.name}</span>
                  </div>
                  <span className="page-dashboard__platform-count">
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
      <CardContent className="page-dashboard__stat-content">
        <div className="page-dashboard__stat-row">
          <div>
            <p className="page-dashboard__stat-label">{title}</p>
            {value !== null ? (
              <p className="page-dashboard__stat-value">{value}</p>
            ) : (
              <Skeleton className="page-dashboard__stat-skeleton" />
            )}
            <p className="page-dashboard__stat-subtitle">{subtitle}</p>
          </div>
          <div className="page-dashboard__stat-icon-wrap">
            <Icon className="page-dashboard__stat-icon" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
