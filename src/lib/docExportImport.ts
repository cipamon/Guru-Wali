import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { calcAttendancePct, getImageCandidateUrls, normalizeExternalImageUrl } from './imageUtils';
import {
  EVALUASI_PERIODES,
  getSnapshotForPeriode,
  normalizeEvaluasiPeriode,
} from './aspectPeriods';
import {
  createEmptyPerwalianInduk,
  createEmptyStudent,
  resolveStudentInduk,
} from './firebase';
import type {
  EvaluasiPeriode,
  KopLine,
  PaperOrientation,
  PrintDocumentType,
  SheetKey,
  SignatureRow,
  SignatureSettings,
  WcLog,
  WcPrintConfig,
  WcStudent,
  WcUser,
} from '../types/waliconnect';

// ---------- Shared Download & Signature Helpers ----------

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function getSignatureForOrientation(
  config: WcPrintConfig,
  orientation: PaperOrientation
): SignatureSettings {
  if (orientation === 'landscape' && config.ttd_landscape) {
    return config.ttd_landscape;
  }
  return {
    ttd_layout: config.ttd_layout,
    ttd_offset_x: config.ttd_offset_x ?? 0,
    ttd_left_offset_x: config.ttd_left_offset_x ?? 0,
    ttd_right_offset_x: config.ttd_right_offset_x ?? 0,
    ttd_spacer: config.ttd_spacer ?? 48,
    ttd_align: config.ttd_align ?? 'left',
    ttd_left_rows: config.ttd_left_rows || [],
    ttd_right_rows: config.ttd_right_rows || [],
  };
}

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function formatTanggalIndonesia(date: Date = new Date()): string {
  return `${date.getDate()} ${INDONESIAN_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function extractKotaCetak(tempatTanggal?: string): string {
  if (!tempatTanggal) return '';
  const commaIdx = tempatTanggal.indexOf(',');
  return commaIdx >= 0 ? tempatTanggal.slice(0, commaIdx).trim() : '';
}

export function resolvePrintTempatTanggal(config: WcPrintConfig): string {
  const mode = config.tanggal_cetak_mode ?? 'auto';
  const kota =
    config.kota_cetak !== undefined
      ? config.kota_cetak.trim()
      : extractKotaCetak(config.tempat_tanggal);
  const todayStr = formatTanggalIndonesia(new Date());
  if (mode === 'auto') {
    return kota ? `${kota}, ${todayStr}` : todayStr;
  }
  const manual = config.tempat_tanggal?.trim();
  if (manual) return manual;
  return kota ? `${kota}, ${todayStr}` : todayStr;
}

export function buildAutoRightSignatureRows(
  config: WcPrintConfig,
  currentUser?: WcUser | null
): SignatureRow[] {
  const dateText = resolvePrintTempatTanggal(config);
  if (!currentUser) {
    return [
      { id: 'auto-r1', text: dateText, bold: false, underline: false },
      { id: 'auto-r2', text: 'Guru Wali Pendamping,', bold: true, underline: false },
      {
        id: 'auto-r3',
        text: config.nama_guru_wali || '-',
        bold: true,
        underline: true,
        spacerBefore: true,
      },
      { id: 'auto-r4', text: `NIP. ${config.nip_guru_wali || '-'}`, bold: false, underline: false },
    ];
  }

  const customJabatan = currentUser.jabatan?.trim();
  const defaultRoleLabel =
    currentUser.role === 'Guru Wali'
      ? 'Guru Wali Pendamping'
      : currentUser.role === 'Admin'
        ? 'Administrator / Pengelola'
        : currentUser.role === 'Siswa'
          ? 'Peserta Didik'
          : 'Orang Tua / Wali Murid';
  const roleText = customJabatan
    ? customJabatan.endsWith(',')
      ? customJabatan
      : `${customJabatan},`
    : `${defaultRoleLabel},`;
  const idPrefix =
    currentUser.role === 'Siswa'
      ? 'NIS.'
      : currentUser.role === 'Orang Tua'
        ? 'ID.'
        : 'NIP.';

  return [
    { id: 'auto-r1', text: dateText, bold: false, underline: false },
    { id: 'auto-r2', text: roleText, bold: true, underline: false },
    {
      id: 'auto-r3',
      text: currentUser.nama || config.nama_guru_wali || '-',
      bold: true,
      underline: true,
      spacerBefore: true,
    },
    {
      id: 'auto-r4',
      text: `${idPrefix} ${currentUser.nip || '-'}`,
      bold: false,
      underline: false,
    },
  ];
}

function applyAccountNameAndNipToManualRows(
  rows: SignatureRow[],
  config: WcPrintConfig,
  currentUser: WcUser
): SignatureRow[] {
  if (rows.length === 0) {
    return buildAutoRightSignatureRows(config, currentUser);
  }
  const userName = currentUser.nama?.trim() || config.nama_guru_wali || '-';
  const idPrefix =
    currentUser.role === 'Siswa'
      ? 'NIS.'
      : currentUser.role === 'Orang Tua'
        ? 'ID.'
        : 'NIP.';
  const userNipValue = currentUser.nip?.trim() || '-';

  const hasPlaceholders = rows.some(
    (r) => /\{nama\}|\{nip\}/i.test(r.text || '')
  );
  if (hasPlaceholders) {
    return rows.map((r) => ({
      ...r,
      text: (r.text || '')
        .replace(/\{nama\}/gi, userName)
        .replace(/\{nip\}/gi, userNipValue),
    }));
  }

  let nipIdx = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (/^\s*(NIP|NUPTK|NISN?|ID)\b/i.test(rows[i].text || '')) {
      nipIdx = i;
      break;
    }
  }

  let nameIdx = -1;
  if (nipIdx > 0) {
    nameIdx = nipIdx - 1;
  } else {
    const spacedIdx = rows.findIndex((r, idx) => idx > 0 && Boolean(r.spacerBefore));
    if (spacedIdx >= 0) {
      nameIdx = spacedIdx;
    } else if (rows.length >= 2 && nipIdx === -1) {
      nameIdx = rows.length - 1;
    }
  }

  return rows.map((r, idx) => {
    if (idx === nameIdx) {
      return { ...r, text: userName };
    }
    if (idx === nipIdx) {
      const prefixMatch = (r.text || '').match(/^\s*(NIP\.?|NUPTK\.?|NISN?\.?|ID\.?)/i);
      const effectivePrefix =
        currentUser.role === 'Siswa' || currentUser.role === 'Orang Tua'
          ? idPrefix
          : prefixMatch?.[1] || idPrefix;
      return { ...r, text: `${effectivePrefix} ${userNipValue}` };
    }
    return r;
  });
}

export function resolveSignatureColumns(
  config: WcPrintConfig,
  orientation: PaperOrientation,
  currentUser?: WcUser | null
): { sig: SignatureSettings; leftRows: SignatureRow[]; rightRows: SignatureRow[] } {
  const sig = getSignatureForOrientation(config, orientation);
  const dateMode = config.tanggal_cetak_mode ?? 'auto';
  const rightMode = config.ttd_kanan_mode ?? 'auto_user';
  const dateText = resolvePrintTempatTanggal(config);

  const applyDateToRowZero = (rows: SignatureRow[]): SignatureRow[] => {
    if (dateMode !== 'auto' || rows.length === 0) return rows;
    const hasDatePlaceholder = rows.some((r) => /\{tanggal\}/i.test(r.text || ''));
    if (hasDatePlaceholder) {
      return rows.map((r) => ({
        ...r,
        text: (r.text || '').replace(/\{tanggal\}/gi, dateText),
      }));
    }
    return rows.map((r, idx) => (idx === 0 ? { ...r, text: dateText } : r));
  };

  const leftRows =
    sig.ttd_layout === 'guru_kepsek'
      ? applyDateToRowZero(sig.ttd_right_rows)
      : sig.ttd_left_rows;
  let rightRows =
    sig.ttd_layout === 'guru_kepsek'
      ? sig.ttd_left_rows
      : applyDateToRowZero(sig.ttd_right_rows);

  if (rightMode === 'auto_user' && currentUser) {
    rightRows = applyAccountNameAndNipToManualRows(rightRows, config, currentUser);
  }

  return { sig, leftRows, rightRows };
}

function splitTempatTanggalLahir(st: WcStudent): { tempat: string; tanggal: string } {
  if (st.tempat_lahir || st.tanggal_lahir) {
    return {
      tempat: st.tempat_lahir || '',
      tanggal: st.tanggal_lahir || '',
    };
  }
  const raw = (st.ttl || '').trim();
  if (!raw) return { tempat: '', tanggal: '' };
  const commaIdx = raw.indexOf(',');
  if (commaIdx === -1) return { tempat: raw, tanggal: '' };
  return {
    tempat: raw.slice(0, commaIdx).trim(),
    tanggal: raw.slice(commaIdx + 1).trim(),
  };
}

function formatExcelCellValue(val: unknown, isDateHint = false): string {
  if (val === null || val === undefined) return '';
  if (isDateHint && typeof val === 'number' && val > 1000 && val < 90000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const months = [
        'Januari',
        'Februari',
        'Maret',
        'April',
        'Mei',
        'Juni',
        'Juli',
        'Agustus',
        'September',
        'Oktober',
        'November',
        'Desember',
      ];
      const monthName = months[parsed.m - 1] || String(parsed.m).padStart(2, '0');
      return `${String(parsed.d).padStart(2, '0')} ${monthName} ${parsed.y}`;
    }
  }
  return String(val).trim();
}

function getStudentExportColumns(st: WcStudent): Record<string, string | number> {
  const { tempat, tanggal } = splitTempatTanggalLahir(st);
  const ind = resolveStudentInduk(st);
  return {
    NIS: st.nis,
    NISN: st.nisn,
    Nama: st.nama_lengkap,
    Kelas: st.kelas,
    'No Absen': st.no_absen || '',
    Tempat: tempat,
    'Tanggal Lahir': tanggal,
    Email: st.email,
    Foto: st.foto_url || '',
    ALAMAT: st.alamat,
    NO_HP: st.whatsapp,
    JENIS_KELAMIN: st.jenis_kelamin,
    Status: st.status_siswa || 'Aktif',
    'Wali Kelas': st.wali_kelas || '',
    'Guru BK': st.guru_bk || '',
    'Guru Wali': st.guru_wali_nama || '',
    // A. Identitas & Kontak
    'Nama Panggilan': st.nama_panggilan,
    NIK: ind.nik,
    Agama: st.agama,
    'Media Sosial': ind.media_sosial,
    // B. Alamat, Domisili & Koordinat
    'Alamat KK': ind.alamat_kk,
    'RT / RW': ind.rt_rw,
    'Desa / Kelurahan': ind.kelurahan,
    Kecamatan: ind.kecamatan,
    'Kabupaten / Kota': ind.kabupaten_kota,
    'Kode Pos': ind.kode_pos,
    'Alamat Domisili': ind.alamat_domisili,
    'Status Tempat Tinggal': ind.status_tempat_tinggal,
    'Koordinat Rumah': ind.koordinat_rumah,
    'Link Google Maps': ind.link_google_maps,
    'Jarak Tempuh (km)': ind.jarak_tempuh_km,
    'Waktu Tempuh (menit)': ind.waktu_tempuh_menit,
    'Moda Transportasi': ind.moda_transportasi,
    // C. Orang Tua / Wali & Kontak Darurat
    'Nama Ayah': st.nama_ayah,
    'Status Ayah': ind.status_ayah,
    'HP Ayah': ind.hp_ayah,
    'Pendidikan Ayah': ind.pendidikan_ayah,
    'Pekerjaan Ayah': st.pekerjaan_ayah,
    'Penghasilan Ayah': ind.penghasilan_ayah,
    'Nama Ibu': st.nama_ibu,
    'Status Ibu': ind.status_ibu,
    'HP Ibu': ind.hp_ibu,
    'Pendidikan Ibu': ind.pendidikan_ibu,
    'Pekerjaan Ibu': st.pekerjaan_ibu,
    'Penghasilan Ibu': ind.penghasilan_ibu,
    'Nama Wali': ind.nama_wali,
    'Hubungan Wali': ind.hubungan_wali,
    'HP Wali': ind.hp_wali,
    'Alamat Wali': ind.alamat_wali,
    'Kontak Darurat Nama': ind.kontak_darurat_nama,
    'Kontak Darurat HP': ind.kontak_darurat_hp,
    'Alamat Orang Tua': st.alamat_ortu,
    'Kontak Orang Tua': st.kontak_ortu,
    // D. Sosial-Ekonomi & Bantuan
    'Anak Ke': ind.anak_ke,
    'Jumlah Saudara': ind.jumlah_saudara,
    'Kepemilikan Rumah': ind.status_kepemilikan_rumah,
    'Penerima Bantuan': ind.penerima_bantuan,
    'Jenis Bantuan': ind.jenis_bantuan,
    'No Kartu Bantuan': ind.no_kartu_bantuan,
    'Kendala Ekonomi': ind.kendala_ekonomi,
    // E. Kesehatan Fisik & Psikologis
    'Golongan Darah': ind.golongan_darah,
    'Tinggi Badan (cm)': ind.tinggi_badan_cm,
    'Berat Badan (kg)': ind.berat_badan_kg,
    'Riwayat Penyakit': ind.riwayat_penyakit,
    'Riwayat Alergi': ind.riwayat_alergi,
    'Alat Bantu Khusus': ind.kebutuhan_alat_bantu,
    'Kondisi Psikologis': ind.kondisi_psikologis,
    'Kerentanan Sosial': ind.kerentanan_sosial,
    // F. Akademik, Minat & Kebiasaan
    'Asal Sekolah': ind.asal_sekolah,
    'Mapel Disukai': ind.mapel_disukai,
    'Mapel Sulit': ind.mapel_sulit,
    'Gaya Belajar': ind.gaya_belajar,
    Hobi: st.hobi || ind.hobi_bakat,
    Prestasi: ind.prestasi,
    'Ekskul & Organisasi': ind.ekskul_organisasi,
    'Cita-cita': ind.cita_cita,
    'Rencana Pasca Lulus': st.rencana_lulus,
    'Program Studi / Bidang': st.prodi_pilihan,
    'Aktivitas Luar Sekolah': ind.aktivitas_luar_sekolah,
    'Gawai & Akses Internet': ind.kepemilikan_gawai_internet,
    'Deskripsi Diri': st.deskripsi_diri,
    'Langkah Pencapaian': st.langkah_pencapaian,
    'Catatan Khusus': st.catatan_khusus,
    'Kehadiran (%)': calcAttendancePct(st.kehadiran),
  };
}

const STUDENT_TEMPLATE_SAMPLE: Record<string, string> = {
  NIS: '20241199',
  NISN: '0081234599',
  Nama: 'Aulia Rahman',
  Kelas: 'XI MIPA 2',
  'No Absen': '04',
  Tempat: 'Jakarta',
  'Tanggal Lahir': '10 Mei 2008',
  Email: 'aulia.rahman@student.sch.id',
  Foto: '',
  ALAMAT: 'Jl. Melati No. 12, Jakarta',
  NO_HP: '081234567890',
  JENIS_KELAMIN: 'L',
  Status: 'Aktif',
  'Wali Kelas': 'Dra. Ratna Sari Dewi, M.Pd.',
  'Guru BK': 'Drs. Wahyu Pratama, M.Psi.',
  NIK: '3171051005080001',
  Agama: 'Islam',
  'Nama Panggilan': 'Aulia',
  'Media Sosial': '@aulia.rahman',
  'Alamat KK': 'Jl. Melati No. 12',
  'RT / RW': '002 / 005',
  'Desa / Kelurahan': 'Menteng',
  Kecamatan: 'Menteng',
  'Kabupaten / Kota': 'Jakarta Pusat',
  'Kode Pos': '10310',
  'Status Tempat Tinggal': 'Tinggal bersama orang tua',
  'Koordinat Rumah': '-6.193125, 106.832145',
  'Jarak Tempuh (km)': '3.5',
  'Waktu Tempuh (menit)': '15',
  'Moda Transportasi': 'Diantar orang tua',
  'Nama Ayah': 'Ahmad Rahman',
  'Status Ayah': 'Masih hidup',
  'HP Ayah': '081234567891',
  'Pendidikan Ayah': 'S1',
  'Pekerjaan Ayah': 'Pegawai Swasta',
  'Penghasilan Ayah': 'Rp 6.000.000',
  'Nama Ibu': 'Siti Aminah',
  'Status Ibu': 'Masih hidup',
  'HP Ibu': '081234567892',
  'Pendidikan Ibu': 'S1',
  'Pekerjaan Ibu': 'Ibu Rumah Tangga',
  'Golongan Darah': 'O',
  'Tinggi Badan (cm)': '168',
  'Berat Badan (kg)': '58',
  'Asal Sekolah': 'SMPN 1 Jakarta',
  'Mapel Disukai': 'Matematika',
  'Gaya Belajar': 'Visual',
  'Rencana Pasca Lulus': 'Kuliah',
  'Program Studi / Bidang': 'Teknik Sipil',
};

function mapRowToStudent(raw: Record<string, unknown>, idx: number): WcStudent | null {
  const normMap = new Map<string, { val: unknown; str: string }>();
  Object.entries(raw).forEach(([k, v]) => {
    const normKey = k.trim().toLowerCase().replace(/\s+/g, ' ');
    normMap.set(normKey, { val: v, str: String(v ?? '').trim() });
  });

  const pick = (...aliases: string[]): string => {
    for (const a of aliases) {
      const hit = normMap.get(a.toLowerCase());
      if (hit && hit.str !== '') return hit.str;
    }
    return '';
  };

  const pickDate = (...aliases: string[]): string => {
    for (const a of aliases) {
      const hit = normMap.get(a.toLowerCase());
      if (hit && hit.str !== '') return formatExcelCellValue(hit.val, true);
    }
    return '';
  };

  const namaLengkap = pick('nama', 'nama lengkap', 'nama murid', 'nama siswa');
  const kelas = pick('kelas');
  const nis = pick('nis') || `IMP${Date.now().toString().slice(-5)}${idx + 1}`;

  if (!namaLengkap && !kelas && !pick('nis')) return null;

  const base = createEmptyStudent(`std-imp-${Date.now()}-${idx}`);
  const emptyInduk = createEmptyPerwalianInduk();
  const jkRaw = pick('jenis_kelamin', 'jenis kelamin', 'jenis kelamin (l/p)', 'l/p', 'jk').toUpperCase();
  const jenisKelamin: 'L' | 'P' = jkRaw.startsWith('P') || jkRaw.includes('WANITA') ? 'P' : 'L';

  const rencanaRaw = pick('rencana pasca lulus', 'rencana lulus', 'rencana');
  let rencanaLulus: 'Kuliah' | 'Bekerja' | 'Gap-year' | '' = 'Kuliah';
  if (/bekerja|kerja/i.test(rencanaRaw)) rencanaLulus = 'Bekerja';
  else if (/gap/i.test(rencanaRaw)) rencanaLulus = 'Gap-year';
  else if (/kuliah/i.test(rencanaRaw)) rencanaLulus = 'Kuliah';

  const namaPanggilan = pick('nama panggilan', 'panggilan') || namaLengkap.split(' ')[0] || '';
  const tempatLahir = pick('tempat', 'tempat lahir', 'tempat_lahir');
  const tanggalLahir = pickDate('tanggal lahir', 'tgl lahir', 'tanggal_lahir', 'tgl_lahir');
  const ttlRaw = pick('tempat, tanggal lahir', 'ttl');
  const ttl = [tempatLahir, tanggalLahir].filter(Boolean).join(', ') || ttlRaw;

  const fotoRaw = pick('foto', 'foto_url', 'url foto', 'pas foto', 'link foto');
  const fotoUrl = normalizeExternalImageUrl(fotoRaw);

  const noAbsen = pick('no absen', 'no_absen', 'no. absen', 'absen');
  const statusSiswa = pick('status', 'status_siswa', 'status murid', 'status siswa') || 'Aktif';
  const waliKelas = pick('wali kelas', 'wali_kelas', 'walikelas');
  const guruBk = pick('guru bk', 'guru_bk', 'konselor bk');
  const guruWaliNama = pick('guru wali', 'guru_wali_nama');

  const agama = pick('agama') || 'Islam';
  const hobi = pick('hobi', 'hobi & bakat', 'hobi & minat');
  const alamat = pick('alamat', 'alamat domisili', 'alamat kk');
  const namaAyah = pick('nama ayah', 'ayah');
  const pekerjaanAyah = pick('pekerjaan ayah');
  const namaIbu = pick('nama ibu', 'ibu');
  const pekerjaanIbu = pick('pekerjaan ibu');
  const prodiPilihan = pick('program studi / bidang', 'prodi pilihan', 'prodi', 'jurusan');
  const koordinat = pick('koordinat rumah', 'koordinat');
  const linkMaps =
    pick('link google maps', 'google maps') ||
    (koordinat ? `https://maps.google.com/?q=${encodeURIComponent(koordinat.replace(/\s+/g, ''))}` : '');

  const perwalian_induk = {
    ...emptyInduk,
    nik: pick('nik'),
    media_sosial: pick('media sosial', 'akun media sosial'),
    alamat_kk: pick('alamat kk') || alamat,
    rt_rw: pick('rt / rw', 'rt/rw'),
    kelurahan: pick('desa / kelurahan', 'kelurahan', 'desa'),
    kecamatan: pick('kecamatan'),
    kabupaten_kota: pick('kabupaten / kota', 'kabupaten', 'kota'),
    kode_pos: pick('kode pos'),
    alamat_domisili: pick('alamat domisili') || alamat,
    status_tempat_tinggal: pick('status tempat tinggal') || emptyInduk.status_tempat_tinggal,
    koordinat_rumah: koordinat,
    link_google_maps: linkMaps,
    jarak_tempuh_km: pick('jarak tempuh (km)', 'jarak tempuh'),
    waktu_tempuh_menit: pick('waktu tempuh (menit)', 'waktu tempuh'),
    moda_transportasi: pick('moda transportasi', 'transportasi'),
    status_ayah: pick('status ayah') || emptyInduk.status_ayah,
    hp_ayah: pick('hp ayah', 'no hp ayah'),
    pendidikan_ayah: pick('pendidikan ayah'),
    penghasilan_ayah: pick('penghasilan ayah'),
    status_ibu: pick('status ibu') || emptyInduk.status_ibu,
    hp_ibu: pick('hp ibu', 'no hp ibu'),
    pendidikan_ibu: pick('pendidikan ibu'),
    penghasilan_ibu: pick('penghasilan ibu'),
    nama_wali: pick('nama wali'),
    hubungan_wali: pick('hubungan wali'),
    hp_wali: pick('hp wali'),
    alamat_wali: pick('alamat wali'),
    kontak_darurat_nama: pick('kontak darurat nama', 'nama kontak darurat'),
    kontak_darurat_hp: pick('kontak darurat hp', 'hp kontak darurat'),
    anak_ke: pick('anak ke', 'anak ke-') || emptyInduk.anak_ke,
    jumlah_saudara: pick('jumlah saudara') || emptyInduk.jumlah_saudara,
    status_kepemilikan_rumah: pick('kepemilikan rumah', 'status kepemilikan rumah') || emptyInduk.status_kepemilikan_rumah,
    penerima_bantuan: pick('penerima bantuan', 'status penerima bantuan') || emptyInduk.penerima_bantuan,
    jenis_bantuan: pick('jenis bantuan'),
    no_kartu_bantuan: pick('no kartu bantuan', 'nomor kartu bantuan'),
    kendala_ekonomi: pick('kendala ekonomi'),
    golongan_darah: pick('golongan darah', 'gol darah'),
    tinggi_badan_cm: pick('tinggi badan (cm)', 'tinggi badan'),
    berat_badan_kg: pick('berat badan (kg)', 'berat badan'),
    riwayat_penyakit: pick('riwayat penyakit') || emptyInduk.riwayat_penyakit,
    riwayat_alergi: pick('riwayat alergi') || emptyInduk.riwayat_alergi,
    kebutuhan_alat_bantu: pick('alat bantu khusus', 'kebutuhan alat bantu') || emptyInduk.kebutuhan_alat_bantu,
    kondisi_psikologis: pick('kondisi psikologis') || emptyInduk.kondisi_psikologis,
    kerentanan_sosial: pick('kerentanan sosial') || emptyInduk.kerentanan_sosial,
    asal_sekolah: pick('asal sekolah'),
    mapel_disukai: pick('mapel disukai', 'mata pelajaran disukai'),
    mapel_sulit: pick('mapel sulit', 'mata pelajaran sulit'),
    gaya_belajar: pick('gaya belajar') || emptyInduk.gaya_belajar,
    hobi_bakat: hobi,
    prestasi: pick('prestasi'),
    ekskul_organisasi: pick('ekskul & organisasi', 'ekstrakurikuler'),
    cita_cita: pick('cita-cita', 'cita cita'),
    aktivitas_luar_sekolah: pick('aktivitas luar sekolah'),
    kepemilikan_gawai_internet: pick('gawai & akses internet', 'kepemilikan gawai'),
  };

  return {
    ...base,
    nama_lengkap: namaLengkap || `Murid Impor ${idx + 1}`,
    nama_panggilan: namaPanggilan,
    jenis_kelamin: jenisKelamin,
    kelas: kelas || 'XI',
    no_absen: noAbsen,
    nis,
    nisn: pick('nisn'),
    tempat_lahir: tempatLahir,
    tanggal_lahir: tanggalLahir,
    ttl,
    whatsapp: pick('no_hp', 'no hp', 'no. hp', 'hp', 'no. whatsapp', 'whatsapp', 'no wa', 'wa', 'telepon', 'telp'),
    email: pick('email', 'email aktif'),
    alamat,
    agama,
    hobi,
    status_siswa: statusSiswa,
    guru_wali_nama: guruWaliNama,
    wali_kelas: waliKelas,
    guru_bk: guruBk,
    foto_url: fotoUrl,
    nama_ayah: namaAyah,
    pekerjaan_ayah: pekerjaanAyah,
    nama_ibu: namaIbu,
    pekerjaan_ibu: pekerjaanIbu,
    alamat_ortu: pick('alamat orang tua', 'alamat ortu') || alamat,
    kontak_ortu: pick('kontak orang tua', 'kontak ortu', 'kontak wali') || perwalian_induk.hp_ayah || perwalian_induk.hp_ibu,
    rencana_lulus: rencanaLulus,
    prodi_pilihan: prodiPilihan,
    deskripsi_diri: pick('deskripsi diri'),
    langkah_pencapaian: pick('langkah pencapaian'),
    catatan_khusus: pick('catatan khusus'),
    perwalian_induk,
    bk_detail: {
      ...base.bk_detail,
      a1_nama_lengkap: namaLengkap,
      a2_nama_panggilan: namaPanggilan,
      a3_ttl: ttl,
      a4_agama: agama,
      a7_anak_ke: perwalian_induk.anak_ke,
      a8_jumlah_saudara: perwalian_induk.jumlah_saudara,
      a10_tinggal_bersama: perwalian_induk.status_tempat_tinggal,
      a11_jarak_rumah: perwalian_induk.jarak_tempuh_km,
      a12_transportasi: perwalian_induk.moda_transportasi,
      a13_nama_ayah: namaAyah,
      a14_pendidikan_pekerjaan_ayah: [perwalian_induk.pendidikan_ayah, pekerjaanAyah].filter(Boolean).join(' / '),
      a15_nama_ibu: namaIbu,
      a16_pendidikan_pekerjaan_ibu: [perwalian_induk.pendidikan_ibu, pekerjaanIbu].filter(Boolean).join(' / '),
      b_golongan_darah: perwalian_induk.golongan_darah,
      b_riwayat_penyakit: perwalian_induk.riwayat_penyakit,
      b_alergi_pantangan: perwalian_induk.riwayat_alergi,
      b_kondisi_psikis: perwalian_induk.kondisi_psikologis,
      c_mapel_disukai: perwalian_induk.mapel_disukai,
      c_mapel_sulit: perwalian_induk.mapel_sulit,
      c_prestasi_akademik: perwalian_induk.prestasi,
      c_fasilitas_belajar: perwalian_induk.kepemilikan_gawai_internet,
      d_organisasi_ekskul: perwalian_induk.ekskul_organisasi,
      e_cita_cita: perwalian_induk.cita_cita,
      e_rencana_setelah_lulus: rencanaLulus,
      e_pilihan_studi_kerja: prodiPilihan,
    },
  };
}

// ---------- 1. STUDENTS EXPORT / TEMPLATE / IMPORT ----------

export function downloadStudentsXlsTemplate() {
  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet([STUDENT_TEMPLATE_SAMPLE]);
  wsData['!cols'] = Object.keys(STUDENT_TEMPLATE_SAMPLE).map((k) => ({
    wch: Math.max(15, k.length + 5),
  }));
  XLSX.utils.book_append_sheet(wb, wsData, 'Data_Murid');

  const guide = [
    ['Petunjuk Pengisian Template Import Data Murid WaliConnect Pro'],
    ['Urutan 15 Kolom Standar: NIS | NISN | Nama | Kelas | No Absen | Tempat | Tanggal Lahir | Email | Foto | ALAMAT | NO_HP | JENIS_KELAMIN | Status | Wali Kelas | Guru BK'],
    ['1. Jangan mengubah nama kolom pada baris pertama sheet Data_Murid.'],
    ['2. Kolom wajib diisi: NIS, Nama, dan Kelas.'],
    ['3. JENIS_KELAMIN diisi L (Laki-laki) atau P (Perempuan).'],
    ['4. Status dapat diisi Aktif, Pindah, Lulus, atau Cuti (bawaan: Aktif).'],
    ['5. Foto boleh dikosongkan atau diisi tautan URL foto / link Google Drive (pastikan akses "Siapa saja yang memiliki link").'],
    ['6. Simpan sebagai .xlsx / .xls / .csv lalu unggah lewat tombol Import XLS / Word.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk');

  XLSX.writeFile(wb, 'Template_Data_Murid_WaliConnect.xlsx');
}

export function exportStudentsToXls(students: WcStudent[], filename = 'Data_Murid_WaliConnect.xlsx') {
  const rows = students.map(getStudentExportColumns);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0 ? rows : [STUDENT_TEMPLATE_SAMPLE]
  );
  const keys = Object.keys(rows[0] || STUDENT_TEMPLATE_SAMPLE);
  ws['!cols'] = keys.map((k) => ({ wch: Math.max(15, k.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Data_Murid');
  XLSX.writeFile(wb, filename);
}

export function exportStudentsToPdf(students: WcStudent[], filename = 'Data_Murid_WaliConnect.pdf') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [215, 330] });
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text('DIREKTORI DATA MURID DAMPINGAN (LAMPIRAN A)', 14, 16);
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `WaliConnect Pro · Jumlah Data: ${students.length} Murid · Dicetak: ${new Date().toLocaleDateString('id-ID')}`,
    14,
    22
  );

  autoTable(doc, {
    startY: 27,
    head: [[
      'No Absen',
      'NIS / NISN',
      'Nama',
      'Kelas',
      'Tempat, Tgl Lahir',
      'NO_HP / Email',
      'ALAMAT',
      'L/P',
      'Status',
      'Wali Kelas / Guru BK',
    ]],
    body: students.map((st, idx) => {
      const { tempat, tanggal } = splitTempatTanggalLahir(st);
      const ttlStr = [tempat, tanggal].filter(Boolean).join(', ') || st.ttl || '-';
      return [
        st.no_absen || String(idx + 1),
        `${st.nis}\n${st.nisn || '-'}`,
        st.nama_lengkap,
        st.kelas,
        ttlStr,
        `${st.whatsapp || '-'}\n${st.email || '-'}`,
        st.alamat || '-',
        st.jenis_kelamin,
        st.status_siswa || 'Aktif',
        `Wali: ${st.wali_kelas || '-'}\nBK: ${st.guru_bk || '-'}`,
      ];
    }),
    styles: { font: 'times', fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
  });

  doc.save(filename);
}

export async function exportStudentsToWord(
  students: WcStudent[],
  isTemplate = false,
  filename?: string
) {
  const headers = [
    'NIS',
    'NISN',
    'Nama',
    'Kelas',
    'No Absen',
    'Tempat',
    'Tanggal Lahir',
    'Email',
    'Foto',
    'ALAMAT',
    'NO_HP',
    'JENIS_KELAMIN',
    'Status',
    'Wali Kelas',
    'Guru BK',
  ];

  const sourceRows: string[][] = isTemplate
    ? [
        [
          STUDENT_TEMPLATE_SAMPLE.NIS,
          STUDENT_TEMPLATE_SAMPLE.NISN,
          STUDENT_TEMPLATE_SAMPLE.Nama,
          STUDENT_TEMPLATE_SAMPLE.Kelas,
          STUDENT_TEMPLATE_SAMPLE['No Absen'],
          STUDENT_TEMPLATE_SAMPLE.Tempat,
          STUDENT_TEMPLATE_SAMPLE['Tanggal Lahir'],
          STUDENT_TEMPLATE_SAMPLE.Email,
          STUDENT_TEMPLATE_SAMPLE.Foto,
          STUDENT_TEMPLATE_SAMPLE.ALAMAT,
          STUDENT_TEMPLATE_SAMPLE.NO_HP,
          STUDENT_TEMPLATE_SAMPLE.JENIS_KELAMIN,
          STUDENT_TEMPLATE_SAMPLE.Status,
          STUDENT_TEMPLATE_SAMPLE['Wali Kelas'],
          STUDENT_TEMPLATE_SAMPLE['Guru BK'],
        ],
      ]
    : students.map((st) => {
        const { tempat, tanggal } = splitTempatTanggalLahir(st);
        return [
          st.nis,
          st.nisn,
          st.nama_lengkap,
          st.kelas,
          st.no_absen || '',
          tempat,
          tanggal,
          st.email,
          st.foto_url || '',
          st.alamat,
          st.whatsapp,
          st.jenis_kelamin,
          st.status_siswa || 'Aktif',
          st.wali_kelas || '',
          st.guru_bk || '',
        ];
      });

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: headers.map(
        (h) =>
          new TableCell({
            shading: { fill: 'E2E8F0' },
            children: [
              new Paragraph({
                children: [new TextRun({ text: h, bold: true, size: 15 })],
              }),
            ],
          })
      ),
    }),
    ...sourceRows.map(
      (r) =>
        new TableRow({
          children: r.map(
            (val) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: val || '-', size: 15 })],
                  }),
                ],
              })
          ),
        })
    ),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(330),
              height: convertMillimetersToTwip(215),
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: convertMillimetersToTwip(12),
              bottom: convertMillimetersToTwip(12),
              left: convertMillimetersToTwip(12),
              right: convertMillimetersToTwip(12),
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: isTemplate
                  ? 'TEMPLATE IMPORT DATA MURID — WALICONNECT PRO'
                  : 'DATA MURID DAMPINGAN (LAMPIRAN A) — WALICONNECT PRO',
                bold: true,
                size: 26,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: isTemplate
                  ? 'Isi atau tambahkan baris pada tabel di bawah ini, simpan file .docx, lalu unggah ke menu Import Data Murid.'
                  : `Total: ${students.length} Murid · Dicetak pada ${new Date().toLocaleDateString('id-ID')}`,
                italics: true,
                size: 18,
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(
    blob,
    filename ||
      (isTemplate ? 'Template_Data_Murid_WaliConnect.docx' : 'Data_Murid_WaliConnect.docx')
  );
}

async function readDocxTables(file: File): Promise<string[][][]> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) {
    throw new Error('File Word (.docx) tidak valid atau tidak berisi document.xml.');
  }

  const parser = new DOMParser();
  const xml = parser.parseFromString(docXml, 'application/xml');
  const tables = Array.from(xml.getElementsByTagNameNS('*', 'tbl'));

  return tables.map((tbl) => {
    const rows = Array.from(tbl.getElementsByTagNameNS('*', 'tr'));
    return rows.map((tr) => {
      const cells = Array.from(tr.getElementsByTagNameNS('*', 'tc'));
      return cells.map((tc) => {
        const paras = Array.from(tc.getElementsByTagNameNS('*', 'p'));
        return paras
          .map((p) => {
            const texts = Array.from(p.getElementsByTagNameNS('*', 't'));
            return texts.map((t) => t.textContent || '').join('');
          })
          .join('\n')
          .trim();
      });
    });
  });
}

export async function importStudentsFromFile(file: File): Promise<WcStudent[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.docx')) {
    const tables = await readDocxTables(file);
    const out: WcStudent[] = [];
    for (const tbl of tables) {
      if (tbl.length < 2) continue;
      const headers = tbl[0].map((h) => h.trim());
      if (!headers.some((h) => /nama|nis|kelas/i.test(h))) continue;
      for (let i = 1; i < tbl.length; i++) {
        const rowObj: Record<string, string> = {};
        headers.forEach((h, colIdx) => {
          rowObj[h] = tbl[i][colIdx] || '';
        });
        const st = mapRowToStudent(rowObj, out.length);
        if (st) out.push(st);
      }
    }
    if (out.length === 0) {
      throw new Error(
        'Tabel data murid tidak ditemukan di file Word (.docx). Gunakan Template Word (.docx) agar kolom terbaca otomatis.'
      );
    }
    return out;
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName =
      wb.SheetNames.find((n) => /murid|data/i.test(n)) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const out: WcStudent[] = [];
    json.forEach((row, idx) => {
      const st = mapRowToStudent(row, idx);
      if (st) out.push(st);
    });
    if (out.length === 0) {
      throw new Error('Tidak ada baris murid valid pada file Excel/CSV.');
    }
    return out;
  }

  throw new Error('Format file belum didukung untuk import. Gunakan file .xlsx, .xls, .csv, atau .docx.');
}

// ---------- 2. PRINT SYSTEM EXPORT / TEMPLATE / IMPORT ----------

export type MultiStudentOrderMode = 'berkas_per_orang' | 'paket_per_orang';

export interface PrintTask {
  sheet: SheetKey;
  student: WcStudent | null;
  studentIndex?: number;
  scopedStudentOnly?: boolean;
}

export interface PrintExportContext {
  config: WcPrintConfig;
  selectedDoc: PrintDocumentType;
  students: WcStudent[];
  activeStudent: WcStudent | null;
  selectedStudents?: WcStudent[];
  multiStudentOrder?: MultiStudentOrderMode;
  logs: WcLog[];
  lampiranBPeriode: EvaluasiPeriode | 'semua';
  currentUser?: WcUser | null;
}

const SHEET_ORDER: SheetKey[] = [
  'sampul',
  'sop',
  'lampiran_a',
  'lampiran_b',
  'lampiran_c',
  'lampiran_d',
  'lampiran_e',
];

export function buildPrintTasks(
  selectedDoc: PrintDocumentType,
  targetStudents: WcStudent[],
  fallbackStudent: WcStudent | null,
  orderMode: MultiStudentOrderMode = 'berkas_per_orang'
): PrintTask[] {
  if (selectedDoc !== 'paket_lengkap') {
    if (selectedDoc === 'lampiran_a' || selectedDoc === 'lampiran_b' || selectedDoc === 'lampiran_e') {
      return targetStudents.map((st, idx) => ({
        sheet: selectedDoc,
        student: st,
        studentIndex: idx,
      }));
    }
    if (orderMode === 'paket_per_orang' && targetStudents.length > 1) {
      return targetStudents.map((st, idx) => ({
        sheet: selectedDoc,
        student: st,
        studentIndex: idx,
        scopedStudentOnly: true,
      }));
    }
    return [{ sheet: selectedDoc, student: fallbackStudent }];
  }

  if (targetStudents.length <= 1) {
    const single = targetStudents[0] ?? fallbackStudent;
    return SHEET_ORDER.map((sheet) => ({
      sheet,
      student: single,
      studentIndex: 0,
    }));
  }

  if (orderMode === 'paket_per_orang') {
    const tasks: PrintTask[] = [];
    targetStudents.forEach((st, idx) => {
      SHEET_ORDER.forEach((sheet) => {
        tasks.push({
          sheet,
          student: st,
          studentIndex: idx,
          scopedStudentOnly: true,
        });
      });
    });
    return tasks;
  }

  // Default: 'berkas_per_orang' -> Sampul + SOP, lalu per berkas murid (Lamp. A, B, E per orang), lalu Lamp. C & D
  const tasks: PrintTask[] = [
    { sheet: 'sampul', student: fallbackStudent },
    { sheet: 'sop', student: fallbackStudent },
  ];
  targetStudents.forEach((st, idx) => {
    tasks.push({ sheet: 'lampiran_a', student: st, studentIndex: idx });
    tasks.push({ sheet: 'lampiran_b', student: st, studentIndex: idx });
    tasks.push({ sheet: 'lampiran_e', student: st, studentIndex: idx });
  });
  tasks.push({ sheet: 'lampiran_c', student: fallbackStudent });
  tasks.push({ sheet: 'lampiran_d', student: fallbackStudent });
  return tasks;
}

function getSheetOri(config: WcPrintConfig, sheet: SheetKey): PaperOrientation {
  return config.orientations?.[sheet] ?? 'portrait';
}

function resolvePdfFontName(docFont?: string): 'times' | 'helvetica' {
  if (docFont === 'times' || docFont === 'serif' || docFont === 'georgia') return 'times';
  return 'helvetica';
}

function clampExportLogoPx(val?: number): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return 64;
  return Math.min(200, Math.max(24, Math.round(num)));
}

interface ExportImageAsset {
  dataUrl: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

function decodeImageSrcToPng(src: string, useCors: boolean, maxDim = 720): Promise<ExportImageAsset> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors) {
      img.crossOrigin = 'anonymous';
    }
    const timer = window.setTimeout(() => {
      reject(new Error('Image load timeout'));
    }, 9000);
    img.onload = () => {
      window.clearTimeout(timer);
      try {
        let w = img.naturalWidth || img.width || 200;
        let h = img.naturalHeight || img.height || 200;
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.max(1, Math.round((h * maxDim) / w));
            w = maxDim;
          } else {
            w = Math.max(1, Math.round((w * maxDim) / h));
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        resolve({
          dataUrl,
          bytes: dataUrlToUint8Array(dataUrl),
          width: w,
          height: h,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Image load failed'));
    };
    img.src = src;
  });
}

async function loadExportImage(rawUrl?: string): Promise<ExportImageAsset | null> {
  const candidates = getImageCandidateUrls(rawUrl);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    const isLocalOrData =
      candidate.startsWith('data:') || candidate.startsWith('blob:') || candidate.startsWith('/');
    if (isLocalOrData) {
      try {
        return await decodeImageSrcToPng(candidate, false);
      } catch {
        continue;
      }
    }

    try {
      return await decodeImageSrcToPng(candidate, true);
    } catch {
      // Fallback to same-origin server image proxy to bypass browser CORS restrictions
    }

    try {
      const resp = await fetch(`/api/image-proxy?url=${encodeURIComponent(candidate)}`);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      if (!blob.size) continue;
      const objUrl = URL.createObjectURL(blob);
      try {
        return await decodeImageSrcToPng(objUrl, false);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function preloadExportImages(
  urls: (string | undefined)[]
): Promise<Map<string, ExportImageAsset | null>> {
  const unique = Array.from(
    new Set(urls.map((u) => (u || '').trim()).filter((u) => Boolean(u) && u !== '-'))
  );
  const map = new Map<string, ExportImageAsset | null>();
  await Promise.all(
    unique.map(async (u) => {
      const asset = await loadExportImage(u);
      map.set(u, asset);
    })
  );
  return map;
}

function getPreloadedImage(
  map: Map<string, ExportImageAsset | null>,
  rawUrl?: string
): ExportImageAsset | null {
  const key = (rawUrl || '').trim();
  if (!key || key === '-') return null;
  return map.get(key) ?? null;
}

function fitDimensions(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  if (srcW <= 0 || srcH <= 0) return { w: maxW, h: maxH };
  const ratio = Math.min(maxW / srcW, maxH / srcH);
  return {
    w: Math.max(1, srcW * ratio),
    h: Math.max(1, srcH * ratio),
  };
}

function renderKopPdf(
  doc: jsPDF,
  config: WcPrintConfig,
  pageW: number,
  imageMap: Map<string, ExportImageAsset | null>
): number {
  const margin = 15;
  const topY = 12;

  const leftImg = getPreloadedImage(imageMap, config.logo_kiri);
  const rightImg = getPreloadedImage(imageMap, config.logo_kanan);
  const leftBoxMm = leftImg ? Math.min(28, Math.max(12, clampExportLogoPx(config.logo_kiri_size) * 0.24)) : 0;
  const rightBoxMm = rightImg ? Math.min(28, Math.max(12, clampExportLogoPx(config.logo_kanan_size) * 0.24)) : 0;

  const leftReserve = leftBoxMm > 0 ? leftBoxMm + 4 : 0;
  const rightReserve = rightBoxMm > 0 ? rightBoxMm + 4 : 0;
  const textLeft = margin + leftReserve;
  const textRight = pageW - margin - rightReserve;
  const textMaxW = Math.max(70, textRight - textLeft);
  const textCenterX = (textLeft + textRight) / 2;

  doc.setTextColor(15, 23, 42);
  let y = topY;
  const lines = config.kop_lines || [];
  for (const line of lines) {
    const style =
      line.bold && line.italic
        ? 'bolditalic'
        : line.bold
          ? 'bold'
          : line.italic
            ? 'italic'
            : 'normal';
    const lineFont = resolvePdfFontName(line.fontFamily || config.doc_font);
    const pt = Math.max(7, Number(line.fontSize) || 10);
    const ascenderMm = pt * 0.3528 * 0.86;
    const descenderGapMm = Math.max(1.15, pt * 0.3528 * 0.36);

    doc.setFont(lineFont, style);
    doc.setFontSize(pt);
    const wrapped = doc.splitTextToSize(line.text || '', textMaxW) as string[];
    const segments = wrapped.length > 0 ? wrapped : [''];

    for (const seg of segments) {
      y += ascenderMm;
      doc.text(seg, textCenterX, y, { align: 'center' });
      if (line.underline && seg.trim()) {
        const w = doc.getTextWidth(seg);
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.22);
        doc.line(textCenterX - w / 2, y + 0.8, textCenterX + w / 2, y + 0.8);
      }
      y += descenderGapMm;
    }
  }

  const textBlockH = Math.max(10, y - topY);
  const totalHeaderH = Math.max(textBlockH, leftBoxMm, rightBoxMm);

  if (leftImg && leftBoxMm > 0) {
    const fitted = fitDimensions(leftImg.width, leftImg.height, leftBoxMm, leftBoxMm);
    const lx = margin + (leftBoxMm - fitted.w) / 2;
    const ly = topY + (totalHeaderH - fitted.h) / 2;
    doc.addImage(leftImg.dataUrl, 'PNG', lx, ly, fitted.w, fitted.h);
  }
  if (rightImg && rightBoxMm > 0) {
    const fitted = fitDimensions(rightImg.width, rightImg.height, rightBoxMm, rightBoxMm);
    const rx = pageW - margin - rightBoxMm + (rightBoxMm - fitted.w) / 2;
    const ry = topY + (totalHeaderH - fitted.h) / 2;
    doc.addImage(rightImg.dataUrl, 'PNG', rx, ry, fitted.w, fitted.h);
  }

  const ruleY = topY + totalHeaderH + 2.5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.75);
  doc.line(margin, ruleY, pageW - margin, ruleY);
  doc.setLineWidth(0.25);
  doc.line(margin, ruleY + 1.3, pageW - margin, ruleY + 1.3);
  return ruleY + 7.5;
}

function estimateSignatureColumnHeight(rows: SignatureRow[], spacerMm: number): number {
  const hasExplicit = rows.some((r) => r.spacerBefore !== undefined);
  const fallbackIdx = Math.max(1, rows.length - 2);
  let h = 0;
  rows.forEach((r, idx) => {
    const applySpacer =
      r.spacerBefore !== undefined ? r.spacerBefore : !hasExplicit && idx === fallbackIdx;
    if (applySpacer) h += spacerMm;
    h += 4.8;
  });
  return h;
}

function renderSignaturePdf(
  doc: jsPDF,
  config: WcPrintConfig,
  orientation: PaperOrientation,
  startY: number,
  pageW: number,
  pageH: number,
  currentUser?: WcUser | null
) {
  const { sig, leftRows, rightRows } = resolveSignatureColumns(config, orientation, currentUser);
  const pdfFont = resolvePdfFontName(config.doc_font);
  const align =
    sig.ttd_align === 'center'
      ? 'center'
      : sig.ttd_align === 'right'
        ? 'right'
        : 'left';

  const shiftMm = (sig.ttd_offset_x || 0) * 0.26;
  const leftShiftMm = (sig.ttd_left_offset_x || 0) * 0.26;
  const rightShiftMm = (sig.ttd_right_offset_x || 0) * 0.26;
  const spacerMm = Math.max(8, (sig.ttd_spacer || 48) * 0.26);

  const leftH = estimateSignatureColumnHeight(leftRows, spacerMm);
  const rightH = estimateSignatureColumnHeight(rightRows, spacerMm);
  const totalSigH =
    sig.ttd_layout === 'stacked' ? 6 + leftH + 6 + rightH : 6 + Math.max(leftH, rightH);

  let effectiveStartY = startY;
  if (effectiveStartY + totalSigH > pageH - 12) {
    doc.addPage([215, 330], orientation);
    effectiveStartY = 18;
  }

  const renderCol = (rows: SignatureRow[], baseX: number, y0: number) => {
    let y = y0;
    const hasExplicit = rows.some((r) => r.spacerBefore !== undefined);
    const fallbackIdx = Math.max(1, rows.length - 2);
    rows.forEach((r, idx) => {
      const applySpacer =
        r.spacerBefore !== undefined ? r.spacerBefore : !hasExplicit && idx === fallbackIdx;
      if (applySpacer) y += spacerMm;
      doc.setFont(pdfFont, r.bold ? 'bold' : 'normal');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(r.text || '', baseX, y, { align });
      if (r.underline && r.text) {
        const w = doc.getTextWidth(r.text);
        const lineX =
          align === 'center' ? baseX - w / 2 : align === 'right' ? baseX - w : baseX;
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.25);
        doc.line(lineX, y + 0.8, lineX + w, y + 0.8);
      }
      y += 4.8;
    });
    return y;
  };

  const margin = 15;
  const colW = (pageW - margin * 2 - 12) / 2;
  const leftBaseX =
    (align === 'center'
      ? margin + colW / 2
      : align === 'right'
        ? margin + colW
        : margin) +
    shiftMm +
    leftShiftMm;
  const rightBaseX =
    (align === 'center'
      ? margin + colW + 12 + colW / 2
      : align === 'right'
        ? pageW - margin
        : margin + colW + 12) +
    shiftMm +
    rightShiftMm;

  if (sig.ttd_layout === 'stacked') {
    const nextY = renderCol(leftRows, leftBaseX, effectiveStartY + 6);
    renderCol(rightRows, leftBaseX, nextY + 6);
  } else {
    renderCol(leftRows, leftBaseX, effectiveStartY + 6);
    renderCol(rightRows, rightBaseX, effectiveStartY + 6);
  }
}

export async function exportPrintDocToPdf(ctx: PrintExportContext) {
  const fallbackSt = ctx.activeStudent ?? ctx.students[0] ?? null;
  const targetStudents: WcStudent[] =
    ctx.selectedStudents && ctx.selectedStudents.length > 0
      ? ctx.selectedStudents
      : fallbackSt
        ? [fallbackSt]
        : [];
  const tasks = buildPrintTasks(
    ctx.selectedDoc,
    targetStudents,
    fallbackSt,
    ctx.multiStudentOrder ?? 'berkas_per_orang'
  );

  const imageUrls: (string | undefined)[] = [ctx.config.logo_kiri, ctx.config.logo_kanan];
  targetStudents.forEach((s) => imageUrls.push(s.foto_url));
  if (fallbackSt?.foto_url) imageUrls.push(fallbackSt.foto_url);
  ctx.logs.forEach((l) => {
    if (l.foto_url) imageUrls.push(l.foto_url);
  });
  const imageMap = await preloadExportImages(imageUrls);

  const firstOri = getSheetOri(ctx.config, tasks[0]?.sheet ?? 'sampul');
  const doc = new jsPDF({
    orientation: firstOri,
    unit: 'mm',
    format: [215, 330],
  });
  const pdfFont = resolvePdfFontName(ctx.config.doc_font);
  const gridHeadStyles = {
    fillColor: [241, 245, 249] as [number, number, number],
    textColor: 15,
    fontStyle: 'bold' as const,
    lineColor: [51, 65, 85] as [number, number, number],
    lineWidth: 0.2,
  };
  const gridBaseStyles = {
    font: pdfFont,
    lineColor: [51, 65, 85] as [number, number, number],
    lineWidth: 0.2,
    textColor: [15, 23, 42] as [number, number, number],
  };

  tasks.forEach(({ sheet, student: st, scopedStudentOnly }, pageIdx) => {
    const ori = getSheetOri(ctx.config, sheet);
    if (pageIdx > 0) {
      doc.addPage([215, 330], ori);
    }
    const pageW = ori === 'landscape' ? 330 : 215;
    const pageH = ori === 'landscape' ? 215 : 330;
    const sheetStudents = scopedStudentOnly && st ? [st] : ctx.students;
    const sheetLogs =
      scopedStudentOnly && st ? ctx.logs.filter((l) => l.student_id === st.id) : ctx.logs;

    // Halaman Sampul TANPA Kop Surat
    if (sheet === 'sampul') {
      doc.setTextColor(15, 23, 42);
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11);
      doc.text('DOKUMEN RESMI PENDAMPINGAN PERWALIAN SEKOLAH', pageW / 2, 42, {
        align: 'center',
      });
      doc.setFontSize(22);
      doc.text('BUKU JURNAL GURU WALI', pageW / 2, 56, { align: 'center' });
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(11);
      doc.text(
        'Berdasarkan Peraturan Menteri Pendidikan Dasar dan Menengah Nomor 11 Tahun 2025',
        pageW / 2,
        66,
        { align: 'center' }
      );

      const coverLogo = getPreloadedImage(imageMap, ctx.config.logo_kiri);
      let tableStartY = 98;
      if (coverLogo) {
        const fitted = fitDimensions(coverLogo.width, coverLogo.height, 36, 36);
        doc.addImage(
          coverLogo.dataUrl,
          'PNG',
          (pageW - fitted.w) / 2,
          78 + (36 - fitted.h) / 2,
          fitted.w,
          fitted.h
        );
        tableStartY = 124;
      }

      autoTable(doc, {
        startY: tableStartY,
        margin: { left: pageW / 2 - 68, right: pageW / 2 - 68 },
        theme: 'grid',
        body: [
          ['Satuan Pendidikan', `: ${ctx.config.nama_sekolah}`],
          ['Nama Guru Wali', `: ${ctx.config.nama_guru_wali}`],
          ['NIP / NUPTK', `: ${ctx.config.nip_guru_wali}`],
          [
            scopedStudentOnly && st ? 'Murid Dampingan' : 'Jumlah Dampingan',
            scopedStudentOnly && st
              ? `: ${st.nama_lengkap} (${st.kelas})`
              : `: ${sheetStudents.length} Murid Aktif`,
          ],
          ['Tahun Ajaran', `: ${ctx.config.tahun_ajaran}`],
        ],
        styles: { ...gridBaseStyles, fontSize: 10.5, cellPadding: 3 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 46 } },
      });

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.3);
      doc.line(20, pageH - 34, pageW - 20, pageH - 34);
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(10.5);
      doc.text(ctx.config.nama_sekolah, pageW / 2, pageH - 26, { align: 'center' });
      doc.setFont(pdfFont, 'normal');
      doc.text(`Tahun Pelajaran ${ctx.config.tahun_ajaran}`, pageW / 2, pageH - 20, {
        align: 'center',
      });
      return;
    }

    let y = renderKopPdf(doc, ctx.config, pageW, imageMap);

    if (sheet === 'sop') {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('STANDAR OPERASIONAL PROSEDUR (SOP) GURU WALI', pageW / 2, y, {
        align: 'center',
      });
      y += 5;
      doc.setFont(pdfFont, 'italic');
      doc.setFontSize(9.5);
      doc.text(
        'Implementasi Tugas Pendampingan Murid Sesuai Permendikdasmen Nomor 11 Tahun 2025',
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 6.5;

      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 },
        theme: 'grid',
        head: [['No', 'Tahapan Prosedur', 'Aktivitas Utama & Bukti Fisik']],
        body: [
          ['1', 'Pemetaan Profil Awal', 'Pengisian identitas lengkap & rencana pasca-lulus (Lampiran A) serta formulir BK.'],
          ['2', 'Penyusunan Jadwal Pendampingan', 'Penetapan jadwal tatap muka rutin minimal 9 sesi per semester (Lampiran D).'],
          ['3', 'Sesi Pertemuan Perwalian', 'Pelaksanaan konseling ringan, motivasi belajar, & pencatatan jurnal (Lampiran C).'],
          ['4', 'Evaluasi 5 Aspek Berkala', 'Penilaian akademik, karakter, sosial-emosional, disiplin, & minat (Lampiran B).'],
          ['5', 'Koordinasi Orang Tua & BK', 'Komunikasi dua arah orang tua serta rujukan kasus khusus ke koordinator BK.'],
          ['6', 'Pelaporan & Pengarsipan SOP', 'Verifikasi dan pengesahan Buku Jurnal Guru Wali oleh Kepala Sekolah.'],
        ],
        styles: { ...gridBaseStyles, fontSize: 9, cellPadding: 2.2 },
        headStyles: gridHeadStyles,
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 52, fontStyle: 'bold' },
        },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 },
        theme: 'grid',
        head: [['No', 'Nama Murid', 'Kelas', 'Hadir', 'Target Pasca Lulus']],
        body: sheetStudents.map((s, idx) => [
          idx + 1,
          s.nama_lengkap,
          s.kelas,
          `${calcAttendancePct(s.kehadiran)}%`,
          `${s.rencana_lulus || '-'} (${s.prodi_pilihan || '-'})`,
        ]),
        styles: { ...gridBaseStyles, fontSize: 9, cellPadding: 2 },
        headStyles: gridHeadStyles,
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          2: { cellWidth: 22 },
          3: { cellWidth: 18, halign: 'center' },
        },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW, pageH, ctx.currentUser);
    } else if (sheet === 'lampiran_a' && st) {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('LAMPIRAN A — IDENTITAS MURID DAMPINGAN', pageW / 2, y, { align: 'center' });
      y += 5;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(`Tahun Ajaran ${ctx.config.tahun_ajaran}`, pageW / 2, y, { align: 'center' });
      y += 6;

      const photoW = 32;
      const photoH = 43;
      const photoX = pageW - 15 - photoW;
      const photoY = y;

      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 + photoW + 4 },
        theme: 'grid',
        body: [
          ['Nama Lengkap', st.nama_lengkap || '-'],
          ['Nama Panggilan', st.nama_panggilan || '-'],
          ['Jenis Kelamin', st.jenis_kelamin === 'L' ? 'Laki-Laki' : 'Perempuan'],
          ['Kelas / NIS / NISN', `${st.kelas} / ${st.nis || '-'} / ${st.nisn || '-'}`],
          ['Tempat, Tanggal Lahir', st.ttl || '-'],
          ['Agama / Hobi', `${st.agama || '-'} / ${st.hobi || '-'}`],
          ['WhatsApp / Email', `${st.whatsapp || '-'} / ${st.email || '-'}`],
          ['Alamat Domisili', st.alamat || '-'],
          ['Nama & Pekerjaan Ayah', `${st.nama_ayah || '-'} (${st.pekerjaan_ayah || '-'})`],
          ['Nama & Pekerjaan Ibu', `${st.nama_ibu || '-'} (${st.pekerjaan_ibu || '-'})`],
          ['Alamat & Kontak Ortu', `${st.alamat_ortu || '-'} · ${st.kontak_ortu || '-'}`],
        ],
        styles: { ...gridBaseStyles, fontSize: 8.8, cellPadding: 1.9 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 44, fillColor: [248, 250, 252] } },
      });

      // Pas Foto 4x6 Frame
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.3);
      doc.rect(photoX, photoY, photoW, photoH);
      const stPhoto = getPreloadedImage(imageMap, st.foto_url);
      if (stPhoto) {
        const fitted = fitDimensions(stPhoto.width, stPhoto.height, photoW - 1.5, photoH - 1.5);
        doc.addImage(
          stPhoto.dataUrl,
          'PNG',
          photoX + (photoW - fitted.w) / 2,
          photoY + (photoH - fitted.h) / 2,
          fitted.w,
          fitted.h
        );
      } else {
        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('Pas Foto\n4 × 6 cm', photoX + photoW / 2, photoY + photoH / 2 - 1, {
          align: 'center',
        });
        doc.setTextColor(15, 23, 42);
      }

      const tableEndY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
      y = Math.max(tableEndY, photoY + photoH) + 4;

      const planChoices = ['Kuliah', 'Bekerja', 'Gap-year']
        .map((c) => (st.rencana_lulus === c ? `[✓] ${c}` : `[ ] ${c}`))
        .join('   ');

      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 },
        theme: 'grid',
        body: [
          ['Deskripsi Diri & Minat', st.deskripsi_diri || '-'],
          ['Rencana Pasca Lulus', planChoices],
          ['Program Studi / Bidang', st.prodi_pilihan || '-'],
          ['Langkah Pencapaian', st.langkah_pencapaian || '-'],
          ['Catatan Khusus Siswa', st.catatan_khusus || '-'],
        ],
        styles: { ...gridBaseStyles, fontSize: 8.8, cellPadding: 2.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 46, fillColor: [248, 250, 252] } },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW, pageH, ctx.currentUser);
    } else if (sheet === 'lampiran_b' && st) {
      const isAll = ctx.lampiranBPeriode === 'semua';
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('LAMPIRAN B — CATATAN PERKEMBANGAN MURID (5 ASPEK)', pageW / 2, y, {
        align: 'center',
      });
      y += 5;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(
        `Nama: ${st.nama_lengkap} · Kelas: ${st.kelas} · Periode: ${
          isAll ? '3 Bulan, 6 Bulan, 9 Bulan & 1 Tahun' : ctx.lampiranBPeriode
        }`,
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 6;

      const aspectRows: {
        no: string;
        label: string;
        key: 'akademik' | 'karakter' | 'sosial_emosional' | 'kedisiplinan' | 'potensi_minat';
      }[] = [
        { no: '1', label: 'Akademik', key: 'akademik' },
        { no: '2', label: 'Karakter & Akhlak', key: 'karakter' },
        { no: '3', label: 'Sosial-Emosional', key: 'sosial_emosional' },
        { no: '4', label: 'Kedisiplinan', key: 'kedisiplinan' },
        { no: '5', label: 'Potensi & Minat', key: 'potensi_minat' },
      ];

      if (ctx.lampiranBPeriode === 'semua') {
        autoTable(doc, {
          startY: y,
          margin: { left: 15, right: 15 },
          theme: 'grid',
          head: [['No', 'Aspek', ...EVALUASI_PERIODES.map((p) => p.label)]],
          body: aspectRows.map((r) => [
            r.no,
            r.label,
            ...EVALUASI_PERIODES.map(
              (p) => getSnapshotForPeriode(st.perkembangan, p.value)[r.key] || '-'
            ),
          ]),
          styles: { ...gridBaseStyles, fontSize: 8, cellPadding: 2 },
          headStyles: gridHeadStyles,
          columnStyles: {
            0: { cellWidth: 9, halign: 'center' },
            1: { cellWidth: 28, fontStyle: 'bold' },
          },
        });
      } else {
        const snap = getSnapshotForPeriode(st.perkembangan, ctx.lampiranBPeriode);
        autoTable(doc, {
          startY: y,
          margin: { left: 15, right: 15 },
          theme: 'grid',
          head: [
            ['No', 'Aspek Perkembangan', `Catatan Capaian & Pembinaan (${ctx.lampiranBPeriode})`],
          ],
          body: aspectRows.map((r) => [r.no, r.label, snap[r.key] || '-']),
          styles: { ...gridBaseStyles, fontSize: 9.2, cellPadding: 2.8 },
          headStyles: gridHeadStyles,
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 44, fontStyle: 'bold' },
          },
        });
      }
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW, pageH, ctx.currentUser);
    } else if (sheet === 'lampiran_c') {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('LAMPIRAN C — REKAP PERTEMUAN & JURNAL PERWALIAN', pageW / 2, y, {
        align: 'center',
      });
      y += 5;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(
        `Tahun Ajaran ${ctx.config.tahun_ajaran}${
          scopedStudentOnly && st ? ` · Murid: ${st.nama_lengkap} (${st.kelas})` : ''
        }`,
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 6;

      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 },
        theme: 'grid',
        head: [['No', 'Tanggal / Sesi', 'Murid & Bidang', 'Topik & Uraian', 'Tindak Lanjut', 'Foto']],
        body:
          sheetLogs.length > 0
            ? sheetLogs.map((l, idx) => [
                idx + 1,
                `${l.tanggal}\nSesi ${l.sesi_ke}`,
                `${l.student_name}\n${l.kategori}`,
                `${l.topik}\n${l.uraian}`,
                l.tindak_lanjut || '-',
                l.foto_url && getPreloadedImage(imageMap, l.foto_url) ? '' : '-',
              ])
            : [['-', '-', '-', 'Belum ada catatan pertemuan perwalian.', '-', '-']],
        styles: { ...gridBaseStyles, fontSize: 8.3, cellPadding: 2, minCellHeight: 14 },
        headStyles: gridHeadStyles,
        columnStyles: {
          0: { cellWidth: 9, halign: 'center' },
          1: { cellWidth: 24 },
          2: { cellWidth: 32 },
          5: { cellWidth: 18, halign: 'center' },
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 5) {
            const rowLog = sheetLogs[data.row.index];
            const asset = rowLog?.foto_url ? getPreloadedImage(imageMap, rowLog.foto_url) : null;
            if (asset) {
              const pad = 1.5;
              const fitted = fitDimensions(
                asset.width,
                asset.height,
                data.cell.width - pad * 2,
                data.cell.height - pad * 2
              );
              doc.addImage(
                asset.dataUrl,
                'PNG',
                data.cell.x + (data.cell.width - fitted.w) / 2,
                data.cell.y + (data.cell.height - fitted.h) / 2,
                fitted.w,
                fitted.h
              );
            }
          }
        },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW, pageH, ctx.currentUser);
    } else if (sheet === 'lampiran_d') {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('LAMPIRAN D — DAFTAR HADIR PERTEMUAN PERWALIAN (SESI 1–9)', pageW / 2, y, {
        align: 'center',
      });
      y += 5;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(
        `Tahun Ajaran ${ctx.config.tahun_ajaran}${
          scopedStudentOnly && st ? ` · Murid: ${st.nama_lengkap} (${st.kelas})` : ''
        }`,
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 6;

      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 },
        theme: 'grid',
        head: [['No', 'Nama Murid', 'Kelas', '1', '2', '3', '4', '5', '6', '7', '8', '9', '%']],
        body: sheetStudents.map((s, idx) => [
          idx + 1,
          s.nama_lengkap,
          s.kelas,
          ...Array.from({ length: 9 }, (_, i) => (s.kehadiran?.[i] ? 'v' : '-')),
          `${calcAttendancePct(s.kehadiran)}%`,
        ]),
        styles: { ...gridBaseStyles, fontSize: 8.5, cellPadding: 2 },
        headStyles: { ...gridHeadStyles, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          2: { cellWidth: 22 },
          3: { cellWidth: 8, halign: 'center' },
          4: { cellWidth: 8, halign: 'center' },
          5: { cellWidth: 8, halign: 'center' },
          6: { cellWidth: 8, halign: 'center' },
          7: { cellWidth: 8, halign: 'center' },
          8: { cellWidth: 8, halign: 'center' },
          9: { cellWidth: 8, halign: 'center' },
          10: { cellWidth: 8, halign: 'center' },
          11: { cellWidth: 8, halign: 'center' },
          12: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW, pageH, ctx.currentUser);
    } else if (sheet === 'lampiran_e' && st) {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11.5);
      doc.text(
        'LAMPIRAN E — DOKUMENTASI FOTO & FORMULIR DATA DETAIL PESERTA DIDIK (BK)',
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 4.8;
      doc.setFont(pdfFont, 'italic');
      doc.setFontSize(9);
      doc.text(
        `Murid: ${st.nama_lengkap} (${st.kelas}) — Rahasia Profesional Layanan Bimbingan & Konseling`,
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 6;

      // Section A: Documentation Photos
      const studentOwnPhotos = ctx.logs.filter((l) => l.foto_url && l.student_id === st.id);
      const docPhotos = (
        studentOwnPhotos.length > 0 ? studentOwnPhotos : ctx.logs.filter((l) => l.foto_url)
      ).slice(0, 3);

      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(9.5);
      doc.text('A. Dokumentasi Foto Kegiatan Pendampingan', 15, y);
      y += 3;

      if (docPhotos.length > 0) {
        const gap = 4;
        const cardW = (pageW - 30 - gap * 2) / 3;
        const cardH = 34;
        docPhotos.forEach((l, idx) => {
          const cx = 15 + idx * (cardW + gap);
          doc.setDrawColor(51, 65, 85);
          doc.setLineWidth(0.25);
          doc.rect(cx, y, cardW, cardH);
          const photoAsset = getPreloadedImage(imageMap, l.foto_url);
          if (photoAsset) {
            const fitted = fitDimensions(photoAsset.width, photoAsset.height, cardW - 3, 22);
            doc.addImage(
              photoAsset.dataUrl,
              'PNG',
              cx + (cardW - fitted.w) / 2,
              y + 1.5 + (22 - fitted.h) / 2,
              fitted.w,
              fitted.h
            );
          } else {
            doc.setFont(pdfFont, 'italic');
            doc.setFontSize(7.5);
            doc.text('Foto tidak tersedia', cx + cardW / 2, y + 12, { align: 'center' });
          }
          doc.setFont(pdfFont, 'bold');
          doc.setFontSize(7.8);
          const title = (l.topik || '-').slice(0, 34);
          doc.text(title, cx + cardW / 2, y + 27.5, { align: 'center' });
          doc.setFont(pdfFont, 'normal');
          doc.setFontSize(7.2);
          doc.text(l.tanggal || '', cx + cardW / 2, y + 31.5, { align: 'center' });
        });
        y += cardH + 6;
      } else {
        doc.setFont(pdfFont, 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Belum ada foto dokumentasi pada jurnal pertemuan.', 15, y + 3.5);
        doc.setTextColor(15, 23, 42);
        y += 8;
      }

      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(9.5);
      doc.text(
        `B. Formulir Data Detail Peserta Didik (Bagian A–F) — ${st.nama_lengkap} (${st.kelas})`,
        15,
        y
      );
      y += 2.5;

      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 },
        theme: 'grid',
        body: [
          [
            'Bagian A (Identitas & Keluarga)',
            `Anak ke-${st.bk_detail?.a7_anak_ke || '-'} dari ${st.bk_detail?.a8_jumlah_saudara || '-'} bersaudara · Tinggal bersama: ${st.bk_detail?.a10_tinggal_bersama || '-'} · Kontak Darurat: ${st.bk_detail?.a18_wali_kontak_darurat || '-'}`,
          ],
          [
            'Bagian B (Kesehatan Fisik & Psikis)',
            `TB/BB: ${st.bk_detail?.b_tinggi_berat || '-'} · Gol. Darah: ${st.bk_detail?.b_golongan_darah || '-'} · Riwayat: ${st.bk_detail?.b_riwayat_penyakit || '-'} · Psikis: ${st.bk_detail?.b_kondisi_psikis || '-'}`,
          ],
          [
            'Bagian C (Akademik & Belajar)',
            `Disukai: ${st.bk_detail?.c_mapel_disukai || '-'} · Sulit: ${st.bk_detail?.c_mapel_sulit || '-'} · Hambatan: ${st.bk_detail?.c_hambatan_akademik || '-'}`,
          ],
          [
            'Bagian D (Pribadi & Sosial)',
            `Kelebihan: ${st.bk_detail?.d_sifat_kelebihan || '-'} · Organisasi: ${st.bk_detail?.d_organisasi_ekskul || '-'}`,
          ],
          [
            'Bagian E (Karir & Masa Depan)',
            `Cita-cita: ${st.bk_detail?.e_cita_cita || '-'} · Rencana: ${st.bk_detail?.e_rencana_setelah_lulus || '-'} · Pilihan: ${st.bk_detail?.e_pilihan_studi_kerja || '-'}`,
          ],
          [
            'Bagian F (Harapan Layanan BK)',
            `Harapan: ${st.bk_detail?.f_harapan_layanan_bk || '-'} · Topik: ${st.bk_detail?.f_topik_konseling_diinginkan || '-'} · Kesediaan Ortu: ${st.bk_detail?.f_kesediaan_orang_tua || '-'}`,
          ],
        ],
        styles: { ...gridBaseStyles, fontSize: 8.5, cellPadding: 2.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [248, 250, 252] } },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW, pageH, ctx.currentUser);
    }
  });

  doc.save(`Laporan_SOP_F4_${ctx.selectedDoc}.pdf`);
}

function makeWordImageRun(asset: ExportImageAsset, maxW: number, maxH: number): ImageRun {
  const fitted = fitDimensions(asset.width, asset.height, maxW, maxH);
  return new ImageRun({
    type: 'png',
    data: asset.bytes,
    transformation: {
      width: Math.round(fitted.w),
      height: Math.round(fitted.h),
    },
  });
}

function buildKopWordNodes(
  config: WcPrintConfig,
  imageMap: Map<string, ExportImageAsset | null>
): (Paragraph | Table)[] {
  const leftImg = getPreloadedImage(imageMap, config.logo_kiri);
  const rightImg = getPreloadedImage(imageMap, config.logo_kanan);
  const leftPx = clampExportLogoPx(config.logo_kiri_size);
  const rightPx = clampExportLogoPx(config.logo_kanan_size);

  const noSideBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const bottomDoubleBorder = { style: BorderStyle.DOUBLE, size: 12, color: '0F172A' };
  const cellBorders = {
    top: noSideBorder,
    left: noSideBorder,
    right: noSideBorder,
    bottom: bottomDoubleBorder,
  };

  const kopTextParas = config.kop_lines.map(
    (line, idx) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
          before: idx === 0 ? 0 : 15,
          after: idx === config.kop_lines.length - 1 ? 40 : 25,
        },
        children: [
          new TextRun({
            text: line.text || '',
            bold: line.bold,
            italics: line.italic,
            underline: line.underline ? {} : undefined,
            size: Math.round((line.fontSize || 10) * 2),
          }),
        ],
      })
  );

  const kopTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: noSideBorder,
      left: noSideBorder,
      right: noSideBorder,
      bottom: bottomDoubleBorder,
      insideHorizontal: noSideBorder,
      insideVertical: noSideBorder,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 16, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            margins: { top: 40, bottom: 100, left: 40, right: 60 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: leftImg ? [makeWordImageRun(leftImg, leftPx, leftPx)] : [],
              }),
            ],
          }),
          new TableCell({
            width: { size: 68, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            margins: { top: 40, bottom: 100, left: 60, right: 60 },
            children: kopTextParas.length > 0 ? kopTextParas : [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: 16, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            margins: { top: 40, bottom: 100, left: 60, right: 40 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: rightImg ? [makeWordImageRun(rightImg, rightPx, rightPx)] : [],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  return [kopTable];
}

function buildSignatureWordNodes(
  config: WcPrintConfig,
  orientation: PaperOrientation,
  currentUser?: WcUser | null
): (Paragraph | Table)[] {
  const { sig, leftRows, rightRows } = resolveSignatureColumns(config, orientation, currentUser);
  const align =
    sig.ttd_align === 'center'
      ? AlignmentType.CENTER
      : sig.ttd_align === 'right'
        ? AlignmentType.RIGHT
        : sig.ttd_align === 'justify'
          ? AlignmentType.JUSTIFIED
          : AlignmentType.LEFT;

  const toParas = (rows: SignatureRow[]) => {
    const hasExplicit = rows.some((r) => r.spacerBefore !== undefined);
    const fallbackIdx = Math.max(1, rows.length - 2);
    return rows.map((r, idx) => {
      const applySpacer =
        r.spacerBefore !== undefined ? r.spacerBefore : !hasExplicit && idx === fallbackIdx;
      return new Paragraph({
        alignment: align,
        spacing: {
          before: applySpacer ? Math.round((sig.ttd_spacer || 48) * 15) : 30,
          after: 20,
        },
        children: [
          new TextRun({
            text: r.text || ' ',
            bold: r.bold,
            underline: r.underline ? {} : undefined,
            size: 21,
          }),
        ],
      });
    });
  };

  if (sig.ttd_layout === 'stacked') {
    return [
      new Paragraph({ spacing: { before: 240 }, children: [] }),
      ...toParas(leftRows),
      new Paragraph({ spacing: { before: 180 }, children: [] }),
      ...toParas(rightRows),
    ];
  }

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  return [
    new Paragraph({ spacing: { before: 240 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        ...noBorders,
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              borders: noBorders,
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: toParas(leftRows),
            }),
            new TableCell({
              borders: noBorders,
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: toParas(rightRows),
            }),
          ],
        }),
      ],
    }),
  ];
}

function makeWordTable(headers: string[], rows: string[][]): Table {
  const cellBorder = { style: BorderStyle.SINGLE, size: 6, color: '334155' };
  const tableBorders = {
    top: cellBorder,
    bottom: cellBorder,
    left: cellBorder,
    right: cellBorder,
    insideHorizontal: cellBorder,
    insideVertical: cellBorder,
  };
  const cellMargins = { top: 80, bottom: 80, left: 110, right: 110 };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map(
          (h) =>
            new TableCell({
              shading: { fill: 'F1F5F9' },
              margins: cellMargins,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true, size: 18 })],
                }),
              ],
            })
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            children: r.map(
              (cell) =>
                new TableCell({
                  margins: cellMargins,
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: cell || '-', size: 18 })],
                    }),
                  ],
                })
            ),
          })
      ),
    ],
  });
}

export async function exportPrintDocToWord(ctx: PrintExportContext) {
  const fallbackSt = ctx.activeStudent ?? ctx.students[0] ?? null;
  const targetStudents: WcStudent[] =
    ctx.selectedStudents && ctx.selectedStudents.length > 0
      ? ctx.selectedStudents
      : fallbackSt
        ? [fallbackSt]
        : [];
  const tasks = buildPrintTasks(
    ctx.selectedDoc,
    targetStudents,
    fallbackSt,
    ctx.multiStudentOrder ?? 'berkas_per_orang'
  );

  const imageUrls: (string | undefined)[] = [ctx.config.logo_kiri, ctx.config.logo_kanan];
  targetStudents.forEach((s) => imageUrls.push(s.foto_url));
  if (fallbackSt?.foto_url) imageUrls.push(fallbackSt.foto_url);
  ctx.logs.forEach((l) => {
    if (l.foto_url) imageUrls.push(l.foto_url);
  });
  const imageMap = await preloadExportImages(imageUrls);

  const sections = tasks.map(({ sheet, student: st, scopedStudentOnly }) => {
    const ori = getSheetOri(ctx.config, sheet);
    const isLandscape = ori === 'landscape';
    const children: (Paragraph | Table)[] = [];
    const sheetStudents = scopedStudentOnly && st ? [st] : ctx.students;
    const sheetLogs =
      scopedStudentOnly && st ? ctx.logs.filter((l) => l.student_id === st.id) : ctx.logs;

    if (sheet === 'sampul') {
      const coverLogo = getPreloadedImage(imageMap, ctx.config.logo_kiri);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 900, after: 120 },
          children: [
            new TextRun({
              text: 'DOKUMEN RESMI PENDAMPINGAN PERWALIAN SEKOLAH',
              bold: true,
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: 'BUKU JURNAL GURU WALI', bold: true, size: 44 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [
            new TextRun({
              text: 'Berdasarkan Peraturan Menteri Pendidikan Dasar dan Menengah Nomor 11 Tahun 2025',
              bold: true,
              size: 22,
            }),
          ],
        })
      );

      if (coverLogo) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 420 },
            children: [makeWordImageRun(coverLogo, 128, 128)],
          })
        );
      }

      children.push(
        makeWordTable(
          ['Keterangan', 'Isian'],
          [
            ['Satuan Pendidikan', ctx.config.nama_sekolah],
            ['Nama Guru Wali', ctx.config.nama_guru_wali],
            ['NIP / NUPTK', ctx.config.nip_guru_wali],
            [
              scopedStudentOnly && st ? 'Murid Dampingan' : 'Jumlah Dampingan',
              scopedStudentOnly && st
                ? `${st.nama_lengkap} · ${st.kelas}`
                : `${sheetStudents.length} Murid Aktif`,
            ],
            ['Tahun Ajaran', ctx.config.tahun_ajaran],
          ]
        )
      );
    } else {
      children.push(...buildKopWordNodes(ctx.config, imageMap));
      children.push(new Paragraph({ spacing: { before: 140 }, children: [] }));

      if (sheet === 'sop') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'STANDAR OPERASIONAL PROSEDUR (SOP) GURU WALI',
                bold: true,
                size: 26,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: 'Implementasi Tugas Pendampingan Murid Sesuai Permendikdasmen Nomor 11 Tahun 2025',
                italics: true,
                size: 19,
              }),
            ],
          }),
          makeWordTable(
            ['No', 'Tahapan Prosedur', 'Aktivitas Utama & Bukti Fisik'],
            [
              ['1', 'Pemetaan Profil Awal', 'Identitas murid & rencana pasca-lulus (Lampiran A) serta formulir BK.'],
              ['2', 'Penyusunan Jadwal Pendampingan', 'Jadwal tatap muka minimal 9 sesi per semester (Lampiran D).'],
              ['3', 'Sesi Pertemuan Perwalian', 'Konseling ringan, motivasi belajar & pencatatan jurnal (Lampiran C).'],
              ['4', 'Evaluasi 5 Aspek Berkala', 'Penilaian 5 aspek periode 3, 6, 9 bulan & 1 tahun (Lampiran B).'],
              ['5', 'Koordinasi Orang Tua & BK', 'Komunikasi dua arah orang tua serta rujukan kasus khusus ke tim BK.'],
              ['6', 'Pelaporan & Pengarsipan SOP', 'Verifikasi dan pengesahan Buku Jurnal oleh Kepala Sekolah.'],
            ]
          )
        );
      } else if (sheet === 'lampiran_a' && st) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'LAMPIRAN A — IDENTITAS MURID DAMPINGAN',
                bold: true,
                size: 24,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: `Tahun Ajaran ${ctx.config.tahun_ajaran}`,
                size: 19,
              }),
            ],
          })
        );

        const stPhoto = getPreloadedImage(imageMap, st.foto_url);
        if (stPhoto) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 120 },
              children: [makeWordImageRun(stPhoto, 96, 128)],
            })
          );
        }

        const planChoices = ['Kuliah', 'Bekerja', 'Gap-year']
          .map((c) => (st.rencana_lulus === c ? `[✓] ${c}` : `[ ] ${c}`))
          .join('   ');

        children.push(
          makeWordTable(
            ['Bidang Data', 'Keterangan'],
            [
              ['Nama Lengkap', st.nama_lengkap],
              ['Nama Panggilan', st.nama_panggilan || '-'],
              ['Jenis Kelamin', st.jenis_kelamin === 'L' ? 'Laki-Laki' : 'Perempuan'],
              ['Kelas / NIS / NISN', `${st.kelas} / ${st.nis || '-'} / ${st.nisn || '-'}`],
              ['Tempat, Tanggal Lahir', st.ttl || '-'],
              ['Agama / Hobi', `${st.agama || '-'} / ${st.hobi || '-'}`],
              ['WhatsApp / Email', `${st.whatsapp || '-'} / ${st.email || '-'}`],
              ['Alamat Domisili', st.alamat || '-'],
              ['Nama & Pekerjaan Ayah', `${st.nama_ayah || '-'} (${st.pekerjaan_ayah || '-'})`],
              ['Nama & Pekerjaan Ibu', `${st.nama_ibu || '-'} (${st.pekerjaan_ibu || '-'})`],
              ['Alamat & Kontak Ortu', `${st.alamat_ortu || '-'} · ${st.kontak_ortu || '-'}`],
              ['Deskripsi Diri & Minat', st.deskripsi_diri || '-'],
              ['Rencana Pasca Lulus', planChoices],
              ['Program Studi / Bidang', st.prodi_pilihan || '-'],
              ['Langkah Pencapaian', st.langkah_pencapaian || '-'],
              ['Catatan Khusus Siswa', st.catatan_khusus || '-'],
            ]
          )
        );
      } else if (sheet === 'lampiran_b' && st) {
        const isAll = ctx.lampiranBPeriode === 'semua';
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `LAMPIRAN B — CATATAN PERKEMBANGAN MURID (${
                  isAll ? '3 Bln, 6 Bln, 9 Bln & 1 Thn' : ctx.lampiranBPeriode
                })`,
                bold: true,
                size: 24,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: `Nama: ${st.nama_lengkap} · Kelas: ${st.kelas}`,
                size: 19,
              }),
            ],
          })
        );
        const rowsMeta: {
          no: string;
          label: string;
          key: 'akademik' | 'karakter' | 'sosial_emosional' | 'kedisiplinan' | 'potensi_minat';
        }[] = [
          { no: '1', label: 'Akademik', key: 'akademik' },
          { no: '2', label: 'Karakter & Akhlak', key: 'karakter' },
          { no: '3', label: 'Sosial-Emosional', key: 'sosial_emosional' },
          { no: '4', label: 'Kedisiplinan', key: 'kedisiplinan' },
          { no: '5', label: 'Potensi & Minat', key: 'potensi_minat' },
        ];
        if (ctx.lampiranBPeriode === 'semua') {
          children.push(
            makeWordTable(
              ['No', 'Aspek', ...EVALUASI_PERIODES.map((p) => p.label)],
              rowsMeta.map((r) => [
                r.no,
                r.label,
                ...EVALUASI_PERIODES.map(
                  (p) => getSnapshotForPeriode(st.perkembangan, p.value)[r.key] || '-'
                ),
              ])
            )
          );
        } else {
          const snap = getSnapshotForPeriode(st.perkembangan, ctx.lampiranBPeriode);
          children.push(
            makeWordTable(
              ['No', 'Aspek Perkembangan', `Catatan (${ctx.lampiranBPeriode})`],
              rowsMeta.map((r) => [r.no, r.label, snap[r.key] || '-'])
            )
          );
        }
      } else if (sheet === 'lampiran_c') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: 'LAMPIRAN C — REKAP PERTEMUAN & JURNAL PERWALIAN',
                bold: true,
                size: 24,
              }),
            ],
          }),
          makeWordTable(
            ['No', 'Tanggal / Sesi', 'Murid & Bidang', 'Topik & Uraian', 'Tindak Lanjut'],
            sheetLogs.length > 0
              ? sheetLogs.map((l, idx) => [
                  String(idx + 1),
                  `${l.tanggal} (Sesi ${l.sesi_ke})`,
                  `${l.student_name} (${l.kategori})`,
                  `${l.topik}: ${l.uraian}`,
                  l.tindak_lanjut || '-',
                ])
              : [['-', '-', '-', 'Belum ada catatan pertemuan perwalian.', '-']]
          )
        );
      } else if (sheet === 'lampiran_d') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: 'LAMPIRAN D — DAFTAR HADIR PERTEMUAN PERWALIAN (SESI 1–9)',
                bold: true,
                size: 24,
              }),
            ],
          }),
          makeWordTable(
            ['No', 'Nama Murid', 'Kelas', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', '%'],
            sheetStudents.map((s, idx) => [
              String(idx + 1),
              s.nama_lengkap,
              s.kelas,
              ...Array.from({ length: 9 }, (_, i) => (s.kehadiran?.[i] ? '✓' : '-')),
              `${calcAttendancePct(s.kehadiran)}%`,
            ])
          )
        );
      } else if (sheet === 'lampiran_e' && st) {
        const studentOwnPhotos = ctx.logs.filter((l) => l.foto_url && l.student_id === st.id);
        const docPhotos = (
          studentOwnPhotos.length > 0 ? studentOwnPhotos : ctx.logs.filter((l) => l.foto_url)
        ).slice(0, 3);

        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'LAMPIRAN E — DOKUMENTASI FOTO & FORMULIR DETAIL BK',
                bold: true,
                size: 23,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: `Murid: ${st.nama_lengkap} (${st.kelas}) — Rahasia Profesional Layanan BK`,
                italics: true,
                size: 18,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: 'A. Dokumentasi Foto Kegiatan Pendampingan',
                bold: true,
                size: 19,
              }),
            ],
          })
        );

        if (docPhotos.length > 0) {
          const border = { style: BorderStyle.SINGLE, size: 6, color: '334155' };
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: border,
                bottom: border,
                left: border,
                right: border,
                insideHorizontal: border,
                insideVertical: border,
              },
              rows: [
                new TableRow({
                  cantSplit: true,
                  children: docPhotos.map((l) => {
                    const asset = getPreloadedImage(imageMap, l.foto_url);
                    return new TableCell({
                      margins: { top: 80, bottom: 80, left: 80, right: 80 },
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 60 },
                          children: asset
                            ? [makeWordImageRun(asset, 140, 96)]
                            : [new TextRun({ text: 'Foto tidak tersedia', italics: true, size: 16 })],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: l.topik || '-', bold: true, size: 16 })],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: l.tanggal || '', size: 15 })],
                        }),
                      ],
                    });
                  }),
                }),
              ],
            })
          );
        } else {
          children.push(
            new Paragraph({
              spacing: { after: 120 },
              children: [
                new TextRun({
                  text: 'Belum ada foto dokumentasi pada jurnal pertemuan.',
                  italics: true,
                  size: 18,
                }),
              ],
            })
          );
        }

        children.push(
          new Paragraph({
            spacing: { before: 140, after: 80 },
            children: [
              new TextRun({
                text: `B. Formulir Data Detail Peserta Didik (Bagian A–F) — ${st.nama_lengkap}`,
                bold: true,
                size: 19,
              }),
            ],
          }),
          makeWordTable(
            ['Bagian BK', 'Ringkasan Data'],
            [
              ['Bagian A (Keluarga)', `Anak ke-${st.bk_detail?.a7_anak_ke || '-'} dari ${st.bk_detail?.a8_jumlah_saudara || '-'} bersaudara · Tinggal: ${st.bk_detail?.a10_tinggal_bersama || '-'} · Kontak: ${st.bk_detail?.a18_wali_kontak_darurat || '-'}`],
              ['Bagian B (Kesehatan)', `TB/BB: ${st.bk_detail?.b_tinggi_berat || '-'} · Gol. Darah: ${st.bk_detail?.b_golongan_darah || '-'} · Psikis: ${st.bk_detail?.b_kondisi_psikis || '-'}`],
              ['Bagian C (Akademik)', `Mapel Disukai: ${st.bk_detail?.c_mapel_disukai || '-'} · Hambatan: ${st.bk_detail?.c_hambatan_akademik || '-'}`],
              ['Bagian D (Sosial)', `Kelebihan: ${st.bk_detail?.d_sifat_kelebihan || '-'} · Ekskul: ${st.bk_detail?.d_organisasi_ekskul || '-'}`],
              ['Bagian E (Karir)', `Cita-cita: ${st.bk_detail?.e_cita_cita || '-'} · Pilihan: ${st.bk_detail?.e_pilihan_studi_kerja || '-'}`],
              ['Bagian F (Harapan BK)', `Harapan: ${st.bk_detail?.f_harapan_layanan_bk || '-'} · Topik: ${st.bk_detail?.f_topik_konseling_diinginkan || '-'}`],
            ]
          )
        );
      }

      children.push(...buildSignatureWordNodes(ctx.config, ori, ctx.currentUser));
    }

    return {
      properties: {
        page: {
          size: {
            width: convertMillimetersToTwip(isLandscape ? 330 : 215),
            height: convertMillimetersToTwip(isLandscape ? 215 : 330),
            orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
          margin: {
            top: convertMillimetersToTwip(14),
            bottom: convertMillimetersToTwip(14),
            left: convertMillimetersToTwip(15),
            right: convertMillimetersToTwip(15),
          },
        },
      },
      children,
    };
  });

  const doc = new Document({ sections });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `Laporan_SOP_F4_${ctx.selectedDoc}.docx`);
}

export function exportPrintReportXls(ctx: PrintExportContext, isTemplate = false) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Identitas & Kop Surat (editable template & export)
  const configRows: Record<string, string | number>[] = [
    { Field: 'Nama Sekolah', Nilai: ctx.config.nama_sekolah },
    { Field: 'Tahun Ajaran', Nilai: ctx.config.tahun_ajaran },
    { Field: 'Tempat & Tanggal', Nilai: resolvePrintTempatTanggal(ctx.config) },
    { Field: 'Nama Guru Wali', Nilai: ctx.config.nama_guru_wali },
    { Field: 'NIP Guru Wali', Nilai: ctx.config.nip_guru_wali },
    { Field: 'Nama Kepala Sekolah', Nilai: ctx.config.nama_kepsek },
    { Field: 'NIP Kepala Sekolah', Nilai: ctx.config.nip_kepsek },
    ...ctx.config.kop_lines.map((line, i) => ({
      Field: `Kop Baris ${i + 1}`,
      Nilai: line.text,
    })),
  ];
  const wsConfig = XLSX.utils.json_to_sheet(configRows);
  wsConfig['!cols'] = [{ wch: 24 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsConfig, 'Identitas_Kop');

  // Sheet 2: Lampiran A (Data Murid)
  const studentRows = (ctx.students.length > 0 ? ctx.students : []).map(getStudentExportColumns);
  const wsMurid = XLSX.utils.json_to_sheet(
    studentRows.length > 0 ? studentRows : [STUDENT_TEMPLATE_SAMPLE]
  );
  XLSX.utils.book_append_sheet(wb, wsMurid, 'Data_Murid');

  if (!isTemplate) {
    // Sheet 3: Lampiran B (5 Aspek 4 Periode)
    const aspekStudents =
      ctx.selectedStudents && ctx.selectedStudents.length > 0 ? ctx.selectedStudents : ctx.students;
    const aspekRows: Record<string, string>[] = [];
    aspekStudents.forEach((st) => {
      EVALUASI_PERIODES.forEach((p) => {
        const snap = getSnapshotForPeriode(st.perkembangan, p.value);
        aspekRows.push({
          'Nama Murid': st.nama_lengkap,
          Kelas: st.kelas,
          Periode: p.label,
          Akademik: snap.akademik || '-',
          Karakter: snap.karakter || '-',
          'Sosial-Emosional': snap.sosial_emosional || '-',
          Kedisiplinan: snap.kedisiplinan || '-',
          'Potensi & Minat': snap.potensi_minat || '-',
        });
      });
    });
    const wsAspek = XLSX.utils.json_to_sheet(aspekRows);
    XLSX.utils.book_append_sheet(wb, wsAspek, 'Lampiran_B_5_Aspek');

    // Sheet 4: Lampiran C (Jurnal)
    const logRows = ctx.logs.map((l, idx) => ({
      No: idx + 1,
      Tanggal: l.tanggal,
      Sesi: l.sesi_ke,
      Murid: l.student_name,
      Bidang: l.kategori,
      Topik: l.topik,
      Uraian: l.uraian,
      'Tindak Lanjut': l.tindak_lanjut,
      Status: l.status_kanban,
    }));
    const wsLogs = XLSX.utils.json_to_sheet(logRows);
    XLSX.utils.book_append_sheet(wb, wsLogs, 'Lampiran_C_Jurnal');

    // Sheet 5: Lampiran D (Daftar Hadir 1-9)
    const attRows = ctx.students.map((st, idx) => ({
      No: idx + 1,
      'Nama Murid': st.nama_lengkap,
      Kelas: st.kelas,
      P1: st.kehadiran?.[0] ? 'Hadir' : '-',
      P2: st.kehadiran?.[1] ? 'Hadir' : '-',
      P3: st.kehadiran?.[2] ? 'Hadir' : '-',
      P4: st.kehadiran?.[3] ? 'Hadir' : '-',
      P5: st.kehadiran?.[4] ? 'Hadir' : '-',
      P6: st.kehadiran?.[5] ? 'Hadir' : '-',
      P7: st.kehadiran?.[6] ? 'Hadir' : '-',
      P8: st.kehadiran?.[7] ? 'Hadir' : '-',
      P9: st.kehadiran?.[8] ? 'Hadir' : '-',
      'Persentase (%)': calcAttendancePct(st.kehadiran),
    }));
    const wsAtt = XLSX.utils.json_to_sheet(attRows);
    XLSX.utils.book_append_sheet(wb, wsAtt, 'Lampiran_D_Presensi');
  }

  XLSX.writeFile(
    wb,
    isTemplate
      ? 'Template_Cetak_SOP_F4_WaliConnect.xlsx'
      : `Laporan_Cetak_SOP_F4_${ctx.selectedDoc}.xlsx`
  );
}

export async function downloadPrintTemplateWord(config: WcPrintConfig) {
  const rows: [string, string][] = [
    ['Nama Sekolah', config.nama_sekolah],
    ['Tahun Ajaran', config.tahun_ajaran],
    ['Tempat & Tanggal', resolvePrintTempatTanggal(config)],
    ['Nama Guru Wali', config.nama_guru_wali],
    ['NIP Guru Wali', config.nip_guru_wali],
    ['Nama Kepala Sekolah', config.nama_kepsek],
    ['NIP Kepala Sekolah', config.nip_kepsek],
    ...config.kop_lines.map((line, i): [string, string] => [`Kop Baris ${i + 1}`, line.text]),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(215),
              height: convertMillimetersToTwip(330),
              orientation: PageOrientation.PORTRAIT,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: 'TEMPLATE KONFIGURASI CETAK & KOP SURAT F4 — WALICONNECT PRO',
                bold: true,
                size: 26,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: 'Ubah kolom Nilai di bawah, simpan sebagai .docx, lalu unggah kembali lewat tombol Import XLS / Word.',
                italics: true,
                size: 18,
              }),
            ],
          }),
          makeWordTable(['Field', 'Nilai'], rows),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, 'Template_Cetak_SOP_F4_WaliConnect.docx');
}

export interface ImportedPrintPayload {
  configPatch: Partial<WcPrintConfig>;
  importedStudents: WcStudent[];
}

function applyKeyValueConfigRows(
  pairs: { field: string; val: string }[],
  currentConfig: WcPrintConfig
): Partial<WcPrintConfig> {
  const patch: Partial<WcPrintConfig> = {};
  const nextKop: KopLine[] = currentConfig.kop_lines.map((l) => ({ ...l }));

  pairs.forEach(({ field, val }) => {
    const f = field.trim().toLowerCase();
    const v = val.trim();
    if (!v) return;
    if (f.includes('nama sekolah')) patch.nama_sekolah = v;
    else if (f.includes('tahun ajaran')) patch.tahun_ajaran = v;
    else if (f.includes('tempat')) patch.tempat_tanggal = v;
    else if (f.includes('nama guru')) patch.nama_guru_wali = v;
    else if (f.includes('nip guru')) patch.nip_guru_wali = v;
    else if (f.includes('nama kepala') || f.includes('nama kepsek')) patch.nama_kepsek = v;
    else if (f.includes('nip kepala') || f.includes('nip kepsek')) patch.nip_kepsek = v;
    else {
      const m = f.match(/kop baris\s*(\d+)/);
      if (m) {
        const idx = Number(m[1]) - 1;
        if (idx >= 0 && idx < nextKop.length) {
          nextKop[idx] = { ...nextKop[idx], text: v };
          patch.kop_lines = nextKop;
        }
      }
    }
  });

  return patch;
}

export async function importPrintTemplateFromFile(
  file: File,
  currentConfig: WcPrintConfig
): Promise<ImportedPrintPayload> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.docx')) {
    const tables = await readDocxTables(file);
    const pairs: { field: string; val: string }[] = [];
    const importedStudents: WcStudent[] = [];

    tables.forEach((tbl) => {
      if (tbl.length < 2) return;
      const h0 = tbl[0].map((c) => c.toLowerCase());
      if (h0.some((c) => c.includes('field')) && h0.some((c) => c.includes('nilai'))) {
        for (let i = 1; i < tbl.length; i++) {
          pairs.push({ field: tbl[i][0] || '', val: tbl[i][1] || '' });
        }
      } else if (h0.some((c) => /nama|nis|kelas/i.test(c))) {
        const headers = tbl[0];
        for (let i = 1; i < tbl.length; i++) {
          const obj: Record<string, string> = {};
          headers.forEach((h, ci) => {
            obj[h] = tbl[i][ci] || '';
          });
          const st = mapRowToStudent(obj, importedStudents.length);
          if (st) importedStudents.push(st);
        }
      }
    });

    const configPatch = applyKeyValueConfigRows(pairs, currentConfig);
    if (Object.keys(configPatch).length === 0 && importedStudents.length === 0) {
      throw new Error(
        'Format tabel pada file Word (.docx) tidak dikenali. Gunakan Template Word Cetak F4.'
      );
    }
    return { configPatch, importedStudents };
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    let configPatch: Partial<WcPrintConfig> = {};
    const importedStudents: WcStudent[] = [];

    const cfgSheetName = wb.SheetNames.find((n) => /identitas|kop|konfig/i.test(n));
    if (cfgSheetName) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[cfgSheetName], {
        defval: '',
      });
      const pairs = rows.map((r) => ({
        field: String(r.Field ?? r.field ?? Object.values(r)[0] ?? ''),
        val: String(r.Nilai ?? r.nilai ?? Object.values(r)[1] ?? ''),
      }));
      configPatch = applyKeyValueConfigRows(pairs, currentConfig);
    }

    const muridSheetName = wb.SheetNames.find((n) => /murid|data/i.test(n));
    if (muridSheetName) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[muridSheetName], {
        defval: '',
      });
      rows.forEach((r, idx) => {
        const st = mapRowToStudent(r, idx);
        if (st) importedStudents.push(st);
      });
    }

    if (Object.keys(configPatch).length === 0 && importedStudents.length === 0) {
      throw new Error('Tidak ditemukan data Identitas/Kop atau Data Murid valid pada file Excel.');
    }
    return { configPatch, importedStudents };
  }

  throw new Error('Format file import harus .xlsx, .xls, .csv, atau .docx.');
}

// ---------- 3. GENERIC TABLE EXPORT / IMPORT / TEMPLATE / PRINT ----------

export interface PrintTablePayload {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  landscape?: boolean;
}

export function triggerTablePrint(payload: PrintTablePayload) {
  window.dispatchEvent(new CustomEvent<PrintTablePayload>('wc-print-table', { detail: payload }));
}

export function exportRecordsToXls(
  rows: Record<string, string | number>[],
  sheetName: string,
  filename: string
) {
  const wb = XLSX.utils.book_new();
  const safeRows = rows.length > 0 ? rows : [{ Info: 'Tidak ada data' }];
  const ws = XLSX.utils.json_to_sheet(safeRows);
  const keys = Object.keys(safeRows[0] || {});
  ws['!cols'] = keys.map((k) => ({ wch: Math.max(15, k.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

export function downloadRecordsXlsTemplate(
  sampleRows: Record<string, string | number>[],
  guideLines: string[],
  sheetName: string,
  filename: string
) {
  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet(sampleRows);
  const keys = Object.keys(sampleRows[0] || {});
  wsData['!cols'] = keys.map((k) => ({ wch: Math.max(16, k.length + 5) }));
  XLSX.utils.book_append_sheet(wb, wsData, sheetName.slice(0, 31));

  if (guideLines.length > 0) {
    const wsGuide = XLSX.utils.aoa_to_sheet(guideLines.map((l) => [l]));
    wsGuide['!cols'] = [{ wch: 105 }];
    XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk');
  }
  XLSX.writeFile(wb, filename);
}

export function exportRecordsToPdf(
  title: string,
  subtitle: string,
  headers: string[],
  rows: string[][],
  filename: string,
  landscape = true
) {
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [215, 330],
  });
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text(title, 14, 16);
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `${subtitle} · Dicetak: ${new Date().toLocaleDateString('id-ID')}`,
    14,
    22
  );

  autoTable(doc, {
    startY: 27,
    head: [headers],
    body: rows,
    styles: { font: 'times', fontSize: 8.2, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
  });

  doc.save(filename);
}

export async function exportRecordsToWord(
  title: string,
  subtitle: string,
  headers: string[],
  rows: string[][],
  filename: string,
  landscape = true
) {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(landscape ? 330 : 215),
              height: convertMillimetersToTwip(landscape ? 215 : 330),
              orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: convertMillimetersToTwip(12),
              bottom: convertMillimetersToTwip(12),
              left: convertMillimetersToTwip(12),
              right: convertMillimetersToTwip(12),
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: title, bold: true, size: 26 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 180 },
            children: [new TextRun({ text: subtitle, italics: true, size: 18 })],
          }),
          makeWordTable(headers, rows),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, filename);
}

export async function importRecordsFromFile(file: File): Promise<Record<string, unknown>[]> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.docx')) {
    const tables = await readDocxTables(file);
    const out: Record<string, unknown>[] = [];
    for (const tbl of tables) {
      if (tbl.length < 2) continue;
      const headers = tbl[0].map((h) => h.trim());
      if (headers.filter(Boolean).length === 0) continue;
      for (let i = 1; i < tbl.length; i++) {
        const obj: Record<string, string> = {};
        let nonEmpty = false;
        headers.forEach((h, idx) => {
          const val = (tbl[i][idx] || '').trim();
          if (val && val !== '-') nonEmpty = true;
          obj[h] = val === '-' ? '' : val;
        });
        if (nonEmpty) out.push(obj);
      }
    }
    if (out.length === 0) {
      throw new Error('Tabel data tidak ditemukan di file Word (.docx). Gunakan Template Word (.docx).');
    }
    return out;
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName =
      wb.SheetNames.find((n) => !/petunjuk|guide/i.test(n)) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (json.length === 0) {
      throw new Error('Tidak ada baris data pada file Excel/CSV.');
    }
    return json;
  }

  throw new Error('Format file belum didukung. Gunakan .xlsx, .xls, .csv, atau .docx.');
}

