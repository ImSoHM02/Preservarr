import { PLATFORM_CATALOG_BY_SLUG } from "@shared/platform-catalog";

const lightImageModules = import.meta.glob("../images/Light - Color/**/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const darkImageModules = import.meta.glob("../images/Dark - Color/**/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function toNameKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildImageNameMap(modules: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();

  for (const [filePath, imageUrl] of Object.entries(modules)) {
    const fileName = filePath.split("/").pop();
    if (!fileName) {
      continue;
    }

    const baseName = fileName.replace(/\.png$/i, "");
    map.set(toNameKey(baseName), imageUrl);
  }

  return map;
}

const lightImageMap = buildImageNameMap(lightImageModules);
const darkImageMap = buildImageNameMap(darkImageModules);

export function getPlatformIconSrc(slug: string, isLightTheme: boolean): string | null {
  const catalogEntry = PLATFORM_CATALOG_BY_SLUG.get(slug);
  if (!catalogEntry) {
    return null;
  }

  const lightImage = lightImageMap.get(toNameKey(catalogEntry.lightImageName));
  const darkImage = darkImageMap.get(toNameKey(catalogEntry.darkImageName));
  if (!lightImage || !darkImage) {
    return null;
  }

  // Existing visual behavior intentionally uses dark logos in light theme and vice versa.
  return isLightTheme ? darkImage : lightImage;
}
