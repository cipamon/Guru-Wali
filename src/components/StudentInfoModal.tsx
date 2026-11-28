import React, { useEffect, useState } from 'react';
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
  Lock,
  Unlock,
} from 'lucide-react';
import {
  calcAttendancePct,
  extractGoogleDriveFileId,
  normalizeExternalImageUrl,
} from '../lib/imageUtils';
import { getSnapshotForPeriode, normalizeEvaluasiPeriode } from '../lib/aspectPeriods';
import { resolveStudentInduk } from '../lib/firebase';
import { SmartPhoto } from './SmartPhoto';
import type { WcStudent } from '../types/waliconnect';

interface StudentInfoModalProps {
  student: WcStudent | null;
  onClose: () => void;
  onEdit?: (student: WcStudent) => void;
  canEdit?: boolean;
  onToggleLock?: (student: WcStudent) => Promise<void> | void;
  logsCount?: number;
}

type InfoSectionTab = 'ringkasan' | 'A_B' | 'C_D' | 'E_F';

export const StudentInfoModal: React.FC<StudentInfoModalProps> = ({
  student,
  onClose,
  onEdit,
  canEdit = true,
  onToggleLock,
  logsCount,
}) => {
  const [infoTab, setInfoTab] = useState<InfoSectionTab>('ringkasan');

  useEffect(() => {
    if (!student) return;
    setInfoTab('ringkasan');
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
  const ind = resolveStudentInduk(student);

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

  const mapsHref =
    ind.link_google_maps ||
    (ind.koordinat_rumah.trim()
      ? `https://maps.google.com/?q=${encodeURIComponent(ind.koordinat_rumah.replace(/\s+/g, ''))}`
      : '');

  const statusColor =
    (student.status_siswa || 'Aktif') === 'Aktif'
      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';

  const renderField = (label: string, val?: string) => (
    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
      <p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="font-semibold text-slate-900 dark:text-white mt-0.5 break-words">
        {val || '-'}
      </p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Informasi Siswa ${student.nama_lengkap}`}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Buku Induk &amp; Informasi Lengkap Siswa
              </span>
              <span
                className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusColor}`}
              >
                {student.status_siswa || 'Aktif'}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                  student.data_locked
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {student.data_locked ? (
                  <>
                    <Lock className="w-2.5 h-2.5" />
                    <span>Data Terkunci</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-2.5 h-2.5" />
                    <span>Akses Terbuka</span>
                  </>
                )}
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
              {ind.nik ? ` · NIK ${ind.nik}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {onToggleLock && (
              <button
                type="button"
                onClick={() => onToggleLock(student)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border ${
                  student.data_locked
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                }`}
              >
                {student.data_locked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Buka Kunci</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Kunci Data</span>
                  </>
                )}
              </button>
            )}
            {onEdit && canEdit !== false && (
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
            {onEdit && canEdit === false && student.data_locked && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                <Lock className="w-3 h-3" />
                <span>Terkunci</span>
              </span>
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

        {/* Sub-tab Switcher */}
        <div className="px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-1.5">
          {[
            { id: 'ringkasan', label: 'Ringkasan & 5 Aspek' },
            { id: 'A_B', label: 'A–B: Identitas, Alamat & GPS' },
            { id: 'C_D', label: 'C–D: Ortu/Wali & Sosio-Ekonomi' },
            { id: 'E_F', label: 'E–F: Kesehatan & Akademik/Minat' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setInfoTab(t.id as InfoSectionTab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                infoTab === t.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {infoTab === 'ringkasan' && (
            <>
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

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">NIS / NISN / NIK</p>
                    <p className="font-bold font-mono-tabular text-slate-900 dark:text-white mt-0.5">
                      {student.nis || '-'} / {student.nisn || '-'}
                    </p>
                    {ind.nik && <p className="text-[11px] text-slate-500 font-mono-tabular">NIK: {ind.nik}</p>}
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
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> Guru BK
                    </p>
                    <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                      {student.guru_bk || '-'}
                    </p>
                  </div>
                  <div className="sm:col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Alamat Domisili
                      </p>
                      <p className="font-medium text-slate-900 dark:text-white mt-0.5">
                        {ind.alamat_domisili || student.alamat || '-'}
                      </p>
                    </div>
                    {mapsHref && (
                      <a
                        href={mapsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Google Maps</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    {student.hobi || ind.hobi_bakat || '-'}
                    {typeof logsCount === 'number' ? ` · ${logsCount} jurnal` : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <h4 className="font-bold text-slate-900 dark:text-white">
                    Refleksi &amp; Catatan Khusus (Lampiran A)
                  </h4>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong>Deskripsi:</strong> {student.deskripsi_diri || '-'}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    <strong>Langkah:</strong> {student.langkah_pencapaian || '-'}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <h4 className="font-bold text-slate-900 dark:text-white">
                    Evaluasi 5 Aspek ({activePeriode})
                  </h4>
                  <p><strong>Akademik:</strong> {aspectSnap.akademik || '-'}</p>
                  <p><strong>Karakter:</strong> {aspectSnap.karakter || '-'}</p>
                  <p><strong>Sosial-Emosional:</strong> {aspectSnap.sosial_emosional || '-'}</p>
                  <p><strong>Kedisiplinan:</strong> {aspectSnap.kedisiplinan || '-'}</p>
                  <p><strong>Potensi &amp; Minat:</strong> {aspectSnap.potensi_minat || '-'}</p>
                </div>
              </div>
            </>
          )}

          {infoTab === 'A_B' && (
            <div className="space-y-5">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2.5">
                  A. Data Identitas &amp; Kontak Siswa (12 Butir)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {renderField('1. Nama Lengkap', student.nama_lengkap)}
                  {renderField('2. Nama Panggilan', student.nama_panggilan)}
                  {renderField('3. NIS', student.nis)}
                  {renderField('4. NISN', student.nisn)}
                  {renderField('5. NIK', ind.nik)}
                  {renderField('6–7. Tempat, Tanggal Lahir', ttlDisplay)}
                  {renderField('8. Jenis Kelamin', student.jenis_kelamin === 'P' ? 'Perempuan' : 'Laki-laki')}
                  {renderField('9. Agama', student.agama)}
                  {renderField('10. HP / WhatsApp Siswa', student.whatsapp)}
                  {renderField('11. Email Aktif', student.email)}
                  {renderField('12. Akun Media Sosial', ind.media_sosial)}
                  {renderField('Kelas / Absen', `${student.kelas} / Absen ${student.no_absen || '-'}`)}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <h4 className="font-bold text-slate-900 dark:text-white">
                    B. Data Alamat, Domisili &amp; Geografis (13 Butir)
                  </h4>
                  {mapsHref && (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Buka Lokasi Google Maps</span>
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">{renderField('1. Alamat Sesuai KK', ind.alamat_kk)}</div>
                  {renderField('2. RT / RW', ind.rt_rw)}
                  {renderField('3. Desa / Kelurahan', ind.kelurahan)}
                  {renderField('4. Kecamatan', ind.kecamatan)}
                  {renderField('5. Kabupaten / Kota', ind.kabupaten_kota)}
                  {renderField('6. Kode Pos', ind.kode_pos)}
                  <div className="sm:col-span-2">{renderField('7. Alamat Domisili Saat Ini', ind.alamat_domisili)}</div>
                  {renderField('8. Status Tempat Tinggal', ind.status_tempat_tinggal)}
                  {renderField('9. Titik Koordinat (Lat, Lng)', ind.koordinat_rumah)}
                  {renderField('10. Tautan Google Maps', ind.link_google_maps)}
                  {renderField('11. Jarak Tempuh ke Sekolah', ind.jarak_tempuh_km ? `${ind.jarak_tempuh_km} km` : '-')}
                  {renderField('12. Waktu Tempuh', ind.waktu_tempuh_menit ? `${ind.waktu_tempuh_menit} menit` : '-')}
                  {renderField('13. Moda Transportasi Utama', ind.moda_transportasi)}
                </div>
              </div>
            </div>
          )}

          {infoTab === 'C_D' && (
            <div className="space-y-5">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2.5">
                  C. Data Orang Tua / Wali &amp; Kontak Darurat (18 Butir)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {renderField('1. Nama Lengkap Ayah', student.nama_ayah)}
                  {renderField('2. Status Ayah', ind.status_ayah)}
                  {renderField('3. HP / WhatsApp Ayah', ind.hp_ayah)}
                  {renderField('4. Pendidikan Ayah', ind.pendidikan_ayah)}
                  {renderField('5. Pekerjaan Ayah', student.pekerjaan_ayah)}
                  {renderField('6. Penghasilan Ayah/Bulan', ind.penghasilan_ayah)}
                  {renderField('7. Nama Lengkap Ibu', student.nama_ibu)}
                  {renderField('8. Status Ibu', ind.status_ibu)}
                  {renderField('9. HP / WhatsApp Ibu', ind.hp_ibu)}
                  {renderField('10. Pendidikan Ibu', ind.pendidikan_ibu)}
                  {renderField('11. Pekerjaan Ibu', student.pekerjaan_ibu)}
                  {renderField('12. Penghasilan Ibu/Bulan', ind.penghasilan_ibu)}
                  {renderField('13. Nama Wali', ind.nama_wali)}
                  {renderField('14. Hubungan Wali', ind.hubungan_wali)}
                  {renderField('15. HP / WhatsApp Wali', ind.hp_wali)}
                  <div className="sm:col-span-3">{renderField('16. Alamat Lengkap Wali', ind.alamat_wali)}</div>
                  {renderField('17. Nama Kontak Darurat Lainnya', ind.kontak_darurat_nama)}
                  {renderField('18. HP Kontak Darurat Lainnya', ind.kontak_darurat_hp)}
                  {renderField('Kontak Utama Ortu', student.kontak_ortu)}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2.5">
                  D. Data Sosial-Ekonomi &amp; Bantuan Pendidikan (6 Butir)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {renderField('1. Anak Ke / Jumlah Saudara', `Anak ke-${ind.anak_ke || '-'} dari ${ind.jumlah_saudara || '-'} bersaudara`)}
                  {renderField('2. Kepemilikan Rumah Keluarga', ind.status_kepemilikan_rumah)}
                  {renderField('3. Penerima Bantuan Sosial/Pendidikan', ind.penerima_bantuan)}
                  {renderField('4. Jenis Bantuan', ind.jenis_bantuan)}
                  {renderField('5. Nomor Kartu Bantuan (KIP/KKS)', ind.no_kartu_bantuan)}
                  {renderField('6. Kendala Ekonomi Keluarga', ind.kendala_ekonomi)}
                </div>
              </div>
            </div>
          )}

          {infoTab === 'E_F' && (
            <div className="space-y-5">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2.5">
                  E. Data Kesehatan Fisik &amp; Psikologis (7 Butir)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {renderField('1. Golongan Darah', ind.golongan_darah)}
                  {renderField('2. Tinggi / Berat Badan', `${ind.tinggi_badan_cm || '-'} cm / ${ind.berat_badan_kg || '-'} kg`)}
                  {renderField('5. Kebutuhan Alat Bantu Khusus', ind.kebutuhan_alat_bantu)}
                  <div className="sm:col-span-3">{renderField('3. Riwayat Penyakit Kronis / Bawaan', ind.riwayat_penyakit)}</div>
                  <div className="sm:col-span-3">{renderField('4. Riwayat Alergi (Obat / Makanan)', ind.riwayat_alergi)}</div>
                  <div className="sm:col-span-3">{renderField('6. Kondisi Psikologis / Emosional', ind.kondisi_psikologis)}</div>
                  <div className="sm:col-span-3">{renderField('7. Kerentanan Sosial di Kelas', ind.kerentanan_sosial)}</div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2.5">
                  F. Data Akademik, Minat &amp; Kebiasaan (10 Butir)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {renderField('1. Asal Sekolah Sebelumnya', ind.asal_sekolah)}
                  {renderField('2. Mapel Paling Disukai', ind.mapel_disukai)}
                  {renderField('3. Mapel Dianggap Sulit', ind.mapel_sulit)}
                  {renderField('4. Gaya Belajar', ind.gaya_belajar)}
                  {renderField('5. Hobi & Bakat Khusus', student.hobi || ind.hobi_bakat)}
                  {renderField('8. Cita-cita & Rencana Lulus', `${ind.cita_cita || '-'} · ${student.rencana_lulus || '-'} (${student.prodi_pilihan || '-'})`)}
                  <div className="sm:col-span-3">{renderField('6. Prestasi Akademik / Non-Akademik', ind.prestasi)}</div>
                  <div className="sm:col-span-3">{renderField('7. Ekstrakurikuler & Organisasi', ind.ekskul_organisasi)}</div>
                  <div className="sm:col-span-2">{renderField('9. Aktivitas Rutin di Luar Sekolah', ind.aktivitas_luar_sekolah)}</div>
                  {renderField('10. Kepemilikan Gawai & Internet', ind.kepemilikan_gawai_internet)}
                </div>
              </div>
            </div>
          )}
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
