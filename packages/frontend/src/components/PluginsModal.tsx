import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package, X, Search, RefreshCw, Plus, Trash2, FileText, AlertCircle,
  Globe, Check, Power,
} from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { usePlugins } from '../hooks/usePlugins';
import type { InstalledPlugin, AvailablePlugin } from '../types';

interface PluginsModalProps {
  onClose: () => void;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

interface ReadmeModalProps {
  pluginName: string;
  installPath: string;
  onLoad: (installPath: string) => Promise<{ content: string; filename: string }>;
  onClose: () => void;
}

function ReadmeModal({ pluginName, installPath, onLoad, onClose }: ReadmeModalProps) {
  const [content, setContent] = useState('');
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ref = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    onLoad(installPath)
      .then(({ content, filename }) => { setContent(content); setFilename(filename); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [installPath, onLoad]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        ref={ref}
        className="mx-4 flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border-default bg-modal shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border-default px-4 py-3">
          <FileText className="mr-2 h-4 w-4 text-tertiary" />
          <span className="text-sm font-semibold text-primary">{pluginName}</span>
          {filename && <span className="ml-2 text-[11px] text-faint">· {filename}</span>}
          <button
            onClick={onClose}
            className="ml-auto rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-codeblock p-4">
          {loading ? (
            <div className="text-sm text-muted">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-400">{error}</div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-secondary">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

interface AddMarketplaceBarProps {
  onAdd: (source: string) => Promise<void>;
  onCancel: () => void;
}

function AddMarketplaceBar({ onAdd, onCancel }: AddMarketplaceBarProps) {
  const [source, setSource] = useState('');
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    if (!source.trim()) return;
    setAdding(true);
    try {
      await onAdd(source.trim());
      setSource('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        autoFocus
        value={source}
        onChange={e => setSource(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="owner/repo, git URL, or local path"
        className="w-72 rounded-md border border-border-input bg-input px-2.5 py-1 font-mono text-[11px] text-primary outline-none focus:border-border-focus"
      />
      <button
        onClick={submit}
        disabled={adding || !source.trim()}
        className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
      >
        <Check className="h-3 w-3" />
        {adding ? 'Adding…' : 'Add'}
      </button>
      <button
        onClick={onCancel}
        className="rounded-md px-2 py-1 text-[11px] text-tertiary transition-colors hover:bg-elevated hover:text-primary"
      >
        Cancel
      </button>
    </div>
  );
}

interface AvailablePluginCardProps {
  plugin: AvailablePlugin;
  busy: boolean;
  onInstall: () => void;
  onView: (installPath: string) => void;
  installedPath?: string;
}

function AvailablePluginCard({ plugin, busy, onInstall, onView, installedPath }: AvailablePluginCardProps) {
  return (
    <div className="mb-1.5 flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface p-3 transition-colors hover:bg-hover">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-primary">{plugin.name}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
          <Globe className="h-2.5 w-2.5" />
          {plugin.marketplaceName}
        </span>
        {plugin.category && (
          <span className="rounded-full bg-badge px-1.5 py-0.5 text-[10px] text-muted">{plugin.category}</span>
        )}
        <span className="ml-auto">
          {plugin.isInstalled ? (
            <span className="rounded-full bg-green-500/12 px-2 py-0.5 text-[10px] font-medium text-green-400">Installed</span>
          ) : (
            <span className="rounded-full bg-badge px-2 py-0.5 text-[10px] font-medium text-muted">Not installed</span>
          )}
        </span>
      </div>
      {plugin.description && (
        <p className="line-clamp-2 text-[12px] leading-relaxed text-tertiary">{plugin.description}</p>
      )}
      <div className="flex items-center gap-3 font-mono text-[11px] text-faint">
        {plugin.author?.name && <span>by {plugin.author.name}</span>}
        {typeof plugin.installCount === 'number' && <span>{plugin.installCount} installs</span>}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        {!plugin.isInstalled ? (
          <button
            onClick={onInstall}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {busy ? 'Installing…' : 'Install'}
          </button>
        ) : installedPath ? (
          <button
            onClick={() => onView(installedPath)}
            className="inline-flex items-center gap-1 rounded-md border border-border-input bg-elevated px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-hover"
          >
            <FileText className="h-3 w-3" />
            View README
          </button>
        ) : null}
      </div>
    </div>
  );
}

type InstalledAction = 'enable' | 'disable' | 'update' | 'uninstall';

interface InstalledPluginCardProps {
  plugin: InstalledPlugin;
  busyAction: InstalledAction | null;
  onEnable: () => void;
  onDisable: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
  onView: (installPath: string) => void;
}

function InstalledPluginCard({
  plugin, busyAction, onEnable, onDisable, onUpdate, onUninstall, onView,
}: InstalledPluginCardProps) {
  const busy = busyAction !== null;
  const hasErrors = plugin.errors && plugin.errors.length > 0;
  return (
    <div className={`mb-1.5 flex flex-col gap-1.5 rounded-lg border p-3 transition-colors ${
      plugin.enabled ? 'border-border-subtle bg-surface hover:bg-hover' : 'border-border-subtle bg-surface/50 hover:bg-hover'
    }`}>
      <div className="flex items-center gap-2">
        <span className={`text-[13px] font-semibold ${plugin.enabled ? 'text-primary' : 'text-muted'}`}>{plugin.name}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
          <Globe className="h-2.5 w-2.5" />
          {plugin.marketplaceName}
        </span>
        <button
          onClick={plugin.enabled ? onDisable : onEnable}
          disabled={busy}
          className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${
            plugin.enabled
              ? 'bg-green-500/12 text-green-400 hover:bg-green-500/20'
              : 'bg-badge text-muted hover:bg-hover'
          }`}
          title={plugin.enabled ? 'Click to disable' : 'Click to enable'}
        >
          {busyAction === 'enable' || busyAction === 'disable' ? (
            <RefreshCw className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <Power className="h-2.5 w-2.5" />
          )}
          {busyAction === 'enable' ? 'Enabling…' : busyAction === 'disable' ? 'Disabling…' : plugin.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      {plugin.description && (
        <p className="line-clamp-2 text-[12px] leading-relaxed text-tertiary">{plugin.description}</p>
      )}
      <div className="flex items-center gap-3 font-mono text-[11px] text-faint">
        {plugin.version === 'unknown' ? (
          <span
            className="inline-flex items-center gap-1 text-amber-500/80"
            title="The plugin author didn't include a `version` field in their plugin.json — this is a packaging issue on their side, not yours"
          >
            <AlertCircle className="h-2.5 w-2.5" />
            unversioned
          </span>
        ) : (
          <span>v{plugin.version}</span>
        )}
        <span>scope: {plugin.scope}</span>
        <span className="ml-auto">updated {formatRelative(plugin.lastUpdated)}</span>
      </div>
      {hasErrors && (
        <div className="flex items-start gap-1.5 rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{plugin.errors!.join('; ')}</span>
        </div>
      )}
      <div className="mt-0.5 flex items-center gap-1.5">
        <button
          onClick={onUpdate}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-border-input bg-elevated px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-hover disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${busyAction === 'update' ? 'animate-spin' : ''}`} />
          {busyAction === 'update' ? 'Updating…' : 'Update'}
        </button>
        <button
          onClick={() => onView(plugin.installPath)}
          className="inline-flex items-center gap-1 rounded-md border border-border-input bg-elevated px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-hover"
        >
          <FileText className="h-3 w-3" />
          View README
        </button>
        <button
          onClick={onUninstall}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          title="Uninstall"
        >
          {busyAction === 'uninstall' ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          {busyAction === 'uninstall' ? 'Uninstalling…' : 'Uninstall'}
        </button>
      </div>
    </div>
  );
}

export default function PluginsModal({ onClose }: PluginsModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>();
  const {
    marketplaces, installed, available, loading, refreshing, error,
    addMarketplace, removeMarketplace, updateMarketplaces,
    installPlugin, uninstallPlugin, updatePlugin,
    enablePlugin, disablePlugin, getReadme,
  } = usePlugins(true);

  const [addingMarketplace, setAddingMarketplace] = useState(false);
  const [updatingMarketplaces, setUpdatingMarketplaces] = useState(false);
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all');
  const [availableSearch, setAvailableSearch] = useState('');
  const [installedSearch, setInstalledSearch] = useState('');
  const [busy, setBusy] = useState<{ id: string; action: 'install' | InstalledAction } | null>(null);
  const [toast, setToast] = useState<{ kind: 'info' | 'error'; msg: string } | null>(null);
  const [readmeModal, setReadmeModal] = useState<{ name: string; installPath: string } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !readmeModal) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, readmeModal]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showError = useCallback((err: unknown) => {
    setToast({ kind: 'error', msg: err instanceof Error ? err.message : String(err) });
  }, []);

  const handleAddMarketplace = useCallback(async (source: string) => {
    try {
      await addMarketplace(source);
      setToast({ kind: 'info', msg: `Marketplace added` });
      setAddingMarketplace(false);
    } catch (e) {
      showError(e);
      throw e;
    }
  }, [addMarketplace, showError]);

  const handleRemoveMarketplace = useCallback(async (name: string) => {
    try {
      await removeMarketplace(name);
      setToast({ kind: 'info', msg: `Removed ${name}` });
      if (marketplaceFilter === name) setMarketplaceFilter('all');
    } catch (e) {
      showError(e);
    }
  }, [removeMarketplace, marketplaceFilter, showError]);

  const handleUpdateMarketplaces = useCallback(async () => {
    setUpdatingMarketplaces(true);
    try {
      await updateMarketplaces();
      setToast({ kind: 'info', msg: 'Marketplaces updated' });
    } catch (e) {
      showError(e);
    } finally {
      setUpdatingMarketplaces(false);
    }
  }, [updateMarketplaces, showError]);

  const withBusy = useCallback(async (
    id: string,
    action: 'install' | InstalledAction,
    fn: () => Promise<void>,
    successMsg?: string,
  ) => {
    setBusy({ id, action });
    try {
      await fn();
      if (successMsg) setToast({ kind: 'info', msg: successMsg });
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  }, [showError]);

  const filteredAvailable = useMemo(() => {
    const q = availableSearch.toLowerCase().trim();
    return available.filter(p => {
      if (marketplaceFilter !== 'all' && p.marketplaceName !== marketplaceFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q)
        || p.description.toLowerCase().includes(q)
        || (p.keywords ?? []).some(k => k.toLowerCase().includes(q));
    });
  }, [available, availableSearch, marketplaceFilter]);

  const filteredInstalled = useMemo(() => {
    const q = installedSearch.toLowerCase().trim();
    return installed.filter(p => {
      if (marketplaceFilter !== 'all' && p.marketplaceName !== marketplaceFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q)
        || (p.description ?? '').toLowerCase().includes(q);
    });
  }, [installed, installedSearch, marketplaceFilter]);

  // Map pluginId → installPath so the "View README" button on Available cards can resolve.
  const installedPathById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of installed) map.set(p.id, p.installPath);
    return map;
  }, [installed]);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8" onClick={onClose}>
        <div
          ref={modalRef}
          className="flex h-full max-h-[760px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border-default bg-modal shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center border-b border-border-default px-5 py-4">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-primary">
              <Package className="h-4 w-4 text-violet-400" />
              Plugins
            </h2>
            <span className="ml-3 text-[11px] text-faint">Browse, install, and manage Claude Code plugins from your configured marketplaces</span>
            {refreshing && (
              <span className="ml-3 inline-flex items-center gap-1.5 text-[11px] text-muted">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Refreshing…
              </span>
            )}
            <button
              onClick={onClose}
              className="ml-auto rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Marketplaces bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-surface px-5 py-3">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted">Marketplaces</label>
            {marketplaces.length === 0 && !loading && (
              <span className="text-[11px] italic text-faint">None configured</span>
            )}
            {marketplaces.map(mp => (
              <div key={mp.name} className="inline-flex items-center gap-1 rounded-full border border-border-input bg-elevated pl-2 pr-1 py-0.5">
                <Globe className="h-2.5 w-2.5 text-blue-400" />
                <span className="text-[11px] text-primary" title={mp.url ?? mp.repo ?? mp.path ?? mp.source}>
                  {mp.name}
                </span>
                <button
                  onClick={() => handleRemoveMarketplace(mp.name)}
                  className="rounded-full p-0.5 text-muted transition-colors hover:bg-red-500/20 hover:text-red-400"
                  title={`Remove ${mp.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            {addingMarketplace ? (
              <AddMarketplaceBar
                onAdd={handleAddMarketplace}
                onCancel={() => setAddingMarketplace(false)}
              />
            ) : (
              <>
                <button
                  onClick={() => setAddingMarketplace(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-border-input bg-transparent px-2 py-1 text-[11px] text-muted transition-colors hover:border-border-focus hover:text-primary"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
                <button
                  onClick={handleUpdateMarketplaces}
                  disabled={updatingMarketplaces || marketplaces.length === 0}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-border-input bg-elevated px-2 py-1 text-[11px] text-primary transition-colors hover:bg-hover disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${updatingMarketplaces ? 'animate-spin' : ''}`} />
                  {updatingMarketplaces ? 'Updating…' : 'Update all'}
                </button>
              </>
            )}
          </div>

          {/* Body */}
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center text-sm text-red-400">{error}</div>
          ) : (
            <div className="grid flex-1 grid-cols-2 overflow-hidden">
              {/* Available column */}
              <div className="flex min-h-0 flex-col overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-tertiary">Available</h3>
                  <span className="rounded-full bg-badge px-1.5 py-0.5 text-[10px] text-faint">{filteredAvailable.length}</span>
                  <select
                    value={marketplaceFilter}
                    onChange={e => setMarketplaceFilter(e.target.value)}
                    className="ml-auto rounded-md border border-border-input bg-input py-1 px-2 text-[11px] text-primary outline-none focus:border-border-focus"
                  >
                    <option value="all">All marketplaces</option>
                    {marketplaces.map(mp => (
                      <option key={mp.name} value={mp.name}>{mp.name}</option>
                    ))}
                  </select>
                  <div className="relative w-40">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
                    <input
                      value={availableSearch}
                      onChange={e => setAvailableSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full rounded-md border border-border-input bg-input py-1 pl-7 pr-2 text-[11px] text-primary outline-none focus:border-border-focus"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {filteredAvailable.length === 0 ? (
                    <div className="px-3 py-8 text-center text-[12px] text-muted">
                      {available.length === 0 ? 'No plugins available — add a marketplace first' : 'No matches'}
                    </div>
                  ) : (
                    filteredAvailable.map(plugin => (
                      <AvailablePluginCard
                        key={plugin.pluginId}
                        plugin={plugin}
                        busy={busy?.id === plugin.pluginId && busy.action === 'install'}
                        installedPath={installedPathById.get(plugin.pluginId)}
                        onInstall={() => withBusy(plugin.pluginId, 'install', () => installPlugin(plugin.pluginId), `Installed ${plugin.name}`)}
                        onView={(installPath) => setReadmeModal({ name: plugin.name, installPath })}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Installed column */}
              <div className="flex min-h-0 flex-col overflow-hidden border-l border-border-default">
                <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-tertiary">Installed</h3>
                  <span className="rounded-full bg-badge px-1.5 py-0.5 text-[10px] text-faint">{filteredInstalled.length}</span>
                  <div className="relative ml-auto w-40">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
                    <input
                      value={installedSearch}
                      onChange={e => setInstalledSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full rounded-md border border-border-input bg-input py-1 pl-7 pr-2 text-[11px] text-primary outline-none focus:border-border-focus"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {filteredInstalled.length === 0 ? (
                    <div className="px-3 py-8 text-center text-[12px] text-muted">
                      {installed.length === 0 ? 'No plugins installed' : 'No matches'}
                    </div>
                  ) : (
                    filteredInstalled.map(plugin => (
                      <InstalledPluginCard
                        key={plugin.id}
                        plugin={plugin}
                        busyAction={busy?.id === plugin.id && busy.action !== 'install' ? busy.action : null}
                        onEnable={() => withBusy(plugin.id, 'enable', () => enablePlugin(plugin.id), `Enabled ${plugin.name}`)}
                        onDisable={() => withBusy(plugin.id, 'disable', () => disablePlugin(plugin.id), `Disabled ${plugin.name}`)}
                        onUpdate={() => withBusy(plugin.id, 'update', () => updatePlugin(plugin.id), `Updated ${plugin.name}`)}
                        onUninstall={() => withBusy(plugin.id, 'uninstall', () => uninstallPlugin(plugin.id), `Uninstalled ${plugin.name}`)}
                        onView={(installPath) => setReadmeModal({ name: plugin.name, installPath })}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div className={`absolute bottom-4 right-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] shadow-lg ${
              toast.kind === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-border-default bg-surface text-secondary'
            }`}>
              {toast.kind === 'error' && <AlertCircle className="h-3.5 w-3.5" />}
              {toast.msg}
            </div>
          )}
        </div>
      </div>

      {readmeModal && (
        <ReadmeModal
          pluginName={readmeModal.name}
          installPath={readmeModal.installPath}
          onLoad={getReadme}
          onClose={() => setReadmeModal(null)}
        />
      )}
    </>
  );
}
