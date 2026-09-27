import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  HardDrive,
  Folder,
  Layers,
  Trash2,
  ExternalLink,
  Info,
  Maximize2,
  Copy,
  Check,
} from 'lucide-react';
import { EntropyApiClient } from '../services/api';

export interface TreemapItem {
  id: string;
  name: string;
  path: string;
  category: 'artifact' | 'cache' | 'virtual_disk' | 'system';
  categoryLabel: string;
  size_bytes: number;
  size_formatted: string;
  description?: string;
  is_safe?: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TreemapNode extends TreemapItem {
  rect: Rect;
}

interface StorageTreemapProps {
  items: TreemapItem[];
  onSelectItem?: (item: TreemapItem) => void;
  onCleanItem?: (item: TreemapItem) => void;
}

// Category palette using design tokens & semantic tints
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; glow: string }> = {
  artifact: {
    bg: 'bg-emerald-500/15 hover:bg-emerald-500/25',
    border: 'border-emerald-500/40 hover:border-emerald-400',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    glow: 'rgba(52, 211, 153, 0.25)',
  },
  virtual_disk: {
    bg: 'bg-purple-500/15 hover:bg-purple-500/25',
    border: 'border-purple-500/40 hover:border-purple-400',
    text: 'text-purple-300',
    dot: 'bg-purple-400',
    glow: 'rgba(168, 85, 247, 0.25)',
  },
  cache: {
    bg: 'bg-amber-500/15 hover:bg-amber-500/25',
    border: 'border-amber-500/40 hover:border-amber-400',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    glow: 'rgba(251, 191, 36, 0.25)',
  },
  system: {
    bg: 'bg-rose-500/15 hover:bg-rose-500/25',
    border: 'border-rose-500/40 hover:border-rose-400',
    text: 'text-rose-300',
    dot: 'bg-rose-400',
    glow: 'rgba(244, 63, 94, 0.25)',
  },
};

/**
 * Standard Squarified Treemap layout algorithm (Bruls, Huizing, van Wijk).
 * Optimizes bounding rectangles to approach aspect ratio = 1 (least elongation).
 */
function computeSquarifiedTreemap(
  items: TreemapItem[],
  width: number,
  height: number
): TreemapNode[] {
  if (width <= 0 || height <= 0 || items.length === 0) return [];

  // Filter non-zero items and sort descending
  const sorted = [...items]
    .filter((it) => it.size_bytes > 0)
    .sort((a, b) => b.size_bytes - a.size_bytes);

  if (sorted.length === 0) return [];

  const totalSize = sorted.reduce((sum, it) => sum + it.size_bytes, 0);
  const totalArea = width * height;

  // Normalized area per item
  const elements = sorted.map((it) => ({
    ...it,
    area: (it.size_bytes / totalSize) * totalArea,
  }));

  const results: TreemapNode[] = [];

  function worst(row: typeof elements, sideLength: number): number {
    if (row.length === 0) return Infinity;
    const rowArea = row.reduce((s, r) => s + r.area, 0);
    const side2 = sideLength * sideLength;
    let maxRatio = 0;
    for (const r of row) {
      const rArea = r.area;
      const ratio = Math.max((side2 * rArea) / (rowArea * rowArea), (rowArea * rowArea) / (side2 * rArea));
      if (ratio > maxRatio) maxRatio = ratio;
    }
    return maxRatio;
  }

  function layoutRow(row: typeof elements, rect: Rect, isHorizontal: boolean) {
    const rowArea = row.reduce((s, r) => s + r.area, 0);
    const sideLength = isHorizontal ? rect.w : rect.h;
    const otherDimension = rowArea / sideLength;

    let offset = 0;
    for (const item of row) {
      const itemSpan = item.area / otherDimension;
      const nodeRect: Rect = isHorizontal
        ? {
            x: rect.x + offset,
            y: rect.y,
            w: Math.max(1, itemSpan),
            h: Math.max(1, otherDimension),
          }
        : {
            x: rect.x,
            y: rect.y + offset,
            w: Math.max(1, otherDimension),
            h: Math.max(1, itemSpan),
          };

      results.push({
        ...item,
        rect: nodeRect,
      });

      offset += itemSpan;
    }

    if (isHorizontal) {
      return {
        x: rect.x,
        y: rect.y + otherDimension,
        w: rect.w,
        h: Math.max(0, rect.h - otherDimension),
      };
    } else {
      return {
        x: rect.x + otherDimension,
        y: rect.y,
        w: Math.max(0, rect.w - otherDimension),
        h: Math.max(0, rect.h - otherDimension),
      };
    }
  }

  function squarify(children: typeof elements, currentRect: Rect) {
    if (children.length === 0 || currentRect.w <= 0 || currentRect.h <= 0) return;

    let remainingRect = { ...currentRect };
    let currentRow: typeof elements = [];

    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      const isHorizontal = remainingRect.w >= remainingRect.h;
      const sideLength = isHorizontal ? remainingRect.w : remainingRect.h;

      if (currentRow.length === 0) {
        currentRow.push(c);
      } else {
        const rowWithC = [...currentRow, c];
        if (worst(rowWithC, sideLength) <= worst(currentRow, sideLength)) {
          currentRow.push(c);
        } else {
          remainingRect = layoutRow(currentRow, remainingRect, isHorizontal);
          currentRow = [c];
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

export const StorageTreemap: React.FC<StorageTreemapProps> = ({
  items,
  onSelectItem,
  onCleanItem,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 900, height: 500 });
  const [hoveredNode, setHoveredNode] = useState<TreemapNode | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Observe container dimensions for dynamic responsive recalculation
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          // Maintain a 16:9 or comfortable 500px aspect height
          const computedHeight = Math.max(420, Math.min(650, Math.round(width * 0.52)));
          setDimensions({ width, height: computedHeight });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return items;
    return items.filter((it) => it.category === selectedCategory);
  }, [items, selectedCategory]);

  const totalBytes = useMemo(() => {
    return filteredItems.reduce((acc, it) => acc + it.size_bytes, 0);
  }, [filteredItems]);

  const formattedTotal = useMemo(() => {
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`;
    if (totalBytes < 1024 * 1024 * 1024) return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }, [totalBytes]);

  const nodes = useMemo(() => {
    return computeSquarifiedTreemap(filteredItems, dimensions.width, dimensions.height);
  }, [filteredItems, dimensions]);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, { count: number; bytes: number }> = {
      artifact: { count: 0, bytes: 0 },
      virtual_disk: { count: 0, bytes: 0 },
      cache: { count: 0, bytes: 0 },
      system: { count: 0, bytes: 0 },
    };
    for (const it of items) {
      if (!counts[it.category]) {
        counts[it.category] = { count: 0, bytes: 0 };
      }
      counts[it.category].count += 1;
      counts[it.category].bytes += it.size_bytes;
    }
    return counts;
  }, [items]);

  const handleCopyPath = async (e: React.MouseEvent, path: string, id: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(path);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  const handleOpenExplorer = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await EntropyApiClient.openInExplorer(path);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Category Filter Pills & Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedCategory === 'all'
                ? 'bg-[var(--color-accent)] text-white shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            All Categories ({items.length})
          </button>

          <button
            onClick={() => setSelectedCategory('virtual_disk')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'virtual_disk'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-purple-300 hover:bg-purple-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            Virtual Disks ({categoryBreakdown.virtual_disk?.count || 0})
          </button>

          <button
            onClick={() => setSelectedCategory('artifact')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'artifact'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-emerald-300 hover:bg-emerald-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Build Artifacts ({categoryBreakdown.artifact?.count || 0})
          </button>

          <button
            onClick={() => setSelectedCategory('cache')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'cache'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-300 hover:bg-amber-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Global Caches ({categoryBreakdown.cache?.count || 0})
          </button>

          <button
            onClick={() => setSelectedCategory('system')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'system'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-300 hover:bg-rose-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            System Junk ({categoryBreakdown.system?.count || 0})
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-[var(--color-text-secondary)]">
            Total Reclaimable:{' '}
            <span className="font-semibold font-mono text-[var(--color-text-primary)] text-sm ml-1">
              {formattedTotal}
            </span>
          </div>
        </div>
      </div>

      {/* Main Treemap Canvas Container */}
      <div
        ref={containerRef}
        className="relative w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] overflow-hidden shadow-inner select-none"
        style={{ height: `${dimensions.height}px` }}
      >
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-tertiary)] gap-2">
            <Layers className="w-8 h-8 opacity-40" />
            <p className="text-sm">No items in this category.</p>
          </div>
        ) : (
          nodes.map((node) => {
            const styleConfig = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.artifact;
            const pct = totalBytes > 0 ? ((node.size_bytes / totalBytes) * 100).toFixed(1) : '0';
            const isTiny = node.rect.w < 60 || node.rect.h < 40;
            const isMedium = node.rect.w >= 110 && node.rect.h >= 65;
            const isLarge = node.rect.w >= 180 && node.rect.h >= 90;

            return (
              <div
                key={node.id}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onSelectItem?.(node)}
                style={{
                  position: 'absolute',
                  left: `${node.rect.x}px`,
                  top: `${node.rect.y}px`,
                  width: `${node.rect.w}px`,
                  height: `${node.rect.h}px`,
                  padding: '2px',
                }}
                className="transition-all duration-150 cursor-pointer group"
              >
                <div
                  className={`w-full h-full rounded-lg border transition-all duration-200 flex flex-col justify-between p-2 overflow-hidden ${styleConfig.bg} ${styleConfig.border}`}
                  style={{
                    boxShadow: hoveredNode?.id === node.id ? `0 0 16px ${styleConfig.glow}` : undefined,
                  }}
                >
                  {/* Header / Title */}
                  <div className="flex items-start justify-between gap-1 overflow-hidden">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styleConfig.dot}`} />
                      {!isTiny && (
                        <span
                          className={`font-semibold text-xs truncate ${styleConfig.text}`}
                          title={node.name}
                        >
                          {node.name}
                        </span>
                      )}
                    </div>

                    {isMedium && (
                      <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] shrink-0">
                        {pct}%
                      </span>
                    )}
                  </div>

                  {/* Body / Path / Category description */}
                  {isLarge && (
                    <div className="my-auto overflow-hidden">
                      <p className="text-[11px] font-mono text-[var(--color-text-secondary)] truncate">
                        {node.path}
                      </p>
                      {node.description && (
                        <p className="text-[10px] text-[var(--color-text-tertiary)] truncate mt-0.5">
                          {node.description}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Footer / Size & Quick Action */}
                  <div className="flex items-end justify-between gap-1 mt-auto">
                    <span className="font-mono font-bold text-xs text-[var(--color-text-primary)]">
                      {node.size_formatted}
                    </span>

                    {/* Action buttons on hover */}
                    {isMedium && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <button
                          onClick={(e) => handleCopyPath(e, node.path, node.id)}
                          title="Copy full path"
                          className="p-1 rounded bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white"
                        >
                          {copiedId === node.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={(e) => handleOpenExplorer(e, node.path)}
                          title="Open in File Explorer"
                          className="p-1 rounded bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Floating Tooltip Detail Overlay for hovered tile */}
        {hoveredNode && (
          <div
            className="pointer-events-none absolute z-30 bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-sm transition-all"
            style={{
              left: `${Math.min(hoveredNode.rect.x + 12, dimensions.width - 290)}px`,
              top: `${Math.min(hoveredNode.rect.y + hoveredNode.rect.h + 8, dimensions.height - 130)}px`,
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-semibold text-xs text-[var(--color-text-primary)] truncate">
                {hoveredNode.name}
              </span>
              <span className="font-mono text-xs font-bold text-[var(--color-accent)]">
                {hoveredNode.size_formatted}
              </span>
            </div>
            <div className="text-[11px] font-mono text-[var(--color-text-tertiary)] break-all mb-1.5">
              {hoveredNode.path}
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] pt-1.5 border-t border-[var(--color-border)]">
              <span>Category: {hoveredNode.categoryLabel}</span>
              <span>
                {totalBytes > 0
                  ? `${((hoveredNode.size_bytes / totalBytes) * 100).toFixed(1)}% of total reclaimable`
                  : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Helper Legend & Safety Guide */}
      <div className="flex flex-wrap items-center justify-between text-xs text-[var(--color-text-tertiary)] px-1">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-purple-500/30 border border-purple-500/50" />
            Virtual Disks (WSL/Docker)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500/30 border border-emerald-500/50" />
            Build Artifacts (Safe to delete)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500/30 border border-amber-500/50" />
            Global Shared Caches
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-rose-500/30 border border-rose-500/50" />
            System Junk & Temp
          </span>
        </div>
        <div>
          <span>Tip: Hover any block to view path or open in native Explorer.</span>
        </div>
      </div>
    </div>
  );
};
