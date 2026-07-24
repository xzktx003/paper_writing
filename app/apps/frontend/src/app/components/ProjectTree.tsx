import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectConfig } from '../hooks/useProject';
import { uploadFiles } from '../../api/client';
import {
  buildProjectTree,
  canCopyTreeItem,
  canMoveTreeItem,
  ClipboardTreeItem,
  copyTreeItem,
  FileItem,
  FileTreeNode,
  canCreateChildrenFromContext,
  getBaseName,
  getCreateTargetFolderPath,
  getFileSelectType,
  getParentPath,
  getUniquePastePath,
  joinProjectPath,
  moveTreeItem,
  normalizeProjectPath,
  removeTreeItem,
} from '../utils/projectTree';
import { downloadAuthenticatedFile } from './AuthenticatedAsset';

interface Props {
  projectPath: string;
  config: ProjectConfig;
  onFileSelect: (file: { path: string; type: 'chapter' | 'code' | 'other' }) => void;
  onChapterReorder: (newOrder: string[]) => void;
}

export function ProjectTree({ projectPath, config, onFileSelect, onChapterReorder }: Props) {
  const { t } = useTranslation();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['files', 'sec', 'docs', 'fig', 'img', 'appendix', 'tab']));
  const restoredTreeRef = useRef<string | null>(null);
  const [fileItems, setFileItems] = useState<FileItem[]>(config.files || []);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileTreeNode | null } | null>(null);
  const [clipboardItem, setClipboardItem] = useState<(ClipboardTreeItem & { action: 'copy' | 'cut' }) | null>(null);
  const [draggedItem, setDraggedItem] = useState<ClipboardTreeItem | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null!);
  const projectId = getPaperAgentProjectId(projectPath);
  const tree = useMemo(() => buildProjectTree(fileItems), [fileItems]);

  useEffect(() => {
    restoredTreeRef.current = null;
    try {
      const saved = JSON.parse(localStorage.getItem(`paper-agent-tree:${projectPath}`) || 'null');
      if (Array.isArray(saved?.expanded)) setExpandedSections(new Set(saved.expanded.filter((item: unknown) => typeof item === 'string')));
    } catch { /* ignore invalid browser state */ }
    restoredTreeRef.current = projectPath;
  }, [projectPath]);

  useEffect(() => {
    if (restoredTreeRef.current !== projectPath) return;
    localStorage.setItem(`paper-agent-tree:${projectPath}`, JSON.stringify({ expanded: [...expandedSections] }));
  }, [projectPath, expandedSections]);

  useEffect(() => {
    setFileItems(config.files || []);
  }, [config.files]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  // 智能菜单位置计算：检测底部/右侧边界，必要时向上/向左弹出
  const getMenuPosition = (clientX: number, clientY: number, menuWidth = 176, menuItemHeight = 32, itemCount = 5) => {
    const menuHeight = menuItemHeight * Math.min(itemCount, 8) + 16; // 估算菜单高度
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let x = clientX;
    let y = clientY;

    // 检测底部边界：菜单向下会超出视口，则向上弹出
    if (clientY + menuHeight > viewportHeight - 10) {
      y = clientY - menuHeight;
    }

    // 检测右侧边界：菜单向右会超出视口，则向左弹出
    if (clientX + menuWidth > viewportWidth - 10) {
      x = clientX - menuWidth;
    }

    // 确保最小值（不会跑到屏幕外）
    x = Math.max(10, x);
    y = Math.max(10, y);

    return { x, y };
  };

  const showContextMenu = (event: React.MouseEvent, node: FileTreeNode | null) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = getMenuPosition(event.clientX, event.clientY);
    setContextMenu({ x: pos.x, y: pos.y, node });
  };

  const copyPath = async (node: FileTreeNode) => {
    const pathToCopy = normalizeProjectPath(node.path);
    const copied = await copyTextToClipboard(pathToCopy);
    setStatus(copied ? t('Copied path: {{path}}', { path: pathToCopy }) : t('Failed to copy path: {{path}}', { path: pathToCopy }));
  };

  const downloadItem = async (node: FileTreeNode) => {
    if (!projectId) return setStatus(t('File operations are only available for managed projects.'));
    const params = new URLSearchParams({ path: normalizeProjectPath(node.path) });
    const url = `/api/projects/${encodeURIComponent(projectId)}/download?${params.toString()}`;
    setStatus(t('Downloading {{path}}', { path: node.path }));
    try {
      await downloadAuthenticatedFile(url, getBaseName(node.path));
    } catch (cause) {
      setStatus(t('Download failed: {{error}}', { error: cause instanceof Error ? cause.message : String(cause) }));
    }
  };

  const deleteItem = async (node: FileTreeNode) => {
    if (!projectId) return setStatus(t('File operations are only available for managed projects.'));
    const ok = window.confirm(t('Delete {{path}}?', { path: node.path }));
    if (!ok) return;
    const res = await fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(node.path)}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      setStatus(body.error || t('Failed to delete {{path}}', { path: node.path }));
      return;
    }
    setFileItems(prev => removeTreeItem(prev, node.path));
    setStatus(t('Deleted {{path}}', { path: node.path }));
  };

  const renameItem = async (node: FileTreeNode) => {
    if (!projectId) return setStatus(t('File operations are only available for managed projects.'));
    // Start inline rename instead of window.prompt()
    const oldName = getBaseName(node.path);
    setRenamingPath(node.path);
    setRenameValue(oldName);
    // Focus the input after render
    setTimeout(() => {
      const input = renameInputRef.current;
      if (input) {
        input.focus();
        // Select name without extension for files
        const dotIdx = oldName.lastIndexOf('.');
        if (dotIdx > 0) {
          input.setSelectionRange(0, dotIdx);
        } else {
          input.select();
        }
      }
    }, 0);
  };

  const confirmRename = async () => {
    const oldPath = renamingPath;
    if (!oldPath || !projectId) return;
    const oldName = getBaseName(oldPath);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === oldName || trimmed.includes('/') || trimmed === '.' || trimmed === '..') {
      setStatus(!trimmed ? t('Name cannot be empty.') : trimmed === oldName ? '' : t('Invalid file name.'));
      setRenamingPath(null);
      return;
    }
    const parentPath = getParentPath(oldPath);
    const newPath = joinProjectPath(parentPath, trimmed);
    const res = await fetch(`/api/projects/${projectId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: oldPath, to: newPath }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      setStatus(body.error || t('Failed to rename {{path}}', { path: oldPath }));
    } else {
      setFileItems(prev => moveTreeItem(prev, oldPath, newPath));
      setStatus(t('Renamed {{from}} → {{to}}', { from: oldName, to: trimmed }));
    }
    setRenamingPath(null);
  };

  const cancelRename = () => {
    setRenamingPath(null);
  };

  const moveItemToFolder = async (source: ClipboardTreeItem, targetFolderPath: string) => {
    if (!projectId) return setStatus(t('File operations are only available for managed projects.'));
    if (!canMoveTreeItem(source, targetFolderPath)) return;
    const destinationPath = joinProjectPath(targetFolderPath, getBaseName(source.path));
    const res = await fetch(`/api/projects/${projectId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: source.path, to: destinationPath }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      setStatus(body.error || t('Failed to move {{path}}', { path: source.path }));
      return;
    }
    setFileItems(prev => moveTreeItem(prev, source.path, destinationPath));
    setExpandedSections(prev => new Set(prev).add(targetFolderPath));
    setStatus(t('Moved {{path}} to {{target}}', { path: source.path, target: targetFolderPath || t('project root') }));
    if (clipboardItem?.action === 'cut' && clipboardItem.path === source.path) setClipboardItem(null);
  };

  const copyItemToFolder = async (source: ClipboardTreeItem, targetFolderPath: string) => {
    if (!projectId) return setStatus(t('File operations are only available for managed projects.'));
    const destinationPath = getUniquePastePath(fileItems, targetFolderPath, source.path);
    const res = await fetch(`/api/projects/${projectId}/copy-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: source.path, to: destinationPath }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      setStatus(body.error || t('Failed to copy {{path}}', { path: source.path }));
      return;
    }
    setFileItems(prev => copyTreeItem(prev, source.path, destinationPath));
    setExpandedSections(prev => new Set(prev).add(targetFolderPath));
    setStatus(t('Copied {{from}} to {{to}}', { from: source.path, to: destinationPath }));
  };

  const pasteIntoFolder = async (targetFolderPath: string) => {
    if (!clipboardItem) return;
    if (clipboardItem.action === 'copy') await copyItemToFolder(clipboardItem, targetFolderPath);
    else await moveItemToFolder(clipboardItem, targetFolderPath);
  };

  const createItem = async (targetFolderPath: string, type: 'file' | 'folder') => {
    if (!projectId) return setStatus(t('File operations are only available for managed projects.'));
    const label = type === 'folder' ? t('folder') : t('file');
    const rawName = window.prompt(t('New {{type}} name', { type: label }));
    if (rawName === null) return;
    const name = rawName.trim();
    if (!name) return setStatus(t('New {{type}} name is required.', { type: label }));
    if (name === '.' || name === '..' || normalizeProjectPath(name) !== name || name.includes('/')) {
      return setStatus(t('New {{type}} name cannot contain path separators.', { type: label }));
    }
    const destinationPath = joinProjectPath(targetFolderPath, name);
    const res = await fetch(`/api/projects/${projectId}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: destinationPath, type }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      setStatus(body.error || t('Failed to create {{path}}', { path: destinationPath }));
      return;
    }
    const itemType: FileItem['type'] = type === 'folder' ? 'dir' : 'file';
    setFileItems(prev => [...prev, { path: destinationPath, type: itemType }]);
    setExpandedSections(prev => {
      const next = new Set(prev).add(targetFolderPath || 'files');
      if (itemType === 'dir') next.add(destinationPath);
      return next;
    });
    setStatus(t('Created {{path}}', { path: destinationPath }));
    if (itemType === 'file') onFileSelect({ path: destinationPath, type: getFileSelectType(destinationPath) });
  };

  const handleDrop = async (source: ClipboardTreeItem, targetFolderPath: string) => {
    setDropTargetPath(null);
    setDraggedItem(null);
    await moveItemToFolder(source, targetFolderPath);
  };

  const triggerUpload = (targetFolder: string) => {
    if (!projectId) return setStatus(t('File operations are only available for managed projects.'));

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';

    input.addEventListener('change', async (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      document.body.removeChild(input);
      setUploading(true);
      setStatus(t('Uploading...'));

      try {
        const result = await uploadFiles(projectId, Array.from(files), targetFolder || undefined);
        if (result.ok && result.files) {
          const newItems: FileItem[] = result.files.map(f => ({
            path: f,
            type: 'file' as const,
          }));
          setFileItems(prev => [...prev, ...newItems]);

          if (targetFolder) {
            setExpandedSections(prev => new Set(prev).add(targetFolder));
          }

          setStatus(t('Uploaded {{count}} file(s)', { count: result.files.length }));
        } else {
          setStatus(t('Upload failed'));
        }
      } catch (err) {
        setStatus(t('Upload error: {{error}}', { error: err instanceof Error ? err.message : t('Unknown error') }));
      } finally {
        setUploading(false);
      }
    }, { once: true });

    document.body.appendChild(input);
    input.click();
  };

  // Refresh file list from server
  const refreshFiles = async () => {
    if (!projectId) return;
    setStatus(t('Refreshing...'));
    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (res.ok) {
        const data = await res.json();
        if (data.files) {
          setFileItems(data.files);
          setStatus(t('Loaded {{count}} files', { count: data.files.length }));
        }
      } else {
        setStatus(t('Failed to refresh'));
      }
    } catch {
      setStatus(t('Refresh error'));
    }
  };

  return (
    <div
      style={{ fontSize: '13px', position: 'relative', minHeight: '100%' }}
      onContextMenu={(event) => showContextMenu(event, null)}
    >
      <div>
        <div
          onClick={() => toggleSection('files')}
          onDragOver={(event) => {
            if (!draggedItem || !canMoveTreeItem(draggedItem, '')) return;
            event.preventDefault();
            setDropTargetPath('');
          }}
          onDragLeave={() => setDropTargetPath(null)}
          onDrop={(event) => {
            event.preventDefault();
            if (draggedItem) void handleDrop(draggedItem, '');
          }}
          style={{ padding: '4px 8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span>{expandedSections.has('files') ? '▼' : '▶'}</span>
          <span>{t('Files')}</span>
          {projectId && (
            <button
              type="button"
              title={t('Upload files')}
              disabled={uploading}
              onClick={(e) => {
                e.stopPropagation();
                triggerUpload('');
              }}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                cursor: uploading ? 'wait' : 'pointer',
                color: 'var(--muted)',
                fontSize: '11px',
                padding: '1px 4px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                borderRadius: '3px',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-strong)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
            >
              {uploading ? `⏳ ${t('Uploading...')}` : `↑ ${t('Upload')}`}
            </button>
          )}
          {projectId && (
            <button
              type="button"
              title={t('Refresh file list')}
              onClick={(e) => {
                e.stopPropagation();
                void refreshFiles();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                fontSize: '11px',
                padding: '1px 4px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                borderRadius: '3px',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-strong)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
            >
              🔄
            </button>
          )}
        </div>
        {expandedSections.has('files') && (
          <div style={{ paddingLeft: '6px' }}>
            {tree.length === 0 ? (
              <div style={{ padding: '4px 8px 4px 18px', color: 'var(--muted)', fontSize: '12px' }}>{t('No files')}</div>
            ) : tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                expanded={expandedSections}
                onToggle={toggleSection}
                onSelect={(filePath) => onFileSelect({ path: filePath, type: getFileSelectType(filePath) })}
                onContextMenu={showContextMenu}
                onDragStart={setDraggedItem}
                onDragEnd={() => {
                  setDraggedItem(null);
                  setDropTargetPath(null);
                }}
                onDrop={handleDrop}
                draggedItem={draggedItem}
                dropTargetPath={dropTargetPath}
                onDropTargetChange={setDropTargetPath}
                renamingPath={renamingPath}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameConfirm={confirmRename}
                onRenameCancel={cancelRename}
                renameInputRef={renameInputRef}
              />
            ))}
            {draggedItem && canMoveTreeItem(draggedItem, '') && (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTargetPath('');
                }}
                onDragLeave={(event) => {
                  event.stopPropagation();
                  setDropTargetPath(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (draggedItem) void handleDrop(draggedItem, '');
                }}
                style={{
                  margin: '6px 8px 4px 18px',
                  padding: '7px 10px',
                  border: `1px dashed ${dropTargetPath === '' ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  color: dropTargetPath === '' ? 'var(--accent-strong)' : 'var(--muted)',
                  background: dropTargetPath === '' ? 'var(--accent-soft)' : 'transparent',
                  fontSize: 12,
                }}
              >
                {t('Drop here to move to project root')}
              </div>
            )}
          </div>
        )}
      </div>
      {status && <div style={{ padding: '6px 8px', color: 'var(--muted)', fontSize: '11px' }}>{status}</div>}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          clipboardItem={clipboardItem}
          onCopyPath={copyPath}
          onDownload={downloadItem}
          onCopy={(node) => setClipboardItem({ path: node.path, type: node.type, action: 'copy' })}
          onCut={(node) => setClipboardItem({ path: node.path, type: node.type, action: 'cut' })}
          onRename={(node) => void renameItem(node)}
          onCreateFile={(targetFolder) => createItem(targetFolder, 'file')}
          onCreateFolder={(targetFolder) => createItem(targetFolder, 'folder')}
          onUpload={(targetFolder) => triggerUpload(targetFolder)}
          onPaste={(targetFolder) => pasteIntoFolder(targetFolder)}
          onDelete={deleteItem}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (section: string) => void;
  onSelect: (filePath: string) => void;
  onContextMenu: (event: React.MouseEvent, node: FileTreeNode) => void;
  onDragStart: (node: ClipboardTreeItem) => void;
  onDragEnd: () => void;
  onDrop: (source: ClipboardTreeItem, targetFolderPath: string) => void;
  draggedItem: ClipboardTreeItem | null;
  dropTargetPath: string | null;
  onDropTargetChange: (path: string | null) => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  renameInputRef: React.RefObject<HTMLInputElement>;
}

function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDrop,
  draggedItem,
  dropTargetPath,
  onDropTargetChange,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  renameInputRef,
}: TreeNodeProps) {
  const isDir = node.type === 'dir';
  const isOpen = expanded.has(node.path);
  const isDropTarget = isDir && dropTargetPath === node.path;
  const isRenaming = renamingPath === node.path;

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onRenameConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onRenameCancel();
    }
  };

  return (
    <div>
      <div
        onClick={() => isDir ? onToggle(node.path) : onSelect(node.path)}
        onContextMenu={(event) => onContextMenu(event, node)}
        draggable={!isRenaming}
        onDragStart={(event) => {
          if (isRenaming) return;
          event.stopPropagation();
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', node.path);
          onDragStart({ path: node.path, type: node.type });
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (!isDir || !draggedItem || !canMoveTreeItem(draggedItem, node.path)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          onDropTargetChange(node.path);
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          onDropTargetChange(null);
        }}
        onDrop={(event) => {
          if (!isDir || !draggedItem) return;
          event.preventDefault();
          event.stopPropagation();
          onDrop(draggedItem, node.path);
        }}
        style={{
          padding: '3px 8px',
          paddingLeft: `${8 + depth * 14}px`,
          cursor: 'pointer',
          borderRadius: '3px',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          minWidth: 0,
          background: isDropTarget ? 'var(--accent-soft)' : 'transparent',
        }}
        onMouseEnter={e => { if (!isDropTarget) e.currentTarget.style.background = 'var(--hover)'; }}
        onMouseLeave={e => { if (!isDropTarget) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ width: 12, flexShrink: 0, color: 'var(--muted)' }}>{isDir ? (isOpen ? '▼' : '▶') : ''}</span>
        <FileIcon path={node.path} isDir={isDir} isOpen={isOpen} />
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={onRenameConfirm}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1,
              minWidth: 0,
              border: '1px solid var(--accent)',
              borderRadius: 3,
              padding: '1px 4px',
              fontSize: '13px',
              background: 'var(--paper)',
              color: 'var(--text)',
              outline: 'none',
              boxShadow: '0 0 0 2px var(--accent-soft)',
            }}
          />
        ) : (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.path}>
            {node.name}
          </span>
        )}
      </div>
      {isDir && isOpen && node.children.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
          draggedItem={draggedItem}
          dropTargetPath={dropTargetPath}
          onDropTargetChange={onDropTargetChange}
          renamingPath={renamingPath}
          renameValue={renameValue}
          onRenameChange={onRenameChange}
          onRenameConfirm={onRenameConfirm}
          onRenameCancel={onRenameCancel}
          renameInputRef={renameInputRef}
        />
      ))}
    </div>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  node: FileTreeNode | null;
  clipboardItem: (ClipboardTreeItem & { action: 'copy' | 'cut' }) | null;
  onCopyPath: (node: FileTreeNode) => void;
  onDownload: (node: FileTreeNode) => void;
  onCopy: (node: FileTreeNode) => void;
  onCut: (node: FileTreeNode) => void;
  onRename: (node: FileTreeNode) => void;
  onCreateFile: (targetFolderPath: string) => void;
  onCreateFolder: (targetFolderPath: string) => void;
  onUpload: (targetFolderPath: string) => void;
  onPaste: (targetFolderPath: string) => void;
  onDelete: (node: FileTreeNode) => void;
  onClose: () => void;
}

function ContextMenu({ x, y, node, clipboardItem, onCopyPath, onDownload, onCopy, onCut, onRename, onCreateFile, onCreateFolder, onUpload, onPaste, onDelete, onClose }: ContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  // 动态调整菜单位置，确保不超出视口
  useEffect(() => {
    if (!menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let newX = x;
    let newY = y;

    // 检测底部边界
    if (rect.bottom > viewportHeight - 10) {
      newY = y - rect.height;
      newY = Math.max(10, newY);
    }

    // 检测右侧边界
    if (rect.right > viewportWidth - 10) {
      newX = x - rect.width;
      newX = Math.max(10, newX);
    }

    setAdjustedPos({ x: newX, y: newY });
  }, [x, y]);

  const createTargetFolderPath = getCreateTargetFolderPath(node);
  const targetFolderPath = createTargetFolderPath ?? getParentPath(node?.path || '');
  const canCreateChildren = canCreateChildrenFromContext(node);
  const canPaste = !!clipboardItem && (
    clipboardItem.action === 'copy'
      ? canCopyTreeItem(clipboardItem, targetFolderPath)
      : canMoveTreeItem(clipboardItem, targetFolderPath)
  );
  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        top: adjustedPos.y,
        left: adjustedPos.x,
        zIndex: 1000,
        minWidth: 176,
        padding: '4px',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
        borderRadius: 6,
        color: 'var(--text)',
      }}
    >
      {node && (
        <>
          <MenuItem label={t('Copy Path')} onClick={() => run(() => void onCopyPath(node))} />
          <MenuItem label={t('Download')} onClick={() => run(() => onDownload(node))} />
          <MenuItem label={t('Copy')} onClick={() => run(() => onCopy(node))} />
          <MenuItem label={t('Cut')} onClick={() => run(() => onCut(node))} />
          <MenuItem label={t('Rename')} onClick={() => run(() => onRename(node))} />
          <MenuDivider />
        </>
      )}
      <MenuItem label={t('Paste')} disabled={!canPaste} onClick={() => run(() => onPaste(targetFolderPath))} />
      {canCreateChildren && (
        <>
          <MenuItem label={t('New File')} onClick={() => run(() => void onCreateFile(createTargetFolderPath ?? ''))} />
          <MenuItem label={t('New Folder')} onClick={() => run(() => void onCreateFolder(createTargetFolderPath ?? ''))} />
          <MenuItem label={t('Upload')} onClick={() => run(() => onUpload(createTargetFolderPath ?? ''))} />
        </>
      )}
      {node && (
        <>
          <MenuDivider />
          <MenuItem label={t('Delete')} danger onClick={() => run(() => void onDelete(node))} />
        </>
      )}
    </div>
  );
}


async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back below. Clipboard API can be unavailable or denied on plain HTTP.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function MenuItem({ label, disabled, danger, onClick }: { label: string; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%',
        border: 'none',
        background: 'transparent',
        textAlign: 'left',
        padding: '6px 10px',
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--muted)' : danger ? 'var(--danger)' : 'var(--text)',
        fontSize: 12,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />;
}

function getPaperAgentProjectId(projectPath: string): string | null {
  return projectPath.startsWith('__paper_agent__:') ? projectPath.replace('__paper_agent__:', '') : null;
}

function FileIcon({ path, isDir, isOpen }: { path: string; isDir: boolean; isOpen: boolean }) {
  if (isDir) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 14,
          flexShrink: 0,
          position: 'relative',
          display: 'inline-block',
          borderRadius: '3px',
          background: isOpen ? '#d99a2b' : '#c78a20',
          boxShadow: 'inset 0 -1px 0 rgba(0, 0, 0, 0.12)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 1,
            top: -3,
            width: 8,
            height: 5,
            borderRadius: '3px 3px 0 0',
            background: isOpen ? '#e7b65a' : '#d8a13d',
          }}
        />
      </span>
    );
  }

  const icon = fileIcon(path);
  const isBadge = icon.label.length <= 4;
  return (
    <span
      aria-hidden="true"
      title={icon.label}
      style={{
        width: 18,
        height: 18,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: isBadge ? 4 : 3,
        border: `1px solid ${icon.border}`,
        background: icon.bg,
        color: icon.fg,
        fontFamily: isBadge ? '"JetBrains Mono", monospace' : 'inherit',
        fontSize: isBadge ? 8 : 12,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      {icon.label}
    </span>
  );
}

function fileIcon(filePath: string): { label: string; bg: string; fg: string; border: string } {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tex')) return { label: 'TEX', bg: '#e8f1ff', fg: '#2563eb', border: '#bfd4ff' };
  if (lower.endsWith('.bib')) return { label: 'BIB', bg: '#f0eaff', fg: '#7c3aed', border: '#d8c7ff' };
  if (lower.endsWith('.sty')) return { label: 'STY', bg: '#eef2ff', fg: '#4338ca', border: '#c7d2fe' };
  if (lower.endsWith('.bst')) return { label: 'BST', bg: '#f5f3ff', fg: '#6d28d9', border: '#ddd6fe' };
  if (lower.endsWith('.py')) return { label: 'PY', bg: '#fff3c4', fg: '#8a5a00', border: '#f2d56b' };
  if (lower.endsWith('.md')) return { label: 'MD', bg: '#eef6f3', fg: '#047857', border: '#b7ded0' };
  if (lower.endsWith('.pdf')) return { label: 'PDF', bg: '#feeceb', fg: '#dc2626', border: '#fecaca' };
  if (/\.(png|jpg|jpeg|gif|webp|svg|eps)$/i.test(lower)) return { label: 'IMG', bg: '#ecfdf5', fg: '#059669', border: '#bbf7d0' };
  if (/\.(js|jsx|ts|tsx)$/i.test(lower)) return { label: 'JS', bg: '#fff7d6', fg: '#a16207', border: '#f5df87' };
  if (/\.(json|yaml|yml|toml)$/i.test(lower)) return { label: '{}', bg: '#f5f3ff', fg: '#6d28d9', border: '#ddd6fe' };
  return { label: '.', bg: '#f4f6f8', fg: '#64748b', border: '#dbe1e8' };
}
