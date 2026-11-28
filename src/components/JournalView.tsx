import React, { useState } from 'react';
import {
  Plus,
  Sparkles,
  Upload,
  Trash2,
  Edit3,
  X,
  Loader2,
  Image as ImageIcon,
  CheckSquare,
  Square,
} from 'lucide-react';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { compressImageFile } from '../lib/imageUtils';
import {
  downloadRecordsXlsTemplate,
  exportRecordsToPdf,
  exportRecordsToWord,
  exportRecordsToXls,
  importRecordsFromFile,
  triggerTablePrint,
} from '../lib/docExportImport';
import { SmartPhoto } from './SmartPhoto';
import { StudentInfoModal } from './StudentInfoModal';
import { DataActionsBar } from './DataActionsBar';
import type {
  KanbanStatus,
  LogKategori,
  WcLog,
  WcStudent,
  WcUser,
} from '../types/waliconnect';

interface JournalViewProps {
  logs: WcLog[];
  students: WcStudent[];
  currentUser: WcUser;
  searchQuery: string;
}

const CATEGORIES: LogKategori[] = [
  'Akademik',
  'Karakter',
  'Sosial-Emosional',
  'Kedisiplinan',
  'Karir',
];

const JOURNAL_HEADERS = [
  'Tanggal',
  'Sesi',
  'Nama Murid',
  'Kategori',
  'Topik',
  'Uraian',
  'Tindak Lanjut',
  'Status Kanban',
];

function pickRowValue(row: Record<string, unknown>, ...keys: string[]): string {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(
      ([k]) => k.trim().toLowerCase() === key.trim().toLowerCase()
    );
    if (found && String(found[1] ?? '').trim()) {
      return String(found[1]).trim();
    }
  }
  return '';
}

function normalizeKategori(raw: string): LogKategori {
  const lower = raw.toLowerCase();
  if (lower.includes('karakter')) return 'Karakter';
  if (lower.includes('sosial') || lower.includes('emosi')) return 'Sosial-Emosional';
  if (lower.includes('disiplin')) return 'Kedisiplinan';
  if (lower.includes('karir') || lower.includes('karier')) return 'Karir';
  return 'Akademik';
}

function normalizeStatus(raw: string): KanbanStatus {
  const lower = raw.toLowerCase();
  if (lower.includes('selesai')) return 'Selesai Tertangani';
  if (lower.includes('tindak') || lower.includes('perlu')) return 'Perlu Tindak Lanjut';
  return 'Dalam Proses';
}

export const JournalView: React.FC<JournalViewProps> = ({
  logs,
  students,
  currentUser,
  searchQuery,
}) => {
  const isStaff = currentUser.role === 'Guru Wali' || currentUser.role === 'Admin';
  const [filterCat, setFilterCat] = useState<'Semua' | LogKategori>('Semua');
  const [infoStudent, setInfoStudent] = useState<WcStudent | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const visibleLogs = logs.filter((l) => {
    if (!isStaff && currentUser.linked_student_id && l.student_id !== currentUser.linked_student_id) {
      return false;
    }
    if (filterCat !== 'Semua' && l.kategori !== filterCat) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.topik.toLowerCase().includes(q) ||
        l.student_name.toLowerCase().includes(q) ||
        l.uraian.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const visibleIds = visibleLogs.map((l) => l.id);
  const activeChecked = checkedIds.filter((id) => visibleIds.includes(id));
  const allSelected = visibleIds.length > 0 && activeChecked.length === visibleIds.length;
  const targetLogs =
    activeChecked.length > 0
      ? visibleLogs.filter((l) => activeChecked.includes(l.id))
      : visibleLogs;

  const toggleSelect = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setCheckedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setCheckedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WcLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');

  const openNew = () => {
    const defaultStd =
      students.find((s) => s.id === currentUser.linked_student_id) ?? students[0];
    setEditing({
      id: `log-${Date.now()}`,
      student_id: defaultStd?.id || '',
      student_name: defaultStd?.nama_lengkap || '',
      tanggal: new Date().toISOString().slice(0, 10),
      sesi_ke: logs.length + 1,
      kategori: 'Akademik',
      topik: '',
      uraian: '',
      tindak_lanjut: '',
      status_kanban: 'Dalam Proses',
      author_name: currentUser.nama,
      author_role: currentUser.role,
      foto_url: '',
      created_at: new Date().toISOString(),
    });
    setAiErr('');
    setModalOpen(true);
  };

  const openEdit = (item: WcLog) => {
    setEditing({ ...item });
    setAiErr('');
    setModalOpen(true);
  };

  const handleUploadFoto = async (file: File | undefined) => {
    if (!file || !editing) return;
    const compressed = await compressImageFile(file, 720, 0.72);
    setEditing({ ...editing, foto_url: compressed });
  };

  const handleAiTindakLanjut = async () => {
    if (!editing) return;
    setAiErr('');
    setAiBusy(true);
    try {
      const std = students.find((s) => s.id === editing.student_id);
      const res = await fetch('/api/ai/tindak-lanjut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: editing.student_name || std?.nama_lengkap,
          kelas: std?.kelas,
          kategori: editing.kategori,
          topik: editing.topik,
          uraian: editing.uraian,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyusun tindak lanjut AI.');
      setEditing({ ...editing, tindak_lanjut: data.text });
    } catch (err) {
      setAiErr(err instanceof Error ? err.message : 'Gagal menghubungi AI.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.student_id || !editing.topik.trim()) {
      setAiErr('Pilih murid dan isi topik pertemuan.');
      return;
    }

    setSaving(true);
    try {
      const std = students.find((s) => s.id === editing.student_id);
      const payload: WcLog = {
        ...editing,
        student_name: std?.nama_lengkap || editing.student_name,
      };
      await setDoc(doc(db, COLLECTIONS.logs, payload.id), payload);
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${COLLECTIONS.logs}/${editing.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.logs, id));
      setCheckedIds((prev) => prev.filter((item) => item !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${COLLECTIONS.logs}/${id}`);
    }
  };

  const handleBulkDelete = async () => {
    setActionError('');
    setNotice('');
    try {
      const deletable = visibleLogs.filter(
        (l) =>
          activeChecked.includes(l.id) &&
          (isStaff || l.author_name === currentUser.nama)
      );
      await Promise.all(
        deletable.map((l) => deleteDoc(doc(db, COLLECTIONS.logs, l.id)))
      );
      setNotice(`${deletable.length} catatan jurnal berhasil dihapus.`);
      setCheckedIds((prev) => prev.filter((id) => !activeChecked.includes(id)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghapus catatan jurnal.');
    }
  };

  const handleDownloadTemplateXls = () => {
    downloadRecordsXlsTemplate(
      [
        {
          Tanggal: new Date().toISOString().slice(0, 10),
          Sesi: 1,
          'Nama Murid': students[0]?.nama_lengkap || 'Ahmad Rizky Pratama',
          Kategori: 'Akademik',
          Topik: 'Konsultasi Strategi Belajar',
          Uraian: 'Membahas target nilai semester dan pembagian jadwal belajar.',
          'Tindak Lanjut': 'Pemantauan rutin mingguan oleh Guru Wali.',
          'Status Kanban': 'Dalam Proses',
        },
      ],
      [
        'Petunjuk Import Jurnal Perwalian WaliConnect Pro',
        'Kolom: Tanggal | Sesi | Nama Murid | Kategori | Topik | Uraian | Tindak Lanjut | Status Kanban',
        'Kategori valid: Akademik, Karakter, Sosial-Emosional, Kedisiplinan, Karir',
        'Status Kanban valid: Dalam Proses, Perlu Tindak Lanjut, Selesai Tertangani',
      ],
      'Jurnal_Perwalian',
      'Template_Jurnal_Perwalian.xlsx'
    );
  };

  const handleDownloadTemplateWord = async () => {
    await exportRecordsToWord(
      'TEMPLATE IMPORT JURNAL PERWALIAN',
      'Isi tabel di bawah ini, simpan file .docx, lalu unggah ke Import XLS / Word.',
      JOURNAL_HEADERS,
      [
        [
          new Date().toISOString().slice(0, 10),
          '1',
          students[0]?.nama_lengkap || 'Ahmad Rizky Pratama',
          'Akademik',
          'Konsultasi Strategi Belajar',
          'Membahas target nilai semester dan pembagian jadwal belajar.',
          'Pemantauan rutin mingguan oleh Guru Wali.',
          'Dalam Proses',
        ],
      ],
      'Template_Jurnal_Perwalian.docx',
      true
    );
  };

  const handleImportFile = async (file: File) => {
    setActionError('');
    setNotice('');
    try {
      const rows = await importRecordsFromFile(file);
      const baseTs = Date.now();
      const imported: WcLog[] = [];
      rows.forEach((row, idx) => {
        const topik = pickRowValue(row, 'Topik', 'Pokok Bahasan');
        if (!topik) return;
        const namaMurid = pickRowValue(row, 'Nama Murid', 'Murid', 'Nama');
        const matchedStudent =
          students.find(
            (s) => s.nama_lengkap.toLowerCase() === namaMurid.toLowerCase()
          ) ??
          students.find((s) => s.id === currentUser.linked_student_id) ??
          students[0];
        const sesiVal = Number(pickRowValue(row, 'Sesi', 'Sesi Ke')) || idx + 1;
        imported.push({
          id: `log-imp-${baseTs}-${idx}`,
          student_id: matchedStudent?.id || '',
          student_name: matchedStudent?.nama_lengkap || namaMurid || 'Murid',
          tanggal: pickRowValue(row, 'Tanggal') || new Date().toISOString().slice(0, 10),
          sesi_ke: sesiVal,
          kategori: normalizeKategori(pickRowValue(row, 'Kategori')),
          topik,
          uraian: pickRowValue(row, 'Uraian', 'Catatan'),
          tindak_lanjut: pickRowValue(row, 'Tindak Lanjut', 'Rencana Tindak Lanjut'),
          status_kanban: normalizeStatus(pickRowValue(row, 'Status Kanban', 'Status')),
          author_name: currentUser.nama,
          author_role: currentUser.role,
          foto_url: '',
          created_at: new Date().toISOString(),
        });
      });

      if (imported.length === 0) {
        throw new Error('Tidak ada baris jurnal valid dengan kolom Topik yang terisi.');
      }

      await Promise.all(
        imported.map((item) => setDoc(doc(db, COLLECTIONS.logs, item.id), item))
      );
      setNotice(`Berhasil mengimpor ${imported.length} catatan jurnal ke database.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengimpor file jurnal.');
    }
  };

  const toJournalMatrix = (items: WcLog[]) =>
    items.map((l) => [
      l.tanggal,
      `Sesi ${l.sesi_ke}`,
      l.student_name,
      l.kategori,
      l.topik,
      l.uraian,
      l.tindak_lanjut || '-',
      l.status_kanban,
    ]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['Semua', ...CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  filterCat === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Catat Pertemuan Jurnal</span>
          </button>
        </div>

        <DataActionsBar
          totalCount={visibleLogs.length}
          selectedCount={activeChecked.length}
          allSelected={allSelected}
          onToggleSelectAll={toggleSelectAll}
          canManage={true}
          onEditSelected={() => {
            const first = visibleLogs.find((l) => l.id === activeChecked[0]);
            if (first) openEdit(first);
          }}
          onBulkDelete={handleBulkDelete}
          bulkDeleteLabel="catatan jurnal"
          onDownloadTemplateXls={handleDownloadTemplateXls}
          onDownloadTemplateWord={handleDownloadTemplateWord}
          onImportFile={handleImportFile}
          onExportXls={() =>
            exportRecordsToXls(
              targetLogs.map((l) => ({
                Tanggal: l.tanggal,
                Sesi: l.sesi_ke,
                'Nama Murid': l.student_name,
                Kategori: l.kategori,
                Topik: l.topik,
                Uraian: l.uraian,
                'Tindak Lanjut': l.tindak_lanjut || '-',
                'Status Kanban': l.status_kanban,
                Pencatat: `${l.author_name} (${l.author_role})`,
              })),
              'Jurnal_Perwalian',
              'Jurnal_Perwalian_WaliConnect.xlsx'
            )
          }
          onExportPdf={() =>
            exportRecordsToPdf(
              'BUKU JURNAL PERWALIAN (LAMPIRAN C)',
              `Total Catatan: ${targetLogs.length}`,
              JOURNAL_HEADERS,
              toJournalMatrix(targetLogs),
              'Jurnal_Perwalian_WaliConnect.pdf',
              true
            )
          }
          onExportWord={() =>
            exportRecordsToWord(
              'BUKU JURNAL PERWALIAN (LAMPIRAN C)',
              `Total Catatan: ${targetLogs.length}`,
              JOURNAL_HEADERS,
              toJournalMatrix(targetLogs),
              'Jurnal_Perwalian_WaliConnect.docx',
              true
            )
          }
          onPrint={() =>
            triggerTablePrint({
              title: 'BUKU JURNAL PERWALIAN (LAMPIRAN C)',
              subtitle: `Total Catatan: ${targetLogs.length} · Dicetak oleh ${currentUser.nama}`,
              headers: JOURNAL_HEADERS,
              rows: toJournalMatrix(targetLogs),
              landscape: true,
            })
          }
          notice={notice}
          error={actionError}
        />
      </div>

      {visibleLogs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Belum Ada Catatan Jurnal Perwalian
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Klik tombol "Catat Pertemuan Jurnal" untuk mencatat sesi bimbingan baru beserta foto dokumentasi.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleLogs.map((logItem) => {
            const isChecked = activeChecked.includes(logItem.id);
            return (
              <div
                key={logItem.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 flex flex-col md:flex-row gap-5 transition-colors ${
                  isChecked
                    ? 'border-blue-500 ring-1 ring-blue-500/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {logItem.foto_url && (
                  <div className="w-full md:w-44 h-36 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
                    <SmartPhoto src={logItem.foto_url} alt={logItem.topik} />
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSelect(logItem.id)}
                        title="Pilih catatan jurnal"
                        className="p-0.5 text-slate-500 hover:text-blue-600 cursor-pointer"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {logItem.kategori} · Sesi {logItem.sesi_ke} ·{' '}
                        <span className="font-mono-tabular">{logItem.tanggal}</span> ·{' '}
                        <span className="text-slate-700 dark:text-slate-300">
                          {logItem.status_kanban}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(isStaff || logItem.author_name === currentUser.nama) && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(logItem)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(logItem.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {logItem.topik}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Murid:{' '}
                    <button
                      type="button"
                      onClick={() => {
                        const matched = students.find(
                          (s) =>
                            s.id === logItem.student_id ||
                            s.nama_lengkap === logItem.student_name
                        );
                        if (matched) setInfoStudent(matched);
                      }}
                      title="Klik nama untuk melihat pop-up informasi murid"
                      className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                    >
                      {logItem.student_name}
                    </button>{' '}
                    · Dicatat oleh {logItem.author_name} ({logItem.author_role})
                  </p>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                    {logItem.uraian}
                  </p>

                  {logItem.tindak_lanjut && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                        Rencana Tindak Lanjut:
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                        {logItem.tindak_lanjut}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Add/Edit Jurnal Lampiran C */}
      {modalOpen && editing && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Buku Jurnal Perwalian (Lampiran C)
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
              {aiErr && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {aiErr}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold mb-1">Murid Dampingan *</label>
                  <select
                    value={editing.student_id}
                    onChange={(e) => {
                      const s = students.find((x) => x.id === e.target.value);
                      setEditing({
                        ...editing,
                        student_id: e.target.value,
                        student_name: s?.nama_lengkap || '',
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <option value="">-- Pilih Murid --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama_lengkap} ({s.kelas})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Tanggal Pertemuan</label>
                  <input
                    type="date"
                    value={editing.tanggal}
                    onChange={(e) => setEditing({ ...editing, tanggal: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Kategori Bidang</label>
                  <select
                    value={editing.kategori}
                    onChange={(e) =>
                      setEditing({ ...editing, kategori: e.target.value as LogKategori })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Sesi Ke-</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={editing.sesi_ke}
                      onChange={(e) =>
                        setEditing({ ...editing, sesi_ke: Number(e.target.value) || 1 })
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Status Kanban</label>
                    <select
                      value={editing.status_kanban}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          status_kanban: e.target.value as KanbanStatus,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      <option value="Dalam Proses">Dalam Proses</option>
                      <option value="Perlu Tindak Lanjut">Perlu Tindak Lanjut</option>
                      <option value="Selesai Tertangani">Selesai Tertangani</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Topik / Pokok Bahasan *</label>
                <input
                  required
                  type="text"
                  value={editing.topik}
                  onChange={(e) => setEditing({ ...editing, topik: e.target.value })}
                  placeholder="Contoh: Konsultasi Pemilihan Program Studi & Manajemen Belajar"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Uraian Catatan Pertemuan</label>
                <textarea
                  rows={3}
                  value={editing.uraian}
                  onChange={(e) => setEditing({ ...editing, uraian: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold">Rencana Tindak Lanjut</label>
                  <button
                    type="button"
                    onClick={handleAiTindakLanjut}
                    disabled={aiBusy}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {aiBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>Susun Tindak Lanjut AI</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={editing.tindak_lanjut}
                  onChange={(e) => setEditing({ ...editing, tindak_lanjut: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              {/* Photo Documentation Upload */}
              <div className="flex flex-wrap items-center gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                {editing.foto_url ? (
                  <img
                    src={editing.foto_url}
                    alt="Dokumentasi"
                    referrerPolicy="no-referrer"
                    className="w-24 h-18 rounded-lg object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-24 h-18 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    Dokumentasi Foto Pertemuan (Opsional)
                  </p>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-100">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Pilih Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUploadFoto(e.target.files?.[0])}
                    />
                  </label>
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
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Catatan Jurnal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <StudentInfoModal student={infoStudent} onClose={() => setInfoStudent(null)} />
    </div>
  );
};
