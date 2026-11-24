import React, { useEffect, useState } from 'react';
import { Sparkles, Save, Loader2, Check, CalendarRange } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { calcAttendancePct } from '../lib/imageUtils';
import {
  buildUpdatedPerkembangan,
  createEmptySnapshot,
  EVALUASI_PERIODES,
  getSnapshotForPeriode,
  hasSnapshotContent,
  normalizeEvaluasiPeriode,
} from '../lib/aspectPeriods';
import { StudentInfoModal } from './StudentInfoModal';
import type {
  EvaluasiPeriode,
  PerkembanganSnapshot,
  UserRole,
  WcLog,
  WcStudent,
} from '../types/waliconnect';

interface AttendanceAspectsViewProps {
  students: WcStudent[];
  logs: WcLog[];
  role: UserRole;
  linkedStudentId?: string;
}

const ASPECT_FIELDS: { key: keyof Omit<PerkembanganSnapshot, 'updated_at'>; label: string }[] = [
  { key: 'akademik', label: '1. Aspek Akademik' },
  { key: 'karakter', label: '2. Aspek Karakter & Akhlak' },
  { key: 'sosial_emosional', label: '3. Aspek Sosial-Emosional' },
  { key: 'kedisiplinan', label: '4. Aspek Kedisiplinan' },
  { key: 'potensi_minat', label: '5. Aspek Potensi & Minat' },
];

export const AttendanceAspectsView: React.FC<AttendanceAspectsViewProps> = ({
  students,
  logs,
  role,
  linkedStudentId,
}) => {
  const canEdit = role === 'Guru Wali' || role === 'Admin';
  const [infoStudent, setInfoStudent] = useState<WcStudent | null>(null);
  const visibleStudents = canEdit
    ? students
    : students.filter((s) => !linkedStudentId || s.id === linkedStudentId);

  const [selectedId, setSelectedId] = useState<string>(visibleStudents[0]?.id || '');
  const selectedStudent =
    visibleStudents.find((s) => s.id === selectedId) ?? visibleStudents[0] ?? null;

  const [activePeriode, setActivePeriode] = useState<EvaluasiPeriode>('3 Bulan');
  const [periodDrafts, setPeriodDrafts] = useState<
    Partial<Record<EvaluasiPeriode, PerkembanganSnapshot>>
  >({});
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (selectedStudent) {
      const nextPeriod = normalizeEvaluasiPeriode(selectedStudent.perkembangan?.periode);
      setActivePeriode(nextPeriod);
      setPeriodDrafts({
        '3 Bulan': getSnapshotForPeriode(selectedStudent.perkembangan, '3 Bulan'),
        '6 Bulan': getSnapshotForPeriode(selectedStudent.perkembangan, '6 Bulan'),
        '9 Bulan': getSnapshotForPeriode(selectedStudent.perkembangan, '9 Bulan'),
        '1 Tahun': getSnapshotForPeriode(selectedStudent.perkembangan, '1 Tahun'),
      });
    } else {
      setPeriodDrafts({});
    }
  }, [selectedStudent?.id, selectedStudent?.updated_at]);

  const currentDraft: PerkembanganSnapshot =
    periodDrafts[activePeriode] ??
    getSnapshotForPeriode(selectedStudent?.perkembangan, activePeriode) ??
    createEmptySnapshot();

  const updateCurrentField = (
    key: keyof Omit<PerkembanganSnapshot, 'updated_at'>,
    value: string
  ) => {
    setPeriodDrafts((prev) => ({
      ...prev,
      [activePeriode]: {
        ...(prev[activePeriode] ??
          getSnapshotForPeriode(selectedStudent?.perkembangan, activePeriode)),
        [key]: value,
      },
    }));
  };

  const handleToggleSession = async (student: WcStudent, sessionIndex: number) => {
    if (!canEdit) return;
    const current = Array.isArray(student.kehadiran)
      ? [...student.kehadiran]
      : Array(9).fill(false);
    while (current.length < 9) current.push(false);
    current[sessionIndex] = !current[sessionIndex];

    try {
      await updateDoc(doc(db, COLLECTIONS.students, student.id), {
        kehadiran: current,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.students}/${student.id}`);
    }
  };

  const handleAiFillAspects = async () => {
    if (!selectedStudent) return;
    setErrorMsg('');
    setStatusMsg('');
    setAiBusy(true);

    try {
      const recentLogs = logs
        .filter((l) => l.student_id === selectedStudent.id)
        .slice(0, 5)
        .map((l) => `${l.kategori} (${l.tanggal}): ${l.topik} - ${l.uraian}`);

      const res = await fetch('/api/ai/lima-aspek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: selectedStudent.nama_lengkap,
          kelas: selectedStudent.kelas,
          periode: activePeriode,
          rencanaLulus: selectedStudent.rencana_lulus,
          attendancePct: calcAttendancePct(selectedStudent.kehadiran),
          recentLogs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghubungi AI.');

      const a = data.aspects || {};
      setPeriodDrafts((prev) => {
        const base =
          prev[activePeriode] ??
          getSnapshotForPeriode(selectedStudent.perkembangan, activePeriode);
        return {
          ...prev,
          [activePeriode]: {
            ...base,
            akademik: a.akademik || base.akademik,
            karakter: a.karakter || base.karakter,
            sosial_emosional: a.sosial_emosional || base.sosial_emosional,
            kedisiplinan: a.kedisiplinan || base.kedisiplinan,
            potensi_minat: a.potensi_minat || base.potensi_minat,
          },
        };
      });
      setStatusMsg(
        `Draft 5 aspek periode ${activePeriode} berhasil disusun AI (Structured JSON). Tinjau lalu klik Simpan.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyusun 5 aspek AI.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSaveAspects = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const nextPerkembangan = buildUpdatedPerkembangan(
        selectedStudent.perkembangan,
        activePeriode,
        currentDraft
      );
      await updateDoc(doc(db, COLLECTIONS.students, selectedStudent.id), {
        perkembangan: nextPerkembangan,
        updated_at: new Date().toISOString(),
      });
      setStatusMsg(
        `Evaluasi 5 Aspek Perkembangan (Lampiran B) periode ${activePeriode} berhasil disimpan.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.students}/${selectedStudent.id}`);
    } finally {
      setSaving(false);
    }
  };

  const activePeriodMeta = EVALUASI_PERIODES.find((p) => p.value === activePeriode);

  return (
    <div className="space-y-6">
      {/* Lampiran D: Presensi Pertemuan 1-9 Matrix */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Matriks Presensi Pertemuan 1–9 (Lampiran D)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {canEdit
              ? 'Centang sesi ke-1 hingga ke-9 untuk menghitung persentase kehadiran perwalian secara otomatis.'
              : 'Rekap kehadiran bimbingan perwalian sesi 1 sampai dengan sesi 9.'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4 font-bold">Nama Murid</th>
                <th className="py-3 px-3 font-bold">Kelas</th>
                {Array.from({ length: 9 }, (_, i) => (
                  <th key={i} className="py-3 px-2 font-bold text-center font-mono-tabular">
                    P{i + 1}
                  </th>
                ))}
                <th className="py-3 px-4 font-bold text-right">Kehadiran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleStudents.map((st) => {
                const pct = calcAttendancePct(st.kehadiran);
                return (
                  <tr
                    key={st.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      selectedStudent?.id === st.id ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(st.id);
                          setInfoStudent(st);
                        }}
                        title="Klik nama untuk melihat pop-up informasi murid"
                        className="text-left font-bold hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                      >
                        {st.nama_lengkap}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-slate-500 dark:text-slate-400">{st.kelas}</td>
                    {Array.from({ length: 9 }, (_, idx) => {
                      const checked = Boolean(st.kehadiran?.[idx]);
                      return (
                        <td key={idx} className="py-3 px-2 text-center">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => handleToggleSession(st, idx)}
                            aria-label={`Sesi ${idx + 1} ${st.nama_lengkap}`}
                            className={`w-6 h-6 rounded-md inline-flex items-center justify-center border transition-colors ${
                              checked
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-transparent'
                            } ${canEdit ? 'cursor-pointer hover:border-blue-500' : 'cursor-default'}`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-mono-tabular font-bold text-blue-600 dark:text-blue-400">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
              {visibleStudents.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500">
                    Belum ada data murid.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lampiran B: Evaluasi 5 Aspek Perkembangan */}
      {selectedStudent && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Evaluasi 5 Aspek Perkembangan Murid (Lampiran B)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Murid terpilih:{' '}
                <button
                  type="button"
                  onClick={() => setInfoStudent(selectedStudent)}
                  title="Klik nama untuk melihat pop-up informasi murid"
                  className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                >
                  {selectedStudent.nama_lengkap}
                </button>{' '}
                ({selectedStudent.kelas}) · Siklus{' '}
                <strong>{activePeriode}</strong> ({activePeriodMeta?.hint})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {visibleStudents.length > 1 && (
                <select
                  value={selectedStudent.id}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  {visibleStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama_lengkap} ({s.kelas})
                    </option>
                  ))}
                </select>
              )}

              {canEdit && (
                <button
                  type="button"
                  onClick={handleAiFillAspects}
                  disabled={aiBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  {aiBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Isi 5 Aspek AI ({activePeriode})</span>
                </button>
              )}
            </div>
          </div>

          {/* Period Tabs: 3 Bulan, 6 Bulan, 9 Bulan, 1 Tahun */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <CalendarRange className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Periode Evaluasi Berkala:</span>
            </div>
            <div className="grid grid-cols-2 sm:flex items-center gap-1.5">
              {EVALUASI_PERIODES.map((p) => {
                const isSelected = activePeriode === p.value;
                const savedSnap = getSnapshotForPeriode(selectedStudent.perkembangan, p.value);
                const filled = hasSnapshotContent(savedSnap);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setActivePeriode(p.value);
                      setStatusMsg('');
                      setErrorMsg('');
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{p.label}</span>
                    {filled && (
                      <span
                        title="Sudah ada catatan tersimpan"
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-emerald-300' : 'bg-emerald-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {statusMsg && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {statusMsg}
            </div>
          )}
          {errorMsg && (
            <div className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ASPECT_FIELDS.map((field) => (
              <div
                key={field.key}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800"
              >
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-2">
                  {field.label}
                </label>
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={currentDraft[field.key]}
                  onChange={(e) => updateCurrentField(field.key, e.target.value)}
                  placeholder={`Tuliskan catatan perkembangan ${field.label.toLowerCase()} untuk periode ${activePeriode}...`}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white disabled:opacity-80"
                />
              </div>
            ))}
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Setiap periode (3 Bulan, 6 Bulan, 9 Bulan, 1 Tahun) disimpan terpisah sebagai riwayat Lampiran B.
              </p>
              <button
                type="button"
                onClick={handleSaveAspects}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Simpan Evaluasi {activePeriode}</span>
              </button>
            </div>
          )}
        </div>
      )}
      <StudentInfoModal
        student={infoStudent}
        onClose={() => setInfoStudent(null)}
        logsCount={
          infoStudent ? logs.filter((l) => l.student_id === infoStudent.id).length : undefined
        }
      />
    </div>
  );
};
