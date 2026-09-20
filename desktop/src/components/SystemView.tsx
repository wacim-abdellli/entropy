import React, { useState } from 'react';
import {
  Activity,
  Cpu,
  Boxes,
  Database,
  ExternalLink,
  Terminal,
  Search,
  Check,
  Copy,
} from 'lucide-react';
import {
  ProcessConnection,
  RuntimeConnection,
  DockerConnection,
  CacheConnection,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface SystemViewProps {
  initialTab?: 'processes' | 'runtimes' | 'containers' | 'caches';
  processes: ProcessConnection[];
  runtimes: RuntimeConnection[];
  containers: DockerConnection[];
  caches: CacheConnection[];
}

export const SystemView: React.FC<SystemViewProps> = ({
  initialTab = 'processes',
  processes,
  runtimes,
  containers,
  caches,
}) => {
  const [activeTab, setActiveTab] = useState<'processes' | 'runtimes' | 'containers' | 'caches'>(
    initialTab
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1800);
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const filteredProcesses = processes.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.cwd && p.cwd.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.cmdline_preview && p.cmdline_preview.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0d14] text-zinc-300 p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2330]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 flex items-center space-x-2">
            <span>System Substrates & Inventory</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Machine-wide enumeration of active processes, runtime toolchains, containers, and build caches.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search substrates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 bg-[#10141f] border border-[#1e2330] focus:border-emerald-500/50 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-[#1e2330] text-xs">
        <button
          onClick={() => setActiveTab('processes')}
          className={`px-4 py-2 border-b-2 font-medium transition-colors flex items-center space-x-2 ${
            activeTab === 'processes'
              ? 'border-sky-400 text-sky-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Processes ({processes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('runtimes')}
          className={`px-4 py-2 border-b-2 font-medium transition-colors flex items-center space-x-2 ${
            activeTab === 'runtimes'
              ? 'border-purple-400 text-purple-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Runtimes & SDKs ({runtimes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('containers')}
          className={`px-4 py-2 border-b-2 font-medium transition-colors flex items-center space-x-2 ${
            activeTab === 'containers'
              ? 'border-indigo-400 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Docker Containers ({containers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('caches')}
          className={`px-4 py-2 border-b-2 font-medium transition-colors flex items-center space-x-2 ${
            activeTab === 'caches'
              ? 'border-teal-400 text-teal-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Package Caches ({caches.length})</span>
        </button>
      </div>

      {/* Content */}
      {activeTab === 'processes' && (
        <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#131826] border-b border-[#1e2330] text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="p-3">Process / PID</th>
                <th className="p-3">Role</th>
                <th className="p-3">Memory (RSS)</th>
                <th className="p-3">Working Directory</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#181d2c] font-mono">
              {filteredProcesses.map((p) => (
                <tr key={p.entity_id} className="hover:bg-[#141926] transition-colors">
                  <td className="p-3">
                    <div className="font-bold text-zinc-100">{p.name}</div>
                    <div className="text-[10px] text-zinc-500">PID {p.pid}</div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        p.is_shell
                          ? 'bg-zinc-800 text-zinc-400'
                          : 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/60'
                      }`}
                    >
                      {p.is_shell ? 'Interactive Shell' : 'Active Worker'}
                    </span>
                  </td>
                  <td className="p-3 text-zinc-300">
                    {(p.memory_bytes ? p.memory_bytes / (1024 * 1024) : 0).toFixed(1)} MB
                  </td>
                  <td className="p-3 text-zinc-400 text-[11px] truncate max-w-[320px]">
                    {p.cwd || '—'}
                  </td>
                  <td className="p-3 text-right">
                    {p.cwd && (
                      <button
                        onClick={() => EntropyApiClient.openInExplorer(p.cwd!)}
                        title="Open CWD in Explorer"
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'runtimes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {runtimes.map((rt) => (
            <div
              key={rt.entity_id}
              className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#1e2330]">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-zinc-100 capitalize text-sm">{rt.name}</span>
                </div>
                <span className="font-mono text-xs bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-900/60">
                  v{rt.version}
                </span>
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                <div className="text-zinc-400">
                  <span className="text-zinc-500">Executable: </span>
                  <span className="text-zinc-200">{rt.executable_path}</span>
                </div>
                {rt.install_path && (
                  <div className="text-zinc-400">
                    <span className="text-zinc-500">Prefix / Home: </span>
                    <span className="text-zinc-300">{rt.install_path}</span>
                  </div>
                )}
                <div className="text-zinc-500 text-[10px]">
                  Scope: {rt.is_system ? 'System Installation' : 'User Local'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'containers' && (
        <div className="space-y-4">
          {containers.map((c) => (
            <div
              key={c.entity_id}
              className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#1e2330]">
                <div className="flex items-center space-x-2">
                  <Boxes className="w-4 h-4 text-indigo-400" />
                  <span className="font-bold text-zinc-100 text-sm">{c.name}</span>
                </div>
                <span className="font-mono text-xs bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded">
                  {c.state}
                </span>
              </div>

              <div className="text-xs font-mono space-y-1">
                <div>Image: <span className="text-zinc-200">{c.image}</span></div>
                <div>Status: <span className="text-zinc-400">{c.status}</span></div>
              </div>

              {c.bind_mounts.length > 0 && (
                <div className="pt-2 border-t border-[#1e2330] space-y-1">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Bind Mounts</div>
                  {c.bind_mounts.map((m, idx) => (
                    <div key={idx} className="font-mono text-[11px] text-zinc-300 bg-[#131826] p-1.5 rounded">
                      {m}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {containers.length === 0 && (
            <div className="p-8 text-center bg-[#0f131d] border border-[#1e2330] rounded-lg text-zinc-500 text-xs italic">
              No Docker containers currently accessible or running.
            </div>
          )}
        </div>
      )}

      {activeTab === 'caches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {caches.map((cache) => (
            <div
              key={cache.entity_id}
              className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#1e2330]">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-teal-400" />
                  <span className="font-bold text-zinc-100 uppercase text-sm">{cache.category} Cache</span>
                  {cache.is_shared && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-950/60 border border-sky-800/40 text-sky-400 font-semibold uppercase">
                      Shared System Cache
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-teal-300 font-bold">
                  {formatSize(cache.size_bytes)}
                </span>
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                <div className="text-zinc-400 truncate">
                  <span className="text-zinc-500">Path: </span>
                  <span className="text-zinc-200">{cache.path}</span>
                </div>
                {cache.entry_count !== null && (
                  <div className="text-zinc-500">
                    Entries: {cache.entry_count} packages cached
                  </div>
                )}
                {cache.is_shared && (
                  <div className="text-zinc-400 text-[11px] italic font-sans">
                    {cache.scope_explanation || 'Shared across projects on this machine. (Not isolated to this workspace)'}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[#1e2330] flex justify-end">
                <button
                  onClick={() => handleCopy(cache.path)}
                  className="flex items-center space-x-1 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
                >
                  {copiedText === cache.path ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 text-[11px]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[11px]">Copy Path</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
