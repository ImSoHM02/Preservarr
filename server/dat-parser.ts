import { XMLParser } from "fast-xml-parser";

export interface ParsedDatEntry {
  gameTitle: string;
  region: string | null;
  revision: string | null;
  crc32: string | null;
  md5: string | null;
  sha1: string | null;
}

export interface ParsedDatFile {
  name: string;
  description: string;
  entries: ParsedDatEntry[];
}

// Extract region from a title like "Game Name (USA)" or "Game Name (Europe, Australia)"
const REGION_REGEX = /\(([^)]*(?:USA|Europe|Japan|World|Australia|France|Germany|Spain|Italy|Brazil|Korea|China|Asia|Netherlands|Sweden|Denmark|Norway|Finland|Portugal|Russia|Taiwan|Hong Kong)[^)]*)\)/i;

// Extract revision from "Game Name (Rev 1)" or "Game Name (Rev A)"
const REVISION_REGEX = /\(Rev\s+([^)]+)\)/i;

function extractRegion(title: string): string | null {
  const match = title.match(REGION_REGEX);
  return match ? match[1] : null;
}

function extractRevision(title: string): string | null {
  const match = title.match(REVISION_REGEX);
  return match ? match[1] : null;
}

/**
 * Parse a No-Intro or Redump DAT file (CLRMAMEPro XML format).
 *
 * Expected structure:
 * <datafile>
 *   <header><name>...</name><description>...</description></header>
 *   <game name="Title (Region) (Rev X)">
 *     <rom name="Title.ext" size="1234" crc="ABCD" md5="..." sha1="..."/>
 *   </game>
 * </datafile>
 *
 * Some DATs use <machine> instead of <game> (MAME-derived).
 * Some have multiple <rom> entries per game (multi-disc).
 */
export function parseDatFile(xml: string): ParsedDatFile {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name: string) => ["game", "machine", "rom"].includes(name),
  });

  const parsed = parser.parse(xml);
  const datafile = parsed.datafile;
  if (!datafile) {
    throw new Error("Invalid DAT file: missing <datafile> root element");
  }

  const header = datafile.header ?? {};
  const name = header.name ?? "Unknown DAT";
  const description = header.description ?? name;

  // Support both <game> and <machine> elements
  const games: unknown[] = datafile.game ?? datafile.machine ?? [];
  if (!Array.isArray(games) || games.length === 0) {
    throw new Error("Invalid DAT file: no <game> or <machine> entries found");
  }

  const entries: ParsedDatEntry[] = [];

  for (const game of games) {
    const g = game as Record<string, unknown>;
    const gameTitle = (g["@_name"] as string) ?? "";
    if (!gameTitle) continue;

    const region = extractRegion(gameTitle);
    const revision = extractRevision(gameTitle);

    // Each game can have one or more <rom> entries
    const roms = (g.rom ?? []) as Record<string, unknown>[];
    if (roms.length === 0) {
      // Some DATs have game entries with no rom data — skip
      continue;
    }

    for (const rom of roms) {
      const crc = (rom["@_crc"] as string)?.toUpperCase() ?? null;
      const md5 = (rom["@_md5"] as string)?.toUpperCase() ?? null;
      const sha1 = (rom["@_sha1"] as string)?.toUpperCase() ?? null;

      // Skip entries with no hashes at all
      if (!crc && !md5 && !sha1) continue;

      entries.push({
        gameTitle,
        region,
        revision,
        crc32: crc,
        md5,
        sha1,
      });
    }
  }

  return { name, description, entries };
}
