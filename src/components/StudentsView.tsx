import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutGrid,
  Table2,
  Plus,
  Edit3,
  Trash2,
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  FileType2,
  Sparkles,
  ShieldAlert,
  Save,
  X,
  Loader2,
  UserCircle2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import {
  COLLECTIONS,
  createEmptyBkDetail,
  createEmptyStudent,
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { calcAttendancePct, compressImageFile } from '../lib/imageUtils';
import {
  downloadStudentsXlsTemplate,
  exportStudentsToPdf,
  exportStudentsToWord,
  exportStudentsToXls,
  importStudentsFromFile,
} from '../lib/docExportImport';
import type { BkDetail, UserRole, WcStudent } from '../types/waliconnect';

interface StudentsViewProps {
  students: WcStudent[];
  role: UserRole;
  linkedStudentId?: string;
  searchQuery: string;
  initialSelectedId?: string;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  role,
  linkedStudentId,
  searchQuery,
  initialSelectedId,
}) => {
  const isStaff = role === 'Guru Wali' || role === 'Admin';

  const visibleStudents = isStaff
    ? students.filter((s) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          s.nama_lengkap.toLowerCase().includes(q) ||
          s.kelas.toLowerCase().includes(q) ||
          s.nis.toLowerCase().includes(q)
        );
      })
    : students.filter((s) => !linkedStudentId || s.id === linkedStudentId);

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedId, setSelectedId] = useState<string>(
    initialSelectedId || visibleStudents[0]?.id || ''
  );
  const [profileSubTab, setProfileSubTab] = useState<'mandiri' | 'bk'>('mandiri');

  // Multi-select & Import/Export state
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [importingFile, setImportingFile] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [transferNotice, setTransferNotice] = useState('');
  const [transferError, setTransferError] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Modal Lampiran A state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<WcStudent | null>(null);
  const [savingModal, setSavingModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Inline Mandiri & BK draft state synced with selectedStudent
  const selectedStudent =
    visibleStudents.find((s) => s.id === selectedId) ?? visibleStudents[0] ?? null;

  const [mandiriDraft, setMandiriDraft] = useState<{
    foto_url: string;
    deskripsi_diri: string;
    rencana_lulus: 'Kuliah' | 'Bekerja' | 'Gap-year' | '';
    prodi_pilihan: string;
    langkah_pencapaian: string;
    catatan_khusus: string;
  }>({
    foto_url: '',
    deskripsi_diri: '',
    rencana_lulus: 'Kuliah',
    prodi_pilihan: '',
    langkah_pencapaian: '',
    catatan_khusus: '',
  });

  const [bkDraft, setBkDraft] = useState<BkDetail>(createEmptyBkDetail());
  const [bkSection, setBkSection] = useState<'A' | 'B' | 'C' | 'D' | 'E' | 'F'>('A');
  const [savingInline, setSavingInline] = useState(false);
  const [inlineToast, setInlineToast] = useState('');

  useEffect(() => {
    if (initialSelectedId) setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  useEffect(() => {
    if (selectedStudent) {
      setMandiriDraft({
        foto_url: selectedStudent.foto_url || '',
        deskripsi_diri: selectedStudent.deskripsi_diri || '',
        rencana_lulus: selectedStudent.rencana_lulus || 'Kuliah',
        prodi_pilihan: selectedStudent.prodi_pilihan || '',
        langkah_pencapaian: selectedStudent.langkah_pencapaian || '',
        catatan_khusus: selectedStudent.catatan_khusus || '',
      });
      setBkDraft({ ...createEmptyBkDetail(), ...(selectedStudent.bk_detail || {}) });
    }
  }, [selectedStudent?.id, selectedStudent?.updated_at]);

  const openNewModal = () => {
    setEditingStudent(createEmptyStudent(`std-${Date.now()}`));
    setAiError('');
    setModalOpen(true);
  };

  const openEditModal = (st: WcStudent) => {
    setEditingStudent({ ...st });
    setAiError('');
    setModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!editingStudent.nama_lengkap.trim() || !editingStudent.kelas.trim() || !editingStudent.nis.trim()) {
      setAiError('Nama Lengkap, Kelas, dan NIS wajib diisi.');
      return;
    }
    setSavingModal(true);
    try {
      const payload: WcStudent = {
        ...editingStudent,
        updated_at: new Date().toISOString(),
      };
      await setDoc(doc(db, COLLECTIONS.students, payload.id), payload);
      setSelectedId(payload.id);
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${COLLECTIONS.students}/${editingStudent.id}`);
    } finally {
      setSavingModal(false);
    }
  };

  const handleDeleteStudent = async (st: WcStudent) => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.students, st.id));
      setCheckedIds((prev) => prev.filter((id) => id !== st.id));
      setTransferNotice(`Data murid "${st.nama_lengkap}" berhasil dihapus.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${COLLECTIONS.students}/${st.id}`);
    }
  };

  const toggleCheckStudent = (id: string) => {
    setConfirmBulkDelete(false);
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const allVisibleChecked =
    visibleStudents.length > 0 && visibleStudents.every((s) => checkedIds.includes(s.id));

  const toggleCheckAll = () => {
    setConfirmBulkDelete(false);
    if (allVisibleChecked) {
      setCheckedIds([]);
    } else {
      setCheckedIds(visibleStudents.map((s) => s.id));
    }
  };

  const targetExportStudents =
    checkedIds.length > 0
      ? visibleStudents.filter((s) => checkedIds.includes(s.id))
      : visibleStudents;

  const handleBulkDelete = async () => {
    const targets = visibleStudents.filter((s) => checkedIds.includes(s.id));
    if (targets.length === 0) return;
    setBulkDeleting(true);
    setTransferError('');
    setTransferNotice('');
    try {
      await Promise.all(targets.map((s) => deleteDoc(doc(db, COLLECTIONS.students, s.id))));
      setCheckedIds([]);
      setConfirmBulkDelete(false);
      setTransferNotice(`${targets.length} data murid terpilih berhasil dihapus.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, COLLECTIONS.students);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleImportStudentsFile = async (file: File | undefined) => {
    if (!file) return;
    setImportingFile(true);
    setTransferError('');
    setTransferNotice('');
    try {
      const parsed = await importStudentsFromFile(file);
      await Promise.all(
        parsed.map((st) => setDoc(doc(db, COLLECTIONS.students, st.id), st))
      );
      setSelectedId(parsed[0].id);
      setTransferNotice(
        `Berhasil mengimpor ${parsed.length} data murid dari "${file.name}" ke database.`
      );
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Gagal mengimpor file data murid.');
    } finally {
      setImportingFile(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handlePhotoUpload = async (
    file: File | undefined,
    target: 'modal' | 'mandiri'
  ) => {
    if (!file) return;
    const compressed = await compressImageFile(file, 640, 0.78);
    if (target === 'modal' && editingStudent) {
      setEditingStudent({ ...editingStudent, foto_url: compressed });
    } else if (target === 'mandiri') {
      setMandiriDraft((prev) => ({ ...prev, foto_url: compressed }));
    }
  };

  const handleAiLangkahLulus = async (source: 'modal' | 'mandiri') => {
    setAiError('');
    setAiLoading(true);
    try {
      const payload =
        source === 'modal' && editingStudent
          ? {
              nama: editingStudent.nama_lengkap,
              kelas: editingStudent.kelas,
              rencanaLulus: editingStudent.rencana_lulus,
              prodiPilihan: editingStudent.prodi_pilihan,
              deskripsiDiri: editingStudent.deskripsi_diri,
              hobi: editingStudent.hobi,
            }
          : {
              nama: selectedStudent?.nama_lengkap,
              kelas: selectedStudent?.kelas,
              rencanaLulus: mandiriDraft.rencana_lulus,
              prodiPilihan: mandiriDraft.prodi_pilihan,
              deskripsiDiri: mandiriDraft.deskripsi_diri,
              hobi: selectedStudent?.hobi,
            };

      const res = await fetch('/api/ai/langkah-lulus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memanggil asisten AI.');

      if (source === 'modal' && editingStudent) {
        setEditingStudent({ ...editingStudent, langkah_pencapaian: data.text });
      } else {
        setMandiriDraft((prev) => ({ ...prev, langkah_pencapaian: data.text }));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Gagal menyusun langkah AI.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveMandiri = async () => {
    if (!selectedStudent) return;
    setSavingInline(true);
    setInlineToast('');
    try {
      await updateDoc(doc(db, COLLECTIONS.students, selectedStudent.id), {
        foto_url: mandiriDraft.foto_url,
        deskripsi_diri: mandiriDraft.deskripsi_diri,
        rencana_lulus: mandiriDraft.rencana_lulus,
        prodi_pilihan: mandiriDraft.prodi_pilihan,
        langkah_pencapaian: mandiriDraft.langkah_pencapaian,
        catatan_khusus: mandiriDraft.catatan_khusus,
        updated_at: new Date().toISOString(),
      });
      setInlineToast('Panel Isian Mandiri (Lampiran A) berhasil disimpan ke Firestore.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.students}/${selectedStudent.id}`);
    } finally {
      setSavingInline(false);
    }
  };

  const handleSaveBk = async () => {
    if (!selectedStudent) return;
    setSavingInline(true);
    setInlineToast('');
    try {
      await updateDoc(doc(db, COLLECTIONS.students, selectedStudent.id), {
        bk_detail: bkDraft,
        updated_at: new Date().toISOString(),
      });
      setInlineToast('Formulir Data Detail Peserta Didik (Layanan BK) berhasil disimpan.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.students}/${selectedStudent.id}`);
    } finally {
      setSavingInline(false);
    }
  };

  const renderBkInput = (label: string, field: keyof BkDetail, multiline = false) => (
    <div key={field}>
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea
          rows={2}
          value={bkDraft[field] || ''}
          onChange={(e) => setBkDraft((prev) => ({ ...prev, [field]: e.target.value }))}
          className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <input
          type="text"
          value={bkDraft[field] || ''}
          onChange={(e) => setBkDraft((prev) => ({ ...prev, [field]: e.target.value }))}
          className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isStaff ? 'Direktori Murid Dampingan (Lampiran A & BK)' : 'Biodata & Rencana Lulus'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Menampilkan {visibleStudents.length} profil murid aktif
              {checkedIds.length > 0 && ` · ${checkedIds.length} dipilih`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isStaff && (
              <>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      viewMode === 'grid'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Mode Kotak</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      viewMode === 'table'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>Mode Detail Tabel</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={openNewModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Manual</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Export / Import / Template & Selection Action Bar */}
        {isStaff && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={toggleCheckAll}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                {allVisibleChecked ? (
                  <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{allVisibleChecked ? 'Batal Pilih Semua' : 'Pilih Semua'}</span>
              </button>

              {checkedIds.length === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const st = visibleStudents.find((s) => s.id === checkedIds[0]);
                    if (st) openEditModal(st);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-700 dark:text-blue-300 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Terpilih</span>
                </button>
              )}

              {checkedIds.length > 0 && !confirmBulkDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold text-rose-700 dark:text-rose-300 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus ({checkedIds.length})</span>
                </button>
              )}

              {confirmBulkDelete && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold">
                  <span>Hapus {checkedIds.length} murid?</span>
                  <button
                    type="button"
                    disabled={bulkDeleting}
                    onClick={handleBulkDelete}
                    className="px-2 py-0.5 rounded bg-white text-rose-700 font-bold cursor-pointer"
                  >
                    {bulkDeleting ? 'Menghapus...' : 'Ya'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(false)}
                    className="px-1.5 py-0.5 rounded bg-rose-700 text-white cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={downloadStudentsXlsTemplate}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                title="Unduh Template Excel (.xlsx)"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Template XLS</span>
              </button>
              <button
                type="button"
                onClick={() => exportStudentsToWord([], true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                title="Unduh Template Word (.docx)"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>Template Word</span>
              </button>

              <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-semibold cursor-pointer hover:bg-slate-800">
                {importingFile ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>Import XLS / Word</span>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.docx"
                  className="hidden"
                  onChange={(e) => handleImportStudentsFile(e.target.files?.[0])}
                />
              </label>

              <span className="text-slate-300 dark:text-slate-700 px-0.5">|</span>

              <button
                type="button"
                disabled={targetExportStudents.length === 0}
                onClick={() => exportStudentsToXls(targetExportStudents)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Ekspor XLS{checkedIds.length > 0 ? ` (${checkedIds.length})` : ''}</span>
              </button>
              <button
                type="button"
                disabled={targetExportStudents.length === 0}
                onClick={() => exportStudentsToPdf(targetExportStudents)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Ekspor PDF{checkedIds.length > 0 ? ` (${checkedIds.length})` : ''}</span>
              </button>
              <button
                type="button"
                disabled={targetExportStudents.length === 0}
                onClick={() => exportStudentsToWord(targetExportStudents, false)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
              >
                <FileType2 className="w-3.5 h-3.5" />
                <span>Ekspor Word{checkedIds.length > 0 ? ` (${checkedIds.length})` : ''}</span>
              </button>
            </div>
          </div>
        )}

        {transferNotice && (
          <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            {transferNotice}
          </div>
        )}
        {transferError && (
          <div className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
            {transferError}
          </div>
        )}
      </div>

      {/* Student List: Grid vs Detail Table */}
      {visibleStudents.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
          <UserCircle2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Belum Ada Data Murid Dampingan
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tambahkan profil murid manual, impor dari template Excel/Word, atau muat data demo.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleStudents.map((st) => {
            const active = selectedStudent?.id === st.id;
            const isChecked = checkedIds.includes(st.id);
            const pct = calcAttendancePct(st.kehadiran);
            return (
              <div
                key={st.id}
                onClick={() => setSelectedId(st.id)}
                className={`rounded-2xl p-5 border transition-all cursor-pointer bg-white dark:bg-slate-900 ${
                  active
                    ? 'border-blue-600 ring-1 ring-blue-600/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {isStaff && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCheckStudent(st.id);
                      }}
                      aria-label={`Pilih ${st.nama_lengkap}`}
                      className="pt-0.5 text-slate-400 hover:text-blue-600 cursor-pointer shrink-0"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <div className="w-16 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                    {st.foto_url ? (
                      <img
                        src={st.foto_url}
                        alt={st.nama_lengkap}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-bold text-slate-400">4×6</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {st.nama_lengkap}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {st.kelas} · NIS <span className="font-mono-tabular">{st.nis}</span>
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                      Rencana: <strong>{st.rencana_lulus || '-'}</strong> · Hadir{' '}
                      <span className="font-mono-tabular font-bold text-blue-600 dark:text-blue-400">
                        {pct}%
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[65%]">
                    {st.prodi_pilihan || 'Program studi belum ditentukan'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(st);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer"
                      title="Edit Lampiran A"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {isStaff && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStudent(st);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 cursor-pointer"
                        title="Hapus Murid"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  {isStaff && (
                    <th className="py-3 px-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleCheckAll}
                        aria-label="Pilih semua"
                        className="text-slate-500 hover:text-blue-600 cursor-pointer"
                      >
                        {allVisibleChecked ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="py-3 px-4 font-bold">Nama Murid</th>
                  <th className="py-3 px-4 font-bold">Kelas</th>
                  <th className="py-3 px-4 font-bold">NIS / NISN</th>
                  <th className="py-3 px-4 font-bold">Rencana Lulus</th>
                  <th className="py-3 px-4 font-bold">Kontak Wali</th>
                  <th className="py-3 px-4 font-bold text-right">Hadir</th>
                  <th className="py-3 px-4 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleStudents.map((st) => {
                  const isChecked = checkedIds.includes(st.id);
                  return (
                    <tr
                      key={st.id}
                      onClick={() => setSelectedId(st.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedStudent?.id === st.id
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {isStaff && (
                        <td
                          className="py-3 px-3 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCheckStudent(st.id);
                          }}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 mx-auto" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 mx-auto" />
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                        {st.nama_lengkap}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{st.kelas}</td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-600 dark:text-slate-300">
                        {st.nis} / {st.nisn || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-200">
                        {st.rencana_lulus || '-'} · {st.prodi_pilihan || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-600 dark:text-slate-300">
                        {st.kontak_ortu || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-bold text-blue-600 dark:text-blue-400">
                        {calcAttendancePct(st.kehadiran)}%
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(st);
                          }}
                          className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        {isStaff && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteStudent(st);
                            }}
                            className="text-rose-600 dark:text-rose-400 font-semibold hover:underline cursor-pointer"
                          >
                            Hapus
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected Student Workspace: Panel Isian Mandiri (Lampiran A) + Formulir Detail BK */}
      {selectedStudent && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                Profil Terpilih · {selectedStudent.kelas}
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {selectedStudent.nama_lengkap}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setProfileSubTab('mandiri')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    profileSubTab === 'mandiri'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Panel Isian Mandiri (Lampiran A)
                </button>
                <button
                  type="button"
                  onClick={() => setProfileSubTab('bk')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    profileSubTab === 'bk'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Formulir Detail BK (Bagian A–F)
                </button>
              </div>
              <button
                type="button"
                onClick={() => openEditModal(selectedStudent)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Biodata Lampiran A</span>
              </button>
            </div>
          </div>

          {inlineToast && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {inlineToast}
            </div>
          )}
          {aiError && (
            <div className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300">
              {aiError}
            </div>
          )}

          {profileSubTab === 'mandiri' ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* 4x6 Photo Column */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Pas Foto Formal 4 × 6
                </p>
                <div className="w-36 h-48 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                  {mandiriDraft.foto_url ? (
                    <img
                      src={mandiriDraft.foto_url}
                      alt="Pas Foto 4x6"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">Belum ada foto 4×6</span>
                  )}
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Unggah Pas Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files?.[0], 'mandiri')}
                  />
                </label>
              </div>

              {/* 5 Reflection Questions Inline */}
              <div className="lg:col-span-3 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      1. Pilihan Rencana Pasca Lulus
                    </label>
                    <select
                      value={mandiriDraft.rencana_lulus}
                      onChange={(e) =>
                        setMandiriDraft((p) => ({
                          ...p,
                          rencana_lulus: e.target.value as 'Kuliah' | 'Bekerja' | 'Gap-year',
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="Kuliah">Kuliah</option>
                      <option value="Bekerja">Bekerja</option>
                      <option value="Gap-year">Gap-year</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      2. Program Studi / Bidang Kerja Pilihan
                    </label>
                    <input
                      type="text"
                      value={mandiriDraft.prodi_pilihan}
                      onChange={(e) =>
                        setMandiriDraft((p) => ({ ...p, prodi_pilihan: e.target.value }))
                      }
                      placeholder="Contoh: Teknik Informatika / Desain Komunikasi Visual"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    3. Deskripsi Diri, Potensi &amp; Minat Utama
                  </label>
                  <textarea
                    rows={2}
                    value={mandiriDraft.deskripsi_diri}
                    onChange={(e) =>
                      setMandiriDraft((p) => ({ ...p, deskripsi_diri: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      4. Langkah Pencapaian Target Pasca Lulus
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAiLangkahLulus('mandiri')}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold hover:bg-indigo-100 cursor-pointer disabled:opacity-60"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>Bantu Susun Langkah AI</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={mandiriDraft.langkah_pencapaian}
                    onChange={(e) =>
                      setMandiriDraft((p) => ({ ...p, langkah_pencapaian: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    5. Catatan Khusus / Dukungan yang Dibutuhkan Siswa
                  </label>
                  <textarea
                    rows={2}
                    value={mandiriDraft.catatan_khusus}
                    onChange={(e) =>
                      setMandiriDraft((p) => ({ ...p, catatan_khusus: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveMandiri}
                    disabled={savingInline}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {savingInline ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Simpan Isian Mandiri Lampiran A</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Confidentiality Notice BK */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Catatan Kerahasiaan Layanan Bimbingan &amp; Konseling (BK)
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                    Seluruh data pada Formulir Data Detail Peserta Didik Bagian A–F bersifat rahasia profesional sesuai kode etik BK dan Permendikdasmen No. 11/2025, digunakan semata-mata untuk kepentingan pendampingan perkembangan murid.
                  </p>
                </div>
              </div>

              {/* Section Selector A–F */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'A', label: 'Bagian A: Identitas & Keluarga (18 Poin)' },
                  { id: 'B', label: 'Bagian B: Kesehatan Fisik & Psikis' },
                  { id: 'C', label: 'Bagian C: Akademik & Kebiasaan Belajar' },
                  { id: 'D', label: 'Bagian D: Pribadi & Sosial' },
                  { id: 'E', label: 'Bagian E: Karir & Masa Depan' },
                  { id: 'F', label: 'Bagian F: Harapan Layanan BK' },
                ].map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setBkSection(sec.id as 'A' | 'B' | 'C' | 'D' | 'E' | 'F')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      bkSection === sec.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {sec.label}
                  </button>
                ))}
              </div>

              {bkSection === 'A' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {renderBkInput('1. Nama Lengkap', 'a1_nama_lengkap')}
                  {renderBkInput('2. Nama Panggilan', 'a2_nama_panggilan')}
                  {renderBkInput('3. Tempat, Tanggal Lahir', 'a3_ttl')}
                  {renderBkInput('4. Agama', 'a4_agama')}
                  {renderBkInput('5. Suku Bangsa', 'a5_suku_bangsa')}
                  {renderBkInput('6. Bahasa Sehari-hari di Rumah', 'a6_bahasa_rumah')}
                  {renderBkInput('7. Anak Ke-', 'a7_anak_ke')}
                  {renderBkInput('8. Jumlah Saudara Kandung', 'a8_jumlah_saudara')}
                  {renderBkInput('9. Status Anak dalam Keluarga', 'a9_status_keluarga')}
                  {renderBkInput('10. Tinggal Bersama', 'a10_tinggal_bersama')}
                  {renderBkInput('11. Jarak Rumah ke Sekolah', 'a11_jarak_rumah')}
                  {renderBkInput('12. Transportasi ke Sekolah', 'a12_transportasi')}
                  {renderBkInput('13. Nama Ayah / Wali', 'a13_nama_ayah')}
                  {renderBkInput('14. Pendidikan & Pekerjaan Ayah', 'a14_pendidikan_pekerjaan_ayah')}
                  {renderBkInput('15. Nama Ibu', 'a15_nama_ibu')}
                  {renderBkInput('16. Pendidikan & Pekerjaan Ibu', 'a16_pendidikan_pekerjaan_ibu')}
                  {renderBkInput('17. Kisaran Penghasilan Keluarga', 'a17_penghasilan_keluarga')}
                  {renderBkInput('18. Kontak Darurat Orang Tua / Wali', 'a18_wali_kontak_darurat')}
                </div>
              )}

              {bkSection === 'B' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderBkInput('Tinggi & Berat Badan', 'b_tinggi_berat')}
                  {renderBkInput('Golongan Darah', 'b_golongan_darah')}
                  {renderBkInput('Riwayat Penyakit / Rawat Inap', 'b_riwayat_penyakit', true)}
                  {renderBkInput('Alergi & Pantangan Khusus', 'b_alergi_pantangan', true)}
                  {renderBkInput('Kondisi Penglihatan & Pendengaran', 'b_kondisi_penglihatan_pendengaran', true)}
                  {renderBkInput('Kondisi Psikis / Emosional Umum', 'b_kondisi_psikis', true)}
                </div>
              )}

              {bkSection === 'C' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderBkInput('Mata Pelajaran yang Disukai', 'c_mapel_disukai')}
                  {renderBkInput('Mata Pelajaran yang Dianggap Sulit', 'c_mapel_sulit')}
                  {renderBkInput('Kebiasaan & Waktu Belajar di Rumah', 'c_waktu_belajar')}
                  {renderBkInput('Fasilitas Belajar yang Dimiliki', 'c_fasilitas_belajar')}
                  {renderBkInput('Hambatan Akademik yang Dirasakan', 'c_hambatan_akademik', true)}
                  {renderBkInput('Riwayat Prestasi Akademik / Lomba', 'c_prestasi_akademik', true)}
                </div>
              )}

              {bkSection === 'D' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderBkInput('Sifat & Kelebihan Diri', 'd_sifat_kelebihan', true)}
                  {renderBkInput('Aspek Pribadi yang Perlu Dikembangkan', 'd_aspek_perlu_dikembangkan', true)}
                  {renderBkInput('Hubungan dengan Anggota Keluarga', 'd_hubungan_keluarga')}
                  {renderBkInput('Hubungan dengan Teman Sebaya', 'd_hubungan_teman_sebaya')}
                  {renderBkInput('Keaktifan Organisasi / Ekstrakurikuler', 'd_organisasi_ekskul', true)}
                  {renderBkInput('Masalah Pribadi / Sosial yang Dihadapi', 'd_masalah_pribadi_sosial', true)}
                </div>
              )}

              {bkSection === 'E' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderBkInput('Cita-Cita Profesi', 'e_cita_cita')}
                  {renderBkInput('Rencana Setelah Lulus SMA/SMK', 'e_rencana_setelah_lulus')}
                  {renderBkInput('Pilihan Program Studi / Bidang Kerja', 'e_pilihan_studi_kerja', true)}
                  {renderBkInput('Dukungan & Harapan Orang Tua', 'e_dukungan_orang_tua', true)}
                </div>
              )}

              {bkSection === 'F' && (
                <div className="grid grid-cols-1 gap-4">
                  {renderBkInput('Harapan Murid Terhadap Layanan Guru Wali & BK', 'f_harapan_layanan_bk', true)}
                  {renderBkInput('Topik Konseling yang Ingin Dibahas', 'f_topik_konseling_diinginkan', true)}
                  {renderBkInput('Kesediaan Orang Tua Berkolaborasi dengan Sekolah', 'f_kesediaan_orang_tua')}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveBk}
                  disabled={savingInline}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingInline ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Simpan Formulir BK Lengkap</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Full Form Lampiran A */}
      {modalOpen && editingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Lampiran A — Identitas Murid Dampingan
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lengkapi biodata resmi, data orang tua, pas foto 4×6, dan rencana pasca-lulus
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="flex-1 overflow-y-auto p-6 space-y-5">
              {aiError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {aiError}
                </div>
              )}

              {/* Photo Upload + Link */}
              <div className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="w-24 h-32 rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                  {editingStudent.foto_url ? (
                    <img
                      src={editingStudent.foto_url}
                      alt="Pas Foto"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">4 × 6</span>
                  )}
                </div>
                <div className="flex-1 space-y-2.5 w-full">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer hover:bg-blue-700">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Unggah Pas Foto 4×6 (Otomatis Kompres)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e.target.files?.[0], 'modal')}
                    />
                  </label>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Atau Tempel URL Pas Foto
                    </label>
                    <input
                      type="text"
                      value={editingStudent.foto_url}
                      onChange={(e) =>
                        setEditingStudent({ ...editingStudent, foto_url: e.target.value })
                      }
                      placeholder="https://... atau path aset"
                      className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Identity Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold mb-1">Nama Lengkap *</label>
                  <input
                    required
                    type="text"
                    value={editingStudent.nama_lengkap}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, nama_lengkap: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Nama Panggilan</label>
                  <input
                    type="text"
                    value={editingStudent.nama_panggilan}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, nama_panggilan: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Jenis Kelamin</label>
                  <select
                    value={editingStudent.jenis_kelamin}
                    onChange={(e) =>
                      setEditingStudent({
                        ...editingStudent,
                        jenis_kelamin: e.target.value as 'L' | 'P',
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <option value="L">Laki-Laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Kelas *</label>
                  <input
                    required
                    type="text"
                    value={editingStudent.kelas}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, kelas: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">NIS *</label>
                  <input
                    required
                    type="text"
                    value={editingStudent.nis}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, nis: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">NISN</label>
                  <input
                    type="text"
                    value={editingStudent.nisn}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, nisn: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Tempat, Tanggal Lahir</label>
                  <input
                    type="text"
                    value={editingStudent.ttl}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, ttl: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">No. WhatsApp</label>
                  <input
                    type="text"
                    value={editingStudent.whatsapp}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, whatsapp: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Email Aktif</label>
                  <input
                    type="email"
                    value={editingStudent.email}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, email: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Agama</label>
                  <input
                    type="text"
                    value={editingStudent.agama}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, agama: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">Hobi &amp; Minat</label>
                  <input
                    type="text"
                    value={editingStudent.hobi}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, hobi: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold mb-1">Alamat Domisili Murid</label>
                  <input
                    type="text"
                    value={editingStudent.alamat}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, alamat: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              {/* Parents */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-semibold mb-1">Nama Ayah</label>
                  <input
                    type="text"
                    value={editingStudent.nama_ayah}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, nama_ayah: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Pekerjaan Ayah</label>
                  <input
                    type="text"
                    value={editingStudent.pekerjaan_ayah}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, pekerjaan_ayah: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Nama Ibu</label>
                  <input
                    type="text"
                    value={editingStudent.nama_ibu}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, nama_ibu: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Pekerjaan Ibu</label>
                  <input
                    type="text"
                    value={editingStudent.pekerjaan_ibu}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, pekerjaan_ibu: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Alamat Orang Tua</label>
                  <input
                    type="text"
                    value={editingStudent.alamat_ortu}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, alamat_ortu: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Kontak Orang Tua</label>
                  <input
                    type="text"
                    value={editingStudent.kontak_ortu}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, kontak_ortu: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              {/* Post-graduation */}
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Pilihan Pasca Lulus</label>
                    <select
                      value={editingStudent.rencana_lulus}
                      onChange={(e) =>
                        setEditingStudent({
                          ...editingStudent,
                          rencana_lulus: e.target.value as 'Kuliah' | 'Bekerja' | 'Gap-year',
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      <option value="Kuliah">Kuliah</option>
                      <option value="Bekerja">Bekerja</option>
                      <option value="Gap-year">Gap-year</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Program Studi Pilihan</label>
                    <input
                      type="text"
                      value={editingStudent.prodi_pilihan}
                      onChange={(e) =>
                        setEditingStudent({ ...editingStudent, prodi_pilihan: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Deskripsi Diri &amp; Rencana Pasca Lulus</label>
                  <textarea
                    rows={2}
                    value={editingStudent.deskripsi_diri}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, deskripsi_diri: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold">Langkah Pencapaian</label>
                    <button
                      type="button"
                      onClick={() => handleAiLangkahLulus('modal')}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>Bantu Susun Langkah AI</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={editingStudent.langkah_pencapaian}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, langkah_pencapaian: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Catatan Khusus Siswa</label>
                  <textarea
                    rows={2}
                    value={editingStudent.catatan_khusus}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, catatan_khusus: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingModal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Profil Murid</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
