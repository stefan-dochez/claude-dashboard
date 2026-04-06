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
        className="mx-4 w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-200">
            <Settings className="h-4 w-4 text-neutral-400" />
            <span className="text-sm font-semibold">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scan Paths section */}
        <p className="mb-2 text-xs font-medium text-neutral-300">Scan Paths</p>
        <p className="mb-2 text-[11px] text-neutral-500">
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
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
              />
              <button
                onClick={() => handleRemove(index)}
                className="shrink-0 rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-red-400"
                title="Remove path"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAdd}
          className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-700 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-500 hover:text-neutral-300"
        >
          <Plus className="h-3 w-3" />
          Add path
        </button>

        {/* Meta Projects section */}
        <div className="mb-2 flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-violet-400" />
          <p className="text-xs font-medium text-neutral-300">Meta Projects</p>
        </div>
        <p className="mb-2 text-[11px] text-neutral-500">
          Projects containing sub-projects (monorepos). Their subdirectories will also be scanned.
        </p>

        <div className="mb-2 flex max-h-36 flex-col gap-2 overflow-y-auto">
          {metas.map((meta, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                ref={el => { metaInputRefs.current[index] = el; }}
                type="text"
                value={meta}
                onChange={e => handleChangeMeta(index, e.target.value)}
                placeholder="~/dev/my-monorepo"
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              <button
                onClick={() => handleRemoveMeta(index)}
                className="shrink-0 rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-red-400"
                title="Remove meta project"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAddMeta}
          className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-violet-800/50 py-1.5 text-xs text-neutral-500 transition-colors hover:border-violet-600 hover:text-neutral-300"
        >
          <Plus className="h-3 w-3" />
          Add meta project
        </button>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
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
