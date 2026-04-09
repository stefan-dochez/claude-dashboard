import { useState, useEffect, useRef } from 'react';
import { Settings, X, Plus, Layers } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ScanPathsModalProps {
  scanPaths: string[];
  metaProjects: string[];
  onSave: (paths: string[], metaProjects: string[]) => void;
  onClose: () => void;
}

export default function ScanPathsModal({ scanPaths, metaProjects, onSave, onClose }: ScanPathsModalProps) {
  const [paths, setPaths] = useState<string[]>(scanPaths.length > 0 ? [...scanPaths] : ['']);
  const [metas, setMetas] = useState<string[]>([...metaProjects]);
  const modalRef = useFocusTrap<HTMLDivElement>();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const metaInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSave = () => {
    onSave(
      paths.filter(p => p.trim()),
      metas.filter(p => p.trim()),
    );
  };

  const handleAdd = () => {
    setPaths(prev => [...prev, '']);
    requestAnimationFrame(() => {
      inputRefs.current[paths.length]?.focus();
    });
  };

  const handleRemove = (index: number) => {
    setPaths(prev => prev.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, value: string) => {
    setPaths(prev => prev.map((p, i) => (i === index ? value : p)));
  };

  const handleAddMeta = () => {
    setMetas(prev => [...prev, '']);
    requestAnimationFrame(() => {
      metaInputRefs.current[metas.length]?.focus();
    });
  };

  const handleRemoveMeta = (index: number) => {
    setMetas(prev => prev.filter((_, i) => i !== index));
  };

  const handleChangeMeta = (index: number, value: string) => {
    setMetas(prev => prev.map((p, i) => (i === index ? value : p)));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="mx-4 w-full max-w-sm rounded-lg border border-border-input bg-surface p-4 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Settings className="h-4 w-4 text-tertiary" />
            <span className="text-sm font-semibold">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scan Paths section */}
        <p className="mb-2 text-xs font-medium text-secondary">Scan Paths</p>
        <p className="mb-2 text-[12px] text-muted">
          Directories to scan for projects
        </p>

        <div className="mb-2 flex max-h-36 flex-col gap-2 overflow-y-auto">
          {paths.map((path, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                ref={el => { inputRefs.current[index] = el; }}
                type="text"
                value={path}
                onChange={e => handleChange(index, e.target.value)}
                placeholder="~/projects"
                className="flex-1 rounded-md border border-border-input bg-elevated px-3 py-1.5 text-sm text-primary placeholder-placeholder outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              />
              <button
                onClick={() => handleRemove(index)}
                className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-red-400"
                title="Remove path"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAdd}
          className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border-input py-1.5 text-xs text-muted transition-colors hover:border-border-focus hover:text-secondary"
        >
          <Plus className="h-3 w-3" />
          Add path
        </button>

        {/* Meta Projects section */}
        <div className="mb-2 flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-violet-400" />
          <p className="text-xs font-medium text-secondary">Monorepos</p>
        </div>
        <p className="mb-2 text-[12px] text-muted">
          Git repos containing sub-projects. Their subdirectories will be scanned with extra depth.
        </p>

        <div className="mb-2 flex max-h-36 flex-col gap-2 overflow-y-auto">
          {metas.map((meta, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                ref={el => { metaInputRefs.current[index] = el; }}
                type="text"
                value={meta}
                onChange={e => handleChangeMeta(index, e.target.value)}
                placeholder="~/dev/my-meta-repo"
                className="flex-1 rounded-md border border-border-input bg-elevated px-3 py-1.5 text-sm text-primary placeholder-placeholder outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              <button
                onClick={() => handleRemoveMeta(index)}
                className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-red-400"
                title="Remove monorepo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAddMeta}
          className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-violet-800/50 py-1.5 text-xs text-muted transition-colors hover:border-violet-600 hover:text-secondary"
        >
          <Plus className="h-3 w-3" />
          Add monorepo
        </button>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-tertiary transition-colors hover:bg-elevated hover:text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
