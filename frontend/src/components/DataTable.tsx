import { useState, useMemo, useCallback, type CSSProperties } from 'react';
import { clsx } from 'clsx';
import { ChevronUp, ChevronDown, Search, Download } from 'lucide-react';
import { usePresentationOptional } from '../context/PresentationContext';
import { useToast } from '../context/ToastContext';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  /** Plain-text value for CSV when `render` is used or you want a different export than `row[key]`. */
  exportValue?: (row: T) => string;
  sortable?: boolean;
}

function csvEscape(s: string): string {
  const needsQuote = /[",\n\r]/.test(s);
  const t = s.replace(/"/g, '""');
  return needsQuote ? `"${t}"` : t;
}

function cellCsv<T extends Record<string, any>>(col: DataTableColumn<T>, row: T): string {
  if (col.exportValue) return col.exportValue(row);
  const v = row[col.key];
  if (v == null) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  searchable?: boolean;
  searchKeys?: string[];
  /** When set, shows “Export CSV” for the current sorted/filtered rows. */
  exportCsvFileName?: string;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  searchable = true,
  searchKeys,
  exportCsvFileName,
}: DataTableProps<T>) {
  const { dataGridTableClass, dataGridShellClass, isDesktopData } = usePresentationOptional();
  const showToast = useToast();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    const keys = searchKeys || columns.map(c => c.key);
    return data.filter(row => keys.some(k => String(row[k] ?? '').toLowerCase().includes(q)));
  }, [data, search, searchKeys, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const downloadCsv = useCallback(() => {
    if (!exportCsvFileName || sorted.length === 0) return;
    const header = columns.map(c => csvEscape(c.label)).join(',');
    const lines = sorted.map(row =>
      columns.map(col => csvEscape(cellCsv(col, row))).join(','),
    );
    const body = '\uFEFF' + header + '\n' + lines.join('\n');
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base = exportCsvFileName.replace(/\.csv$/i, '');
    a.href = url;
    a.download = `${base}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${sorted.length} row${sorted.length === 1 ? '' : 's'}`, 'success');
  }, [columns, exportCsvFileName, sorted, showToast]);

  return (
    <div className="space-y-3">
      {(searchable || exportCsvFileName) && (
        <div
          className={clsx(
            'flex flex-wrap items-center gap-2',
            searchable && exportCsvFileName && 'justify-between',
            !searchable && exportCsvFileName && 'justify-end',
          )}
        >
          {searchable && (
            <div className="relative flex-1 min-w-[180px] max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={clsx(
                  'w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none',
                  isDesktopData
                    ? 'bg-white border border-[#7a7a7a] text-black placeholder-gray-500 focus:border-[#0078d4]'
                    : 'bg-slate-800 border border-slate-600 text-white placeholder-gray-500 focus:border-blue-500/50',
                )}
              />
            </div>
          )}
          {exportCsvFileName && (
            <button
              type="button"
              onClick={downloadCsv}
              disabled={sorted.length === 0}
              className={clsx(
                'inline-flex items-center gap-2 shrink-0 text-xs px-3 py-2 rounded-lg transition-colors border disabled:opacity-40 disabled:cursor-not-allowed',
                isDesktopData
                  ? 'border-[#adadad] bg-white text-black hover:bg-gray-50'
                  : 'border-white/15 bg-white/5 text-gray-200 hover:bg-white/10',
              )}
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
        </div>
      )}
      <div className={dataGridShellClass}>
        <table className={clsx(dataGridTableClass, !isDesktopData && 'text-sm')}>
          <thead>
            <tr className={isDesktopData ? '' : 'border-b border-white/10'}>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && toggleSort(col.key)}
                  className={clsx(
                    isDesktopData
                      ? 'cursor-pointer select-none'
                      : 'px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider',
                    !isDesktopData && col.sortable !== false && 'cursor-pointer hover:text-gray-200',
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={isDesktopData ? '' : 'divide-y divide-white/5'}>
            {sorted.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                style={
                  !isDesktopData
                    ? ({ ['--dt-i' as string]: String(Math.min(i, 28)) } as CSSProperties)
                    : undefined
                }
                className={clsx(
                  'transition-colors duration-200',
                  !isDesktopData && 'dba-dt-row-web',
                  !isDesktopData && onRowClick && 'cursor-pointer hover:bg-slate-800/50',
                  isDesktopData && onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map(col => (
                  <td key={col.key} className={isDesktopData ? 'whitespace-nowrap' : 'px-4 py-3 whitespace-nowrap'}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
