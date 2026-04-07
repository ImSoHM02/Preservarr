type NamingStandard = "no-intro" | "redump" | "none";
type VersionSource = "titledb" | "no-intro" | "redump" | "none";

export type PlatformSourceMapping = {
  namingStandard: NamingStandard;
  versionSource: VersionSource;
};

const NO_INTRO_SLUGS = new Set<string>([
  "atari-2600",
  "atari-5200",
  "atari-7800",
  "atari-jaguar",
  "atari-lynx",
  "bally-astrocade",
  "casio-loopy",
  "casio-pv-1000",
  "colecovision",
  "emerson-arcadia-2001",
  "epoch-cassette-vision",
  "epoch-super-cassette-vision",
  "fairchild-channel-f",
  "gamate",
  "gce-vectrex",
  "gb",
  "gba",
  "gbc",
  "genesis",
  "hartung-game-master",
  "mega-duck",
  "mattel-intellivision",
  "nec-pc-engine",
  "nec-pc-engine-supergrafx",
  "nec-turbografx-16",
  "milton-bradley-microvision",
  "n64",
  "nds",
  "nintendo-dsi",
  "nintendo-64dd",
  "nintendo-entertainment-system",
  "nintendo-famicom",
  "nintendo-famicom-disk-system",
  "nintendo-pok-mon-mini",
  "nintendo-satellaview",
  "nintendo-sufami-turbo",
  "nintendo-super-famicom",
  "nintendo-super-game-boy",
  "nintendo-super-game-boy-2",
  "nintendo-virtual-boy",
  "3ds",
  "sega-32x",
  "sega-game-gear",
  "sega-mark-iii",
  "sega-master-system",
  "sega-mega-drive",
  "sega-sg-1000",
  "snes",
  "snk-neo-geo",
  "snk-neo-geo-pocket",
  "snk-neo-geo-pocket-color",
  "tiger-game-com",
  "watara-supervision",
  "wonderswan",
  "wonderswan-color",
]);

const REDUMP_SLUGS = new Set<string>([
  "3do-interactive-multiplayer",
  "apple-pippin",
  "atari-jaguar-cd",
  "commodore-amiga-cd32",
  "commodore-cdtv",
  "dreamcast",
  "fujitsu-fm-towns-marty",
  "microsoft-xbox",
  "microsoft-xbox-360",
  "nec-pc-engine-cd",
  "nec-pc-fx",
  "nec-turbo-duo",
  "nec-turbografx-cd",
  "nintendo-gamecube",
  "nintendo-wii-u",
  "nintendo-wii",
  "philips-cd-i",
  "ps1",
  "ps2",
  "psp",
  "sega-cd",
  "sega-cd-32x",
  "sega-mega-cd",
  "sega-saturn",
  "sega-saturn-japan",
  "snk-neo-geo-cd",
  "sony-playstation-3",
]);

export function getPlatformSourceMapping(slug: string): PlatformSourceMapping | null {
  if (slug === "switch") {
    return {
      namingStandard: "none",
      versionSource: "titledb",
    };
  }

  if (REDUMP_SLUGS.has(slug)) {
    return {
      namingStandard: "redump",
      versionSource: "redump",
    };
  }

  if (NO_INTRO_SLUGS.has(slug)) {
    return {
      namingStandard: "no-intro",
      versionSource: "no-intro",
    };
  }

  return null;
}
