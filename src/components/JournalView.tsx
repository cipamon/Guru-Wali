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
} from 'lucide-react';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { compressImageFile } from '../lib/imageUtils';
import { SmartPhoto } from './SmartPhoto';
import { StudentInfoModal } from './StudentInfoModal';
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

export const JournalView: React.FC<JournalViewProps> = ({
  logs,
  students,
  currentUser,
  searchQuery,
}) => {
  const isStaff = currentUser.role === 'Guru Wali' || currentUser.role === 'Admin';
  const [filterCat, setFilterCat] = useState<'Semua' | LogKategori>('Semua');
  const [infoStudent, setInfoStudent] = useState<WcStudent | null>(null);

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
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${COLLECTIONS.logs}/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
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
          {visibleLogs.map((logItem) => (
            <div
              key={logItem.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row gap-5"
            >
              {logItem.foto_url && (
                <div className="w-full md:w-44 h-36 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
                  <SmartPhoto src={logItem.foto_url} alt={logItem.topik} />
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {logItem.kategori} · Sesi {logItem.sesi_ke} ·{' '}
                    <span className="font-mono-tabular">{logItem.tanggal}</span> ·{' '}
                    <span className="text-slate-700 dark:text-slate-300">{logItem.status_kanban}</span>
                  </p>

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
                        (s) => s.id === logItem.student_id || s.nama_lengkap === logItem.student_name
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
          ))}
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
