import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Globe,
  Radio,
  RefreshCw,
  Search,
  XCircle,
  Copy,
  Check,
  AlertTriangle,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { NetworkConnectionItem, PortDiagnosticReport } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface NetworkMonitorTabProps {
  onActionComplete?: () => Promise<void> | void;
}

export const NetworkMonitorTab: React.FC<NetworkMonitorTabProps> = ({ onActionComplete }) => {
  const [connections, setConnections] = useState<NetworkConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<'listening' | 'dev' | 'all'>('listening');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Port quick check
  const [checkPortInput, setCheckPortInput] = useState('');
  const [portDiagnostic, setPortDiagnostic] = useState<PortDiagnosticReport | null>(null);
  const [isCheckingPort, setIsCheckingPort] = useState(false);

  // Terminate / Free port modal
  const [targetConn, setTargetConn] = useState<NetworkConnectionItem | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchConnections = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await EntropyApiClient.getNetworkConnections(false);
      setConnections(data);
    } catch (err) {
      console.error('Failed to load network connections:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleCheckPort = async (e: React.FormEvent) => {
    e.preventDefault();
    const port = parseInt(checkPortInput.trim(), 10);
    if (isNaN(port) || port < 1 || port > 65535) return;

    setIsCheckingPort(true);
    try {
      const diag = await EntropyApiClient.getPortDiagnostics(port);
      setPortDiagnostic(diag);
    } catch (err) {
      console.error('Failed to diagnose port:', err);
    } finally {
      setIsCheckingPort(false);
    }
  };

  const handleExecuteKill = async () => {
    if (!targetConn || !targetConn.pid) return;

    setIsTerminating(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await EntropyApiClient.terminateProcess(targetConn.pid, true);
      if (res.success) {
        setActionSuccess(`Successfully freed port ${targetConn.local_port} by terminating ${targetConn.process_name} (PID ${targetConn.pid}).`);
        setTargetConn(null);
        await fetchConnections(true);
        if (onActionComplete) {
          await onActionComplete();
        }
      } else {
        setActionError(res.error || `Failed to terminate ${targetConn.process_name}.`);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTerminating(false);
    }
  };

  const listeningCount = useMemo(() => connections.filter((c) => c.is_listening).length, [connections]);
  const devCount = useMemo(() => connections.filter((c) => c.is_dev).length, [connections]);
  const establishedCount = useMemo(() => connections.filter((c) => c.status === 'ESTABLISHED').length, [connections]);

  const filteredConnections = useMemo(() => {
    return connections.filter((c) => {
      if (filterType === 'listening' && !c.is_listening) return false;
      if (filterType === 'dev' && !c.is_dev) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const portStr = String(c.local_port);
      const pidStr = c.pid ? String(c.pid) : '';
      const name = c.process_name.toLowerCase();
      const ip = c.local_ip.toLowerCase();
      const cmd = (c.cmdline_preview || '').toLowerCase();

      return (
        portStr.includes(q) ||
        pidStr.includes(q) ||
        name.includes(q) ||
        ip.includes(q) ||
        cmd.includes(q)
      );
    });
  }, [connections, filterType, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
                <Radio size={20} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Network & Listening Ports Monitor
                </h2>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Forensic socket telemetry correlated to local PIDs, development servers, and port conflicts.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchConnections(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-[var(--color-accent)]' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
          <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Listening Ports
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-[var(--color-success)]">{listeningCount}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">active listeners</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Dev Services
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-[var(--color-accent)]">{devCount}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">Vite, Node, Python, etc.</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Active TCP Connections
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-[var(--color-text-primary)]">{establishedCount}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">established sockets</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionSuccess && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)] text-xs">
          <div className="flex items-center gap-2">
            <Check size={16} />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="p-1 hover:opacity-80 cursor-pointer"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="p-1 hover:opacity-80 cursor-pointer"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* Search, Filter Pills & Port Quick Diagnostic */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] w-fit">
          <button
            type="button"
            onClick={() => setFilterType('listening')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              filterType === 'listening'
                ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Listening Ports ({listeningCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('dev')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              filterType === 'dev'
                ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Dev Services ({devCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              filterType === 'all'
                ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            All Connections ({connections.length})
          </button>
        </div>

        {/* Port Inspector & Search Bar */}
        <div className="flex items-center gap-2 flex-1 md:max-w-md">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search port, process, or PID..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          <form onSubmit={handleCheckPort} className="flex items-center gap-1.5">
            <input
              type="number"
              min="1"
              max="65535"
              value={checkPortInput}
              onChange={(e) => setCheckPortInput(e.target.value)}
              placeholder="Port #"
              className="w-20 px-2 py-1.5 text-xs font-mono rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="submit"
              disabled={isCheckingPort || !checkPortInput.trim()}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-primary)] cursor-pointer disabled:opacity-50"
            >
              Check
            </button>
          </form>
        </div>
      </div>

      {/* Port Diagnostic Result Banner */}
      {portDiagnostic && (
        <div className={`p-4 rounded-xl border ${
          portDiagnostic.is_occupied
            ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]/20'
            : 'border-[var(--color-success-border)] bg-[var(--color-success-bg)]/20'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--color-text-primary)] font-mono">
                  Port {portDiagnostic.port}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  portDiagnostic.is_occupied
                    ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]'
                    : 'bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]'
                }`}>
                  {portDiagnostic.is_occupied ? 'Occupied' : 'Free / Available'}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">{portDiagnostic.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setPortDiagnostic(null)}
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer"
            >
              <XCircle size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Connections List / Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] animate-pulse" />
          ))}
        </div>
      ) : filteredConnections.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
          <Globe size={32} className="mx-auto text-[var(--color-text-tertiary)] mb-3" />
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">No matching network connections found</h3>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            Try adjusting your search query or filter pills above.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredConnections.map((conn) => {
            const isListening = conn.is_listening;
            const isOccupiedByDev = conn.is_dev;
            const isProtected = conn.is_protected;

            return (
              <div
                key={conn.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/50 transition-colors gap-3"
              >
                {/* Left: Port, Protocol, Process */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Protocol & Port Badge */}
                  <div className="flex flex-col items-center justify-center w-14 py-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] shrink-0">
                    <span className="text-[10px] font-mono font-bold text-[var(--color-text-secondary)]">{conn.protocol}</span>
                    <span className="text-xs font-mono font-bold text-[var(--color-accent)]">{conn.local_port}</span>
                  </div>

                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[var(--color-text-primary)] font-mono">
                        {conn.process_name}
                      </span>

                      {conn.pid && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">
                          PID: {conn.pid}
                        </span>
                      )}

                      {/* Status Badge */}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        isListening
                          ? 'bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]'
                          : conn.status === 'ESTABLISHED'
                          ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30'
                          : 'bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]'
                      }`}>
                        {conn.status}
                      </span>

                      {/* Dev Badge */}
                      {isOccupiedByDev && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
                          Dev Tool
                        </span>
                      )}

                      {/* Protected System Badge */}
                      {isProtected && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]">
                          <Lock size={10} />
                          Protected
                        </span>
                      )}
                    </div>

                    {/* Address & Commandline Preview */}
                    <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-text-tertiary)] flex-wrap">
                      <span>{conn.local_ip}:{conn.local_port}</span>
                      {conn.remote_ip && (
                        <>
                          <ArrowRight size={10} className="text-[var(--color-text-tertiary)]" />
                          <span>{conn.remote_ip}:{conn.remote_port}</span>
                        </>
                      )}
                      {conn.cmdline_preview && (
                        <span className="text-[11px] text-[var(--color-text-secondary)] truncate max-w-sm" title={conn.cmdline_preview}>
                          • {conn.cmdline_preview}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleCopy(`${conn.local_ip}:${conn.local_port}`, conn.id)}
                    title="Copy address:port"
                    className="p-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer"
                  >
                    {copiedId === conn.id ? <Check size={13} className="text-[var(--color-success)]" /> : <Copy size={13} />}
                  </button>

                  {/* Free Port / Terminate Process */}
                  {conn.pid && !isProtected && (
                    <button
                      type="button"
                      onClick={() => setTargetConn(conn)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <XCircle size={13} />
                      <span>{isListening ? 'Free Port' : 'End Process'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Freeing Port / Killing Process */}
      {targetConn && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setTargetConn(null);
          }}
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] text-[var(--color-danger)] shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {targetConn.is_listening ? `Free Port ${targetConn.local_port}?` : `Terminate ${targetConn.process_name}?`}
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  This will immediately terminate the process holding this socket. Any unsaved work in that application will be lost.
                </p>
              </div>
            </div>

            {/* Target Diagnostic Details */}
            <div className="p-3.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] space-y-2 mb-5 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-tertiary)]">Process:</span>
                <span className="font-semibold text-[var(--color-text-primary)]">{targetConn.process_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-tertiary)]">PID:</span>
                <span className="text-[var(--color-text-secondary)]">{targetConn.pid}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-tertiary)]">Socket:</span>
                <span className="text-[var(--color-accent)]">{targetConn.protocol} {targetConn.local_ip}:{targetConn.local_port}</span>
              </div>
              {targetConn.exe_path && (
                <div className="pt-1 border-t border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-tertiary)] break-all font-sans">
                  {targetConn.exe_path}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTargetConn(null)}
                disabled={isTerminating}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteKill}
                disabled={isTerminating}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-danger)] hover:opacity-90 text-white transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isTerminating ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Terminating...</span>
                  </>
                ) : (
                  <>
                    <XCircle size={13} />
                    <span>{targetConn.is_listening ? 'Free Port' : 'Terminate Process'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
