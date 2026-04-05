import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getApiErrorDescription, getApiErrorMessage } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Database, Plus, Trash2, CheckCircle, XCircle, RefreshCw, Pencil } from "lucide-react";

interface Indexer {
  id: number;
  name: string;
  type: string;
  url: string;
  apiKey: string;
  priority: number;
  enabled: boolean;
  categories: string[] | null;
}

interface IndexerFormData {
  name: string;
  url: string;
  apiKey: string;
  priority: number;
  enabled: boolean;
  categories: string;
}

const defaultForm: IndexerFormData = {
  name: "",
  url: "",
  apiKey: "",
  priority: 50,
  enabled: true,
  categories: "",
};

export default function IndexersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<IndexerFormData>(defaultForm);
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({});

  const { data: indexers = [], isLoading } = useQuery<Indexer[]>({
    queryKey: ["indexers"],
    queryFn: () => apiRequest("GET", "/api/indexers").then((r) => r.json()),
  });

  type IndexerPayload = Omit<IndexerFormData, "categories"> & { categories: string[] };

  const createMutation = useMutation({
    mutationFn: (data: IndexerPayload) =>
      apiRequest("POST", "/api/indexers", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indexers"] });
      toast({ title: "Indexer added" });
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to add indexer"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: IndexerPayload }) =>
      apiRequest("PATCH", `/api/indexers/${id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indexers"] });
      toast({ title: "Indexer updated" });
      setDialogOpen(false);
      setEditingId(null);
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to update indexer"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/indexers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indexers"] });
      toast({ title: "Indexer deleted" });
      setDeleteId(null);
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to delete indexer"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const testMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/indexers/${id}/test`).then((r) => r.json()),
    onSuccess: (data, id) => {
      setTestResults((prev) => ({ ...prev, [id]: data }));
    },
    onError: (error, id) => {
      const message = getApiErrorMessage(error, "Connection failed");
      const description = getApiErrorDescription(error);
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          success: false,
          message: description ? `${message} (${description})` : message,
        },
      }));
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/indexers/prowlarr/sync").then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["indexers"] });
      toast({ title: `Prowlarr sync: ${data.added} added, ${data.updated} updated` });
    },
    onError: (err) => {
      toast({
        title: getApiErrorMessage(err, "Prowlarr sync failed"),
        description: getApiErrorDescription(err),
        variant: "destructive",
      });
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/indexers/${id}`, { enabled }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["indexers"] }),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (indexer: Indexer) => {
    setEditingId(indexer.id);
    setForm({
      name: indexer.name,
      url: indexer.url,
      apiKey: indexer.apiKey,
      priority: indexer.priority,
      enabled: indexer.enabled,
      categories: (indexer.categories ?? []).join(", "),
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const categories = form.categories
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const payload = { ...form, categories };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Indexers</h1>
          <p className="text-muted-foreground">Manage Torznab indexers for ROM searching</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync from Prowlarr
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Indexer
          </Button>
        </div>
      </div>

      {isLoading && (
        <p className="text-muted-foreground text-sm">Loading indexers...</p>
      )}

      {!isLoading && indexers.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium mb-1">No indexers configured</p>
            <p className="text-sm text-muted-foreground mb-4">
              Sync from Prowlarr or add a Torznab indexer manually.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Indexer
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {indexers.map((indexer) => {
          const testResult = testResults[indexer.id];
          return (
            <Card key={indexer.id}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <Switch
                    checked={indexer.enabled}
                    onCheckedChange={(enabled) =>
                      toggleEnabledMutation.mutate({ id: indexer.id, enabled })
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{indexer.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {indexer.type}
                      </Badge>
                      {(indexer.categories?.length ?? 0) > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          cats: {indexer.categories?.join(", ")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{indexer.url}</p>
                    {testResult && (
                      <p
                        className={`text-xs mt-1 ${testResult.success ? "text-green-500" : "text-destructive"}`}
                      >
                        {testResult.success ? "✓" : "✗"} {testResult.message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">P{indexer.priority}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => testMutation.mutate(indexer.id)}
                      disabled={testMutation.isPending}
                    >
                      {testResult?.success === true ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : testResult?.success === false ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : null}
                      Test
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(indexer)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(indexer.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Indexer" : "Add Indexer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Indexer"
              />
            </div>
            <div className="space-y-1">
              <Label>Torznab URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="http://prowlarr:9696/1/api"
              />
            </div>
            <div className="space-y-1">
              <Label>API Key</Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="API key"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Priority (lower = higher priority)</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 50 })}
                  min={1}
                  max={100}
                />
              </div>
              <div className="space-y-1">
                <Label>Categories (comma-separated)</Label>
                <Input
                  value={form.categories}
                  onChange={(e) => setForm({ ...form, categories: e.target.value })}
                  placeholder="6000, 6070"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
              <Label>Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete indexer?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
