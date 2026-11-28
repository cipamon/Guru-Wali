import React, { useState } from 'react';
import {
  User,
  MapPin,
  Users,
  Wallet,
  HeartPulse,
  GraduationCap,
  Crosshair,
  ExternalLink,
  Loader2,
  Lock,
} from 'lucide-react';
import { createEmptyBkDetail, resolveStudentInduk } from '../lib/firebase';
import type { PerwalianIndukData, WcStudent, WcUser } from '../types/waliconnect';

export type IndukSectionKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

interface PerwalianIndukFormProps {
  student: WcStudent;
  onChange: (next: WcStudent) => void;
  guruWaliUsers?: WcUser[];
  isStaff?: boolean;
  lockGuruWali?: boolean;
  readOnly?: boolean;
}

const SECTION_TABS: {
  id: IndukSectionKey;
  shortLabel: string;
  fullLabel: string;
  countLabel: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'A',
    shortLabel: 'A. Identitas & Kontak',
    fullLabel: 'A. Data Identitas & Kontak Siswa',
    countLabel: '12 Butir',
    icon: <User className="w-3.5 h-3.5" />,
  },
  {
    id: 'B',
    shortLabel: 'B. Alamat & Koordinat',
    fullLabel: 'B. Data Alamat, Domisili & Geografis (Koordinat)',
    countLabel: '13 Butir',
    icon: <MapPin className="w-3.5 h-3.5" />,
  },
  {
    id: 'C',
    shortLabel: 'C. Orang Tua & Wali',
    fullLabel: 'C. Data Orang Tua / Wali & Kontak Darurat',
    countLabel: '18 Butir',
    icon: <Users className="w-3.5 h-3.5" />,
  },
  {
    id: 'D',
    shortLabel: 'D. Sosial-Ekonomi',
    fullLabel: 'D. Data Sosial-Ekonomi & Bantuan Pendidikan',
    countLabel: '6 Butir',
    icon: <Wallet className="w-3.5 h-3.5" />,
  },
  {
    id: 'E',
    shortLabel: 'E. Kesehatan & Psikis',
    fullLabel: 'E. Data Kesehatan Fisik & Psikologis',
    countLabel: '7 Butir',
    icon: <HeartPulse className="w-3.5 h-3.5" />,
  },
  {
    id: 'F',
    shortLabel: 'F. Akademik & Minat',
    fullLabel: 'F. Data Akademik, Minat & Kebiasaan',
    countLabel: '10 Butir',
    icon: <GraduationCap className="w-3.5 h-3.5" />,
  },
];

const inputCls =
  'w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

export const PerwalianIndukForm: React.FC<PerwalianIndukFormProps> = ({
  student,
  onChange,
  guruWaliUsers = [],
  isStaff = true,
  lockGuruWali = false,
  readOnly = false,
}) => {
  const [activeTab, setActiveTab] = useState<IndukSectionKey>('A');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');

  const induk = resolveStudentInduk(student);

  const updateInduk = (patch: Partial<PerwalianIndukData>, studentPatch?: Partial<WcStudent>) => {
    const nextInduk: PerwalianIndukData = { ...induk, ...patch };
    const nextStudent: WcStudent = {
      ...student,
      ...(studentPatch || {}),
      perwalian_induk: nextInduk,
      bk_detail: {
        ...createEmptyBkDetail(),
        ...(student.bk_detail || {}),
        a1_nama_lengkap: studentPatch?.nama_lengkap ?? student.nama_lengkap,
        a2_nama_panggilan: studentPatch?.nama_panggilan ?? student.nama_panggilan,
        a4_agama: studentPatch?.agama ?? student.agama,
        a7_anak_ke: nextInduk.anak_ke,
        a8_jumlah_saudara: nextInduk.jumlah_saudara,
        a10_tinggal_bersama: nextInduk.status_tempat_tinggal,
        a11_jarak_rumah: nextInduk.jarak_tempuh_km
          ? `${nextInduk.jarak_tempuh_km} km`
          : student.bk_detail?.a11_jarak_rumah || '',
        a12_transportasi: nextInduk.moda_transportasi,
        a13_nama_ayah: studentPatch?.nama_ayah ?? student.nama_ayah,
        a14_pendidikan_pekerjaan_ayah: [
          nextInduk.pendidikan_ayah,
          studentPatch?.pekerjaan_ayah ?? student.pekerjaan_ayah,
        ]
          .filter(Boolean)
          .join(' / '),
        a15_nama_ibu: studentPatch?.nama_ibu ?? student.nama_ibu,
        a16_pendidikan_pekerjaan_ibu: [
          nextInduk.pendidikan_ibu,
          studentPatch?.pekerjaan_ibu ?? student.pekerjaan_ibu,
        ]
          .filter(Boolean)
          .join(' / '),
        a17_penghasilan_keluarga: nextInduk.penghasilan_ayah,
        a18_wali_kontak_darurat: [nextInduk.kontak_darurat_nama, nextInduk.kontak_darurat_hp]
          .filter(Boolean)
          .join(' - '),
        b_golongan_darah: nextInduk.golongan_darah,
        b_tinggi_berat:
          nextInduk.tinggi_badan_cm || nextInduk.berat_badan_kg
            ? `${nextInduk.tinggi_badan_cm || '-'} cm / ${nextInduk.berat_badan_kg || '-'} kg`
            : student.bk_detail?.b_tinggi_berat || '',
        b_riwayat_penyakit: nextInduk.riwayat_penyakit,
        b_alergi_pantangan: nextInduk.riwayat_alergi,
        b_kondisi_penglihatan_pendengaran: nextInduk.kebutuhan_alat_bantu,
        b_kondisi_psikis: nextInduk.kondisi_psikologis,
        c_mapel_disukai: nextInduk.mapel_disukai,
        c_mapel_sulit: nextInduk.mapel_sulit,
        c_prestasi_akademik: nextInduk.prestasi,
        c_fasilitas_belajar: nextInduk.kepemilikan_gawai_internet,
        d_organisasi_ekskul: nextInduk.ekskul_organisasi,
        d_masalah_pribadi_sosial: nextInduk.kerentanan_sosial,
        e_cita_cita: nextInduk.cita_cita,
        e_rencana_setelah_lulus: studentPatch?.rencana_lulus ?? student.rencana_lulus,
        e_pilihan_studi_kerja: studentPatch?.prodi_pilihan ?? student.prodi_pilihan,
      },
    };
    onChange(nextStudent);
  };

  const handleCaptureGps = () => {
    setGpsMsg('');
    if (!navigator.geolocation) {
      setGpsMsg('Browser Anda tidak mendukung fitur geolokasi GPS.');
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const coord = `${lat}, ${lng}`;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
        updateInduk({
          koordinat_rumah: coord,
          link_google_maps: mapsUrl,
        });
        setGpsMsg(`Titik koordinat berhasil diambil: ${coord}`);
        setGpsBusy(false);
      },
      (err) => {
        setGpsMsg(`Gagal mengambil GPS (${err.message}). Anda dapat mengisi koordinat secara manual.`);
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const resolvedMapsUrl =
    induk.link_google_maps ||
    (induk.koordinat_rumah.trim()
      ? `https://maps.google.com/?q=${encodeURIComponent(induk.koordinat_rumah.replace(/\s+/g, ''))}`
      : '');

  const currentTabMeta = SECTION_TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="space-y-4">
      {/* Section Tabs A-F */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70">
        {SECTION_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-900/60'
              }`}
            >
              {tab.icon}
              <span>{tab.shortLabel}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.countLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Header active section */}
      <div className="px-4 py-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/70 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-blue-800 dark:text-blue-200">
          {currentTabMeta.fullLabel}
        </p>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
          {readOnly && <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
          <span>{readOnly ? 'Mode Baca Saja (Data Terkunci)' : 'Buku Induk Siswa Perwalian'}</span>
        </span>
      </div>

      <fieldset
        disabled={readOnly}
        className="border-0 p-0 m-0 min-w-0 space-y-4 disabled:opacity-85"
      >
      {/* SECTION A: Identitas & Kontak (12 Butir + Info Kelas/Guru) */}
      {activeTab === 'A' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-xs font-semibold mb-1">
              1. Nama Lengkap Siswa (sesuai akta/ijazah) *
            </label>
            <input
              required
              type="text"
              value={student.nama_lengkap}
              onChange={(e) => onChange({ ...student, nama_lengkap: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">2. Nama Panggilan</label>
            <input
              type="text"
              value={student.nama_panggilan}
              onChange={(e) => onChange({ ...student, nama_panggilan: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              3. NIS (Nomor Induk Siswa) *
            </label>
            <input
              required
              type="text"
              value={student.nis}
              onChange={(e) => onChange({ ...student, nis: e.target.value })}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">
              4. NISN (Nomor Induk Siswa Nasional)
            </label>
            <input
              type="text"
              value={student.nisn}
              onChange={(e) => onChange({ ...student, nisn: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              5. NIK (Nomor Induk Kependudukan)
            </label>
            <input
              type="text"
              value={induk.nik}
              onChange={(e) => updateInduk({ nik: e.target.value })}
              placeholder="16 digit NIK sesuai KK"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">6. Tempat Lahir</label>
            <input
              type="text"
              value={student.tempat_lahir || ''}
              onChange={(e) => {
                const tempat = e.target.value;
                onChange({
                  ...student,
                  tempat_lahir: tempat,
                  ttl: [tempat.trim(), student.tanggal_lahir?.trim()].filter(Boolean).join(', '),
                });
              }}
              placeholder="Contoh: Jakarta"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">7. Tanggal Lahir</label>
            <input
              type="text"
              value={student.tanggal_lahir || ''}
              onChange={(e) => {
                const tgl = e.target.value;
                onChange({
                  ...student,
                  tanggal_lahir: tgl,
                  ttl: [student.tempat_lahir?.trim(), tgl.trim()].filter(Boolean).join(', '),
                });
              }}
              placeholder="Contoh: 14 Mei 2008"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">8. Jenis Kelamin</label>
            <select
              value={student.jenis_kelamin}
              onChange={(e) =>
                onChange({ ...student, jenis_kelamin: e.target.value as 'L' | 'P' })
              }
              className={inputCls}
            >
              <option value="L">Laki-Laki (L)</option>
              <option value="P">Perempuan (P)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">9. Agama</label>
            <select
              value={student.agama || 'Islam'}
              onChange={(e) => onChange({ ...student, agama: e.target.value })}
              className={inputCls}
            >
              <option value="Islam">Islam</option>
              <option value="Kristen Protestan">Kristen Protestan</option>
              <option value="Katolik">Katolik</option>
              <option value="Hindu">Hindu</option>
              <option value="Buddha">Buddha</option>
              <option value="Konghucu">Konghucu</option>
              <option value="Kepercayaan Lainnya">Kepercayaan Lainnya</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">
              10. Nomor HP / WhatsApp Aktif Siswa
            </label>
            <input
              type="text"
              value={student.whatsapp}
              onChange={(e) => onChange({ ...student, whatsapp: e.target.value })}
              placeholder="08xxxxxxxxxx"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              11. Alamat Email Aktif Siswa
            </label>
            <input
              type="email"
              value={student.email}
              onChange={(e) => onChange({ ...student, email: e.target.value })}
              placeholder="nama@email.com"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              12. Akun Media Sosial Siswa (Opsional)
            </label>
            <input
              type="text"
              value={induk.media_sosial}
              onChange={(e) => updateInduk({ media_sosial: e.target.value })}
              placeholder="Contoh: IG @nama / TikTok @nama"
              className={inputCls}
            />
          </div>

          {/* Informasi Kelas & Pendamping Sekolah */}
          <div className="sm:col-span-2 lg:col-span-3 pt-3 mt-1 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Kelas *</label>
              <input
                required
                type="text"
                value={student.kelas}
                onChange={(e) => onChange({ ...student, kelas: e.target.value })}
                placeholder="XI MIPA 1"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">No. Absen</label>
              <input
                type="text"
                value={student.no_absen || ''}
                onChange={(e) => onChange({ ...student, no_absen: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Status Siswa</label>
              <select
                disabled={!isStaff}
                value={student.status_siswa || 'Aktif'}
                onChange={(e) => onChange({ ...student, status_siswa: e.target.value })}
                className={`${inputCls} disabled:opacity-75`}
              >
                <option value="Aktif">Aktif</option>
                <option value="Pindah">Pindah</option>
                <option value="Lulus">Lulus</option>
                <option value="Cuti">Cuti</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Guru Wali Pendamping</label>
              {isStaff || guruWaliUsers.length > 0 ? (
                <select
                  disabled={!isStaff && lockGuruWali}
                  value={student.guru_wali_id || ''}
                  onChange={(e) => {
                    const chosen = guruWaliUsers.find((g) => g.id === e.target.value);
                    onChange({
                      ...student,
                      guru_wali_id: chosen ? chosen.id : '',
                      guru_wali_nama: chosen ? chosen.nama : '',
                    });
                  }}
                  className={`${inputCls} disabled:opacity-75`}
                >
                  <option value="">-- Pilih Guru Wali --</option>
                  {guruWaliUsers.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nama} ({g.role})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  readOnly
                  value={student.guru_wali_nama || 'Menunggu penetapan'}
                  className={inputCls}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Wali Kelas</label>
              <input
                type="text"
                value={student.wali_kelas || ''}
                onChange={(e) => onChange({ ...student, wali_kelas: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Guru BK</label>
              <input
                type="text"
                value={student.guru_bk || ''}
                onChange={(e) => onChange({ ...student, guru_bk: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION B: Alamat, Domisili & Geografis (13 Butir) */}
      {activeTab === 'B' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold mb-1">
                1. Alamat Lengkap sesuai Kartu Keluarga (KK) (Jalan, Gang/Blok, Nomor Rumah)
              </label>
              <input
                type="text"
                value={induk.alamat_kk}
                onChange={(e) =>
                  updateInduk(
                    { alamat_kk: e.target.value },
                    { alamat: e.target.value || student.alamat }
                  )
                }
                placeholder="Contoh: Jl. Cempaka Putih Tengah Blok B No. 18"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">2. RT / RW</label>
              <input
                type="text"
                value={induk.rt_rw}
                onChange={(e) => updateInduk({ rt_rw: e.target.value })}
                placeholder="004 / 007"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">3. Desa / Kelurahan</label>
              <input
                type="text"
                value={induk.kelurahan}
                onChange={(e) => updateInduk({ kelurahan: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">4. Kecamatan</label>
              <input
                type="text"
                value={induk.kecamatan}
                onChange={(e) => updateInduk({ kecamatan: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">5. Kabupaten / Kota</label>
              <input
                type="text"
                value={induk.kabupaten_kota}
                onChange={(e) => updateInduk({ kabupaten_kota: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">6. Kode Pos</label>
              <input
                type="text"
                value={induk.kode_pos}
                onChange={(e) => updateInduk({ kode_pos: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">8. Status Tempat Tinggal</label>
              <select
                value={induk.status_tempat_tinggal}
                onChange={(e) => updateInduk({ status_tempat_tinggal: e.target.value })}
                className={inputCls}
              >
                <option value="Tinggal bersama orang tua">Tinggal bersama orang tua</option>
                <option value="Tinggal bersama wali">Tinggal bersama wali</option>
                <option value="Tinggal bersama saudara">Tinggal bersama saudara</option>
                <option value="Indekos">Indekos</option>
                <option value="Asrama / Panti">Asrama / Panti</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold mb-1">
                7. Alamat Domisili Saat Ini (diisi jika tempat tinggal sekarang berbeda dengan KK, misal indekos/rumah saudara)
              </label>
              <input
                type="text"
                value={induk.alamat_domisili}
                onChange={(e) =>
                  updateInduk(
                    { alamat_domisili: e.target.value },
                    { alamat: e.target.value || induk.alamat_kk }
                  )
                }
                placeholder="Alamat tempat tinggal saat ini..."
                className={inputCls}
              />
            </div>
          </div>

          {/* Geografis & GPS */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Pemetaan Zonasi &amp; Kunjungan Rumah (Home Visit)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCaptureGps}
                  disabled={gpsBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                >
                  {gpsBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Crosshair className="w-3.5 h-3.5" />
                  )}
                  <span>Ambil Koordinat GPS Sekarang</span>
                </button>
                {resolvedMapsUrl && (
                  <a
                    href={resolvedMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka Google Maps</span>
                  </a>
                )}
              </div>
            </div>

            {gpsMsg && (
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                {gpsMsg}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  9. Titik Koordinat Rumah (Latitude, Longitude)
                </label>
                <input
                  type="text"
                  value={induk.koordinat_rumah}
                  onChange={(e) => {
                    const coord = e.target.value;
                    const cleaned = coord.replace(/\s+/g, '');
                    updateInduk({
                      koordinat_rumah: coord,
                      link_google_maps: cleaned
                        ? `https://maps.google.com/?q=${cleaned}`
                        : induk.link_google_maps,
                    });
                  }}
                  placeholder="-6.175392, 106.871234"
                  className={`${inputCls} font-mono-tabular`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">
                  10. Tautan (Link) Lokasi Google Maps Rumah
                </label>
                <input
                  type="text"
                  value={induk.link_google_maps}
                  onChange={(e) => updateInduk({ link_google_maps: e.target.value })}
                  placeholder="https://maps.google.com/?q=..."
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  11. Jarak Tempuh Rumah ke Sekolah (km)
                </label>
                <input
                  type="text"
                  value={induk.jarak_tempuh_km}
                  onChange={(e) => updateInduk({ jarak_tempuh_km: e.target.value })}
                  placeholder="Contoh: 4.5"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  12. Waktu Tempuh ke Sekolah (menit)
                </label>
                <input
                  type="text"
                  value={induk.waktu_tempuh_menit}
                  onChange={(e) => updateInduk({ waktu_tempuh_menit: e.target.value })}
                  placeholder="Contoh: 20"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  13. Moda Transportasi Utama ke Sekolah
                </label>
                <select
                  value={induk.moda_transportasi || ''}
                  onChange={(e) => updateInduk({ moda_transportasi: e.target.value })}
                  className={inputCls}
                >
                  <option value="">-- Pilih Moda Transportasi --</option>
                  <option value="Jalan kaki">Jalan kaki</option>
                  <option value="Sepeda">Sepeda</option>
                  <option value="Diantar orang tua">Diantar orang tua</option>
                  <option value="Angkutan umum">Angkutan umum</option>
                  <option value="Sepeda motor pribadi">Sepeda motor pribadi</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION C: Orang Tua / Wali & Kontak Darurat (18 Butir) */}
      {activeTab === 'C' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold mb-1">1. Nama Lengkap Ayah</label>
              <input
                type="text"
                value={student.nama_ayah}
                onChange={(e) => onChange({ ...student, nama_ayah: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">2. Status Ayah</label>
              <select
                value={induk.status_ayah}
                onChange={(e) => updateInduk({ status_ayah: e.target.value })}
                className={inputCls}
              >
                <option value="Masih hidup">Masih hidup</option>
                <option value="Meninggal dunia">Meninggal dunia</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                3. Nomor HP / WhatsApp Aktif Ayah
              </label>
              <input
                type="text"
                value={induk.hp_ayah}
                onChange={(e) =>
                  updateInduk(
                    { hp_ayah: e.target.value },
                    { kontak_ortu: e.target.value || student.kontak_ortu }
                  )
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                4. Pendidikan Terakhir Ayah
              </label>
              <input
                type="text"
                value={induk.pendidikan_ayah}
                onChange={(e) => updateInduk({ pendidikan_ayah: e.target.value })}
                placeholder="Contoh: SMA / S1 / S2"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">5. Pekerjaan Utama Ayah</label>
              <input
                type="text"
                value={student.pekerjaan_ayah}
                onChange={(e) => onChange({ ...student, pekerjaan_ayah: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                6. Penghasilan Rata-rata Ayah per Bulan
              </label>
              <input
                type="text"
                value={induk.penghasilan_ayah}
                onChange={(e) => updateInduk({ penghasilan_ayah: e.target.value })}
                placeholder="Contoh: Rp 5.000.000 - Rp 8.000.000"
                className={inputCls}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold mb-1">7. Nama Lengkap Ibu</label>
              <input
                type="text"
                value={student.nama_ibu}
                onChange={(e) => onChange({ ...student, nama_ibu: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">8. Status Ibu</label>
              <select
                value={induk.status_ibu}
                onChange={(e) => updateInduk({ status_ibu: e.target.value })}
                className={inputCls}
              >
                <option value="Masih hidup">Masih hidup</option>
                <option value="Meninggal dunia">Meninggal dunia</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                9. Nomor HP / WhatsApp Aktif Ibu
              </label>
              <input
                type="text"
                value={induk.hp_ibu}
                onChange={(e) =>
                  updateInduk(
                    { hp_ibu: e.target.value },
                    { kontak_ortu: student.kontak_ortu || e.target.value }
                  )
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                10. Pendidikan Terakhir Ibu
              </label>
              <input
                type="text"
                value={induk.pendidikan_ibu}
                onChange={(e) => updateInduk({ pendidikan_ibu: e.target.value })}
                placeholder="Contoh: SMA / D3 / S1"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">11. Pekerjaan Utama Ibu</label>
              <input
                type="text"
                value={student.pekerjaan_ibu}
                onChange={(e) => onChange({ ...student, pekerjaan_ibu: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                12. Penghasilan Rata-rata Ibu per Bulan
              </label>
              <input
                type="text"
                value={induk.penghasilan_ibu}
                onChange={(e) => updateInduk({ penghasilan_ibu: e.target.value })}
                placeholder="Contoh: Rp 3.000.000 - Rp 5.000.000"
                className={inputCls}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold mb-1">
                13. Nama Lengkap Wali (jika tidak tinggal dengan ortu)
              </label>
              <input
                type="text"
                value={induk.nama_wali}
                onChange={(e) => updateInduk({ nama_wali: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                14. Hubungan Wali dengan Siswa
              </label>
              <input
                type="text"
                value={induk.hubungan_wali}
                onChange={(e) => updateInduk({ hubungan_wali: e.target.value })}
                placeholder="Kakek/Nenek, Paman/Bibi, Kakak, Ibu/Bapak Kos"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                15. Nomor HP / WhatsApp Aktif Wali
              </label>
              <input
                type="text"
                value={induk.hp_wali}
                onChange={(e) => updateInduk({ hp_wali: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold mb-1">16. Alamat Lengkap Wali</label>
              <input
                type="text"
                value={induk.alamat_wali}
                onChange={(e) => updateInduk({ alamat_wali: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                17. Nama Kontak Darurat Lainnya (Kerabat / Tetangga)
              </label>
              <input
                type="text"
                value={induk.kontak_darurat_nama}
                onChange={(e) => updateInduk({ kontak_darurat_nama: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                18. Nomor HP Kontak Darurat Lainnya
              </label>
              <input
                type="text"
                value={induk.kontak_darurat_hp}
                onChange={(e) => updateInduk({ kontak_darurat_hp: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                Alamat Orang Tua (Ringkas)
              </label>
              <input
                type="text"
                value={student.alamat_ortu}
                onChange={(e) => onChange({ ...student, alamat_ortu: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION D: Sosial-Ekonomi & Bantuan Pendidikan (6 Butir) */}
      {activeTab === 'D' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-xs font-semibold mb-1">1a. Anak Ke-Berapa</label>
            <input
              type="text"
              value={induk.anak_ke}
              onChange={(e) => updateInduk({ anak_ke: e.target.value })}
              placeholder="Contoh: 1"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              1b. Jumlah Saudara Kandung
            </label>
            <input
              type="text"
              value={induk.jumlah_saudara}
              onChange={(e) => updateInduk({ jumlah_saudara: e.target.value })}
              placeholder="Contoh: 2"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              2. Status Kepemilikan Rumah Keluarga
            </label>
            <select
              value={induk.status_kepemilikan_rumah}
              onChange={(e) => updateInduk({ status_kepemilikan_rumah: e.target.value })}
              className={inputCls}
            >
              <option value="Milik sendiri">Milik sendiri</option>
              <option value="Sewa / Kontrak">Sewa / Kontrak</option>
              <option value="Menumpang">Menumpang</option>
              <option value="Rumah dinas">Rumah dinas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              3. Status Penerima Bantuan Sosial / Pendidikan
            </label>
            <select
              value={induk.penerima_bantuan}
              onChange={(e) => updateInduk({ penerima_bantuan: e.target.value })}
              className={inputCls}
            >
              <option value="Tidak">Tidak</option>
              <option value="Ya">Ya</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              4. Jenis Bantuan yang Diterima (KIP / PIP / PKH / KKS / Beasiswa)
            </label>
            <input
              type="text"
              value={induk.jenis_bantuan}
              onChange={(e) => updateInduk({ jenis_bantuan: e.target.value })}
              placeholder="KIP / PIP / PKH / KKS / Beasiswa Daerah / Swasta"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              5. Nomor Kartu Bantuan (Nomor KIP / KKS)
            </label>
            <input
              type="text"
              value={induk.no_kartu_bantuan}
              onChange={(e) => updateInduk({ no_kartu_bantuan: e.target.value })}
              placeholder="Jika ada"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold mb-1">
              6. Kendala Ekonomi Keluarga Saat Ini (uraian singkat jika orang tua mengalami PHK, sakit menahun, atau kesulitan biaya)
            </label>
            <textarea
              rows={2}
              value={induk.kendala_ekonomi}
              onChange={(e) => updateInduk({ kendala_ekonomi: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* SECTION E: Kesehatan Fisik & Psikologis (7 Butir) */}
      {activeTab === 'E' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-xs font-semibold mb-1">1. Golongan Darah</label>
            <select
              value={induk.golongan_darah}
              onChange={(e) => updateInduk({ golongan_darah: e.target.value })}
              className={inputCls}
            >
              <option value="">-- Pilih / Belum Tahu --</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="AB">AB</option>
              <option value="O">O</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">2a. Tinggi Badan (cm)</label>
            <input
              type="text"
              value={induk.tinggi_badan_cm}
              onChange={(e) => updateInduk({ tinggi_badan_cm: e.target.value })}
              placeholder="Contoh: 165"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">2b. Berat Badan (kg)</label>
            <input
              type="text"
              value={induk.berat_badan_kg}
              onChange={(e) => updateInduk({ berat_badan_kg: e.target.value })}
              placeholder="Contoh: 54"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold mb-1">
              3. Riwayat Penyakit Kronis / Bawaan (asma, epilepsi, jantung, diabetes, maag kronis, anemia)
            </label>
            <textarea
              rows={2}
              value={induk.riwayat_penyakit}
              onChange={(e) => updateInduk({ riwayat_penyakit: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              4. Riwayat Alergi (Obat-obatan / Makanan)
            </label>
            <textarea
              rows={2}
              value={induk.riwayat_alergi}
              onChange={(e) => updateInduk({ riwayat_alergi: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">
              5. Kebutuhan Alat Bantu Khusus (kacamata minus/silinder, alat bantu dengar, alat bantu gerak)
            </label>
            <textarea
              rows={2}
              value={induk.kebutuhan_alat_bantu}
              onChange={(e) => updateInduk({ kebutuhan_alat_bantu: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold mb-1">
              6. Kondisi Psikologis / Emosional (catatan pribadi siswa terkait tingkat stres, kecemasan, atau trauma yang perlu diketahui wali kelas)
            </label>
            <textarea
              rows={2}
              value={induk.kondisi_psikologis}
              onChange={(e) => updateInduk({ kondisi_psikologis: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold mb-1">
              7. Kerentanan Sosial di Kelas (riwayat mengalami perundungan / bullying atau kesulitan beradaptasi)
            </label>
            <textarea
              rows={2}
              value={induk.kerentanan_sosial}
              onChange={(e) => updateInduk({ kerentanan_sosial: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* SECTION F: Akademik, Minat & Kebiasaan (10 Butir) */}
      {activeTab === 'F' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-xs font-semibold mb-1">
              1. Asal Sekolah Sebelumnya (SMP/MTs atau Kelas Sebelumnya)
            </label>
            <input
              type="text"
              value={induk.asal_sekolah}
              onChange={(e) => updateInduk({ asal_sekolah: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              2. Mata Pelajaran yang Paling Disukai
            </label>
            <input
              type="text"
              value={induk.mapel_disukai}
              onChange={(e) => updateInduk({ mapel_disukai: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              3. Mata Pelajaran yang Dianggap Sulit
            </label>
            <input
              type="text"
              value={induk.mapel_sulit}
              onChange={(e) => updateInduk({ mapel_sulit: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              4. Kecenderungan Gaya Belajar
            </label>
            <select
              value={induk.gaya_belajar}
              onChange={(e) => updateInduk({ gaya_belajar: e.target.value })}
              className={inputCls}
            >
              <option value="Visual">Visual (Melihat / Membaca)</option>
              <option value="Auditori">Auditori (Mendengar / Diskusi)</option>
              <option value="Kinestetik">Kinestetik (Praktik / Bergerak)</option>
              <option value="Campuran">Campuran</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">5. Hobi &amp; Bakat Khusus</label>
            <input
              type="text"
              value={induk.hobi_bakat}
              onChange={(e) =>
                updateInduk({ hobi_bakat: e.target.value }, { hobi: e.target.value })
              }
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold mb-1">
              6. Prestasi Akademik / Non-Akademik yang Pernah Diraih
            </label>
            <textarea
              rows={2}
              value={induk.prestasi}
              onChange={(e) => updateInduk({ prestasi: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold mb-1">
              7. Ekstrakurikuler &amp; Organisasi yang Diikuti di Sekolah
            </label>
            <input
              type="text"
              value={induk.ekskul_organisasi}
              onChange={(e) => updateInduk({ ekskul_organisasi: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              8a. Cita-cita Profesi
            </label>
            <input
              type="text"
              value={induk.cita_cita}
              onChange={(e) => updateInduk({ cita_cita: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              8b. Rencana Setelah Lulus
            </label>
            <select
              value={student.rencana_lulus}
              onChange={(e) =>
                updateInduk(
                  {},
                  { rencana_lulus: e.target.value as 'Kuliah' | 'Bekerja' | 'Gap-year' }
                )
              }
              className={inputCls}
            >
              <option value="Kuliah">Kuliah</option>
              <option value="Bekerja">Bekerja</option>
              <option value="Gap-year">Gap-year</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              8c. Jurusan Kuliah / Bidang Kerja / Kedinasan
            </label>
            <input
              type="text"
              value={student.prodi_pilihan}
              onChange={(e) => updateInduk({}, { prodi_pilihan: e.target.value })}
              placeholder="Kuliah jurusan, wirausaha, atau TNI/Polri"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">
              9. Aktivitas Rutin di Luar Jam Sekolah (bimbel, kerja paruh waktu, bantu usaha ortu, mengasuh adik)
            </label>
            <textarea
              rows={2}
              value={induk.aktivitas_luar_sekolah}
              onChange={(e) => updateInduk({ aktivitas_luar_sekolah: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              10. Kepemilikan Gawai &amp; Akses Internet di Rumah
            </label>
            <textarea
              rows={2}
              value={induk.kepemilikan_gawai_internet}
              onChange={(e) => updateInduk({ kepemilikan_gawai_internet: e.target.value })}
              placeholder="HP milik sendiri / bergantian, ketersediaan kuota / Wi-Fi"
              className={inputCls}
            />
          </div>
        </div>
      )}
      </fieldset>
    </div>
  );
};
