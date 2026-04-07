import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, File, ArrowUp, Loader2, HardDrive, ShieldAlert } from "lucide-react";

interface FileSystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FileSystemResponse {
  path: string;
  parent: FileSystemEntry | null;
  files: FileSystemEntry[];
}

interface PathBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
  title?: string;
  extensions?: string[]; // Optional filter for file extensions
}

export function PathBrowser({
  isOpen,
  onClose,
  onSelect,
  initialPath,
  title = "Select File",
  extensions,
}: PathBrowserProps) {
  const [currentPath, setCurrentPath] = useState("/");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Initialize path when dialog opens
  useEffect(() => {
    if (isOpen) {
      let pathToShow = initialPath || "/";
      if (initialPath) {
        const isWindows = initialPath.includes("\\");
        const separator = isWindows ? "\\" : "/";
        const parts = initialPath.split(separator);
        const lastPart = parts[parts.length - 1];

        // Heuristic: if last part has a dot, assume it's a file and show parent directory.
        if (lastPart?.includes(".")) {
          parts.pop();
          pathToShow = parts.join(separator);
        }

        // Handle root path cases
        if (!pathToShow || (isWindows && pathToShow.endsWith(":"))) {
          pathToShow = isWindows ? `${parts[0] || "C:"}\\` : "/";
        }
      }

      setCurrentPath(pathToShow);
      if (initialPath) setSelectedPath(initialPath);
    }
  }, [isOpen, initialPath]);

  const { data, isLoading, error, refetch } = useQuery<FileSystemResponse>({
    queryKey: ["filesystem", currentPath],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/system/filesystem?path=${encodeURIComponent(currentPath)}`
      );
      if (!res.ok) throw new Error("Failed to load directory");
      return res.json();
    },
    enabled: isOpen,
    retry: false,
  });

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setSelectedPath(null);
  };

  const handleSelect = (path: string, isDirectory: boolean) => {
    if (isDirectory) {
      handleNavigate(path);
    } else {
      setSelectedPath(path);
    }
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onSelect(selectedPath);
      onClose();
    }
  };

  const handleManualPath = (e: React.FormEvent) => {
    e.preventDefault();
    refetch();
  };

  // Filter files if extensions provided
  const filteredFiles = data?.files?.filter((file: FileSystemEntry) => {
    if (file.isDirectory) return true;
    if (!extensions || extensions.length === 0) return true;
    return extensions.some((ext) => file.name.endsWith(ext));
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="cmp-pathbrowser__dialog-content">
        <DialogHeader>
          <DialogTitle className="cmp-appsidebar__flex-gap-2-items-center">
            <HardDrive className="cmp-pathbrowser__height-5-width-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleManualPath} className="cmp-pathbrowser__flex-gap-2-margin-y-2">
          <Input
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            className="cmp-pathbrowser__text-sm-flex-1-font-mono"
            placeholder="/path/to/directory"
          />
          <Button type="submit" variant="secondary" size="sm">
            Go
          </Button>
        </form>

        <div className="cmp-pathbrowser__tree-panel">
          <ScrollArea className="cmp-pathbrowser__height-400px">
            {isLoading ? (
              <div className="cmp-pathbrowser__loading-wrap">
                <Loader2 className="cmp-pathbrowser__loading-icon" />
              </div>
            ) : error ? (
              <div className="cmp-pathbrowser__error-wrap">
                <ShieldAlert className="cmp-pathbrowser__height-8-width-8" />
                <p>Failed to access directory.</p>
                <Button variant="outline" size="sm" onClick={() => setCurrentPath("/")}>
                  Go to Root
                </Button>
              </div>
            ) : (
              <div className="cmp-pathbrowser__padding-1">
                {data?.parent && (
                  <div
                    className="cmp-pathbrowser__item-hover hover-elevate active-elevate"
                    onClick={() => data.parent && handleNavigate(data.parent.path)}
                  >
                    <ArrowUp className="cmp-igdbsearchmodal__icon-muted" />
                    <span className="cmp-pathbrowser__text-sm-font-medium">..</span>
                  </div>
                )}
                {filteredFiles?.map((file: FileSystemEntry) => (
                  <div
                    key={file.name}
                    className={`cmp-pathbrowser__item-row ${
                      selectedPath === file.path
                        ? "cmp-pathbrowser__item-selected"
                        : "cmp-pathbrowser__background-accent"
                    } hover-elevate active-elevate`}
                    onClick={() => handleSelect(file.path, file.isDirectory)}
                  >
                    {file.isDirectory ? (
                      <Folder
                        className={`${selectedPath === file.path ? "cmp-pathbrowser__selected-icon" : "cmp-pathbrowser__text-blue-500-height-4-width-4"}`}
                      />
                    ) : (
                      <File
                        className={`${selectedPath === file.path ? "cmp-pathbrowser__selected-icon" : "cmp-pathbrowser__text-gray-500-height-4-width-4"}`}
                      />
                    )}
                    <span className="cmp-pathbrowser__item-path">{file.name}</span>
                  </div>
                ))}
                {filteredFiles?.length === 0 && (
                  <div className="cmp-pathbrowser__empty-state">No files found</div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <div className="cmp-pathbrowser__footer">
            <div className="cmp-pathbrowser__selected-path">{selectedPath || "No file selected"}</div>
            <div className="cmp-pathbrowser__flex-gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={!selectedPath}>
                Select
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
