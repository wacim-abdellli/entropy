import React, { useEffect, useState, useRef } from 'react';
import {
  Cpu,
  HardDrive,
  Activity,
  Battery,
  BatteryCharging,
  Laptop,
  FolderOpen,
  Zap,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle2,
  Gauge,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';
import {
  SystemSpecsReport,
  LiveSystemMetrics,
  SystemDrivePartition,
  SystemGpuInfo,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface MachineOverviewTabProps {
  onTrimWorkingSets: () => Promise<void> | void;
  trimming: boolean;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRate(bytesPerSec: number | null | undefined): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export const MachineOverviewTab: React.FC<MachineOverviewTabProps> = ({
  onTrimWorkingSets,
  trimming,
}) => {
  const [specs, setSpecs] = useState<SystemSpecsReport | null>(null);
  const [live, setLive] = useState<LiveSystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveActive, setLiveActive] = useState(true);
  const pollingRef = useRef<number | null>(null);

  const loadSpecs = async (force: boolean = false) => {
    try {
      if (force) setRefreshing(true);
      const data = await EntropyApiClient.getSystemSpecs(force);
      setSpecs(data);
    } catch (err) {
      console.error('Failed to load system specs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const pollLiveMetrics = async () => {
    try {
      const data = await EntropyApiClient.getLiveSystemMetrics();
      setLive(data);
    } catch (err) {
      console.error('Failed to poll live metrics:', err);
    }
  };

  useEffect(() => {
    loadSpecs(false);
    pollLiveMetrics();
  }, []);

  useEffect(() => {
    if (!liveActive) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = window.setInterval(() => {
      pollLiveMetrics();
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [liveActive]);

  const handleOpenExplorer = async (mountpoint: string) => {
    try {
      await EntropyApiClient.openInExplorer(mountpoint);
    } catch (err) {
      console.error('Failed to open drive in explorer:', err);
    }
  };

  if (loading && !specs) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-[var(--color-text-tertiary)]">
        <RefreshCw className="w-6 h-6 animate-spin mb-3 text-[var(--color-accent)]" />
        <p className="text-xs font-mono">Probing hardware and disk topology…</p>
      </div>
    );
  }

  const currentCpu = live?.cpu_percent ?? specs?.cpu.percent ?? 0;
  const currentRamPct = live?.ram_percent ?? specs?.ram.percent ?? 0;
  const currentRamUsed = live?.ram_used_bytes ?? specs?.ram.used_bytes ?? 0;
  const totalRam = specs?.ram.total_bytes ?? 16 * 1024 * 1024 * 1024;
  const uptime = live?.uptime_formatted ?? specs?.uptime_formatted ?? '—';

  return (
    <div className="space-y-6 animate-enter">
      {/* Top Telemetry & Live Rates Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-[var(--color-border-subtle)]">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <Laptop className="w-4 h-4 text-[var(--color-accent)]" />
            Machine Specifications & Storage Map
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Forensic hardware inventory, live system telemetry, and partition topology.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setLiveActive(!liveActive)}
            className={`h-7 px-2.5 rounded-md text-xs font-mono flex items-center gap-1.5 border transition-colors cursor-pointer ${
              liveActive
                ? 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)] border-[var(--color-border)]'
                : 'bg-[var(--color-surface-1)] text-[var(--color-text-tertiary)] border-[var(--color-border-subtle)]'
            }`}
            title="Toggle 2-second real-time telemetry updates"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                liveActive
                  ? 'bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)] animate-pulse'
                  : 'bg-[var(--color-text-tertiary)]'
              }`}
            />
            {liveActive ? 'Live (2s)' : 'Paused'}
          </button>

          <button
            type="button"
            onClick={() => loadSpecs(true)}
            disabled={refreshing}
            className="h-7 px-2.5 rounded-md text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Force refresh hardware specifications"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[var(--color-accent)]' : ''}`} />
            Rescan
          </button>
        </div>
      </div>

      {/* 4 Live Telemetry Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* CPU Gauge */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Cpu className="w-4 h-4 text-[var(--color-accent)]" />
              CPU Load
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
              {specs?.cpu.logical_cores || 8} Threads
            </span>
          </div>
          <div className="my-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-[var(--color-text-primary)] tracking-tight">
              {currentCpu.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-[var(--color-text-tertiary)]">
              {specs?.cpu.current_freq_mhz ? `${(specs.cpu.current_freq_mhz / 1000).toFixed(2)} GHz` : 'Normal'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[var(--color-surface-3)] rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-[var(--color-accent)] transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(2, currentCpu))}%` }}
            />
          </div>
        </div>

        {/* RAM Gauge */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Activity className="w-4 h-4 text-[var(--color-warning)]" />
              Physical RAM
            </span>
            <button
              type="button"
              onClick={onTrimWorkingSets}
              disabled={trimming}
              className="text-[10px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="Trim inactive working sets to free RAM"
            >
              <Zap className="w-3 h-3" />
              {trimming ? 'Trimming…' : 'Trim RAM'}
            </button>
          </div>
          <div className="my-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-[var(--color-text-primary)] tracking-tight">
              {currentRamPct.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-[var(--color-text-tertiary)]">
              {formatBytes(currentRamUsed)} / {formatBytes(totalRam)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[var(--color-surface-3)] rounded-full overflow-hidden mt-2">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                currentRamPct > 90
                  ? 'bg-[var(--color-danger)]'
                  : currentRamPct > 75
                  ? 'bg-[var(--color-warning)]'
                  : 'bg-[var(--color-success)]'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, currentRamPct))}%` }}
            />
          </div>
        </div>

        {/* Disk I/O Gauge */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-2">
            <span className="flex items-center gap-1.5 font-medium">
              <HardDrive className="w-4 h-4 text-[var(--color-text-secondary)]" />
              Disk Throughput
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">Live R/W</span>
          </div>
          <div className="my-1 space-y-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
                <ArrowDownRight className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Read:
              </span>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {formatRate(live?.disk_read_bytes_sec)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-warning)]" /> Write:
              </span>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {formatRate(live?.disk_write_bytes_sec)}
              </span>
            </div>
          </div>
          <div className="text-[10px] font-mono text-[var(--color-text-tertiary)] mt-1 truncate">
            {specs?.physical_disks?.[0]?.friendly_name || 'Primary Storage Device'}
          </div>
        </div>

        {/* Network Throughput Gauge */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Gauge className="w-4 h-4 text-[var(--color-success)]" />
              Network Traffic
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">Throughput</span>
          </div>
          <div className="my-1 space-y-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
                <ArrowDownRight className="w-3.5 h-3.5 text-[var(--color-success)]" /> Inbound:
              </span>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {formatRate(live?.net_recv_bytes_sec)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Outbound:
              </span>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {formatRate(live?.net_sent_bytes_sec)}
              </span>
            </div>
          </div>
          <div className="text-[10px] font-mono text-[var(--color-text-tertiary)] mt-1">
            Uptime: <span className="text-[var(--color-text-secondary)] font-medium">{uptime}</span>
          </div>
        </div>
      </div>

      {/* Storage Drives & Volumes Section */}
      <div className="p-5 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] flex items-center justify-center text-[var(--color-accent)]">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Storage Drives & Partitions
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                All mounted Windows storage drives, capacity metrics, and free headroom.
              </p>
            </div>
          </div>

          <div className="text-xs font-mono text-[var(--color-text-tertiary)]">
            {specs?.drives.length || 0} Volume{specs?.drives.length === 1 ? '' : 's'} Mounted
          </div>
        </div>

        {/* Drives List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {specs?.drives.map((drive: SystemDrivePartition) => {
            const isWarn = drive.status === 'warning';
            const isCrit = drive.status === 'critical';

            return (
              <div
                key={drive.mountpoint}
                className="p-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg font-bold font-mono text-[var(--color-text-primary)]">
                      {drive.mountpoint}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                          {drive.label}
                        </span>
                        {drive.is_system && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 text-[var(--color-accent)]">
                            Boot Drive
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--color-text-tertiary)] flex items-center gap-1.5 mt-0.5">
                        <span>{drive.fstype}</span>
                        <span>•</span>
                        <span>{drive.media_type || 'Disk'}</span>
                        {drive.friendly_name && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[130px]">{drive.friendly_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenExplorer(drive.mountpoint)}
                    className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer"
                    title={`Open ${drive.mountpoint} in Windows Explorer`}
                    aria-label={`Open ${drive.mountpoint} in Windows Explorer`}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex items-baseline justify-between text-xs mb-1.5">
                    <span className="font-mono text-sm font-bold text-[var(--color-text-primary)]">
                      {formatBytes(drive.used_bytes)}
                      <span className="text-xs font-normal text-[var(--color-text-tertiary)] ml-1">
                        / {formatBytes(drive.total_bytes)}
                      </span>
                    </span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        isCrit
                          ? 'text-[var(--color-danger)]'
                          : isWarn
                          ? 'text-[var(--color-warning)]'
                          : 'text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {drive.percent.toFixed(1)}% Used
                    </span>
                  </div>

                  <div className="w-full h-2 bg-[var(--color-surface-4)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCrit
                          ? 'bg-[var(--color-danger)]'
                          : isWarn
                          ? 'bg-[var(--color-warning)]'
                          : 'bg-[var(--color-accent)]'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, drive.percent))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--color-text-tertiary)] mt-1.5">
                    <span>
                      Free space: <strong className="text-[var(--color-text-secondary)]">{formatBytes(drive.free_bytes)}</strong>
                    </span>
                    {isCrit ? (
                      <span className="text-[var(--color-danger)] flex items-center gap-1 font-semibold">
                        <AlertTriangle className="w-3 h-3" /> Critical Space
                      </span>
                    ) : isWarn ? (
                      <span className="text-[var(--color-warning)] flex items-center gap-1 font-semibold">
                        <AlertTriangle className="w-3 h-3" /> Low Space
                      </span>
                    ) : (
                      <span className="text-[var(--color-success)] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Healthy
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Low-Level Partition Topology Breakdown */}
        {specs?.raw_partitions && specs.raw_partitions.length > 0 && (
          <div className="mt-3 pt-4 border-t border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[var(--color-text-secondary)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                Physical Disk 0 Partition Layout ({specs.physical_disks?.[0]?.friendly_name || 'NVMe SSD'})
              </span>
              <span className="text-[11px] font-mono text-[var(--color-text-tertiary)]">
                Total Disk Capacity: {formatBytes(specs.physical_disks?.[0]?.size_bytes)}
              </span>
            </div>

            {/* Segmented partition bar */}
            <div className="w-full h-6 bg-[var(--color-surface-3)] rounded-md overflow-hidden flex border border-[var(--color-border)] p-0.5 gap-0.5">
              {specs.raw_partitions.map((part) => {
                const totalDisk = specs.physical_disks?.[0]?.size_bytes || 512 * 1024 * 1024 * 1024;
                const widthPct = Math.max(1.5, (part.size_bytes / totalDisk) * 100);
                const isC = part.drive_letter === 'C';
                const isSystem = part.partition_type === 'System' || part.partition_type === 'Reserved';
                const isRecovery = part.partition_type === 'Recovery';

                return (
                  <div
                    key={`${part.disk_number}-${part.partition_number}`}
                    style={{ width: `${widthPct}%` }}
                    className={`h-full rounded-xs flex items-center justify-center text-[9px] font-mono font-medium truncate px-1 transition-all ${
                      isC
                        ? 'bg-[var(--color-accent)] text-white'
                        : isSystem
                        ? 'bg-[var(--color-surface-4)] text-[var(--color-text-tertiary)]'
                        : isRecovery
                        ? 'bg-[var(--color-warning)]/30 text-[var(--color-warning)]'
                        : 'bg-[var(--color-surface-4)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]'
                    }`}
                    title={`Partition ${part.partition_number}: ${part.partition_type} (${formatBytes(part.size_bytes)})${
                      part.drive_letter ? ` - Drive ${part.drive_letter}:` : ''
                    }`}
                  >
                    {widthPct > 5 && (part.drive_letter ? `${part.drive_letter}:` : part.partition_type)}
                  </div>
                );
              })}
            </div>

            {/* Partition details legend */}
            <div className="flex flex-wrap gap-2.5 mt-2.5 text-[10px] font-mono text-[var(--color-text-tertiary)]">
              {specs.raw_partitions.map((part) => (
                <div key={`legend-${part.partition_number}`} className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-xs ${
                      part.drive_letter === 'C'
                        ? 'bg-[var(--color-accent)]'
                        : part.partition_type === 'System'
                        ? 'bg-[var(--color-surface-4)]'
                        : part.partition_type === 'Recovery'
                        ? 'bg-[var(--color-warning)]'
                        : 'bg-[var(--color-text-tertiary)]'
                    }`}
                  />
                  <span>
                    Part {part.partition_number}: {part.drive_letter ? `Drive ${part.drive_letter}: ` : ''}
                    {part.partition_type} ({formatBytes(part.size_bytes)})
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                <strong className="text-[var(--color-text-primary)]">Storage Insight:</strong> Your NVMe SSD holds 512 GB, but Windows C: is allocated 385 GB. The remaining space is partitioned for recovery and secondary OS/data partitions. To safely relieve space on C: without touching risky partition tables, use Directory Junctions to move global build caches or Docker data.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Forensic Hardware Specifications 3-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Column 1: Computer & Operating System */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--color-border-subtle)]">
            <Laptop className="w-4 h-4 text-[var(--color-accent)]" />
            <span className="text-xs font-semibold text-[var(--color-text-primary)]">Device & Windows OS</span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[11px] text-[var(--color-text-tertiary)] block">Device Model</span>
              <span className="font-semibold text-[var(--color-text-primary)] truncate block" title={specs?.pc.model}>
                {specs?.pc.model || 'Windows Workstation'}
              </span>
              <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
                {specs?.pc.manufacturer}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[var(--color-text-tertiary)] block">Operating System</span>
              <span className="font-semibold text-[var(--color-text-primary)] block">
                {specs?.os.product_name}
              </span>
              <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
                Version {specs?.os.version} • Build {specs?.os.build} ({specs?.os.arch})
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[var(--color-text-tertiary)] block">Computer Hostname</span>
              <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                {specs?.os.hostname}
              </span>
            </div>

            {specs?.battery?.has_battery && (
              <div className="pt-1 flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-1">
                  {specs.battery.power_plugged ? (
                    <BatteryCharging className="w-3.5 h-3.5 text-[var(--color-success)]" />
                  ) : (
                    <Battery className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                  )}
                  Battery State
                </span>
                <span className="font-mono text-xs font-semibold text-[var(--color-text-primary)]">
                  {specs.battery.percent}% {specs.battery.power_plugged ? '(AC Connected)' : '(On Battery)'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Processor & Memory */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--color-border-subtle)]">
            <Cpu className="w-4 h-4 text-[var(--color-warning)]" />
            <span className="text-xs font-semibold text-[var(--color-text-primary)]">Processor & Memory</span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[11px] text-[var(--color-text-tertiary)] block">Processor (CPU)</span>
              <span className="font-semibold text-[var(--color-text-primary)] leading-snug block" title={specs?.cpu.name}>
                {specs?.cpu.name}
              </span>
              <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
                {specs?.cpu.physical_cores} Cores • {specs?.cpu.logical_cores} Threads
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[var(--color-text-tertiary)] block">Total Installed Memory</span>
              <span className="font-mono text-xs font-semibold text-[var(--color-text-primary)]">
                {formatBytes(specs?.ram.total_bytes)} RAM
              </span>
              <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] block">
                Available: {formatBytes(specs?.ram.available_bytes)}
              </span>
            </div>

            {specs?.ram.swap_total_bytes ? (
              <div>
                <span className="text-[11px] text-[var(--color-text-tertiary)] block">Windows Pagefile / Swap</span>
                <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                  {formatBytes(specs.ram.swap_used_bytes)} / {formatBytes(specs.ram.swap_total_bytes)} used
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Column 3: Graphics (GPU) & Hardware Disks */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--color-border-subtle)]">
            <Layers className="w-4 h-4 text-[var(--color-success)]" />
            <span className="text-xs font-semibold text-[var(--color-text-primary)]">Graphics & Storage Hardware</span>
          </div>

          <div className="space-y-3 text-xs">
            {specs?.gpus && specs.gpus.length > 0 ? (
              <div>
                <span className="text-[11px] text-[var(--color-text-tertiary)] block mb-1">
                  Graphics Adapters ({specs.gpus.length})
                </span>
                <div className="space-y-2">
                  {specs.gpus.map((gpu: SystemGpuInfo, i: number) => (
                    <div key={i} className="p-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
                      <span className="font-medium text-[var(--color-text-primary)] block truncate" title={gpu.name}>
                        {gpu.name}
                      </span>
                      <div className="text-[10px] font-mono text-[var(--color-text-tertiary)] flex items-center justify-between mt-0.5">
                        <span>{gpu.adapter_ram_bytes ? `${formatBytes(gpu.adapter_ram_bytes)} VRAM` : 'Dynamic Memory'}</span>
                        {gpu.driver_version && <span>v{gpu.driver_version}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <span className="text-[11px] text-[var(--color-text-tertiary)] block">Graphics Adapter</span>
                <span className="text-xs text-[var(--color-text-secondary)]">Standard Display Adapter</span>
              </div>
            )}

            {specs?.physical_disks && specs.physical_disks.length > 0 && (
              <div>
                <span className="text-[11px] text-[var(--color-text-tertiary)] block mb-1">
                  Storage Drive Controller
                </span>
                <div className="p-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
                  <span className="font-medium text-[var(--color-text-primary)] block truncate">
                    {specs.physical_disks[0].friendly_name}
                  </span>
                  <div className="text-[10px] font-mono text-[var(--color-text-tertiary)] flex items-center justify-between mt-0.5">
                    <span>{specs.physical_disks[0].bus_type} • {specs.physical_disks[0].media_type}</span>
                    <span>{formatBytes(specs.physical_disks[0].size_bytes)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
