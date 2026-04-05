import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  SlidersHorizontal,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  X,
} from "lucide-react";

type Platform = {
  id: number;
  name: string;
  slug: string;
  fileExtensions: string[];
};

type QualityProfile = {
  id: number;
  name: string;
  platformId: number;
  preferredFormats: string[];
  preferredRegions: string[];
  minSeeders: number;
  upgradeExisting: boolean;
  platform: Platform | null;
};

type ProfileFormData = {
  name: string;
  platformId: number | null;
  preferredFormats: string[];
  preferredRegions: string[];
  minSeeders: number;
  upgradeExisting: boolean;
};

const COMMON_REGIONS = ["USA", "World", "Europe", "Japan", "Australia", "Korea", "China"];

// Per-platform format options
const PLATFORM_FORMATS: Record<string, string[]> = {
  "nintendo-switch": ["NSZ", "NSP", "XCI", "XCZ"],
  "nintendo-64": ["N64", "Z64", "V64"],
  "snes-super-famicom": ["SFC", "SMC"],
  "game-boy": ["GB"],
  "game-boy-color": ["GBC"],
  "game-boy-advance": ["GBA"],
  "nintendo-ds": ["NDS"],
  "nintendo-3ds": ["CIA", "3DS"],
  playstation: ["CHD", "BIN", "CUE", "ISO"],
  "playstation-2": ["CHD", "ISO"],
  "playstation-portable": ["CHD", "ISO", "CSO"],
  "sega-genesis-mega-drive": ["MD", "BIN", "SMD"],
  dreamcast: ["CHD", "GDI"],
};

const emptyForm: ProfileFormData = {
  name: "",
  platformId: null,
  preferredFormats: [],
  preferredRegions: ["USA", "World", "Europe"],
  minSeeders: 1,
  upgradeExisting: false,
};

export default function QualityProfilesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProfileFormData>(emptyForm);
  const [formatInput, setFormatInput] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profiles, isLoading } = useQuery<QualityProfile[]>({
    queryKey: ["/api/quality-profiles"],
  });

  const { data: platforms } = useQuery<Platform[]>({
    queryKey: ["/api/platforms"],
  });

  const enabledPlatforms = platforms?.filter((p: Platform & { enabled?: boolean }) =>
    (p as Platform & { enabled?: boolean }).enabled !== false
  );

  const createMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const res = await apiRequest("POST", "/api/quality-profiles", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality-profiles"] });
      setDialogOpen(false);
      toast({ title: "Profile created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create profile", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ProfileFormData }) => {
      const res = await apiRequest("PATCH", `/api/quality-profiles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality-profiles"] });
      setDialogOpen(false);
      toast({ title: "Profile updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update profile", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/quality-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality-profiles"] });
      toast({ title: "Profile deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete profile", description: error.message, variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormatInput("");
    setDialogOpen(true);
  };

  const openEdit = (profile: QualityProfile) => {
    setEditingId(profile.id);
    setForm({
      name: profile.name,
      platformId: profile.platformId,
      preferredFormats: profile.preferredFormats,
      preferredRegions: profile.preferredRegions,
      minSeeders: profile.minSeeders,
      upgradeExisting: profile.upgradeExisting,
    });
    setFormatInput("");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.platformId) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const addFormat = (fmt: string) => {
    const val = fmt.trim().toUpperCase();
    if (val && !form.preferredFormats.includes(val)) {
      setForm((prev) => ({ ...prev, preferredFormats: [...prev.preferredFormats, val] }));
    }
    setFormatInput("");
  };

  const removeFormat = (fmt: string) => {
    setForm((prev) => ({
      ...prev,
      preferredFormats: prev.preferredFormats.filter((f) => f !== fmt),
    }));
  };

  const toggleRegion = (region: string) => {
    setForm((prev) => {
      const has = prev.preferredRegions.includes(region);
      return {
        ...prev,
        preferredRegions: has
          ? prev.preferredRegions.filter((r) => r !== region)
          : [...prev.preferredRegions, region],
      };
    });
  };

  const moveRegion = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= form.preferredRegions.length) return;
    setForm((prev) => {
      const regions = [...prev.preferredRegions];
      [regions[index], regions[newIndex]] = [regions[newIndex], regions[index]];
      return { ...prev, preferredRegions: regions };
    });
  };

  // Get format suggestions based on selected platform
  const selectedPlatformSlug = enabledPlatforms?.find((p) => p.id === form.platformId)?.slug;
  const suggestedFormats = selectedPlatformSlug
    ? PLATFORM_FORMATS[selectedPlatformSlug] ?? []
    : [];

  const saving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Quality Profiles</h2>
          <p className="text-sm text-muted-foreground">
            Define format and region preferences per platform for search result scoring.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>

      {!profiles || profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <SlidersHorizontal className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No Quality Profiles</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Create a quality profile to control format preferences, region priority, and seeder
            requirements when searching for ROMs.
          </p>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Profile
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <Card key={profile.id}>
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm">{profile.name}</h3>
                    {profile.platform && (
                      <Badge variant="secondary" className="text-[10px]">
                        {profile.platform.name}
                      </Badge>
                    )}
                    {profile.upgradeExisting && (
                      <Badge variant="outline" className="text-[10px]">
                        Auto-upgrade
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Formats:{" "}
                      {profile.preferredFormats.length > 0
                        ? profile.preferredFormats.join(" > ")
                        : "Any"}
                    </span>
                    <span>
                      Regions:{" "}
                      {profile.preferredRegions.length > 0
                        ? profile.preferredRegions.join(" > ")
                        : "Any"}
                    </span>
                    <span>Min seeders: {profile.minSeeders}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(profile)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(profile.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "New"} Quality Profile</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Switch Preferred"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            {/* Platform */}
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select
                value={form.platformId?.toString() ?? ""}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, platformId: parseInt(v, 10) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a platform" />
                </SelectTrigger>
                <SelectContent>
                  {enabledPlatforms?.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preferred Formats */}
            <div className="space-y-1.5">
              <Label>Preferred Formats (priority order)</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                {form.preferredFormats.map((fmt, i) => (
                  <Badge key={fmt} variant="secondary" className="gap-1 pr-1">
                    <span className="text-[10px] text-muted-foreground mr-0.5">{i + 1}.</span>
                    {fmt}
                    <button
                      onClick={() => removeFormat(fmt)}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              {suggestedFormats.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {suggestedFormats
                    .filter((f) => !form.preferredFormats.includes(f))
                    .map((fmt) => (
                      <Button
                        key={fmt}
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => addFormat(fmt)}
                      >
                        + {fmt}
                      </Button>
                    ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Custom format..."
                  value={formatInput}
                  onChange={(e) => setFormatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addFormat(formatInput);
                    }
                  }}
                  className="h-8 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => addFormat(formatInput)}
                  disabled={!formatInput.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Preferred Regions */}
            <div className="space-y-1.5">
              <Label>Preferred Regions (priority order)</Label>
              <div className="space-y-1">
                {form.preferredRegions.map((region, i) => (
                  <div key={region} className="flex items-center gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <span className="flex-1">{region}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveRegion(i, -1)}
                      disabled={i === 0}
                    >
                      <GripVertical className="h-3 w-3 rotate-90" />
                    </Button>
                    <button
                      onClick={() => toggleRegion(region)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {COMMON_REGIONS.filter((r) => !form.preferredRegions.includes(r)).map((region) => (
                  <Button
                    key={region}
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => toggleRegion(region)}
                  >
                    + {region}
                  </Button>
                ))}
              </div>
            </div>

            {/* Min Seeders */}
            <div className="space-y-1.5">
              <Label>Minimum Seeders</Label>
              <Input
                type="number"
                min={0}
                value={form.minSeeders}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    minSeeders: Math.max(0, parseInt(e.target.value, 10) || 0),
                  }))
                }
                className="w-24"
              />
            </div>

            {/* Auto-upgrade */}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.upgradeExisting}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, upgradeExisting: checked }))
                }
              />
              <div>
                <Label>Auto-upgrade existing files</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically search for better quality releases when available.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.name || !form.platformId || saving}
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
