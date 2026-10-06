import { useCallback, useEffect, useRef, useState } from "react";
import {
  Folder,
  File,
  FolderOpen,
  RefreshCw,
  Search,
  ArrowUpRight,
  FileText,
  FileCode2,
  Image,
  Table2,
  Loader2,
  Info,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { PanelHeader, errorMessage } from "./PanelPrimitives";

type WorkspaceFile = {
  path: string;
  size: number;
  isDir: boolean;
  mtime: number;
};
type FileFilter = "all" | "documents" | "code" | "images" | "folders";
const DOCUMENTS = new Set([
  "md",
  "txt",
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "csv",
  "xlsx",
  "xls",
  "html",
]);
const IMAGES = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "avif",
]);
const CODE = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "json",
  "css",
  "scss",
  "go",
  "rs",
  "java",
  "cs",
  "sh",
  "ps1",
  "sql",
  "yaml",
  "yml",
  "toml",
  "mjs",
]);
function extension(file: WorkspaceFile) {
  return file.path.split(".").pop()?.toLowerCase() || "";
}
function formatSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : bytes < 1024 ** 3
        ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
        : `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
function fileIcon(file: WorkspaceFile) {
  const ext = extension(file);
  return file.isDir
    ? Folder
    : IMAGES.has(ext)
      ? Image
      : ["csv", "xls", "xlsx"].includes(ext)
        ? Table2
        : DOCUMENTS.has(ext)
          ? FileText
          : CODE.has(ext)
            ? FileCode2
            : File;
}

export function DotFiles({ dotId }: { dotId: string }) {
  const { activeDot, showToast } = useApp();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [opening, setOpening] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      setLoading(true);
      setLoadError("");
      const result = await window.dots.api.listWorkspaceFiles(dotId);
      if (request === generation.current) setFiles(result);
    } catch (error) {
      if (request === generation.current)
        setLoadError(errorMessage(error, "Could not load workspace files."));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [dotId]);
  useEffect(() => {
    setFiles([]);
    setSearch("");
    setFilter("all");
    void load();
    const unsubscribe = window.dots.onEvent((event) => {
      if (
        event.type === "run" &&
        event.run.dotId === dotId &&
        ["succeeded", "failed", "cancelled"].includes(event.run.status)
      )
        void load();
    });
    return () => {
      generation.current++;
      unsubscribe();
    };
  }, [dotId, load]);
  const open = async (relative = "") => {
    if (!activeDot?.workspacePath) return;
    const full =
      activeDot.workspacePath.replace(/\\/g, "/").replace(/\/$/, "") +
      (relative
        ? "/" + relative.replace(/\\/g, "/").replace(/^\.?\//, "")
        : "");
    try {
      setOpening(relative || "/");
      await window.dots.api.openPath(full);
    } catch (error) {
      showToast(errorMessage(error, "Could not open this path."), "error");
    } finally {
      setOpening(null);
    }
  };
  const matches = files
    .filter(
      (file) =>
        file.path.toLowerCase().includes(search.toLowerCase()) &&
        (filter === "all" ||
          (filter === "folders"
            ? file.isDir
            : !file.isDir &&
              (filter === "documents"
                ? DOCUMENTS
                : filter === "images"
                  ? IMAGES
                  : CODE
              ).has(extension(file)))),
    )
    .sort((a, b) =>
      sort === "name" ? a.path.localeCompare(b.path) : b.mtime - a.mtime,
    );
  return (
    <div className="profile-panel">
      <PanelHeader
        eyebrow="The work you share"
        title="Files & deliverables"
        description="Everything in your dot’s workspace, ready to open, review, and make your own."
        actions={
          <button className="btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
          </button>
        }
      />
      <div className="workspace-banner">
        <div>
          <strong>
            <Folder
              size={14}
              style={{
                verticalAlign: "middle",
                marginRight: 8,
                color: "var(--accent-primary)",
              }}
            />
            {activeDot?.name || "Your dot"}’s workspace
          </strong>
          <p title={activeDot?.workspacePath}>
            {activeDot?.workspacePath || "No workspace selected"}
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={() => open()}
          disabled={!activeDot?.workspacePath || opening === "/"}
        >
          <FolderOpen size={14} /> Open folder
        </button>
      </div>
      <div className="profile-toolbar">
        <div className="profile-search">
          <Search size={15} />
          <input
            aria-label="Search workspace files"
            placeholder="Find a file…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          aria-label="Sort files"
          value={sort}
          onChange={(event) => setSort(event.target.value as "recent" | "name")}
          style={{ fontSize: 12 }}
        >
          <option value="recent">Recently modified</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      <div className="profile-toolbar">
        <div
          className="profile-choice-group"
          role="group"
          aria-label="File type"
        >
          {(
            [
              ["all", "All files"],
              ["documents", "Documents"],
              ["code", "Code"],
              ["images", "Images"],
              ["folders", "Folders"],
            ] as [FileFilter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "is-selected" : ""}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="profile-count" style={{ marginLeft: "auto" }}>
          {matches.length} {matches.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="workspace-file-list">
        {loadError ? (
          <div className="profile-empty">
            <div className="profile-empty-icon">
              <FolderOpen size={23} />
            </div>
            <h3>Files couldn’t be loaded</h3>
            <p>{loadError}</p>
            <button className="btn-secondary" onClick={load}>
              Try again
            </button>
          </div>
        ) : loading && !files.length ? (
          <div className="profile-empty" role="status">
            <Loader2 size={22} className="spin" />
            <p>Opening the workspace…</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="profile-empty">
            <div className="profile-empty-icon">
              <Folder size={23} />
            </div>
            <h3>
              {files.length ? "No files match" : "Room for your next idea"}
            </h3>
            <p>
              {files.length
                ? "Try another search or file type."
                : "Documents, code, and other work your dot creates will appear here."}
            </p>
            {files.length > 0 && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="workspace-file-header">
              <span>Name</span>
              <span>Size</span>
              <span className="workspace-file-date">Modified</span>
              <span />
            </div>
            {matches.map((file) => {
              const Icon = fileIcon(file);
              const normalized = file.path.replace(/\\/g, "/");
              const parts = normalized.split("/");
              const name = parts.pop() || normalized;
              const parent = parts.join("/");
              return (
                <button
                  className="workspace-file-row"
                  key={file.path}
                  onClick={() => open(file.path)}
                  disabled={opening === file.path}
                  title={`Open ${file.path} in its default app`}
                >
                  <span className="workspace-file-name">
                    <Icon size={17} />
                    <span>
                      {name}
                      {parent && <small>{parent}</small>}
                    </span>
                  </span>
                  <span>{file.isDir ? "Folder" : formatSize(file.size)}</span>
                  <span
                    className="workspace-file-date"
                    title={new Date(file.mtime).toLocaleString()}
                  >
                    {new Date(file.mtime).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {opening === file.path ? (
                    <Loader2 size={13} className="spin" />
                  ) : (
                    <ArrowUpRight size={13} />
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>
      {files.length >= 400 && (
        <div className="profile-note" style={{ marginTop: 17 }}>
          <Info size={15} />
          <div>
            Showing the first 400 indexed items. Open the workspace folder to
            explore all files and deeper folders.
          </div>
        </div>
      )}
      <p className="profile-count" style={{ marginTop: 16, lineHeight: 1.7 }}>
        Files open in your computer’s default app. Package folders and version
        control internals are hidden.
      </p>
    </div>
  );
}
