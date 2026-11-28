import React, { useRef, useState } from 'react';
import {
  CheckSquare,
  Square,
  Edit3,
  Trash2,
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  FileType2,
  Printer,
  Loader2,
  Lock,
  Unlock,
} from 'lucide-react';

interface DataActionsBarProps {
  totalCount: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  canManage?: boolean;
  onEditSelected?: () => void;
  onBulkDelete?: () => Promise<void> | void;
  onBulkLock?: () => Promise<void> | void;
  onBulkUnlock?: () => Promise<void> | void;
  bulkDeleteLabel?: string;
  onDownloadTemplateXls?: () => void;
  onDownloadTemplateWord?: () => void;
  onImportFile?: (file: File) => Promise<void> | void;
  onExportXls: () => void;
  onExportPdf: () => void;
  onExportWord: () => void;
  onPrint: () => void;
  notice?: string;
  error?: string;
}

export const DataActionsBar: React.FC<DataActionsBarProps> = ({
  totalCount,
  selectedCount,
  allSelected,
  onToggleSelectAll,
  canManage = true,
  onEditSelected,
  onBulkDelete,
  onBulkLock,
  onBulkUnlock,
  bulkDeleteLabel = 'data',
  onDownloadTemplateXls,
  onDownloadTemplateWord,
  onImportFile,
  onExportXls,
  onExportPdf,
  onExportWord,
  onPrint,
  notice,
  error,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleConfirmDelete = async () => {
    if (!onBulkDelete) return;
    setDeleting(true);
    try {
      await onBulkDelete();
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file || !onImportFile) return;
    setImporting(true);
    try {
      await onImportFile(file);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const suffix = selectedCount > 0 ? ` (${selectedCount})` : '';

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
        {/* Left: Pilih / Edit / Hapus */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={totalCount === 0}
            onClick={() => {
              setConfirmDelete(false);
              onToggleSelectAll();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
          >
            {allSelected && totalCount > 0 ? (
              <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
            ) : (
              <Square className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{allSelected && totalCount > 0 ? 'Batal Pilih Semua' : 'Pilih Semua'}</span>
          </button>

          {canManage && selectedCount === 1 && onEditSelected && (
            <button
              type="button"
              onClick={onEditSelected}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-700 dark:text-blue-300 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Terpilih</span>
            </button>
          )}

          {canManage && selectedCount > 0 && onBulkUnlock && (
            <button
              type="button"
              onClick={onBulkUnlock}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
              title="Buka kunci data terpilih agar dapat diedit kembali"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Buka Kunci ({selectedCount})</span>
            </button>
          )}

          {canManage && selectedCount > 0 && onBulkLock && (
            <button
              type="button"
              onClick={onBulkLock}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold text-amber-700 dark:text-amber-300 cursor-pointer"
              title="Kunci data terpilih"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Kunci ({selectedCount})</span>
            </button>
          )}

          {canManage && selectedCount > 0 && onBulkDelete && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold text-rose-700 dark:text-rose-300 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus ({selectedCount})</span>
            </button>
          )}

          {canManage && confirmDelete && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold">
              <span>
                Hapus {selectedCount} {bulkDeleteLabel}?
              </span>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-2 py-0.5 rounded bg-white text-rose-700 font-bold cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-1.5 py-0.5 rounded bg-rose-700 text-white cursor-pointer"
              >
                Batal
              </button>
            </div>
          )}
        </div>

        {/* Right: Template / Import / Unduh PDF XLS Word / Cetak */}
        <div className="flex flex-wrap items-center gap-1.5">
          {canManage && onDownloadTemplateXls && (
            <button
              type="button"
              onClick={onDownloadTemplateXls}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              title="Unduh Template Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Template XLS</span>
            </button>
          )}

          {canManage && onDownloadTemplateWord && (
            <button
              type="button"
              onClick={onDownloadTemplateWord}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              title="Unduh Template Word (.docx)"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Template Word</span>
            </button>
          )}

          {canManage && onImportFile && (
            <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-semibold cursor-pointer hover:bg-slate-800">
              {importing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>Import XLS / Word</span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.docx"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
            </label>
          )}

          <span className="text-slate-300 dark:text-slate-700 px-0.5">|</span>

          <button
            type="button"
            disabled={totalCount === 0}
            onClick={onExportXls}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Unduh XLS{suffix}</span>
          </button>

          <button
            type="button"
            disabled={totalCount === 0}
            onClick={onExportPdf}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Unduh PDF{suffix}</span>
          </button>

          <button
            type="button"
            disabled={totalCount === 0}
            onClick={onExportWord}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
          >
            <FileType2 className="w-3.5 h-3.5" />
            <span>Unduh Word{suffix}</span>
          </button>

          <button
            type="button"
            disabled={totalCount === 0}
            onClick={onPrint}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak{suffix}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          {notice}
        </div>
      )}
      {error && (
        <div className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
          {error}
        </div>
      )}
    </div>
  );
};
