import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  UserCheck,
  Search,
  Save,
  CheckSquare,
  Square,
  Loader2,
  Check,
  Sparkles,
} from 'lucide-react';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
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
import type { WcStudent, WcUser } from '../types/waliconnect';

interface PerwalianAssignmentPanelProps {
  users: WcUser[];
  students: WcStudent[];
  currentUser: WcUser;
}

export const PerwalianAssignmentPanel: React.FC<PerwalianAssignmentPanelProps> = ({
  users,
  students,
  currentUser,
}) => {
  const isAdmin = currentUser.role === 'Admin';

  const guruList = useMemo(() => {
    const filtered = users.filter((u) => u.role === 'Guru Wali' || u.role === 'Admin');
    if (isAdmin) return filtered;
    return filtered.filter((u) => u.id === currentUser.id);
  }, [users, isAdmin, currentUser.id]);

  const [selectedGuruId, setSelectedGuruId] = useState<string>(() => {
    if (!isAdmin) return currentUser.id;
    const firstGuru = users.find((u) => u.role === 'Guru Wali') ?? users.find((u) => u.role === 'Admin');
    return firstGuru?.id || '';
  });

  useEffect(() => {
    if (!selectedGuruId || !guruList.some((g) => g.id === selectedGuruId)) {
      const next = guruList.find((g) => g.role === 'Guru Wali') ?? guruList[0];
      if (next) setSelectedGuruId(next.id);
    }
  }, [guruList, selectedGuruId]);

  const selectedGuru = guruList.find((g) => g.id === selectedGuruId) ?? null;

  const [checkedStudentIds, setCheckedStudentIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('Semua');
  const [assignFilter, setAssignFilter] = useState<
    'Semua' | 'guru_ini' | 'belum' | 'guru_lain'
  >('Semua');
  const [savingBatch, setSavingBatch] = useState(false);
  const [updatingSingleId, setUpdatingSingleId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [infoStudent, setInfoStudent] = useState<WcStudent | null>(null);

  useEffect(() => {
    if (!selectedGuruId) {
      setCheckedStudentIds([]);
      return;
    }
    setCheckedStudentIds(
      students.filter((s) => s.guru_wali_id === selectedGuruId).map((s) => s.id)
    );
  }, [selectedGuruId, students]);

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.kelas) set.add(s.kelas);
    });
    return ['Semua', ...Array.from(set).sort()];
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (classFilter !== 'Semua' && s.kelas !== classFilter) return false;
      if (assignFilter === 'guru_ini' && s.guru_wali_id !== selectedGuruId) return false;
      if (assignFilter === 'belum' && s.guru_wali_id) return false;
      if (
        assignFilter === 'guru_lain' &&
        (!s.guru_wali_id || s.guru_wali_id === selectedGuruId)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        s.nama_lengkap.toLowerCase().includes(q) ||
        s.kelas.toLowerCase().includes(q) ||
        s.nis.toLowerCase().includes(q) ||
        (s.nisn || '').toLowerCase().includes(q) ||
        (s.guru_wali_nama || '').toLowerCase().includes(q)
      );
    });
  }, [students, classFilter, assignFilter, searchQuery, selectedGuruId]);

  const toggleStudent = (id: string) => {
    setNotice('');
    setCheckedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    setNotice('');
    const next = new Set(checkedStudentIds);
    filteredStudents.forEach((s) => next.add(s.id));
    setCheckedStudentIds(Array.from(next));
  };

  const clearVisible = () => {
    setNotice('');
    const visibleSet = new Set(filteredStudents.map((s) => s.id));
    setCheckedStudentIds((prev) => prev.filter((id) => !visibleSet.has(id)));
  };

  const handleSaveBatch = async () => {
    if (!selectedGuru) return;
    setSavingBatch(true);
    setNotice('');
    try {
      const now = new Date().toISOString();
      const selectedSet = new Set(checkedStudentIds);
      const batch = writeBatch(db);
      let changedCount = 0;

      students.forEach((st) => {
        const shouldBeAssigned = selectedSet.has(st.id);
        const currentlyAssignedToSelected = st.guru_wali_id === selectedGuru.id;

        if (shouldBeAssigned && !currentlyAssignedToSelected) {
          batch.update(doc(db, COLLECTIONS.students, st.id), {
            guru_wali_id: selectedGuru.id,
            guru_wali_nama: selectedGuru.nama,
            updated_at: now,
          });
          changedCount += 1;
        } else if (!shouldBeAssigned && currentlyAssignedToSelected) {
          batch.update(doc(db, COLLECTIONS.students, st.id), {
            guru_wali_id: '',
            guru_wali_nama: '',
            updated_at: now,
          });
          changedCount += 1;
        }
      });

      if (changedCount > 0) {
        await batch.commit();
        setNotice(
          `Penetapan perwalian untuk ${selectedGuru.nama} berhasil disimpan (${selectedSet.size} murid dampingan).`
        );
      } else {
        setNotice(`Tidak ada perubahan penetapan untuk ${selectedGuru.nama}.`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.students);
    } finally {
      setSavingBatch(false);
    }
  };

  const handleInlineAssignGuru = async (studentId: string, guruId: string) => {
    setUpdatingSingleId(studentId);
    setNotice('');
    try {
      const guru = guruList.find((g) => g.id === guruId) ?? users.find((u) => u.id === guruId);
      await updateDoc(doc(db, COLLECTIONS.students, studentId), {
        guru_wali_id: guru ? guru.id : '',
        guru_wali_nama: guru ? guru.nama : '',
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.students}/${studentId}`);
    } finally {
      setUpdatingSingleId(null);
    }
  };

  const unassignedCount = students.filter((s) => !s.guru_wali_id).length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Pengaturan Pemilihan Guru Wali &amp; Siswa Perwalian
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAdmin
                  ? 'Pilih Guru Wali di sebelah kiri lalu centang siswa perwalian yang menjadi tanggung jawab pendampingannya.'
                  : 'Pilih dan kelola daftar siswa perwalian yang menjadi tanggung jawab pendampingan Anda.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold">
              Total Murid: <strong className="font-mono-tabular">{students.length}</strong>
            </span>
            <span
              className={`px-3 py-1.5 rounded-xl font-semibold ${
                unassignedCount > 0
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              }`}
            >
              Belum Dipilih: <strong className="font-mono-tabular">{unassignedCount}</strong>
            </span>
          </div>
        </div>

        {notice && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Left: Guru Wali Picker */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
              1. Pilih Guru Wali Pendamping
            </p>
            {guruList.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
                Belum ada akun Guru Wali. Tambahkan akun dengan peran &quot;Guru Wali&quot; terlebih dahulu.
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {guruList.map((g) => {
                  const count = students.filter((s) => s.guru_wali_id === g.id).length;
                  const active = selectedGuruId === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setSelectedGuruId(g.id);
                        setNotice('');
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-500 ring-1 ring-blue-500/30'
                          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {g.nama}
                        </p>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono-tabular shrink-0 ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {count} Murid
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {g.role} · NIP {g.nip}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Siswa Perwalian Checklist */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  2. Centang Siswa Perwalian{' '}
                  {selectedGuru ? (
                    <span className="text-blue-600 dark:text-blue-400">
                      untuk {selectedGuru.nama}
                    </span>
                  ) : null}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {checkedStudentIds.length} siswa dipilih untuk guru ini
                </p>
              </div>

              <button
                type="button"
                disabled={!selectedGuru || savingBatch}
                onClick={handleSaveBatch}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 shadow-xs"
              >
                {savingBatch ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Simpan Pemilihan Perwalian</span>
              </button>
            </div>

            {/* Filter Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, NIS, kelas..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {classOptions.map((c) => (
                  <option key={c} value={c}>
                    {c === 'Semua' ? 'Semua Kelas' : `Kelas ${c}`}
                  </option>
                ))}
              </select>
              <select
                value={assignFilter}
                onChange={(e) =>
                  setAssignFilter(
                    e.target.value as 'Semua' | 'guru_ini' | 'belum' | 'guru_lain'
                  )
                }
                className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="Semua">Semua Status Perwalian</option>
                <option value="guru_ini">Sudah Dipilih untuk Guru Ini</option>
                <option value="belum">Belum Punya Guru Wali</option>
                <option value="guru_lain">Sedang Dibimbing Guru Lain</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectAllVisible}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                <span>Pilih Semua Tampil ({filteredStudents.length})</span>
              </button>
              <button
                type="button"
                onClick={clearVisible}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>Kosongkan Pilihan Tampil</span>
              </button>
            </div>

            {/* Checklist Items */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
              {filteredStudents.map((st) => {
                const checked = checkedStudentIds.includes(st.id);
                const otherGuru =
                  st.guru_wali_id && st.guru_wali_id !== selectedGuruId
                    ? st.guru_wali_nama || 'Guru Lain'
                    : '';
                return (
                  <div
                    key={st.id}
                    onClick={() => toggleStudent(st.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      checked
                        ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500'
                        : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                    }`}
                  >
                    <span className="shrink-0 text-blue-600">
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </span>

                    <div className="w-9 h-11 rounded-lg overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                      <SmartPhoto
                        src={st.foto_url}
                        alt={st.nama_lengkap}
                        fallback={
                          <span className="text-[10px] font-bold text-slate-400">
                            {st.nama_lengkap.slice(0, 2).toUpperCase()}
                          </span>
                        }
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInfoStudent(st);
                        }}
                        title="Klik nama untuk melihat pop-up informasi murid"
                        className="text-left text-xs font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate block max-w-full cursor-pointer"
                      >
                        {st.nama_lengkap}
                      </button>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {st.kelas}
                        {st.no_absen ? ` · Absen ${st.no_absen}` : ''} · NIS {st.nis}
                      </p>
                      <p className="text-[10px] mt-0.5 truncate">
                        {otherGuru ? (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            Saat ini: {otherGuru}
                          </span>
                        ) : st.guru_wali_id === selectedGuruId ? (
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">
                            Terdaftar di guru ini
                          </span>
                        ) : (
                          <span className="text-slate-400">Belum ditetapkan guru wali</span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}

              {filteredStudents.length === 0 && (
                <div className="sm:col-span-2 py-8 text-center text-xs text-slate-500">
                  Tidak ada siswa yang sesuai filter.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Perwalian Matrix Table (Admin) */}
      {isAdmin && (
        <QuickPerwalianMatrix
          students={students}
          guruList={guruList}
          updatingSingleId={updatingSingleId}
          onInlineAssign={handleInlineAssignGuru}
          onOpenInfo={setInfoStudent}
        />
      )}

      <StudentInfoModal student={infoStudent} onClose={() => setInfoStudent(null)} />
    </div>
  );
};

interface QuickPerwalianMatrixProps {
  students: WcStudent[];
  guruList: WcUser[];
  updatingSingleId: string | null;
  onInlineAssign: (studentId: string, guruId: string) => void;
  onOpenInfo: (st: WcStudent) => void;
}

const MATRIX_ASSIGN_HEADERS = ['NIS', 'Nama Murid', 'Kelas', 'Wali Kelas', 'Guru Wali'];

function pickAssignCell(row: Record<string, unknown>, ...keys: string[]): string {
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

const QuickPerwalianMatrix: React.FC<QuickPerwalianMatrixProps> = ({
  students,
  guruList,
  updatingSingleId,
  onInlineAssign,
  onOpenInfo,
}) => {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const allIds = students.map((s) => s.id);
  const activeChecked = checkedIds.filter((id) => allIds.includes(id));
  const allSelected = allIds.length > 0 && activeChecked.length === allIds.length;
  const targetStudents =
    activeChecked.length > 0 ? students.filter((s) => activeChecked.includes(s.id)) : students;

  const toggleSelect = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setCheckedIds(allSelected ? [] : allIds);
  };

  const handleBulkClearGuru = async () => {
    setError('');
    setNotice('');
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      activeChecked.forEach((id) => {
        batch.update(doc(db, COLLECTIONS.students, id), {
          guru_wali_id: '',
          guru_wali_nama: '',
          updated_at: now,
        });
      });
      await batch.commit();
      setNotice(`Penetapan Guru Wali untuk ${activeChecked.length} murid berhasil dikosongkan.`);
      setCheckedIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui penetapan Guru Wali.');
    }
  };

  const handleTemplateXls = () => {
    const sample = students[0];
    downloadRecordsXlsTemplate(
      [
        {
          NIS: sample?.nis || '2025001',
          'Nama Murid': sample?.nama_lengkap || 'Ahmad Rizky Pratama',
          Kelas: sample?.kelas || 'XI IPA 1',
          'Wali Kelas': sample?.wali_kelas || 'Siti Aminah, S.Pd.',
          'Guru Wali': guruList[0]?.nama || 'Dra. Ratna Sari Dewi, M.Pd.',
        },
      ],
      [
        'Petunjuk Import Penetapan Guru Wali',
        '1. Cocokkan baris murid berdasarkan NIS atau Nama Murid.',
        '2. Kolom Guru Wali diisi nama Guru Wali yang sudah terdaftar pada akun pengguna.',
      ],
      'Penetapan_Guru_Wali',
      'Template_Penetapan_Guru_Wali.xlsx'
    );
  };

  const handleTemplateWord = async () => {
    const sample = students[0];
    await exportRecordsToWord(
      'TEMPLATE IMPORT PENETAPAN GURU WALI',
      'Isi tabel berikut, simpan .docx, lalu unggah via Import XLS / Word.',
      MATRIX_ASSIGN_HEADERS,
      [
        [
          sample?.nis || '2025001',
          sample?.nama_lengkap || 'Ahmad Rizky Pratama',
          sample?.kelas || 'XI IPA 1',
          sample?.wali_kelas || 'Siti Aminah, S.Pd.',
          guruList[0]?.nama || 'Dra. Ratna Sari Dewi, M.Pd.',
        ],
      ],
      'Template_Penetapan_Guru_Wali.docx',
      true
    );
  };

  const handleImport = async (file: File) => {
    setError('');
    setNotice('');
    try {
      const rows = await importRecordsFromFile(file);
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      let updated = 0;

      rows.forEach((row) => {
        const nis = pickAssignCell(row, 'NIS');
        const nama = pickAssignCell(row, 'Nama Murid', 'Nama');
        const guruName = pickAssignCell(row, 'Guru Wali', 'Guru Wali Dampingan');
        const st = students.find(
          (s) =>
            (nis && s.nis.trim().toLowerCase() === nis.toLowerCase()) ||
            (nama && s.nama_lengkap.trim().toLowerCase() === nama.toLowerCase())
        );
        if (!st) return;

        const guru = guruList.find(
          (g) => g.nama.trim().toLowerCase() === guruName.toLowerCase()
        );
        batch.update(doc(db, COLLECTIONS.students, st.id), {
          guru_wali_id: guru ? guru.id : '',
          guru_wali_nama: guru ? guru.nama : guruName,
          updated_at: now,
        });
        updated += 1;
      });

      if (updated === 0) {
        throw new Error('Tidak ada data murid yang cocok pada file penetapan Guru Wali.');
      }
      await batch.commit();
      setNotice(`Berhasil memperbarui penetapan Guru Wali untuk ${updated} murid.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengimpor penetapan Guru Wali.');
    }
  };

  const toRows = (items: WcStudent[]) =>
    items.map((s) => [
      s.nis,
      s.nama_lengkap,
      s.kelas,
      s.wali_kelas || '-',
      s.guru_wali_nama || '-',
    ]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Matriks Cepat Penetapan Guru Wali per Murid
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" /> Perubahan dropdown tersimpan langsung
          </span>
        </div>

        <DataActionsBar
          totalCount={students.length}
          selectedCount={activeChecked.length}
          allSelected={allSelected}
          onToggleSelectAll={toggleSelectAll}
          canManage={true}
          onBulkDelete={handleBulkClearGuru}
          bulkDeleteLabel="kosongkan guru wali"
          onDownloadTemplateXls={handleTemplateXls}
          onDownloadTemplateWord={handleTemplateWord}
          onImportFile={handleImport}
          onExportXls={() =>
            exportRecordsToXls(
              targetStudents.map((s) => ({
                NIS: s.nis,
                'Nama Murid': s.nama_lengkap,
                Kelas: s.kelas,
                'Wali Kelas': s.wali_kelas || '-',
                'Guru Wali': s.guru_wali_nama || '-',
              })),
              'Penetapan_Guru_Wali',
              'Penetapan_Guru_Wali.xlsx'
            )
          }
          onExportPdf={() =>
            exportRecordsToPdf(
              'MATRIKS PENETAPAN GURU WALI PER MURID',
              `Jumlah Murid: ${targetStudents.length}`,
              MATRIX_ASSIGN_HEADERS,
              toRows(targetStudents),
              'Penetapan_Guru_Wali.pdf',
              true
            )
          }
          onExportWord={() =>
            exportRecordsToWord(
              'MATRIKS PENETAPAN GURU WALI PER MURID',
              `Jumlah Murid: ${targetStudents.length}`,
              MATRIX_ASSIGN_HEADERS,
              toRows(targetStudents),
              'Penetapan_Guru_Wali.docx',
              true
            )
          }
          onPrint={() =>
            triggerTablePrint({
              title: 'MATRIKS PENETAPAN GURU WALI PER MURID',
              subtitle: `Jumlah Murid: ${targetStudents.length}`,
              headers: MATRIX_ASSIGN_HEADERS,
              rows: toRows(targetStudents),
              landscape: true,
            })
          }
          notice={notice}
          error={error}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3 px-3 w-10">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  title="Pilih Semua"
                  className="p-0.5 text-slate-500 hover:text-blue-600 cursor-pointer"
                >
                  {allSelected ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="py-3 px-4 font-bold">Nama Murid</th>
              <th className="py-3 px-4 font-bold">Kelas / NIS</th>
              <th className="py-3 px-4 font-bold">Wali Kelas</th>
              <th className="py-3 px-4 font-bold">Guru Wali Dampingan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {students.map((st) => {
              const isChecked = activeChecked.includes(st.id);
              return (
                <tr
                  key={st.id}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                    isChecked ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => toggleSelect(st.id)}
                      className="p-0.5 text-slate-500 hover:text-blue-600 cursor-pointer"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                    <button
                      type="button"
                      onClick={() => onOpenInfo(st)}
                      className="text-left hover:text-blue-600 hover:underline cursor-pointer"
                    >
                      {st.nama_lengkap}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                    {st.kelas} · <span className="font-mono-tabular">{st.nis}</span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                    {st.wali_kelas || '-'}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={st.guru_wali_id || ''}
                        disabled={updatingSingleId === st.id}
                        onChange={(e) => onInlineAssign(st.id, e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium min-w-[210px]"
                      >
                        <option value="">-- Belum Dipilih --</option>
                        {guruList.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.nama} ({g.role})
                          </option>
                        ))}
                      </select>
                      {updatingSingleId === st.id && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  Belum ada data murid di database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
