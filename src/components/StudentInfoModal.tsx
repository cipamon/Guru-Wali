import React, { useEffect } from 'react';
import {
  X,
  Edit3,
  Phone,
  Mail,
  MapPin,
  UserCheck,
  GraduationCap,
  Calendar,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import {
  calcAttendancePct,
  extractGoogleDriveFileId,
  normalizeExternalImageUrl,
} from '../lib/imageUtils';
import { getSnapshotForPeriode, normalizeEvaluasiPeriode } from '../lib/aspectPeriods';
import { SmartPhoto } from './SmartPhoto';
import type { WcStudent } from '../types/waliconnect';

interface StudentInfoModalProps {
  student: WcStudent | null;
  onClose: () => void;
  onEdit?: (student: WcStudent) => void;
  logsCount?: number;
}

export const StudentInfoModal: React.FC<StudentInfoModalProps> = ({
  student,
  onClose,
  onEdit,
  logsCount,
}) => {
  useEffect(() => {
    if (!student) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [student, onClose]);

  if (!student) return null;

  const pct = calcAttendancePct(student.kehadiran);
  const attendedCount = (student.kehadiran || []).filter(Boolean).length;
  const totalSessions = (student.kehadiran || []).length || 9;

  let tempat = student.tempat_lahir || '';
  let tanggal = student.tanggal_lahir || '';
  if (!tempat && !tanggal && student.ttl) {
    const commaIdx = student.ttl.indexOf(',');
    if (commaIdx >= 0) {
      tempat = student.ttl.slice(0, commaIdx).trim();
      tanggal = student.ttl.slice(commaIdx + 1).trim();
    } else {
      tempat = student.ttl.trim();
    }
  }
  const ttlDisplay = [tempat, tanggal].filter(Boolean).join(', ') || student.ttl || '-';

  const activePeriode = normalizeEvaluasiPeriode(student.perkembangan?.periode);
  const aspectSnap = getSnapshotForPeriode(student.perkembangan, activePeriode);
  const driveId = extractGoogleDriveFileId(student.foto_url);
  const externalPhotoHref = driveId
    ? `https://drive.google.com/file/d/${driveId}/view`
    : normalizeExternalImageUrl(student.foto_url);

  const statusColor =
    (student.status_siswa || 'Aktif') === 'Aktif'
      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Informasi Siswa ${student.nama_lengkap}`}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Informasi Lengkap Siswa
              </span>
              <span
                className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusColor}`}
              >
                {student.status_siswa || 'Aktif'}
              </span>
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white truncate mt-0.5">
              {student.nama_lengkap}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kelas {student.kelas}
              {student.no_absen ? ` · No. Absen ${student.no_absen}` : ''} · NIS{' '}
              <span className="font-mono-tabular">{student.nis}</span>
              {student.nisn ? ` · NISN ${student.nisn}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(student);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Biodata</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Pop-up Informasi"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Top Photo + 15 Key Identity Fields */}
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="shrink-0 flex flex-col items-center sm:items-start gap-2">
              <div className="w-32 h-44 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-xs">
                <SmartPhoto
                  src={student.foto_url}
                  alt={`Pas Foto ${student.nama_lengkap}`}
                  showDriveHint
                  fallback={
                    <div className="text-center p-2">
                      <span className="block text-xl font-extrabold text-slate-400">
                        {student.nama_lengkap.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="text-[10px] text-slate-400">Belum ada foto</span>
                    </div>
                  }
                />
              </div>
              {externalPhotoHref && externalPhotoHref.startsWith('http') && (
                <a
                  href={externalPhotoHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Buka Tautan Foto</span>
                </a>
              )}
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">NIS / NISN</p>
                <p className="font-bold font-mono-tabular text-slate-900 dark:text-white mt-0.5">
                  {student.nis || '-'} / {student.nisn || '-'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Kelas &amp; No. Absen</p>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {student.kelas || '-'} · Absen {student.no_absen || '-'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Jenis Kelamin &amp; Agama</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {student.jenis_kelamin === 'P' ? 'Perempuan (P)' : 'Laki-laki (L)'} ·{' '}
                  {student.agama || '-'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Tempat, Tanggal Lahir
                </p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{ttlDisplay}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> NO_HP / WhatsApp
                </p>
                <p className="font-semibold font-mono-tabular text-slate-900 dark:text-white mt-0.5">
                  {student.whatsapp || '-'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email
                </p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5 break-all">
                  {student.email || '-'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <UserCheck className="w-3 h-3" /> Guru Wali / Wali Kelas
                </p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {student.guru_wali_nama || student.wali_kelas || '-'}
                </p>
                {student.guru_wali_nama && student.wali_kelas && student.guru_wali_nama !== student.wali_kelas && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Wali Kelas: {student.wali_kelas}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Guru BK
                </p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {student.guru_bk || '-'}
                </p>
              </div>
              <div className="sm:col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Alamat Domisili
                </p>
                <p className="font-medium text-slate-900 dark:text-white mt-0.5">
                  {student.alamat || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30">
              <p className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold">
                Kehadiran Bimbingan
              </p>
              <p className="text-lg font-extrabold font-mono-tabular text-blue-700 dark:text-blue-300 mt-0.5">
                {pct}%{' '}
                <span className="text-xs font-medium opacity-80">
                  ({attendedCount}/{totalSessions} sesi)
                </span>
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" /> Rencana Pasca Lulus
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {student.rencana_lulus || 'Belum ditentukan'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {student.prodi_pilihan || '-'}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                Hobi &amp; Panggilan
              </p>
              <p className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                Panggilan: {student.nama_panggilan || '-'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {student.hobi || '-'}
                {typeof logsCount === 'number' ? ` · ${logsCount} jurnal` : ''}
              </p>
            </div>
          </div>

          {/* Parents & Family */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2 text-xs">
            <h4 className="font-bold text-slate-900 dark:text-white">
              Data Orang Tua / Wali
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-700 dark:text-slate-300">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Ayah:</span>{' '}
                <strong>{student.nama_ayah || '-'}</strong>
                {student.pekerjaan_ayah ? ` (${student.pekerjaan_ayah})` : ''}
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Ibu:</span>{' '}
                <strong>{student.nama_ibu || '-'}</strong>
                {student.pekerjaan_ibu ? ` (${student.pekerjaan_ibu})` : ''}
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Kontak Ortu:</span>{' '}
                <strong className="font-mono-tabular">{student.kontak_ortu || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Alamat Ortu:</span>{' '}
                <span>{student.alamat_ortu || '-'}</span>
              </div>
            </div>
          </div>

          {/* Reflection & 5 Aspects Snapshot */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-900 dark:text-white">
                Refleksi &amp; Catatan Khusus (Lampiran A)
              </h4>
              <div>
                <span className="text-[11px] font-semibold text-slate-500">Deskripsi Diri:</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                  {student.deskripsi_diri || '-'}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500">Langkah Pencapaian:</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5 whitespace-pre-line leading-relaxed">
                  {student.langkah_pencapaian || '-'}
                </p>
              </div>
              {student.catatan_khusus && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">Catatan Khusus:</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                    {student.catatan_khusus}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-900 dark:text-white">
                Evaluasi 5 Aspek ({activePeriode})
              </h4>
              <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
                <p>
                  <strong className="text-slate-900 dark:text-white">Akademik:</strong>{' '}
                  {aspectSnap.akademik || '-'}
                </p>
                <p>
                  <strong className="text-slate-900 dark:text-white">Karakter:</strong>{' '}
                  {aspectSnap.karakter || '-'}
                </p>
                <p>
                  <strong className="text-slate-900 dark:text-white">Sosial-Emosional:</strong>{' '}
                  {aspectSnap.sosial_emosional || '-'}
                </p>
                <p>
                  <strong className="text-slate-900 dark:text-white">Kedisiplinan:</strong>{' '}
                  {aspectSnap.kedisiplinan || '-'}
                </p>
                <p>
                  <strong className="text-slate-900 dark:text-white">Potensi &amp; Minat:</strong>{' '}
                  {aspectSnap.potensi_minat || '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
