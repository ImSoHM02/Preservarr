-- Seed default platforms (Section 2.2 of the plan)
INSERT OR IGNORE INTO platforms (name, slug, file_extensions, naming_standard, version_source, enabled, torznab_categories, igdb_platform_id) VALUES
  ('Nintendo Switch', 'switch', '["nsp","nsz","xci","xcz"]', 'none', 'titledb', 1, '6000,6070', 130),
  ('Nintendo 64', 'n64', '["n64","z64","v64"]', 'no-intro', 'no-intro', 1, '6000,6080', 4),
  ('SNES / Super Famicom', 'snes', '["sfc","smc"]', 'no-intro', 'no-intro', 1, '6000,6080', 19),
  ('Game Boy', 'gb', '["gb"]', 'no-intro', 'no-intro', 1, '6000,6080', 33),
  ('Game Boy Color', 'gbc', '["gbc"]', 'no-intro', 'no-intro', 1, '6000,6080', 22),
  ('Game Boy Advance', 'gba', '["gba"]', 'no-intro', 'no-intro', 1, '6000,6080', 24),
  ('Nintendo DS', 'nds', '["nds"]', 'no-intro', 'no-intro', 1, '6000,6080', 20),
  ('Nintendo 3DS', '3ds', '["cia","3ds"]', 'no-intro', 'no-intro', 1, '6000,6080', 37),
  ('PlayStation', 'ps1', '["bin","cue","iso","chd"]', 'redump', 'redump', 1, '6000,6050', 7),
  ('PlayStation 2', 'ps2', '["iso","chd"]', 'redump', 'redump', 1, '6000,6050', 8),
  ('PlayStation Portable', 'psp', '["iso","cso","chd"]', 'none', 'none', 1, '6000,6060', 38),
  ('Sega Genesis / Mega Drive', 'genesis', '["md","bin","smd"]', 'no-intro', 'no-intro', 1, '6000,6080', 29),
  ('Dreamcast', 'dreamcast', '["gdi","chd"]', 'redump', 'redump', 1, '6000,6080', 23);
