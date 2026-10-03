import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  HardDrive,
  Folder,
  File,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Layers,
  CornerDownRight,
  FolderOpen,
  PieChart,
} from 'lucide-react';
import {
  SsdDriveOverview,
  DriveCategoryBreakdown,
  PathBreakdownReport,
  PathBreakdownNode,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface SsdStorageLensTabProps {
  onNavigateToTab?: (tab: string) => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TreemapLayoutNode extends PathBreakdownNode {
  rect: Rect;
}

// Category palette using design tokens
const NODE_CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  artifact: {
    bg: 'bg-[var(--color-success-bg)] hover:bg-[var(--color-success-bg)]',
    border: 'border-[var(--color-success-border)] hover:border-[var(--color-success)]',
    text: 'text-[var(--color-success)]',
    dot: 'bg-[var(--color-success)]',
  },
  cache: {
    bg: 'bg-[var(--color-warning-bg)] hover:bg-[var(--color-warning-bg)]',
    border: 'border-[var(--color-warning-border)] hover:border-[var(--color-warning)]',
    text: 'text-[var(--color-warning)]',
    dot: 'bg-[var(--color-warning)]',
  },
  virtual_disk: {
    bg: 'bg-[var(--color-info-bg)] hover:bg-[var(--color-info-bg)]',
    border: 'border-[var(--color-info-border)] hover:border-[var(--color-info)]',
    text: 'text-[var(--color-info)]',
    dot: 'bg-[var(--color-info)]',
  },
  ai_model: {
    bg: 'bg-purple-500/10 hover:bg-purple-500/15',
    border: 'border-purple-500/25 hover:border-purple-500/40',
    text: 'text-purple-400',
    dot: 'bg-purple-400',
  },
  download: {
    bg: 'bg-orange-500/10 hover:bg-orange-500/15',
    border: 'border-orange-500/25 hover:border-orange-500/40',
    text: 'text-orange-400',
    dot: 'bg-orange-400',
  },
  system: {
    bg: 'bg-[var(--color-danger-bg)] hover:bg-[var(--color-danger-bg)]',
    border: 'border-[var(--color-danger-border)] hover:border-[var(--color-danger)]',
    text: 'text-[var(--color-danger)]',
    dot: 'bg-[var(--color-danger)]',
  },
  folder: {
    bg: 'bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]',
    border: 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
    text: 'text-[var(--color-accent-strong)]',
    dot: 'bg-[var(--color-accent)]',
  },
  source_code: {
    bg: 'bg-[var(--color-accent-muted)] hover:bg-[var(--color-accent-muted)]',
    border: 'border-[var(--color-accent)]/30 hover:border-[var(--color-accent)]',
    text: 'text-[var(--color-accent-strong)]',
    dot: 'bg-[var(--color-accent)]',
  },
  media: {
    bg: 'bg-pink-500/10 hover:bg-pink-500/15',
    border: 'border-pink-500/25 hover:border-pink-500/40',
    text: 'text-pink-400',
    dot: 'bg-pink-400',
  },
  file: {
    bg: 'bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]',
    border: 'border-[var(--color-border-subtle)] hover:border-[var(--color-border)]',
    text: 'text-[var(--color-text-secondary)]',
    dot: 'bg-[var(--color-text-tertiary)]',
  },
};

/**
 * Standard Squarified Treemap layout algorithm for fast drill-down cartography
 */
function computeSquarifiedTreemap(
  items: PathBreakdownNode[],
  width: number,
  height: number
): TreemapLayoutNode[] {
  if (width <= 0 || height <= 0 || items.length === 0) return [];

  const total = items.reduce((acc, it) => acc + Math.max(1, it.size_bytes), 0);
  const elements = items
    .filter((it) => it.size_bytes > 0)
    .sort((a, b) => b.size_bytes - a.size_bytes)
    .map((it) => ({
      item: it,
      area: (Math.max(1, it.size_bytes) / total) * (width * height),
    }));

  if (elements.length === 0) return [];

  const results: TreemapLayoutNode[] = [];

  function layoutRow(row: typeof elements, rect: Rect, isHorizontal: boolean) {
    const rowArea = row.reduce((acc, el) => acc + el.area, 0);
    const rowThickness = isHorizontal ? rowArea / rect.w : rowArea / rect.h;
    let offset = 0;

    for (const el of row) {
      const elLength = rowThickness > 0 ? el.area / rowThickness : 0;
      if (isHorizontal) {
        results.push({
          ...el.item,
          rect: {
            x: rect.x + offset,
            y: rect.y,
            w: Math.max(1, elLength),
            h: Math.max(1, rowThickness),
          },
        });
        offset += elLength;
      } else {
        results.push({
          ...el.item,
          rect: {
            x: rect.x,
            y: rect.y + offset,
            w: Math.max(1, rowThickness),
            h: Math.max(1, elLength),
          },
        });
        offset += elLength;
      }
    }
  }

  function worstRatio(row: typeof elements, length: number) {
    if (row.length === 0 || length <= 0) return Infinity;
    const rowArea = row.reduce((acc, el) => acc + el.area, 0);
    const rowThickness = rowArea / length;
    if (rowThickness <= 0) return Infinity;

    let maxRatio = 0;
    for (const el of row) {
      const elLength = el.area / rowThickness;
      if (elLength <= 0) continue;
      const ratio = Math.max(rowThickness / elLength, elLength / rowThickness);
      if (ratio > maxRatio) maxRatio = ratio;
    }
    return maxRatio;
  }

  function squarify(children: typeof elements, rect: Rect) {
    if (children.length === 0) return;
    if (rect.w <= 0 || rect.h <= 0) return;

    const remainingRect = { ...rect };
    let currentRow: typeof elements = [];

    for (let i = 0; i < children.length; i++) {
      const nextItem = children[i];
      const isHorizontal = remainingRect.w >= remainingRect.h;
      const length = isHorizontal ? remainingRect.w : remainingRect.h;

      if (currentRow.length === 0) {
        currentRow.push(nextItem);
      } else {
        const currentWorst = worstRatio(currentRow, length);
        const nextWorst = worstRatio([...currentRow, nextItem], length);

        if (nextWorst <= currentWorst) {
          currentRow.push(nextItem);
        } else {
          layoutRow(currentRow, remainingRect, isHorizontal);
          const rowArea = currentRow.reduce((acc, el) => acc + el.area, 0);
          const rowThickness = rowArea / length;

          if (isHorizontal) {
            remainingRect.y += rowThickness;
            remainingRect.h = Math.max(0, remainingRect.h - rowThickness);
          } else {
            remainingRect.x += rowThickness;
            remainingRect.w = Math.max(0, remainingRect.w - rowThickness);
          }

          currentRow = [nextItem];
        }
      }
    }

    if (currentRow.length > 0) {
      const isHorizontal = remainingRect.w >= remainingRect.h;
      layoutRow(currentRow, remainingRect, isHorizontal);
    }
  }

  squarify(elements, { x: 0, y: 0, w: width, h: height });
  return results;
}

export const SsdStorageLensTab: React.FC<SsdStorageLensTabProps> = () => {
  // Drives overview
  const [drives, setDrives] = useState<SsdDriveOverview[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string>('C:');
  const [breakdown, setBreakdown] = useState<DriveCategoryBreakdown | null>(null);
  const [drivesLoading, setDrivesLoading] = useState(true);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  // Cartography Drill-Down
  const [currentScanPath, setCurrentScanPath] = useState<string>('C:\\');
  const [pathReport, setPathReport] = useState<PathBreakdownReport | null>(null);
  const [pathScanning, setPathScanning] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<TreemapLayoutNode | null>(null);

  // Treemap container size
  const treemapContainerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 900, height: 380 });

  // Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Observe container size
  useEffect(() => {
    if (!treemapContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          const computedHeight = Math.max(300, Math.min(500, Math.round(width * 0.42)));
          setDimensions({ width, height: computedHeight });
        }
      }
    });
    observer.observe(treemapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initial drives fetch
  const loadDrives = useCallback(async () => {
    setDrivesLoading(true);
    try {
      const list = await EntropyApiClient.getSsdDrivesOverview();
      setDrives(list);
      if (list.length > 0) {
        const defaultDrive = list.find((d) => d.is_system) || list[0];
        setSelectedDrive(defaultDrive.drive);
        setCurrentScanPath(defaultDrive.mountpoint);
      }
    } catch (err) {
      console.error('Failed to load SSD drives:', err);
    } finally {
      setDrivesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrives();
  }, [loadDrives]);

  // Load category breakdown when selected drive changes
  const loadBreakdown = useCallback(async (driveLetter: string) => {
    setBreakdownLoading(true);
    try {
      const data = await EntropyApiClient.getDriveCategoryBreakdown(driveLetter);
      setBreakdown(data);
    } catch (err) {
      console.error('Failed to load drive category breakdown:', err);
    } finally {
      setBreakdownLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDrive) {
      loadBreakdown(selectedDrive);
    }
  }, [selectedDrive, loadBreakdown]);

  // Scan path drill down
  const scanPath = useCallback(async (targetPath: string) => {
    setPathScanning(true);
    try {
      const rep = await EntropyApiClient.scanPathBreakdown(targetPath, 1);
      setPathReport(rep);
      setCurrentScanPath(rep.path);
    } catch (err) {
      console.error('Failed to scan path breakdown:', err);
    } finally {
      setPathScanning(false);
    }
  }, []);

  useEffect(() => {
    if (currentScanPath) {
      scanPath(currentScanPath);
    }
  }, [currentScanPath, scanPath]);

  // Compute treemap layout nodes
  const layoutNodes = useMemo(() => {
    if (!pathReport || !pathReport.items) return [];
    return computeSquarifiedTreemap(pathReport.items, dimensions.width, dimensions.height);
  }, [pathReport, dimensions]);

  // Switch active drive
  const handleSelectDrive = (d: SsdDriveOverview) => {
    setSelectedDrive(d.drive);
    setCurrentScanPath(d.mountpoint);
  };

  // Open folder in Explorer
  const handleOpenExplorer = async (path: string) => {
    try {
      await EntropyApiClient.openInExplorer(path);
      setToastMessage('Opened in File Explorer.');
    } catch {
      setToastMessage('Failed to open Explorer.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-surface-3)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] shadow-2xl animate-in slide-in-from-bottom-2 duration-150">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Drive Selector Strip ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              <HardDrive size={18} className="text-[var(--color-accent)]" />
              <span>SSD Storage Lens &amp; Space Cartography</span>
            </h1>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Inspect physical disk capacity, domain space distribution, and drill down hierarchically into largest directories.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              loadDrives();
              if (selectedDrive) loadBreakdown(selectedDrive);
              if (currentScanPath) scanPath(currentScanPath);
            }}
            disabled={drivesLoading || breakdownLoading || pathScanning}
            className="p-2 rounded-xl bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
            title="Refresh Storage Lens"
            aria-label="Refresh Storage Lens"
          >
            <RefreshCw size={14} className={drivesLoading || breakdownLoading || pathScanning ? 'animate-spin text-[var(--color-accent)]' : ''} />
          </button>
        </div>

        {/* Drive Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {drives.map((d) => {
            const isSelected = selectedDrive.toUpperCase().startsWith(d.drive.toUpperCase());
            return (
              <div
                key={d.drive}
                onClick={() => handleSelectDrive(d)}
                className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] shadow-md ring-1 ring-[var(--color-accent)]/30'
                    : 'bg-[var(--color-surface-1)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]' : 'bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]'}`}>
                      <HardDrive size={16} />
                    </div>
                    <div>
                      <span className="text-sm font-bold font-mono text-[var(--color-text-primary)]">
                        {d.drive}
                      </span>
                      <span className="text-xs text-[var(--color-text-tertiary)] ml-1.5 font-medium">
                        {d.label || 'Local Disk'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {d.is_dev_drive && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                        DEV DRIVE
                      </span>
                    )}
                    {d.is_system && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)] border border-[var(--color-accent)]/20">
                        SYSTEM
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]">
                      {d.fstype}
                    </span>
                  </div>
                </div>

                {/* Capacity Bar */}
                <div className="space-y-1.5 mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-text-tertiary)]">
                      {d.free_formatted} free of {d.total_formatted}
                    </span>
                    <span className={`font-mono font-semibold ${d.percent_used > 85 ? 'text-[var(--color-danger)]' : d.percent_used > 70 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'}`}>
                      {d.percent_used}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--color-surface-3)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        d.percent_used > 85
                          ? 'bg-[var(--color-danger)]'
                          : d.percent_used > 70
                          ? 'bg-[var(--color-warning)]'
                          : 'bg-[var(--color-accent)]'
                      }`}
                      style={{ width: `${d.percent_used}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Category Breakdown Spectrum Bar ── */}
      {breakdown && (
        <div className="p-5 rounded-2xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <PieChart size={15} className="text-[var(--color-accent)]" />
                <h2 className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
                  {breakdown.drive} Space Distribution Spectrum
                </h2>
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Breakdown of {breakdown.used_formatted} used space into developer artifacts, caches, and system domains.
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs text-[var(--color-text-tertiary)] mr-1.5">Reclaimable on {breakdown.drive}:</span>
              <span className="text-sm font-bold font-mono text-[var(--color-success)]">
                {breakdown.total_reclaimable_formatted}
              </span>
            </div>
          </div>

          {/* Stacked Proportional Bar */}
          <div className="w-full h-4 rounded-xl bg-[var(--color-surface-3)] overflow-hidden flex gap-0.5 p-0.5">
            {breakdown.categories.map((cat) => (
              <div
                key={cat.id}
                className="h-full first:rounded-l-lg last:rounded-r-lg transition-all duration-300 relative group cursor-pointer"
                style={{
                  width: `${Math.max(1, cat.percent_of_used)}%`,
                  backgroundColor: cat.color_var,
                }}
                title={`${cat.label}: ${cat.size_formatted} (${cat.percent_of_used}%)`}
              />
            ))}
          </div>

          {/* Legend Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 pt-2">
            {breakdown.categories.map((cat) => (
              <div
                key={cat.id}
                className="p-2.5 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border-subtle)] space-y-1"
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color_var }}
                  />
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary)] truncate">
                    {cat.label}
                  </span>
                </div>
                <div className="text-xs font-bold font-mono text-[var(--color-text-primary)]">
                  {cat.size_formatted}
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--color-text-tertiary)] font-mono">
                  <span>{cat.percent_of_used}%</span>
                  {cat.is_reclaimable && (
                    <span className="text-[var(--color-success)] font-medium">Reclaimable</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Interactive Cartography & Drill-Down ── */}
      <div className="p-5 rounded-2xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs space-y-4">
        {/* Navigation Header & Breadcrumbs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-semibold text-[var(--color-text-tertiary)] flex items-center gap-1">
              <FolderOpen size={14} className="text-[var(--color-accent)]" />
              <span>Location:</span>
            </span>

            {/* Breadcrumb Trail */}
            <div className="flex items-center gap-1 flex-wrap text-xs font-mono">
              {pathReport?.breadcrumbs.map((bc, idx) => {
                const isLast = idx === (pathReport.breadcrumbs.length - 1);
                return (
                  <React.Fragment key={bc.path}>
                    <button
                      type="button"
                      onClick={() => scanPath(bc.path)}
                      className={`px-1.5 py-0.5 rounded hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer ${
                        isLast
                          ? 'font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-2)]'
                          : 'text-[var(--color-accent-strong)] hover:underline'
                      }`}
                    >
                      {bc.name}
                    </button>
                    {!isLast && (
                      <ChevronRight size={12} className="text-[var(--color-text-tertiary)]" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Quick Jump Shortcuts */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scanPath(`${selectedDrive}\\`)}
              className="px-2 py-1 rounded-lg text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] transition-colors cursor-pointer"
            >
              Drive Root ({selectedDrive})
            </button>
            <button
              type="button"
              onClick={() => handleOpenExplorer(currentScanPath)}
              className="p-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] transition-colors cursor-pointer"
              title="Reveal Current Folder in Windows Explorer"
              aria-label="Reveal Current Folder in Windows Explorer"
            >
              <ExternalLink size={13} />
            </button>
          </div>
        </div>

        {/* Squarified Treemap Canvas */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
            <span className="flex items-center gap-1.5">
              <Layers size={13} className="text-[var(--color-accent)]" />
              <span>Proportional Storage Footprint (Click any directory to drill down)</span>
            </span>
            {pathScanning && (
              <span className="flex items-center gap-1 text-[var(--color-accent)] font-medium">
                <RefreshCw size={11} className="animate-spin" />
                <span>Scanning directory...</span>
              </span>
            )}
          </div>

          <div
            ref={treemapContainerRef}
            className="w-full relative rounded-xl bg-[var(--color-surface-0)] border border-[var(--color-border)] overflow-hidden"
            style={{ height: dimensions.height }}
          >
            {layoutNodes.map((node) => {
              const style = NODE_CATEGORY_STYLES[node.category] || NODE_CATEGORY_STYLES.folder;
              const isHovered = hoveredNode?.id === node.id;
              const canDrillDown = node.is_dir;

              // Hide labels if rectangle is too tiny
              const showText = node.rect.w > 65 && node.rect.h > 40;
              const showDetail = node.rect.w > 95 && node.rect.h > 60;

              return (
                <div
                  key={node.id}
                  onClick={() => {
                    if (canDrillDown) scanPath(node.path);
                  }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  className={`absolute transition-all duration-150 p-2 select-none flex flex-col justify-between overflow-hidden border ${style.bg} ${style.border} ${
                    canDrillDown ? 'cursor-pointer' : 'cursor-default'
                  } ${isHovered ? 'z-10 ring-2 ring-[var(--color-accent)]' : 'z-0'}`}
                  style={{
                    left: node.rect.x,
                    top: node.rect.y,
                    width: node.rect.w,
                    height: node.rect.h,
                  }}
                >
                  {showText && (
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        {node.is_dir ? (
                          <Folder size={12} className={`${style.text} shrink-0`} />
                        ) : (
                          <File size={12} className={`${style.text} shrink-0`} />
                        )}
                        <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                          {node.name}
                        </span>
                      </div>
                      {showDetail && (
                        <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5 truncate">
                          {node.category_label}
                        </div>
                      )}
                    </div>
                  )}

                  {showText && (
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="font-bold text-[var(--color-text-primary)]">
                        {node.size_formatted}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">
                        {node.percentage}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {layoutNodes.length === 0 && !pathScanning && (
              <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--color-text-tertiary)] p-6 text-center">
                <FolderOpen size={24} className="mb-2 opacity-50" />
                <span>This directory is empty or contains no measurable storage files.</span>
              </div>
            )}
          </div>
        </div>

        {/* Directory Items List */}
        <div className="space-y-2 pt-2">
          <div className="text-xs font-semibold text-[var(--color-text-primary)]">
            Contents of {pathReport?.name || currentScanPath} ({pathReport?.total_size_formatted || '0 B'})
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {pathReport?.items.map((it) => {
              const style = NODE_CATEGORY_STYLES[it.category] || NODE_CATEGORY_STYLES.folder;
              return (
                <div
                  key={it.path}
                  className="p-2.5 rounded-xl bg-[var(--color-surface-2)]/50 hover:bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border)] transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`p-1.5 rounded-lg ${style.bg} ${style.text} shrink-0`}>
                      {it.is_dir ? <Folder size={14} /> : <File size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate font-mono">
                          {it.name}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]">
                          {it.category_label}
                        </span>
                      </div>
                      <div className="w-full max-w-xs h-1 rounded-full bg-[var(--color-surface-3)] mt-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--color-accent)]"
                          style={{ width: `${Math.min(100, it.percentage)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-[var(--color-text-primary)]">
                        {it.size_formatted}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
                        {it.percentage}%
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenExplorer(it.path)}
                      className="p-1.5 rounded-lg bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                      title="Reveal in Explorer"
                      aria-label="Reveal in Explorer"
                    >
                      <ExternalLink size={13} />
                    </button>

                    {it.is_dir && (
                      <button
                        type="button"
                        onClick={() => scanPath(it.path)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-accent-muted)] hover:bg-[var(--color-accent)] text-[var(--color-accent-strong)] hover:text-white transition-all cursor-pointer flex items-center gap-1"
                      >
                        <span>Drill Down</span>
                        <CornerDownRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
