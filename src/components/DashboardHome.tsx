import React, { useState } from 'react';
import {
  Users,
  CalendarCheck,
  BookOpen,
  AlertCircle,
  ArrowRight,
  Calendar,
  MapPin,
  Clock,
  Sparkles,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { calcAttendancePct } from '../lib/imageUtils';
import {
  EVALUASI_PERIODES,
  getSnapshotForPeriode,
  hasSnapshotContent,
  normalizeEvaluasiPeriode,
} from '../lib/aspectPeriods';
import {
  AttendanceLineChart,
  CategoryStackedBarChart,
  JournalDonutChart,
} from './D3Charts';
import type {
  EvaluasiPeriode,
  KanbanStatus,
  NavTabId,
  WcAnnouncement,
  WcLog,
  WcStudent,
  WcUser,
} from '../types/waliconnect';

interface DashboardHomeProps {
  currentUser: WcUser;
  users: WcUser[];
  students: WcStudent[];
  logs: WcLog[];
  announcements: WcAnnouncement[];
  darkMode: boolean;
  onNavigate: (tab: NavTabId, studentId?: string) => void;
}

const KANBAN_COLS: KanbanStatus[] = [
  'Dalam Proses',
  'Perlu Tindak Lanjut',
  'Selesai Tertangani',
];

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  currentUser,
  users,
  students,
  logs,
  announcements,
  darkMode,
  onNavigate,
}) => {
  const [aspectPeriodeOverride, setAspectPeriodeOverride] = useState<EvaluasiPeriode | null>(null);

  const handleMoveKanban = async (logItem: WcLog, newStatus: KanbanStatus) => {
    if (logItem.status_kanban === newStatus) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.logs, logItem.id), {
        status_kanban: newStatus,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.logs}/${logItem.id}`);
    }
  };

  // Parent & Student specific home views
  if (currentUser.role === 'Orang Tua' || currentUser.role === 'Siswa') {
    const linkedStudent =
      students.find((s) => s.id === currentUser.linked_student_id) ?? students[0];

    if (!linkedStudent) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
            Profil Murid Belum Tertaut
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Hubungi Guru Wali atau Admin BK untuk menautkan akun Anda ke profil murid.
          </p>
        </div>
      );
    }

    const attPct = calcAttendancePct(linkedStudent.kehadiran);
    const studentLogs = logs.filter((l) => l.student_id === linkedStudent.id);
    const activePeriode =
      aspectPeriodeOverride ?? normalizeEvaluasiPeriode(linkedStudent.perkembangan?.periode);
    const activeSnapshot = getSnapshotForPeriode(linkedStudent.perkembangan, activePeriode);
    const aspekItems = [
      { key: 'Akademik', val: activeSnapshot.akademik },
      { key: 'Karakter', val: activeSnapshot.karakter },
      { key: 'Sosial-Emosional', val: activeSnapshot.sosial_emosional },
      { key: 'Kedisiplinan', val: activeSnapshot.kedisiplinan },
      { key: 'Potensi & Minat', val: activeSnapshot.potensi_minat },
    ];

    return (
      <div className="space-y-6">
        {/* Highlight Profile Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-24 h-32 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
              {linkedStudent.foto_url ? (
                <img
                  src={linkedStudent.foto_url}
                  alt={linkedStudent.nama_lengkap}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-slate-400">
                  {linkedStudent.nama_lengkap.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                {currentUser.role === 'Orang Tua'
                  ? 'Profil Putra / Putri Tertaut'
                  : 'Profil Murid Dampingan'}
              </p>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white truncate">
                {linkedStudent.nama_lengkap}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Kelas {linkedStudent.kelas} · NIS {linkedStudent.nis} · NISN {linkedStudent.nisn || '-'}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Kehadiran Bimbingan</p>
                  <p className="text-lg font-bold font-mono-tabular text-blue-600 dark:text-blue-400">
                    {attPct}%
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Target Pasca Lulus</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {linkedStudent.rencana_lulus || 'Belum diisi'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Program / Bidang</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                    {linkedStudent.prodi_pilihan || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Catatan Bimbingan</p>
                  <p className="text-lg font-bold font-mono-tabular text-slate-900 dark:text-white">
                    {studentLogs.length} sesi
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 shrink-0">
              {currentUser.role === 'Siswa' ? (
                <button
                  type="button"
                  onClick={() => onNavigate('students', linkedStudent.id)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Isi Refleksi &amp; Rencana Lulus</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('communication')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Konsultasi Guru Wali</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('attendance_aspects')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Lihat Presensi &amp; 5 Aspek</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 5 Aspects Summary + Recent Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Ringkasan Evaluasi 5 Aspek Perkembangan (Lampiran B)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Periode evaluasi terpilih: <strong>{activePeriode}</strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {EVALUASI_PERIODES.map((p) => {
                  const selected = activePeriode === p.value;
                  const filled = hasSnapshotContent(
                    getSnapshotForPeriode(linkedStudent.perkembangan, p.value)
                  );
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setAspectPeriodeOverride(p.value)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        selected
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900'
                      }`}
                    >
                      <span>{p.label}</span>
                      {filled && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            selected ? 'bg-emerald-300' : 'bg-emerald-500'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {aspekItems.map((item) => (
                <div key={item.key} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    {item.key}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.val || 'Belum ada catatan evaluasi untuk aspek ini.'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Info &amp; Agenda Terbaru
            </h3>
            <div className="space-y-4">
              {announcements.slice(0, 3).map((ann) => (
                <div
                  key={ann.id}
                  className="pb-3.5 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0"
                >
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold font-mono-tabular">
                    {ann.tanggal} · {ann.kategori || 'Pengumuman'}
                  </p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {ann.judul}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                    {ann.isi}
                  </p>
                </div>
              ))}
              {announcements.length === 0 && (
                <p className="text-xs text-slate-500">Belum ada pengumuman sekolah.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Guru Wali & Admin Dashboard
  const totalStudents = students.length;
  const avgAttendance =
    totalStudents === 0
      ? 0
      : Math.round(
          students.reduce((sum, s) => sum + calcAttendancePct(s.kehadiran), 0) / totalStudents
        );
  const totalLogs = logs.length;
  const needFollowUp = logs.filter((l) => l.status_kanban === 'Perlu Tindak Lanjut').length;

  return (
    <div className="space-y-6">
      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Murid Dampingan
            </span>
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-extrabold font-mono-tabular text-slate-900 dark:text-white mt-2">
            {totalStudents}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Aktif terdaftar di Lampiran A
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Rata-Rata Kehadiran
            </span>
            <CalendarCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold font-mono-tabular text-slate-900 dark:text-white mt-2">
            {avgAttendance}%
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Dari 9 sesi pertemuan terjadwal
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Catatan Jurnal Perwalian
            </span>
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-2xl font-extrabold font-mono-tabular text-slate-900 dark:text-white mt-2">
            {totalLogs}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Rekap pertemuan Lampiran C
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Perlu Tindak Lanjut
            </span>
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold font-mono-tabular text-amber-600 dark:text-amber-400 mt-2">
            {needFollowUp}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Prioritas pendampingan aktif
          </p>
        </div>
      </div>

      {/* Charts Row 1: Attendance Trend + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Grafik Progres Kehadiran Bimbingan (Sesi 1–9)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Persentase partisipasi murid per pertemuan Lampiran D
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('attendance_aspects')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
            >
              Kelola Presensi
            </button>
          </div>
          <AttendanceLineChart students={students} darkMode={darkMode} />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            Ringkasan Status Jurnal
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Distribusi tindak lanjut perwalian
          </p>
          <JournalDonutChart logs={logs} darkMode={darkMode} />
        </div>
      </div>

      {/* Row 2: Stacked Bar + Weekly Agenda + Connected Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            Analitik Kategori Pendampingan
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Sebaran 5 bidang perwalian per status
          </p>
          <CategoryStackedBarChart logs={logs} darkMode={darkMode} />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Kalender Agenda Minggu Ini
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('announcements')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Semua
            </button>
          </div>
          <div className="space-y-3.5">
            {announcements.slice(0, 3).map((ann) => (
              <div
                key={ann.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400 font-mono-tabular">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{ann.tanggal}</span>
                  {ann.waktu && (
                    <>
                      <span>·</span>
                      <Clock className="w-3 h-3" />
                      <span>{ann.waktu}</span>
                    </>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                  {ann.judul}
                </p>
                {ann.lokasi && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{ann.lokasi}</span>
                  </p>
                )}
              </div>
            ))}
            {announcements.length === 0 && (
              <p className="text-xs text-slate-500">Belum ada agenda terjadwal.</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Daftar Akun Terhubung
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Kelola
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
            {users.map((u) => (
              <div key={u.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {u.nama}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {u.role} · <span className="font-mono-tabular">{u.nip}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Kanban Board */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Papan Kanban Tindak Lanjut Perwalian
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Klik tombol status pada kartu untuk memindahkan progres penanganan secara real-time
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('journal')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Buka Buku Jurnal Lengkap
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KANBAN_COLS.map((col) => {
            const colLogs = logs.filter((l) => l.status_kanban === col);
            return (
              <div
                key={col}
                className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 p-3.5"
              >
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {col}
                  </span>
                  <span className="text-xs font-mono-tabular font-bold text-slate-500 dark:text-slate-400">
                    {colLogs.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {colLogs.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs"
                    >
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        {item.kategori} · Sesi {item.sesi_ke} ·{' '}
                        <span className="font-mono-tabular">{item.tanggal}</span>
                      </p>
                      <p className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                        {item.topik}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                        Murid: <strong>{item.student_name}</strong>
                      </p>

                      <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                        {KANBAN_COLS.filter((target) => target !== col).map((target) => (
                          <button
                            key={target}
                            type="button"
                            onClick={() => handleMoveKanban(item, target)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300 transition-colors cursor-pointer"
                          >
                            {target === 'Selesai Tertangani' && (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            )}
                            <span>{target}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {colLogs.length === 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">
                      Tidak ada item di kolom ini
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
