import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie,
} from 'recharts';
import { X, DollarSign, Cpu, TrendingUp, Calendar } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

// --------------- Types ---------------

interface StoredTask {
  id: string;
  projectName: string;
  model: string | null;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  endedAt: string | null;
}

interface DailyCost {
  date: string;
  cost: number;
  tasks: number;
}

interface ProjectCost {
  name: string;
  cost: number;
  tasks: number;
}

interface ModelStats {
  model: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  tasks: number;
}

// --------------- Helpers ---------------

const CHART_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#f472b6'];
const RANGE_OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
] as const;

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function getDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(iso: string): string {
  return iso.substring(0, 10);
}

// --------------- Custom tooltip ---------------

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border-default bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-primary">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted">
          <span style={{ color: p.color }}>{p.name}:</span>{' '}
          {p.name.toLowerCase().includes('token') ? formatTokens(p.value) : formatCost(p.value)}
        </p>
      ))}
    </div>
  );
}

// --------------- Summary card ---------------

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-default bg-elevated/30 px-4 py-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-lg font-semibold text-primary">{value}</p>
        <p className="text-[11px] text-muted">{label}{sub ? ` — ${sub}` : ''}</p>
      </div>
    </div>
  );
}

// --------------- Main component ---------------

interface CostDashboardProps {
  onClose: () => void;
}

export default function CostDashboard({ onClose }: CostDashboardProps) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    fetch('/api/tasks/history?limit=500')
      .then(res => res.json())
      .then((data: StoredTask[]) => { setTasks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Filter by date range
  const filtered = useMemo(() => {
    if (range === 'all') return tasks;
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const cutoff = getDaysAgo(days).toISOString();
    return tasks.filter(t => t.createdAt >= cutoff);
  }, [tasks, range]);

  // Aggregations
  const dailyCosts = useMemo((): DailyCost[] => {
    const map = new Map<string, DailyCost>();
    for (const t of filtered) {
      const key = toDateKey(t.createdAt);
      const entry = map.get(key) ?? { date: key, cost: 0, tasks: 0 };
      entry.cost += t.totalCostUsd;
      entry.tasks += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const projectCosts = useMemo((): ProjectCost[] => {
    const map = new Map<string, ProjectCost>();
    for (const t of filtered) {
      const name = t.projectName || 'Unknown';
      const entry = map.get(name) ?? { name, cost: 0, tasks: 0 };
      entry.cost += t.totalCostUsd;
      entry.tasks += 1;
      map.set(name, entry);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost).slice(0, 10);
  }, [filtered]);

  const modelStats = useMemo((): ModelStats[] => {
    const map = new Map<string, ModelStats>();
    for (const t of filtered) {
      const model = t.model ?? 'unknown';
      const short = model.replace('claude-', '').replace(/-\d+$/, '');
      const entry = map.get(short) ?? { model: short, cost: 0, inputTokens: 0, outputTokens: 0, tasks: 0 };
      entry.cost += t.totalCostUsd;
      entry.inputTokens += t.totalInputTokens;
      entry.outputTokens += t.totalOutputTokens;
      entry.tasks += 1;
      map.set(short, entry);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [filtered]);

  const tokenBreakdown = useMemo(() => {
    const input = filtered.reduce((sum, t) => sum + t.totalInputTokens, 0);
    const output = filtered.reduce((sum, t) => sum + t.totalOutputTokens, 0);
    return [
      { name: 'Input', value: input, fill: '#60a5fa' },
      { name: 'Output', value: output, fill: '#a78bfa' },
    ];
  }, [filtered]);

  const totals = useMemo(() => ({
    cost: filtered.reduce((sum, t) => sum + t.totalCostUsd, 0),
    inputTokens: filtered.reduce((sum, t) => sum + t.totalInputTokens, 0),
    outputTokens: filtered.reduce((sum, t) => sum + t.totalOutputTokens, 0),
    tasks: filtered.length,
    avgCost: filtered.length > 0 ? filtered.reduce((sum, t) => sum + t.totalCostUsd, 0) / filtered.length : 0,
  }), [filtered]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        ref={trapRef}
        onClick={e => e.stopPropagation()}
        className="mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-border-default bg-surface shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-default px-5 py-3">
          <TrendingUp className="h-4 w-4 text-green-400" />
          <h2 className="flex-1 text-sm font-medium text-primary">Cost & Analytics</h2>
          <div className="flex items-center gap-1 rounded-lg bg-elevated p-0.5">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  range === opt.value ? 'bg-hover text-primary' : 'text-muted hover:text-secondary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-muted transition-colors hover:bg-hover hover:text-secondary" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <DollarSign className="mb-3 h-8 w-8 text-faint" />
              <p className="text-sm text-muted">No task data for this period</p>
              <p className="mt-1 text-[11px] text-faint">Run some chat sessions to start tracking costs</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <StatCard icon={DollarSign} label="Total cost" value={formatCost(totals.cost)} color="bg-green-500/10 text-green-400" />
                <StatCard icon={Cpu} label="Tokens" value={formatTokens(totals.inputTokens + totals.outputTokens)} sub={`${formatTokens(totals.inputTokens)} in / ${formatTokens(totals.outputTokens)} out`} color="bg-blue-500/10 text-blue-400" />
                <StatCard icon={Calendar} label="Tasks" value={String(totals.tasks)} color="bg-violet-500/10 text-violet-400" />
                <StatCard icon={TrendingUp} label="Avg cost/task" value={formatCost(totals.avgCost)} color="bg-amber-500/10 text-amber-400" />
              </div>

              {/* Cost over time */}
              {dailyCosts.length > 1 && (
                <div>
                  <h3 className="mb-3 text-xs font-medium text-muted">Cost over time</h3>
                  <div className="h-48 rounded-lg border border-border-default bg-elevated/20 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyCosts}>
                        <defs>
                          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} tickFormatter={d => d.substring(5)} />
                        <YAxis tick={{ fontSize: 10, fill: '#888' }} tickFormatter={v => `$${v}`} width={45} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="cost" name="Cost" stroke="#34d399" fill="url(#costGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Cost per project + Model comparison */}
              <div className="grid grid-cols-2 gap-4">
                {/* Cost per project */}
                {projectCosts.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-xs font-medium text-muted">Cost by project</h3>
                    <div className="h-48 rounded-lg border border-border-default bg-elevated/20 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={projectCosts} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis type="number" tick={{ fontSize: 10, fill: '#888' }} tickFormatter={v => `$${v}`} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#888' }} width={90} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="cost" name="Cost" radius={[0, 4, 4, 0]}>
                            {projectCosts.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Model comparison */}
                {modelStats.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-xs font-medium text-muted">Cost by model</h3>
                    <div className="h-48 rounded-lg border border-border-default bg-elevated/20 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={modelStats}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="model" tick={{ fontSize: 10, fill: '#888' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#888' }} tickFormatter={v => `$${v}`} width={45} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="cost" name="Cost" radius={[4, 4, 0, 0]}>
                            {modelStats.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* Token breakdown */}
              {(totals.inputTokens > 0 || totals.outputTokens > 0) && (
                <div>
                  <h3 className="mb-3 text-xs font-medium text-muted">Token breakdown</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex h-40 items-center justify-center rounded-lg border border-border-default bg-elevated/20">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={tokenBreakdown}
                            cx="50%" cy="50%"
                            innerRadius={40} outerRadius={60}
                            dataKey="value"
                            strokeWidth={0}
                          />
                          <Tooltip formatter={(v) => formatTokens(Number(v))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col justify-center gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-blue-400" />
                        <div>
                          <p className="text-sm font-medium text-primary">{formatTokens(totals.inputTokens)}</p>
                          <p className="text-[11px] text-muted">Input tokens ({totals.inputTokens + totals.outputTokens > 0 ? Math.round(totals.inputTokens / (totals.inputTokens + totals.outputTokens) * 100) : 0}%)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-violet-400" />
                        <div>
                          <p className="text-sm font-medium text-primary">{formatTokens(totals.outputTokens)}</p>
                          <p className="text-[11px] text-muted">Output tokens ({totals.inputTokens + totals.outputTokens > 0 ? Math.round(totals.outputTokens / (totals.inputTokens + totals.outputTokens) * 100) : 0}%)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Model detail table */}
              {modelStats.length > 0 && (
                <div>
                  <h3 className="mb-3 text-xs font-medium text-muted">Model comparison</h3>
                  <div className="overflow-hidden rounded-lg border border-border-default">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-border-default bg-elevated/30">
                          <th className="px-4 py-2 text-left font-medium text-muted">Model</th>
                          <th className="px-4 py-2 text-right font-medium text-muted">Tasks</th>
                          <th className="px-4 py-2 text-right font-medium text-muted">Cost</th>
                          <th className="px-4 py-2 text-right font-medium text-muted">Avg/task</th>
                          <th className="px-4 py-2 text-right font-medium text-muted">Input</th>
                          <th className="px-4 py-2 text-right font-medium text-muted">Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modelStats.map(m => (
                          <tr key={m.model} className="border-b border-border-default last:border-0">
                            <td className="px-4 py-2 font-mono text-primary">{m.model}</td>
                            <td className="px-4 py-2 text-right text-secondary">{m.tasks}</td>
                            <td className="px-4 py-2 text-right text-green-400">{formatCost(m.cost)}</td>
                            <td className="px-4 py-2 text-right text-secondary">{formatCost(m.tasks > 0 ? m.cost / m.tasks : 0)}</td>
                            <td className="px-4 py-2 text-right text-blue-400">{formatTokens(m.inputTokens)}</td>
                            <td className="px-4 py-2 text-right text-violet-400">{formatTokens(m.outputTokens)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
