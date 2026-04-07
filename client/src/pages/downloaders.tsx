import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getApiErrorDescription, getApiErrorMessage } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HardDrive, Plus, Trash2, CheckCircle, XCircle, Pencil } from "lucide-react";

interface DownloadClient {
  id: number;
  name: string;
  type: string;
  url: string;
  username: string | null;
  password: string | null;
  downloadPath: string | null;
  enabled: boolean;
}

interface FormData {
  name: string;
  type: string;
  url: string;
  username: string;
  password: string;
  downloadPath: string;
  enabled: boolean;
}

const defaultForm: FormData = {
  name: "",
  type: "qbittorrent",
  url: "",
  username: "",
  password: "",
  downloadPath: "",
  enabled: true,
};

const CLIENT_TYPES = [
  { value: "qbittorrent", label: "qBittorrent" },
  { value: "transmission", label: "Transmission" },
  { value: "rtorrent", label: "rTorrent / ruTorrent" },
  { value: "nzbget", label: "NZBGet" },
  { value: "sabnzbd", label: "SABnzbd" },
];

export default function DownloadersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [testResults, setTestResults] = useState<
    Record<number, { success: boolean; message: string }>
  >({});

  const { data: clients = [], isLoading } = useQuery<DownloadClient[]>({
    queryKey: ["download-clients"],
    queryFn: () => apiRequest("GET", "/api/download-clients").then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) =>
      apiRequest("POST", "/api/download-clients", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["download-clients"] });
      toast({ title: "Download client added" });
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to add client"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormData> }) =>
      apiRequest("PATCH", `/api/download-clients/${id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["download-clients"] });
      toast({ title: "Download client updated" });
      setDialogOpen(false);
      setEditingId(null);
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to update client"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/download-clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["download-clients"] });
      toast({ title: "Download client deleted" });
      setDeleteId(null);
    },
    onError: (error) =>
      toast({
        title: getApiErrorMessage(error, "Failed to delete client"),
        description: getApiErrorDescription(error),
        variant: "destructive",
      }),
  });

  const testMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/download-clients/${id}/test`).then((r) => r.json()),
    onSuccess: (data, id) => setTestResults((prev) => ({ ...prev, [id]: data })),
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

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/download-clients/${id}`, { enabled }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["download-clients"] }),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (client: DownloadClient) => {
    setEditingId(client.id);
    setForm({
      name: client.name,
      type: client.type,
      url: client.url,
      username: client.username ?? "",
      password: "",
      downloadPath: client.downloadPath ?? "",
      enabled: client.enabled,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const typeLabel = (type: string) => CLIENT_TYPES.find((t) => t.value === type)?.label ?? type;

  return (
    <div className="page-downloaders__page">
      <div className="page-dashboard__stat-row">
        <div>
          <h1 className="page-auth-login__text-2xl-font-bold">Download Clients</h1>
          <p className="page-downloaders__text-muted-foreground">Configure torrent and Usenet download clients</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="page-downloaders__height-4-width-4-margin-right-2" />
          Add Client
        </Button>
      </div>

      {isLoading && <p className="page-downloaders__muted-text">Loading...</p>}

      {!isLoading && clients.length === 0 && (
        <Card>
          <CardContent className="page-downloaders__text-center-padding-y-12">
            <HardDrive className="page-downloaders__empty-icon" />
            <p className="page-downloaders__font-medium-margin-bottom-1">No download clients configured</p>
            <p className="page-downloaders__muted-text-spaced">Add qBittorrent, Transmission, or another supported client.</p>
            <Button onClick={openCreate}>
              <Plus className="page-downloaders__height-4-width-4-margin-right-2" />
              Add Client
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="cmp-loadingfallback__space-y-2">
        {clients.map((client) => {
          const testResult = testResults[client.id];
          return (
            <Card key={client.id}>
              <CardContent className="page-downloaders__padding-y-4">
                <div className="cmp-header__flex-gap-4-items-center">
                  <Switch
                    checked={client.enabled}
                    onCheckedChange={(enabled) => toggleMutation.mutate({ id: client.id, enabled })}
                  />
                  <div className="cmp-igdbsearchmodal__min-width-0-flex-1">
                    <div className="cmp-appsidebar__flex-gap-2-items-center">
                      <span className="page-downloaders__font-medium">{client.name}</span>
                      <Badge variant="outline" className="app-common__text-xs">
                        {typeLabel(client.type)}
                      </Badge>
                    </div>
                    <p className="page-downloaders__muted-text-truncate">{client.url}</p>
                    {testResult && (
                      <p className={testResult.success ? "page-downloaders__status-text-success" : "page-downloaders__status-text-error"}>
                        {testResult.success ? "✓" : "✗"} {testResult.message}
                      </p>
                    )}
                  </div>
                  <div className="page-downloaders__actions-row">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => testMutation.mutate(client.id)}
                      disabled={testMutation.isPending}
                    >
                      {testResult?.success === true ? (
                        <CheckCircle className="page-downloaders__status-icon-success" />
                      ) : testResult?.success === false ? (
                        <XCircle className="page-downloaders__status-icon-error" />
                      ) : null}
                      Test
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(client)}>
                      <Pencil className="cmp-searchbar__height-4-width-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="page-downloaders__text-destructive"
                      onClick={() => setDeleteId(client.id)}
                    >
                      <Trash2 className="cmp-searchbar__height-4-width-4" />
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
            <DialogTitle>{editingId ? "Edit Client" : "Add Download Client"}</DialogTitle>
          </DialogHeader>
          <div className="cmp-loadingfallback__space-y-3">
            <div className="page-downloaders__grid-gap-3-grid-cols-2">
              <div className="app-common__stack-xs">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="My qBittorrent"
                />
              </div>
              <div className="app-common__stack-xs">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="app-common__stack-xs">
              <Label>URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="http://qbittorrent:8080"
              />
              <p className="cmp-appsidebar__muted-xs">
                In Docker, use the container name (e.g. <code>http://qbittorrent:8080</code>), not
                an IP address.
              </p>
            </div>
            <div className="page-downloaders__grid-gap-3-grid-cols-2">
              <div className="app-common__stack-xs">
                <Label>Username</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="admin"
                />
              </div>
              <div className="app-common__stack-xs">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingId ? "Leave blank to keep current" : "Password"}
                />
              </div>
            </div>
            <div className="app-common__stack-xs">
              <Label>Default download path (optional)</Label>
              <Input
                value={form.downloadPath}
                onChange={(e) => setForm({ ...form, downloadPath: e.target.value })}
                placeholder="/downloads"
              />
            </div>
            <div className="cmp-appsidebar__flex-gap-2-items-center">
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
            <AlertDialogTitle>Delete download client?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="page-downloaders__danger-button-hover"
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
