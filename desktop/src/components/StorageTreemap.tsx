import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Layers,
  ExternalLink,
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
    bg: 'bg-[var(--color-success-bg)] hover:bg-[var(--color-success-bg)]',
    border: 'border-[var(--color-success-border)] hover:border-[var(--color-success)]',
    text: 'text-[var(--color-success)]',
    dot: 'bg-[var(--color-success)]',
    glow: 'rgba(52, 211, 153, 0.25)',
  },
  virtual_disk: {
    bg: 'bg-[var(--color-info-bg)] hover:bg-[var(--color-info-bg)]',
    border: 'border-[var(--color-info-border)] hover:border-[var(--color-info)]',
    text: 'text-[var(--color-info)]',
    dot: 'bg-[var(--color-info)]',
    glow: 'rgba(56, 189, 248, 0.25)',
  },
  cache: {
    bg: 'bg-[var(--color-warning-bg)] hover:bg-[var(--color-warning-bg)]',
    border: 'border-[var(--color-warning-border)] hover:border-[var(--color-warning)]',
    text: 'text-[var(--color-warning)]',
    dot: 'bg-[var(--color-warning)]',
    glow: 'rgba(251, 191, 36, 0.25)',
  },
  system: {
    bg: 'bg-[var(--color-danger-bg)] hover:bg-[var(--color-danger-bg)]',
    border: 'border-[var(--color-danger-border)] hover:border-[var(--color-danger)]',
    text: 'text-[var(--color-danger)]',
    dot: 'bg-[var(--color-danger)]',
    glow: 'rgba(244, 63, 94, 0.25)',
  },
};

/**
 * Standard Squarified Treemap layout algorithm (Bruls, Huizing, van Wijk).
 * Optimizes bounding rectangles to approach aspect ratio = 1 (least elongation)
 * with 100% boundary containment and soft power weighting for extreme dynamic ranges.
 */
function computeSquarifiedTreemap(
  items: TreemapItem[],
  width: number,
  height: number
): TreemapNode[] {
  if (width <= 0 || height <= 0 || items.length === 0) return [];

  // Filter non-zero items and sort descending by raw size
  const sorted = [...items]
    .filter((it) => it.size_bytes > 0)
    .sort((a, b) => b.size_bytes - a.size_bytes);

  if (sorted.length === 0) return [];

  // Soft power scaling prevents extreme dynamic ranges (e.g. 5GB vs 10MB) from crushing
  // smaller items into invisible sub-pixel lines while preserving dominant visual hierarchy.
  const weights = sorted.map((it) => Math.pow(it.size_bytes, 0.65));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  const totalArea = width * height;

  const elements = sorted.map((it, idx) => ({
    ...it,
    area: (weights[idx] / totalWeight) * totalArea,
  }));

  const results: TreemapNode[] = [];
  const remaining: Rect = { x: 0, y: 0, w: width, h: height };

  function worstRatio(row: typeof elements, sideLength: number): number {
    if (row.length === 0 || sideLength <= 0) return Infinity;
    const rowArea = row.reduce((s, r) => s + r.area, 0);
    const thickness = rowArea / sideLength;
    if (thickness <= 0) return Infinity;

    let maxRatio = 0;
    for (const r of row) {
      const rLength = r.area / thickness;
      if (rLength <= 0) continue;
      const ratio = Math.max(thickness / rLength, rLength / thickness);
      if (ratio > maxRatio) maxRatio = ratio;
    }
    return maxRatio;
  }

  function layoutRow(row: typeof elements, isLastRow: boolean) {
    if (row.length === 0) return;
    const isVertical = remaining.w >= remaining.h;
    const sideLength = isVertical ? remaining.h : remaining.w;
    const rowArea = row.reduce((s, r) => s + r.area, 0);

    let thickness: number;
    if (isLastRow) {
      thickness = isVertical ? remaining.w : remaining.h;
    } else {
      thickness = sideLength > 0 ? rowArea / sideLength : 0;
      thickness = isVertical
        ? Math.min(remaining.w, thickness)
        : Math.min(remaining.h, thickness);
    }

    let offset = 0;
    for (let j = 0; j < row.length; j++) {
      const item = row[j];
      const isLastInRow = j === row.length - 1;
      let itemSpan: number;
      if (isLastInRow) {
        itemSpan = Math.max(1, sideLength - offset);
      } else {
        itemSpan = rowArea > 0 ? (item.area / rowArea) * sideLength : 0;
        itemSpan = Math.max(1, Math.min(sideLength - offset, itemSpan));
      }

      const nodeRect: Rect = isVertical
        ? {
            x: remaining.x,
            y: remaining.y + offset,
            w: thickness,
            h: itemSpan,
          }
        : {
            x: remaining.x + offset,
            y: remaining.y,
            w: itemSpan,
            h: thickness,
          };

      results.push({
        ...item,
        rect: nodeRect,
      });

      offset += itemSpan;
    }

    if (isVertical) {
      remaining.x += thickness;
      remaining.w = Math.max(0, remaining.w - thickness);
    } else {
      remaining.y += thickness;
      remaining.h = Math.max(0, remaining.h - thickness);
    }
  }

  let currentRow: typeof elements = [];

  for (let i = 0; i < elements.length; i++) {
    const nextItem = elements[i];
    const isVertical = remaining.w >= remaining.h;
    const sideLength = isVertical ? remaining.h : remaining.w;

    if (currentRow.length === 0) {
      currentRow.push(nextItem);
    } else {
      const curWorst = worstRatio(currentRow, sideLength);
      const nextWorst = worstRatio([...currentRow, nextItem], sideLength);

      if (nextWorst <= curWorst) {
        currentRow.push(nextItem);
      } else {
        layoutRow(currentRow, false);
        currentRow = [nextItem];
      }
    }
  }

  if (currentRow.length > 0) {
    layoutRow(currentRow, true);
  }

  return results;
}

export const StorageTreemap: React.FC<StorageTreemapProps> = ({
  items,
  onSelectItem,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 900, height: 500 });
  const [hoveredNode, setHoveredNode] = useState<TreemapNode | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Track mouse coordinates for floating tooltip with boundary clamping
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const bounds = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    });
  };

  // Observe container dimensions for dynamic responsive recalculation
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
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
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedCategory === 'virtual_disk'
                ? 'bg-[var(--color-info)] text-black shadow-sm'
                : 'text-[var(--color-info)] hover:bg-[var(--color-info-bg)]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[var(--color-info)]" />
            Virtual Disks ({categoryBreakdown.virtual_disk?.count || 0})
          </button>

          <button
            onClick={() => setSelectedCategory('artifact')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'artifact'
                ? 'bg-[var(--color-success)] text-white shadow-sm'
                : 'text-[var(--color-success)] hover:bg-[var(--color-success-bg)]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
            Build Artifacts ({categoryBreakdown.artifact?.count || 0})
          </button>

          <button
            onClick={() => setSelectedCategory('cache')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'cache'
                ? 'bg-[var(--color-warning)] text-white shadow-sm'
                : 'text-[var(--color-warning)] hover:bg-[var(--color-warning-bg)]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[var(--color-warning)]" />
            Global Caches ({categoryBreakdown.cache?.count || 0})
          </button>

          <button
            onClick={() => setSelectedCategory('system')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'system'
                ? 'bg-[var(--color-danger)] text-white shadow-sm'
                : 'text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[var(--color-danger)]" />
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
        onMouseMove={handleMouseMove}
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

            // Strict pixel enclosure: 2px gap, 100% within container boundaries
            const gap = 2;
            const left = Math.round(node.rect.x) + gap;
            const top = Math.round(node.rect.y) + gap;
            const right = Math.min(dimensions.width - gap, Math.round(node.rect.x + node.rect.w) - gap);
            const bottom = Math.min(dimensions.height - gap, Math.round(node.rect.y + node.rect.h) - gap);
            const width = Math.max(4, right - left);
            const height = Math.max(4, bottom - top);

            const isLarge = width >= 140 && height >= 75;
            const isMedium = width >= 80 && height >= 46;
            const isSmall = width >= 50 && height >= 26;

            return (
              <div
                key={node.id}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onSelectItem?.(node)}
                style={{
                  position: 'absolute',
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                }}
                className="transition-all duration-150 cursor-pointer group"
              >
                <div
                  className={`w-full h-full rounded-lg border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs select-none ${styleConfig.bg} ${styleConfig.border} ${
                    isLarge ? 'p-2.5' : isMedium ? 'p-2' : 'p-1'
                  }`}
                  style={{
                    boxShadow: hoveredNode?.id === node.id ? `0 0 16px ${styleConfig.glow}` : undefined,
                  }}
                >
                  {/* Full Layout for Large Tiles */}
                  {isLarge && (
                    <>
                      <div className="flex items-start justify-between gap-1 overflow-hidden min-w-0">
                        <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styleConfig.dot}`} />
                          <span className={`font-semibold text-xs truncate ${styleConfig.text}`} title={node.name}>
                            {node.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] shrink-0">
                          {pct}%
                        </span>
                      </div>

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

                      <div className="flex items-end justify-between gap-1 mt-auto">
                        <span className="font-mono font-bold text-xs text-[var(--color-text-primary)]">
                          {node.size_formatted}
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleCopyPath(e, node.path, node.id)}
                            title="Copy full path"
                            aria-label="Copy full path"
                            className="p-1 rounded bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white cursor-pointer"
                          >
                            {copiedId === node.id ? <Check className="w-3 h-3 text-[var(--color-success)]" /> : <Copy className="w-3 h-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleOpenExplorer(e, node.path)}
                            title="Open in File Explorer"
                            aria-label="Open in File Explorer"
                            className="p-1 rounded bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Medium Layout (Title top, Size bottom) */}
                  {!isLarge && isMedium && (
                    <>
                      <div className="flex items-center justify-between gap-1 overflow-hidden min-w-0">
                        <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styleConfig.dot}`} />
                          <span className={`font-semibold text-xs truncate ${styleConfig.text}`} title={node.name}>
                            {node.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] shrink-0">
                          {pct}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-auto font-mono text-[11px]">
                        <span className="font-bold text-[var(--color-text-primary)]">
                          {node.size_formatted}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Small Compact Layout (Single Row) */}
                  {!isLarge && !isMedium && isSmall && (
                    <div className="flex items-center justify-between gap-1 h-full min-w-0 px-0.5">
                      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styleConfig.dot}`} />
                        <span className={`text-[10px] font-medium truncate ${styleConfig.text}`} title={node.name}>
                          {node.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono font-bold text-[var(--color-text-primary)] shrink-0">
                        {node.size_formatted}
                      </span>
                    </div>
                  )}

                  {/* Micro Layout (Percentage / Dot only) */}
                  {!isLarge && !isMedium && !isSmall && (
                    <div className="flex items-center justify-center h-full text-[9px] font-mono font-bold text-[var(--color-text-primary)]">
                      {pct}%
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Floating Tooltip Detail Overlay for hovered tile with Smart Edge Collision Avoidance */}
        {hoveredNode && (
          <div
            className="pointer-events-none absolute z-30 bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-sm transition-all"
            style={{
              left: `${
                mousePos.x + 18 + 300 > dimensions.width
                  ? Math.max(8, mousePos.x - 310)
                  : mousePos.x + 18
              }px`,
              top: `${
                mousePos.y + 18 + 120 > dimensions.height
                  ? Math.max(8, mousePos.y - 130)
                  : mousePos.y + 18
              }px`,
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
            <span className="w-2.5 h-2.5 rounded bg-[var(--color-info-bg)] border border-[var(--color-info-border)]" />
            Virtual Disks (WSL/Docker)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[var(--color-success-bg)] border border-[var(--color-success-border)]" />
            Build Artifacts (Safe to delete)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)]" />
            Global Shared Caches
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)]" />
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
