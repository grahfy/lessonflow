"use client";

import { useState, useMemo, useEffect } from "react";
import NextImage from "next/image";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Music,
  Image as ImageIcon,
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Download,
  Eye,
  Search,
  Copy,
  Library
} from "lucide-react";

import { Tooltip } from "@/components/admin/ui/tooltip";
import { PracticeAudioPlayer } from "@/components/ui/practice-audio-player";
import styles from "./unified-material-tree.module.css";

export interface TreeFolder {
  id: string;
  parentId: string | null;
  name: string;
  children: TreeFolder[];
}

export interface TreeFile {
  id: string;
  title: string;
  description: string | null;
  folderId: string | null;
  mimeType: string;
  materialType: "audio" | "pdf" | "image";
  sizeBytes: number;
  createdAt: string;
  previewUrl?: string;
  downloadUrl?: string;
  // Student metadata context
  bookingStartAt?: string | null;
  lessonMode?: "in_person" | "video" | null;
}

interface UnifiedMaterialTreeProps {
  folders: TreeFolder[];
  materials: TreeFile[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  isReadOnly?: boolean;
  materialsDeletingId?: string | null;
  onDeleteMaterial?: (id: string) => void;
  // Admin folder actions
  onCreateFolder?: (name: string, parentId: string | null) => void;
  onRenameFolder?: (folder: TreeFolder) => void;
  onDeleteFolder?: (folder: TreeFolder) => void;
  onMoveFolder?: (folder: TreeFolder) => void;
  onCopyFolder?: (folder: TreeFolder) => void;
  onMoveMaterial?: (material: TreeFile) => void;
  onRenameMaterial?: (material: TreeFile) => void;
  onCopyMaterial?: (material: TreeFile) => void;
  /** "Add to library" — promotes a per-customer material into the shared library. */
  onPromoteMaterial?: (material: TreeFile) => void;
}

/** Recursively checks if a folder or any of its children match the search query. */
function matchesSearch(folder: TreeFolder, materials: TreeFile[], query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  
  if (folder.name.toLowerCase().includes(q)) return true;

  const folderFiles = materials.filter((m) => m.folderId === folder.id);
  if (
    folderFiles.some(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q))
    )
  ) {
    return true;
  }

  return folder.children.some((child) => matchesSearch(child, materials, query));
}

/** Recursively flattens and retrieves all folder IDs under a folder tree node. */
function getAllFolderIds(nodes: TreeFolder[]): string[] {
  const ids: string[] = [];
  const walk = (list: TreeFolder[]) => {
    for (const node of list) {
      ids.push(node.id);
      walk(node.children);
    }
  };
  walk(nodes);
  return ids;
}



export function UnifiedMaterialTree({
  folders,
  materials,
  currentFolderId,
  onNavigate,
  isReadOnly = false,
  materialsDeletingId = null,
  onDeleteMaterial,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onCopyFolder,
  onMoveMaterial,
  onRenameMaterial,
  onCopyMaterial,
  onPromoteMaterial
}: UnifiedMaterialTreeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    // Root is open by default
    __root__: true
  });
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [failedPreviewIds, setFailedPreviewIds] = useState<string[]>([]);

  // Expand all folders containing query matches when searching
  useEffect(() => {
    if (!searchQuery) return;
    const expandedMap: Record<string, boolean> = { __root__: true };
    const walk = (list: TreeFolder[]) => {
      for (const node of list) {
        if (matchesSearch(node, materials, searchQuery)) {
          expandedMap[node.id] = true;
        }
        walk(node.children);
      }
    };
    walk(folders);
    setExpandedFolders((prev) => ({ ...prev, ...expandedMap }));
  }, [searchQuery, folders, materials]);

  const handleToggleFolder = (folderId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleToggleFile = (fileId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    setExpandedFiles((prev) => ({
      ...prev,
      [fileId]: !prev[fileId]
    }));
  };

  const handleExpandAll = () => {
    const allIds = getAllFolderIds(folders);
    const expandedMap: Record<string, boolean> = { __root__: true };
    for (const id of allIds) {
      expandedMap[id] = true;
    }
    setExpandedFolders(expandedMap);
  };

  const handleCollapseAll = () => {
    setExpandedFolders({ __root__: true });
    setExpandedFiles({});
  };

  // Filter materials and folders by search query
  const filteredMaterials = useMemo(() => {
    if (!searchQuery) return materials;
    const q = searchQuery.toLowerCase();
    return materials.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [materials, searchQuery]);

  const isFolderVisible = (folder: TreeFolder): boolean => {
    if (!searchQuery) return true;
    return matchesSearch(folder, materials, searchQuery);
  };

  const isFileVisible = (file: TreeFile): boolean => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      file.title.toLowerCase().includes(q) ||
      !!(file.description && file.description.toLowerCase().includes(q))
    );
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const getFileIcon = (type: TreeFile["materialType"]) => {
    switch (type) {
      case "audio":
        return <Music className={`${styles.nodeIcon} ${styles.audioIcon}`} />;
      case "pdf":
        return <FileText className={`${styles.nodeIcon} ${styles.pdfIcon}`} />;
      case "image":
        return <ImageIcon className={`${styles.nodeIcon} ${styles.imageIcon}`} />;
      default:
        return <FileText className={`${styles.nodeIcon} ${styles.fileIcon}`} />;
    }
  };

  // Helper to render inline previews
  const renderInlinePreview = (file: TreeFile) => {
    const rawUrl = file.previewUrl || `/api/admin/learning-materials/${file.id}`;
    const dlUrl = file.downloadUrl || `/api/admin/learning-materials/${file.id}`;

    return (
      <div className={styles.previewContainer} onClick={(e) => e.stopPropagation()}>
        {file.description ? (
          <p className={styles.previewDescription}>{file.description}</p>
        ) : null}

        {file.materialType === "audio" ? (
          <PracticeAudioPlayer src={rawUrl} className={styles.previewPlayer} size="large" />
        ) : null}

        {file.materialType === "image" ? (
          failedPreviewIds.includes(file.id) ? (
            <p className={styles.previewDescription}>Preview unavailable. Open the file directly.</p>
          ) : (
            <NextImage
              src={rawUrl}
              alt={file.title}
              width={400}
              height={140}
              unoptimized
              className={styles.previewImage}
              onError={() => setFailedPreviewIds((prev) => [...prev, file.id])}
            />
          )
        ) : null}

        {file.materialType === "pdf" ? (
          <div className={styles.previewDocInfo}>
            <FileText size={16} className={styles.pdfIcon} />
            <span>PDF Document ({formatBytes(file.sizeBytes)})</span>
          </div>
        ) : null}

        <div className={styles.previewActions}>
          <Tooltip content="Open file in a new browser tab.">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => window.open(rawUrl, "_blank")}
            >
              <Eye size={13} style={{ marginRight: "4px" }} /> Preview
            </button>
          </Tooltip>
          <Tooltip content="Download file directly to your device.">
            <a href={dlUrl} download className="btn btn-secondary btn-sm">
              <Download size={13} style={{ marginRight: "4px" }} /> Download
            </a>
          </Tooltip>
        </div>
      </div>
    );
  };

  // Recursive component to render folders
  const renderFolderNode = (folder: TreeFolder) => {
    if (!isFolderVisible(folder)) return null;

    const isExpanded = !!expandedFolders[folder.id];
    const isActive = currentFolderId === folder.id;
    const folderFiles = filteredMaterials.filter((m) => m.folderId === folder.id);
    const folderChildren = folder.children;
    const hasContents = folderChildren.length > 0 || folderFiles.length > 0;

    return (
      <div key={folder.id} className={styles.nodeWrapper}>
        <div
          className={`${styles.nodeRow} ${isActive ? styles.activeFolder : ""}`}
          onClick={() => {
            onNavigate(folder.id);
            if (hasContents) {
              handleToggleFolder(folder.id);
            }
          }}
        >
          {/* Chevron */}
          <div
            className={styles.chevronContainer}
            onClick={(e) => {
              if (hasContents) {
                handleToggleFolder(folder.id, e);
              } else {
                e.stopPropagation();
              }
            }}
          >
            {hasContents ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : null}
          </div>

          {/* Folder Icon */}
          {isExpanded ? (
            <FolderOpen className={`${styles.nodeIcon} ${styles.folderIcon}`} />
          ) : (
            <Folder className={`${styles.nodeIcon} ${styles.folderIcon}`} />
          )}

          {/* Folder Name */}
          <div className={styles.nodeContent}>
            <span className={styles.nodeTitle}>{folder.name}</span>
          </div>

          {/* Admin actions on hover */}
          {!isReadOnly && (
            <div className={styles.nodeActions} onClick={(e) => e.stopPropagation()}>
              {onCreateFolder && (
                <Tooltip content="Create folder inside this folder.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onCreateFolder("", folder.id)}
                  >
                    <Plus size={14} />
                  </button>
                </Tooltip>
              )}
              {onRenameFolder && (
                <Tooltip content="Rename this folder.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onRenameFolder(folder)}
                  >
                    <Pencil size={14} />
                  </button>
                </Tooltip>
              )}
              {onMoveFolder && (
                <Tooltip content="Move this folder.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onMoveFolder(folder)}
                  >
                    <ArrowRightLeft size={14} />
                  </button>
                </Tooltip>
              )}
              {onCopyFolder && (
                <Tooltip content="Copy this folder.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onCopyFolder(folder)}
                  >
                    <Copy size={14} />
                  </button>
                </Tooltip>
              )}
              {onDeleteFolder && (
                <Tooltip content="Delete this folder. Contents move to parent.">
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    onClick={() => onDeleteFolder(folder)}
                  >
                    <Trash2 size={14} />
                  </button>
                </Tooltip>
              )}
            </div>
          )}
        </div>

        {/* Children Render */}
        {isExpanded && hasContents && (
          <div className={styles.childrenContainer}>
            {folderChildren.map((child) => renderFolderNode(child))}
            {folderFiles.map((file) => renderFileNode(file))}
          </div>
        )}
      </div>
    );
  };

  // Renders a file node
  const renderFileNode = (file: TreeFile) => {
    if (!isFileVisible(file)) return null;

    const isExpanded = !!expandedFiles[file.id];
    const isDeleting = materialsDeletingId === file.id;

    // Formatting date
    const dateStr = new Date(file.createdAt).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    return (
      <div key={file.id} className={styles.nodeWrapper}>
        <div
          className={`${styles.nodeRow} ${styles.activeFile}`}
          onClick={() => handleToggleFile(file.id)}
        >
          {/* File Icon */}
          {getFileIcon(file.materialType)}

          {/* File Meta */}
          <div className={styles.nodeContent}>
            <span className={styles.nodeTitle}>{file.title}</span>
            <div className={styles.nodeMeta}>
              <span>{formatBytes(file.sizeBytes)}</span>
              <span className={styles.metaDivider}>·</span>
              <span>{dateStr}</span>
              {file.bookingStartAt && (
                <>
                  <span className={styles.metaDivider}>·</span>
                  <span className={styles.bookingChip}>
                    Lesson: {new Date(file.bookingStartAt).toLocaleDateString("en-AU")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Actions on hover */}
          <div className={styles.nodeActions} onClick={(e) => e.stopPropagation()}>
            {!isReadOnly && onRenameMaterial && (
              <Tooltip content="Rename file.">
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => onRenameMaterial(file)}
                >
                  <Pencil size={14} />
                </button>
              </Tooltip>
            )}
            {!isReadOnly && onMoveMaterial && (
              <Tooltip content="Move file to another folder.">
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => onMoveMaterial(file)}
                >
                  <ArrowRightLeft size={14} />
                </button>
              </Tooltip>
            )}
            {!isReadOnly && onCopyMaterial && (
              <Tooltip content="Copy file.">
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => onCopyMaterial(file)}
                >
                  <Copy size={14} />
                </button>
              </Tooltip>
            )}
            {!isReadOnly && onPromoteMaterial && (
              <Tooltip content="Add a copy of this file to the shared library.">
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => onPromoteMaterial(file)}
                >
                  <Library size={14} />
                </button>
              </Tooltip>
            )}
            {!isReadOnly && onDeleteMaterial && (
              <Tooltip content="Delete this file permanently.">
                <button
                  type="button"
                  disabled={isDeleting}
                  className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                  onClick={() => onDeleteMaterial(file.id)}
                >
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Expandable Preview */}
        {isExpanded && renderInlinePreview(file)}
      </div>
    );
  };

  const rootFiles = filteredMaterials.filter((m) => m.folderId === null);
  const rootFolders = folders;
  const isRootActive = currentFolderId === null;
  const hasRootContents = rootFolders.length > 0 || rootFiles.length > 0;
  const isRootExpanded = !!expandedFolders.__root__;

  return (
    <div className={styles.treeContainer}>
      {/* Search Input */}
      <div className={styles.searchBar}>
        <Search className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search files and folders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Toolbar */}
      <div className={styles.treeHeader}>
        <span className={styles.treeTitle}>Explorer</span>
        <div className={styles.treeToolbar}>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={handleExpandAll}
          >
            Expand All
          </button>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={handleCollapseAll}
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className={styles.treeViewport}>
        {!hasRootContents && searchQuery ? (
          <p className={styles.emptyState}>No matches found for &quot;{searchQuery}&quot;</p>
        ) : (
          <div className={styles.nodeWrapper}>
            {/* Synthetic Root Folder Node */}
            <div
              className={`${styles.nodeRow} ${isRootActive ? styles.activeFolder : ""}`}
              onClick={() => {
                onNavigate(null);
                handleToggleFolder("__root__");
              }}
            >
              <div
                className={styles.chevronContainer}
                onClick={(e) => handleToggleFolder("__root__", e)}
              >
                {isRootExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {isRootExpanded ? (
                <FolderOpen className={`${styles.nodeIcon} ${styles.folderIcon}`} />
              ) : (
                <Folder className={`${styles.nodeIcon} ${styles.folderIcon}`} />
              )}
              <div className={styles.nodeContent}>
                <span className={styles.nodeTitle}>/</span>
              </div>
              {!isReadOnly && onCreateFolder && (
                <div className={styles.nodeActions} onClick={(e) => e.stopPropagation()}>
                  <Tooltip content="Create folder at root level.">
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => onCreateFolder("", null)}
                    >
                      <Plus size={14} />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>

            {/* Root Children */}
            {isRootExpanded && (
              <div className={styles.childrenContainer}>
                {rootFolders.map((folder) => renderFolderNode(folder))}
                {rootFiles.map((file) => renderFileNode(file))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
