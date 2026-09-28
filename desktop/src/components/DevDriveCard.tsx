import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Info,
  Loader2,
  Package,
  RefreshCw,
  Rocket,
  Zap,
} from 'lucide-react';
import { DevDriveStatusReport, DevDriveRelocateResult } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface DevDriveCardProps {
  onRefreshParent?: () => void;
}

export const DevDriveCard: React.FC<DevDriveCardProps> = ({ onRefreshParent }) => {
  const [report, setReport] = useState<DevDriveStatusReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [targetDrive, setTargetDrive] = useState<string>('D:');
  const [isRelocating, setIsRelocating] = useState(false);
  const [relocateResult, setRelocateResult] = useState<DevDriveRelocateResult | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await EntropyApiClient.getDevDriveStatus();
      setReport(data);
      if (data.mounted_volumes.length > 1) {
        const nonC = data.mounted_volumes.find((v) => v.drive_letter.toUpperCase() !== 'C:');
        if (nonC) setTargetDrive(nonC.drive_letter);
      }
    } catch (err) {
      console.warn('Failed to query Dev Drive status:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRelocate = async () => {
    if (!targetDrive) return;
    setIsRelocating(true);
    setRelocateResult(null);
    try {
      const res = await EntropyApiClient.relocatePackageCaches(targetDrive);
      setRelocateResult(res);
      await fetchStatus();
      onRefreshParent?.();
    } catch (err: unknown) {
      setRelocateResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRelocating(false);
      setTimeout(() => setRelocateResult(null), 8000);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (isLoading && !report) {
    return (
      <div className="p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] animate-pulse space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 bg-[var(--color-surface-3)] rounded" />
          <div className="h-5 w-24 bg-[var(--color-surface-3)] rounded-full" />
        </div>
        <div className="h-4 w-3/4 bg-[var(--color-surface-2)] rounded" />
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6 space-y-5 shadow-xs">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/30 flex items-center justify-center text-[var(--color-accent-strong)] shrink-0">
            <Rocket size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                Dev Drive (ReFS) Storage Booster
              </h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                report.is_supported
                  ? 'bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]'
                  : 'bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]'
              }`}>
                {report.is_supported ? 'Win11 ReFS Ready' : 'Windows 10 Storage Mode'}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Copy-on-Write (CoW) block cloning &amp; antivirus performance mode for developer workloads
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchStatus}
          disabled={isLoading}
          className="p-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] transition-colors cursor-pointer disabled:opacity-50"
          title="Refresh Dev Drive status"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Relocate Notification ── */}
      {relocateResult && (
        <div className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in duration-150 ${
          relocateResult.success
            ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success)]'
            : 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)]'
        }`}>
          <div className="flex items-center gap-2">
            {relocateResult.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{relocateResult.message || relocateResult.error}</span>
          </div>
        </div>
      )}

      {/* ── Status Banner ── */}
      <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] space-y-2 text-xs">
        <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-semibold">
          <Info size={14} className="text-[var(--color-accent)] shrink-0" />
          <span>Architecture &amp; Compatibility Telemetry</span>
        </div>
        <p className="text-[var(--color-text-secondary)] leading-relaxed">
          {report.support_message}
        </p>
        {!report.is_supported && (
          <div className="pt-2 text-[11px] text-[var(--color-text-tertiary)] border-t border-[var(--color-border-subtle)]">
            💡 On Windows 10, maximum compile acceleration is achieved by enabling <strong>Win32 Long Paths</strong> and adding dev directories to <strong>Windows Defender Exclusions</strong> (see above cards).
          </div>
        )}
      </div>

      {/* ── Mounted Volumes Grid ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
            Mounted Storage Volumes ({report.mounted_volumes.length})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {report.mounted_volumes.map((vol) => (
            <div
              key={vol.drive_letter}
              className={`p-3.5 rounded-xl border ${
                vol.is_dev_drive
                  ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)]/30'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]'
              } space-y-1.5`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive size={15} className={vol.is_dev_drive ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'} />
                  <span className="font-mono font-bold text-sm text-[var(--color-text-primary)]">
                    {vol.drive_letter} {vol.label ? `(${vol.label})` : ''}
                  </span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                  vol.is_dev_drive
                    ? 'bg-[var(--color-success)] text-white'
                    : 'bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]'
                }`}>
                  {vol.file_system}
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-tertiary)] font-mono">
                {formatBytes(vol.free_bytes)} free of {formatBytes(vol.total_bytes)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Toolchain Package Cache Alignment ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
            Package Cache Placement &amp; Redirection
          </span>
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            Relocating caches prevents system C: drive wear &amp; accelerates package restore
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {report.package_caches.map((cache) => (
            <div
              key={cache.tool}
              className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] space-y-1 text-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Package size={13} className="text-[var(--color-accent)]" />
                  <span className="font-bold uppercase font-mono text-[var(--color-text-primary)]">
                    {cache.tool} Cache
                  </span>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  cache.is_on_dev_drive
                    ? 'bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]'
                    : 'bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]'
                }`}>
                  {cache.is_on_dev_drive ? 'Dev Drive' : cache.is_on_system_drive ? 'System C: Drive' : 'Secondary Drive'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-[var(--color-text-tertiary)] truncate" title={cache.current_path}>
                {cache.current_path}
              </div>
            </div>
          ))}
        </div>

        {/* Relocate Action Panel */}
        {report.mounted_volumes.length > 1 && (
          <div className="mt-3 p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-text-secondary)] font-medium">
                Redirect all package caches to fast volume:
              </span>
              <select
                value={targetDrive}
                onChange={(e) => setTargetDrive(e.target.value)}
                className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg px-2.5 py-1 text-xs font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                {report.mounted_volumes.map((v) => (
                  <option key={v.drive_letter} value={v.drive_letter}>
                    {v.drive_letter} ({v.file_system} - {formatBytes(v.free_bytes)} free)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleRelocate}
              disabled={isRelocating}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white flex items-center gap-1.5 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {isRelocating ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              <span>Redirect Caches to {targetDrive}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
