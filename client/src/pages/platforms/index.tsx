import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gamepad2 } from "lucide-react";
import { useTheme } from "next-themes";
import EmptyState from "@/components/EmptyState";
import nintendoSwitchLight from "../../images/Light - Color/Consoles/Nintendo Switch.png";
import nintendoSwitchDark from "../../images/Dark - Color/Consoles/Nintendo Switch.png";
import nintendo64Light from "../../images/Light - Color/Consoles/Nintendo 64.png";
import nintendo64Dark from "../../images/Dark - Color/Consoles/Nintendo 64.png";
import snesLight from "../../images/Light - Color/Consoles/Super Nintendo Entertainment System.png";
import snesDark from "../../images/Dark - Color/Consoles/Super Nintendo Entertainment System.png";
import gameBoyLight from "../../images/Light - Color/Handhelds/Nintendo Game Boy.png";
import gameBoyDark from "../../images/Dark - Color/Handhelds/Nintendo Game Boy.png";
import gameBoyColorLight from "../../images/Light - Color/Handhelds/Nintendo Game Boy Color.png";
import gameBoyColorDark from "../../images/Dark - Color/Handhelds/Nintendo Game Boy Color.png";
import gameBoyAdvanceLight from "../../images/Light - Color/Handhelds/Nintendo Game Boy Advance.png";
import gameBoyAdvanceDark from "../../images/Dark - Color/Handhelds/Nintendo Game Boy Advance.png";
import nintendoDsLight from "../../images/Light - Color/Handhelds/Nintendo DS.png";
import nintendoDsDark from "../../images/Dark - Color/Handhelds/Nintendo DS.png";
import nintendo3dsLight from "../../images/Light - Color/Handhelds/Nintendo 3DS.png";
import nintendo3dsDark from "../../images/Dark - Color/Handhelds/Nintendo 3DS.png";
import playstation1Light from "../../images/Light - Color/Consoles/Sony Playstation.png";
import playstation1Dark from "../../images/Dark - Color/Consoles/Sony Playstation.png";
import playstation2Light from "../../images/Light - Color/Consoles/Sony Playstation 2.png";
import playstation2Dark from "../../images/Dark - Color/Consoles/Sony Playstation 2.png";
import pspLight from "../../images/Light - Color/Handhelds/Sony PSP.png";
import pspDark from "../../images/Dark - Color/Handhelds/Sony PSP.png";
import segaGenesisLight from "../../images/Light - Color/Consoles/Sega Genesis.png";
import segaGenesisDark from "../../images/Dark - Color/Consoles/Sega Genesis.png";
import segaDreamcastLight from "../../images/Light - Color/Consoles/Sega Dreamcast.png";
import segaDreamcastDark from "../../images/Dark - Color/Consoles/Sega Dreamcast.png";

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

type PlatformIconSet = {
  light: string;
  dark: string;
};

const platformIcons: Record<string, PlatformIconSet> = {
  switch: { light: nintendoSwitchLight, dark: nintendoSwitchDark },
  n64: { light: nintendo64Light, dark: nintendo64Dark },
  snes: { light: snesLight, dark: snesDark },
  gb: { light: gameBoyLight, dark: gameBoyDark },
  gbc: { light: gameBoyColorLight, dark: gameBoyColorDark },
  gba: { light: gameBoyAdvanceLight, dark: gameBoyAdvanceDark },
  nds: { light: nintendoDsLight, dark: nintendoDsDark },
  "3ds": { light: nintendo3dsLight, dark: nintendo3dsDark },
  ps1: { light: playstation1Light, dark: playstation1Dark },
  ps2: { light: playstation2Light, dark: playstation2Dark },
  psp: { light: pspLight, dark: pspDark },
  genesis: { light: segaGenesisLight, dark: segaGenesisDark },
  dreamcast: { light: segaDreamcastLight, dark: segaDreamcastDark },
};

function getPlatformIconSrc(slug: string, isLightTheme: boolean) {
  const iconSet = platformIcons[slug];
  if (!iconSet) {
    return null;
  }
  return isLightTheme ? iconSet.dark : iconSet.light;
}

export default function PlatformsPage() {
  const [, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isLightTheme = resolvedTheme === "light";

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

  const renderPlatformCard = (platform: PlatformWithCount) => {
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

      <div className="page-platforms-index__platform-grid">
        {enabled.map(renderPlatformCard)}
      </div>

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
