import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Save,
  Loader2,
  Check,
  CalendarRange,
  CheckSquare,
  Square,
} from 'lucide-react';
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
import {
  downloadRecordsXlsTemplate,
  exportRecordsToPdf,
  exportRecordsToWord,
  exportRecordsToXls,
  importRecordsFromFile,
  triggerTablePrint,
} from '../lib/docExportImport';
import { StudentInfoModal } from './StudentInfoModal';
import { DataActionsBar } from './DataActionsBar';
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

const MATRIX_HEADERS = [
  'NIS',
  'Nama Murid',
  'Kelas',
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
  'P9',
  '%',
  'Periode',
  'Akademik',
  'Karakter',
  'Sosial-Emosional',
  'Kedisiplinan',
  'Potensi & Minat',
];

function pickCell(row: Record<string, unknown>, ...keys: string[]): string {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(
      ([k]) => k.trim().toLowerCase() === key.trim().toLowerCase()
    );
    if (found !== undefined && String(found[1] ?? '').trim()) {
      return String(found[1]).trim();
    }
  }
  return '';
}

function parseAttMark(val: string): boolean {
  const v = val.trim().toLowerCase();
  return ['v', '✓', '1', 'true', 'ya', 'hadir', 'y', 'x'].includes(v);
}

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

  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [matrixNotice, setMatrixNotice] = useState('');
  const [matrixError, setMatrixError] = useState('');

  const visibleIds = visibleStudents.map((s) => s.id);
  const activeChecked = checkedIds.filter((id) => visibleIds.includes(id));
  const allSelected = visibleIds.length > 0 && activeChecked.length === visibleIds.length;
  const targetStudents =
    activeChecked.length > 0
      ? visibleStudents.filter((s) => activeChecked.includes(s.id))
      : visibleStudents;

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

  const handleBulkResetAttendance = async () => {
    setMatrixError('');
    setMatrixNotice('');
    try {
      await Promise.all(
        activeChecked.map((id) =>
          updateDoc(doc(db, COLLECTIONS.students, id), {
            kehadiran: Array(9).fill(false),
            updated_at: new Date().toISOString(),
          })
        )
      );
      setMatrixNotice(`Presensi P1–P9 untuk ${activeChecked.length} murid berhasil direset.`);
      setCheckedIds((prev) => prev.filter((id) => !activeChecked.includes(id)));
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : 'Gagal mereset presensi murid.');
    }
  };

  const handleDownloadTemplateXls = () => {
    const sample = visibleStudents[0];
    downloadRecordsXlsTemplate(
      [
        {
          NIS: sample?.nis || '2025001',
          'Nama Murid': sample?.nama_lengkap || 'Ahmad Rizky Pratama',
          Kelas: sample?.kelas || 'XI IPA 1',
          P1: 'v',
          P2: 'v',
          P3: 'v',
          P4: '-',
          P5: '-',
          P6: '-',
          P7: '-',
          P8: '-',
          P9: '-',
          Periode: activePeriode,
          Akademik: 'Menunjukkan peningkatan konsisten pada mata pelajaran inti.',
          Karakter: 'Sopan, disiplin, dan aktif membantu teman.',
          'Sosial-Emosional': 'Mampu beradaptasi dan mengelola emosi dengan baik.',
          Kedisiplinan: 'Tertib mengikuti seluruh sesi perwalian.',
          'Potensi & Minat': 'Antusias pada bidang riset dan teknologi.',
        },
      ],
      [
        'Petunjuk Import Presensi & 5 Aspek Perkembangan WaliConnect Pro',
        '1. Cocokkan baris murid berdasarkan kolom NIS atau Nama Murid yang sudah terdaftar.',
        '2. Kolom P1–P9 diisi v / Hadir / 1 jika hadir, atau - jika tidak hadir.',
        '3. Periode diisi: 3 Bulan, 6 Bulan, 9 Bulan, atau 1 Tahun.',
      ],
      'Presensi_5Aspek',
      'Template_Presensi_5Aspek.xlsx'
    );
  };

  const handleDownloadTemplateWord = async () => {
    const sample = visibleStudents[0];
    await exportRecordsToWord(
      'TEMPLATE IMPORT PRESENSI P1–P9 & 5 ASPEK',
      'Sesuaikan NIS / Nama Murid dengan data murid terdaftar, isi kolom P1–P9 dan 5 aspek, lalu simpan .docx.',
      MATRIX_HEADERS.filter((h) => h !== '%'),
      [
        [
          sample?.nis || '2025001',
          sample?.nama_lengkap || 'Ahmad Rizky Pratama',
          sample?.kelas || 'XI IPA 1',
          'v',
          'v',
          'v',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          activePeriode,
          'Peningkatan konsisten.',
          'Disiplin & bertanggung jawab.',
          'Adaptif.',
          'Tertib.',
          'Minat riset.',
        ],
      ],
      'Template_Presensi_5Aspek.docx',
      true
    );
  };

  const handleImportFile = async (file: File) => {
    setMatrixError('');
    setMatrixNotice('');
    try {
      const rows = await importRecordsFromFile(file);
      let updatedCount = 0;

      for (const row of rows) {
        const nis = pickCell(row, 'NIS');
        const nama = pickCell(row, 'Nama Murid', 'Nama');
        const matched = visibleStudents.find(
          (s) =>
            (nis && s.nis.trim().toLowerCase() === nis.toLowerCase()) ||
            (nama && s.nama_lengkap.trim().toLowerCase() === nama.toLowerCase())
        );
        if (!matched) continue;

        const nextKehadiran = Array.from({ length: 9 }, (_, i) => {
          const raw = pickCell(row, `P${i + 1}`);
          return raw ? parseAttMark(raw) : Boolean(matched.kehadiran?.[i]);
        });

        const periode = normalizeEvaluasiPeriode(pickCell(row, 'Periode') || activePeriode);
        const existingSnap = getSnapshotForPeriode(matched.perkembangan, periode);
        const akademik = pickCell(row, 'Akademik') || existingSnap.akademik;
        const karakter = pickCell(row, 'Karakter') || existingSnap.karakter;
        const sosial =
          pickCell(row, 'Sosial-Emosional', 'Sosial Emosional') ||
          existingSnap.sosial_emosional;
        const disiplin = pickCell(row, 'Kedisiplinan') || existingSnap.kedisiplinan;
        const potensi =
          pickCell(row, 'Potensi & Minat', 'Potensi') || existingSnap.potensi_minat;

        const nextPerkembangan = buildUpdatedPerkembangan(matched.perkembangan, periode, {
          akademik,
          karakter,
          sosial_emosional: sosial,
          kedisiplinan: disiplin,
          potensi_minat: potensi,
        });

        await updateDoc(doc(db, COLLECTIONS.students, matched.id), {
          kehadiran: nextKehadiran,
          perkembangan: nextPerkembangan,
          updated_at: new Date().toISOString(),
        });
        updatedCount += 1;
      }

      if (updatedCount === 0) {
        throw new Error(
          'Tidak ada murid yang cocok berdasarkan NIS atau Nama Murid pada file yang diunggah.'
        );
      }
      setMatrixNotice(
        `Berhasil memperbarui presensi & evaluasi 5 aspek untuk ${updatedCount} murid.`
      );
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : 'Gagal mengimpor file presensi.');
    }
  };

  const toMatrixRows = (items: WcStudent[]) =>
    items.map((st) => {
      const snap = getSnapshotForPeriode(st.perkembangan, activePeriode);
      return [
        st.nis,
        st.nama_lengkap,
        st.kelas,
        ...Array.from({ length: 9 }, (_, i) => (st.kehadiran?.[i] ? 'v' : '-')),
        `${calcAttendancePct(st.kehadiran)}%`,
        activePeriode,
        snap.akademik || '-',
        snap.karakter || '-',
        snap.sosial_emosional || '-',
        snap.kedisiplinan || '-',
        snap.potensi_minat || '-',
      ];
    });

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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Matriks Presensi Pertemuan 1–9 (Lampiran D) &amp; Rekap 5 Aspek
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {canEdit
              ? 'Centang sesi ke-1 hingga ke-9 untuk menghitung persentase kehadiran perwalian secara otomatis.'
              : 'Rekap kehadiran bimbingan perwalian sesi 1 sampai dengan sesi 9.'}
          </p>
        </div>

        <DataActionsBar
          totalCount={visibleStudents.length}
          selectedCount={activeChecked.length}
          allSelected={allSelected}
          onToggleSelectAll={toggleSelectAll}
          canManage={canEdit}
          onEditSelected={() => {
            if (activeChecked[0]) {
              setSelectedId(activeChecked[0]);
              setMatrixNotice('Murid dimuat ke form Evaluasi 5 Aspek Perkembangan di bawah.');
            }
          }}
          onBulkDelete={handleBulkResetAttendance}
          bulkDeleteLabel="reset presensi P1–P9"
          onDownloadTemplateXls={handleDownloadTemplateXls}
          onDownloadTemplateWord={handleDownloadTemplateWord}
          onImportFile={handleImportFile}
          onExportXls={() =>
            exportRecordsToXls(
              targetStudents.map((st) => {
                const snap = getSnapshotForPeriode(st.perkembangan, activePeriode);
                return {
                  NIS: st.nis,
                  'Nama Murid': st.nama_lengkap,
                  Kelas: st.kelas,
                  P1: st.kehadiran?.[0] ? 'v' : '-',
                  P2: st.kehadiran?.[1] ? 'v' : '-',
                  P3: st.kehadiran?.[2] ? 'v' : '-',
                  P4: st.kehadiran?.[3] ? 'v' : '-',
                  P5: st.kehadiran?.[4] ? 'v' : '-',
                  P6: st.kehadiran?.[5] ? 'v' : '-',
                  P7: st.kehadiran?.[6] ? 'v' : '-',
                  P8: st.kehadiran?.[7] ? 'v' : '-',
                  P9: st.kehadiran?.[8] ? 'v' : '-',
                  Kehadiran: `${calcAttendancePct(st.kehadiran)}%`,
                  Periode: activePeriode,
                  Akademik: snap.akademik || '-',
                  Karakter: snap.karakter || '-',
                  'Sosial-Emosional': snap.sosial_emosional || '-',
                  Kedisiplinan: snap.kedisiplinan || '-',
                  'Potensi & Minat': snap.potensi_minat || '-',
                };
              }),
              'Presensi_5Aspek',
              'Presensi_5Aspek_WaliConnect.xlsx'
            )
          }
          onExportPdf={() =>
            exportRecordsToPdf(
              `MATRIKS PRESENSI P1–P9 & EVALUASI 5 ASPEK (${activePeriode})`,
              `Jumlah Murid: ${targetStudents.length}`,
              MATRIX_HEADERS,
              toMatrixRows(targetStudents),
              'Presensi_5Aspek_WaliConnect.pdf',
              true
            )
          }
          onExportWord={() =>
            exportRecordsToWord(
              `MATRIKS PRESENSI P1–P9 & EVALUASI 5 ASPEK (${activePeriode})`,
              `Jumlah Murid: ${targetStudents.length}`,
              MATRIX_HEADERS,
              toMatrixRows(targetStudents),
              'Presensi_5Aspek_WaliConnect.docx',
              true
            )
          }
          onPrint={() =>
            triggerTablePrint({
              title: `MATRIKS PRESENSI P1–P9 & EVALUASI 5 ASPEK (${activePeriode})`,
              subtitle: `Jumlah Murid: ${targetStudents.length}`,
              headers: MATRIX_HEADERS,
              rows: toMatrixRows(targetStudents),
              landscape: true,
            })
          }
          notice={matrixNotice}
          error={matrixError}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
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
                const isChecked = activeChecked.includes(st.id);
                return (
                  <tr
                    key={st.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      isChecked
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : selectedStudent?.id === st.id
                          ? 'bg-blue-50/40 dark:bg-blue-950/20'
                          : ''
                    }`}
                  >
                    <td className="py-3 px-3">
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
                  <td colSpan={13} className="py-8 text-center text-slate-500">
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
