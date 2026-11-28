import { createEmptyBkDetail, createEmptyPerwalianInduk, DEFAULT_LOGO_URL } from './firebase';
import type {
  BkDetail,
  EvaluasiPeriode,
  PerkembanganAspek,
  PerkembanganSnapshot,
  WcLog,
  WcPrintConfig,
  WcStudent,
  WcUser,
} from '../types/waliconnect';

export type DummySpanMode = 'to_end_date' | 'full_12_months';

export interface DummyReportOptions {
  startDate: string; // YYYY-MM-DD, default early July
  endDate: string;   // YYYY-MM-DD, default today
  spanMode: DummySpanMode;
  includeSampleClassmates?: boolean;
}

export interface DummyReportBundle {
  students: WcStudent[];
  logs: WcLog[];
  sessionDates: string[]; // 9 ISO YYYY-MM-DD dates for Sesi 1-9
  periodRanges: Record<EvaluasiPeriode, string>;
}

const SHORT_MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const FULL_MONTHS_ID = [
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

export function getDefaultJulyStartDate(refDate: Date = new Date()): string {
  const year = refDate.getMonth() >= 6 ? refDate.getFullYear() : refDate.getFullYear() - 1;
  return `${year}-07-01`;
}

export function getTodayIsoDate(refDate: Date = new Date()): string {
  const y = refDate.getFullYear();
  const m = String(refDate.getMonth() + 1).padStart(2, '0');
  const d = String(refDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDateSafe(iso: string, fallback: Date = new Date()): Date {
  if (!iso) return new Date(fallback);
  const parsed = new Date(`${iso}T09:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatShortIdDate(iso: string): string {
  const d = parseIsoDateSafe(iso);
  return `${d.getDate()} ${SHORT_MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatLongIdDate(iso: string): string {
  const d = parseIsoDateSafe(iso);
  return `${d.getDate()} ${FULL_MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function snapToSchoolDay(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  if (day === 0) {
    copy.setDate(copy.getDate() + 1); // Sunday -> Monday
  } else if (day === 6) {
    copy.setDate(copy.getDate() - 1); // Saturday -> Friday
  }
  return copy;
}

function addMonths(base: Date, months: number): Date {
  const copy = new Date(base);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function computeDummyPeriodRanges(startDate: string): Record<EvaluasiPeriode, string> {
  const start = parseIsoDateSafe(startDate);
  const fmtSpan = (from: Date, to: Date) => {
    const fLabel = `${SHORT_MONTHS_ID[from.getMonth()]} ${from.getFullYear()}`;
    const tLabel = `${SHORT_MONTHS_ID[to.getMonth()]} ${to.getFullYear()}`;
    return from.getFullYear() === to.getFullYear()
      ? `${SHORT_MONTHS_ID[from.getMonth()]}–${tLabel}`
      : `${fLabel}–${tLabel}`;
  };

  const m3Start = start;
  const m3End = new Date(addMonths(start, 3).getTime() - 86400000);
  const m6Start = addMonths(start, 3);
  const m6End = new Date(addMonths(start, 6).getTime() - 86400000);
  const m9Start = addMonths(start, 6);
  const m9End = new Date(addMonths(start, 9).getTime() - 86400000);
  const m12Start = addMonths(start, 9);
  const m12End = new Date(addMonths(start, 12).getTime() - 86400000);

  return {
    '3 Bulan': fmtSpan(m3Start, m3End),
    '6 Bulan': fmtSpan(m6Start, m6End),
    '9 Bulan': fmtSpan(m9Start, m9End),
    '1 Tahun': fmtSpan(m12Start, m12End),
  };
}

export function computeSessionDates(
  startDate: string,
  endDate: string,
  spanMode: DummySpanMode
): string[] {
  const start = parseIsoDateSafe(startDate);
  let end =
    spanMode === 'full_12_months'
      ? new Date(addMonths(start, 11).getTime() + 18 * 86400000)
      : parseIsoDateSafe(endDate);

  if (end.getTime() <= start.getTime() + 14 * 86400000) {
    end = new Date(start.getTime() + 120 * 86400000);
  }

  const totalMs = end.getTime() - start.getTime();
  const dates: string[] = [];
  let prevTime = 0;

  for (let i = 0; i < 9; i++) {
    const ratio = i / 8;
    const raw = new Date(start.getTime() + totalMs * ratio);
    const schoolDay = snapToSchoolDay(raw);
    if (schoolDay.getTime() <= prevTime) {
      schoolDay.setTime(prevTime + 86400000 * 2);
      const adjusted = snapToSchoolDay(schoolDay);
      prevTime = adjusted.getTime();
      dates.push(toIsoDate(adjusted));
    } else {
      prevTime = schoolDay.getTime();
      dates.push(toIsoDate(schoolDay));
    }
  }

  return dates;
}

function buildStudentPerkembangan(
  student: WcStudent,
  startDate: string
): PerkembanganAspek {
  const ranges = computeDummyPeriodRanges(startDate);
  const nama = student.nama_panggilan?.trim() || student.nama_lengkap.split(' ')[0] || 'Murid';
  const kelas = student.kelas || 'XI';
  const hobi =
    student.hobi?.trim() ||
    student.perwalian_induk?.hobi_bakat?.trim() ||
    'kegiatan akademik dan organisasi sekolah';
  const mapelSuka =
    student.bk_detail?.c_mapel_disukai?.trim() ||
    student.perwalian_induk?.mapel_disukai?.trim() ||
    'mata pelajaran peminatan utama';
  const mapelSulit =
    student.bk_detail?.c_mapel_sulit?.trim() ||
    student.perwalian_induk?.mapel_sulit?.trim() ||
    'pemecahan soal penalaran tingkat lanjut';
  const prodi = student.prodi_pilihan?.trim() || 'bidang studi/karir pilihan';
  const rencana = student.rencana_lulus || 'Kuliah';

  const snap3: PerkembanganSnapshot = {
    akademik: `[${ranges['3 Bulan']}] Adaptasi materi di kelas ${kelas} berjalan baik. ${nama} menunjukkan ketertarikan kuat pada ${mapelSuka}, sementara pendampingan awal difokuskan pada strategi belajar ${mapelSulit}.`,
    karakter: `Menunjukkan sikap sopan, jujur, dan responsif terhadap arahan Guru Wali sejak awal tahun ajaran. Mulai terbiasa menjaga etika berkomunikasi di kelas.`,
    sosial_emosional: `Berinteraksi positif dengan teman sekelas dan mulai terbuka menceritakan target serta tantangan belajar saat sesi perwalian awal.`,
    kedisiplinan: `Kehadiran pagi dan kerapian seragam tertib. Mulai menerapkan agenda catatan tugas harian agar pengumpulan tugas lebih teratur.`,
    potensi_minat: `Minat pada ${hobi} terlihat menonjol sejak awal semester. Direkomendasikan aktif mengikuti ekstrakurikuler pendukung target ${rencana} (${prodi}).`,
    updated_at: startDate,
  };

  const snap6: PerkembanganSnapshot = {
    akademik: `[${ranges['6 Bulan']}] Grafik nilai ulangan harian dan proyek tengah semester meningkat stabil. ${nama} mulai konsisten mengikuti jadwal belajar terstruktur dan diskusi sebaya pada ${mapelSulit}.`,
    karakter: `Rasa tanggung jawab dalam tugas kelompok dan kepedulian membantu teman yang mengalami kesulitan semakin tampak nyata.`,
    sosial_emosional: `Mampu mengelola kecemasan belajar menjelang evaluasi semester dengan lebih tenang serta menjaga komunikasi rutin bersama orang tua dan Guru Wali.`,
    kedisiplinan: `Ketepatan pengumpulan tugas meningkat di atas 90%, presensi pertemuan perwalian terjaga sangat baik tanpa keterlambatan berarti.`,
    potensi_minat: `Mulai menghimpun portofolio karya/capaian di bidang ${hobi} sebagai bekal awal perencanaan jalur ${rencana} (${prodi}).`,
    updated_at: startDate,
  };

  const snap9: PerkembanganSnapshot = {
    akademik: `[${ranges['9 Bulan']}] Capaian belajar konsisten melampaui kriteria ketuntasan pada mayoritas mata pelajaran. ${nama} sudah mampu melakukan evaluasi mandiri terhadap kekeliruan latihan soal.`,
    karakter: `Kematangan sikap, keteladanan kedisiplinan, dan inisiatif kepemimpinan di lingkungan kelas semakin kuat.`,
    sosial_emosional: `Emosi stabil, bersikap asertif dalam menyelesaikan perbedaan pendapat dengan teman, dan proaktif meminta umpan balik Guru Wali.`,
    kedisiplinan: `Konsisten menjaga ritme belajar di sekolah dan di rumah dengan pemantauan berkala dari orang tua/wali murid.`,
    potensi_minat: `Aktif mengikuti pembinaan prestasi, proyek terapan, atau organisasi sekolah yang selaras dengan tujuan ${prodi}.`,
    updated_at: startDate,
  };

  const snap12: PerkembanganSnapshot = {
    akademik: `[${ranges['1 Tahun']}] Tuntas seluruh target pembelajaran 1 tahun ajaran dengan peningkatan rata-rata rapor yang memuaskan serta kesiapan penuh menghadapi jenjang berikutnya.`,
    karakter: `Tumbuh menjadi pribadi yang tangguh, berintegritas, komunikatif, dan bertanggung jawab dalam situasi akademik maupun sosial.`,
    sosial_emosional: `Kemandirian emosional, empati sosial, dan ketahanan menghadapi tekanan target akademik terbentuk secara seimbang.`,
    kedisiplinan: `Menjadi teladan kedisiplinan kehadiran, kerapian, dan ketuntasan agenda belajar sepanjang 1 tahun pendampingan perwalian.`,
    potensi_minat: `Portofolio minat ${hobi} dan rencana tindak lanjut pasca-lulus (${rencana} — ${prodi}) telah tersusun matang untuk fase pembinaan berikutnya.`,
    updated_at: startDate,
  };

  return {
    ...snap6,
    periode: '1 Tahun',
    by_periode: {
      '3 Bulan': snap3,
      '6 Bulan': snap6,
      '9 Bulan': snap9,
      '1 Tahun': snap12,
    },
    updated_at: new Date().toISOString(),
  };
}

function buildCompleteBkDetail(student: WcStudent): BkDetail {
  const empty = createEmptyBkDetail();
  const prev = student.bk_detail || empty;
  const ind = student.perwalian_induk || createEmptyPerwalianInduk();
  const hobi = student.hobi || ind.hobi_bakat || 'Literasi Digital, Olahraga, & Organisasi';
  const prodi = student.prodi_pilihan || 'Perguruan Tinggi Negeri / Bidang Vokasi Unggulan';
  const ayahWork = student.pekerjaan_ayah || 'Karyawan Swasta';
  const ibuWork = student.pekerjaan_ibu || 'Ibu Rumah Tangga / Wiraswasta';

  return {
    a1_nama_lengkap: prev.a1_nama_lengkap || student.nama_lengkap,
    a2_nama_panggilan: prev.a2_nama_panggilan || student.nama_panggilan || student.nama_lengkap.split(' ')[0],
    a3_ttl: prev.a3_ttl || student.ttl || 'Jakarta, 14 Mei 2008',
    a4_agama: prev.a4_agama || student.agama || 'Islam',
    a5_suku_bangsa: prev.a5_suku_bangsa || 'Indonesia',
    a6_bahasa_rumah: prev.a6_bahasa_rumah || 'Bahasa Indonesia',
    a7_anak_ke: prev.a7_anak_ke || ind.anak_ke || '1',
    a8_jumlah_saudara: prev.a8_jumlah_saudara || ind.jumlah_saudara || '2',
    a9_status_keluarga: prev.a9_status_keluarga || 'Anak Kandung',
    a10_tinggal_bersama: prev.a10_tinggal_bersama || ind.status_tempat_tinggal || 'Orang Tua Kandung',
    a11_jarak_rumah:
      prev.a11_jarak_rumah || (ind.jarak_tempuh_km ? `${ind.jarak_tempuh_km} km dari sekolah` : '4,5 km dari sekolah'),
    a12_transportasi: prev.a12_transportasi || ind.moda_transportasi || 'Sepeda motor / Diantar orang tua',
    a13_nama_ayah: prev.a13_nama_ayah || student.nama_ayah || 'Hendra Wijaya',
    a14_pendidikan_pekerjaan_ayah:
      prev.a14_pendidikan_pekerjaan_ayah || `${ind.pendidikan_ayah || 'S1'} / ${ayahWork}`,
    a15_nama_ibu: prev.a15_nama_ibu || student.nama_ibu || 'Siti Rahmawati',
    a16_pendidikan_pekerjaan_ibu:
      prev.a16_pendidikan_pekerjaan_ibu || `${ind.pendidikan_ibu || 'S1'} / ${ibuWork}`,
    a17_penghasilan_keluarga:
      prev.a17_penghasilan_keluarga || ind.penghasilan_ayah || 'Rp 6.000.000 - Rp 10.000.000 / bulan',
    a18_wali_kontak_darurat:
      prev.a18_wali_kontak_darurat ||
      (student.kontak_ortu
        ? `${student.nama_ayah || 'Orang Tua'} - ${student.kontak_ortu}`
        : 'Orang Tua / Wali - 081288901100'),
    b_tinggi_berat:
      prev.b_tinggi_berat ||
      (ind.tinggi_badan_cm && ind.berat_badan_kg
        ? `${ind.tinggi_badan_cm} cm / ${ind.berat_badan_kg} kg`
        : '166 cm / 56 kg'),
    b_golongan_darah: prev.b_golongan_darah || ind.golongan_darah || 'O',
    b_riwayat_penyakit: prev.b_riwayat_penyakit || ind.riwayat_penyakit || 'Tidak ada keluhan penyakit kronis',
    b_alergi_pantangan: prev.b_alergi_pantangan || ind.riwayat_alergi || 'Tidak ada alergi makanan/obat',
    b_kondisi_penglihatan_pendengaran:
      prev.b_kondisi_penglihatan_pendengaran || ind.kebutuhan_alat_bantu || 'Penglihatan & pendengaran baik',
    b_kondisi_psikis:
      prev.b_kondisi_psikis || ind.kondisi_psikologis || 'Stabil, kooperatif, dan memiliki motivasi belajar tinggi',
    c_mapel_disukai: prev.c_mapel_disukai || ind.mapel_disukai || 'Matematika, Bahasa Inggris, Informatika',
    c_mapel_sulit: prev.c_mapel_sulit || ind.mapel_sulit || 'Penalaran soal analisis & penulisan esai ilmiah',
    c_waktu_belajar: prev.c_mapel_sulit ? prev.c_waktu_belajar || 'Pukul 19.30 - 21.00 WIB' : 'Pukul 19.30 - 21.00 WIB',
    c_fasilitas_belajar:
      prev.c_fasilitas_belajar || ind.kepemilikan_gawai_internet || 'Meja belajar pribadi, gawai/laptop, koneksi Wi-Fi rumah',
    c_hambatan_akademik:
      prev.c_hambatan_akademik || 'Manajemen waktu antara persiapan ulangan harian dan kegiatan ekstrakurikuler',
    c_prestasi_akademik:
      prev.c_prestasi_akademik || ind.prestasi || 'Peringkat 5 besar kelas & peserta aktif kompetisi akademik sekolah',
    d_sifat_kelebihan:
      prev.d_sifat_kelebihan || 'Disiplin, komunikatif, teliti, mudah diajak bekerja sama dalam tim',
    d_aspek_perlu_dikembangkan:
      prev.d_aspek_perlu_dikembangkan || 'Kepercayaan diri saat presentasi publik dan konsistensi jadwal istirahat',
    d_hubungan_keluarga: prev.d_hubungan_keluarga || 'Harmonis, orang tua rutin memantau perkembangan belajar di rumah',
    d_hubungan_teman_sebaya:
      prev.d_hubungan_teman_sebaya || 'Akrab dengan teman sekelas dan aktif membantu dalam diskusi kelompok',
    d_organisasi_ekskul:
      prev.d_organisasi_ekskul || ind.ekskul_organisasi || `Aktif pada kegiatan ${hobi}`,
    d_masalah_pribadi_sosial:
      prev.d_masalah_pribadi_sosial || 'Tidak ada konflik sosial; sesekali merasa tegang menjelang ujian semester',
    e_cita_cita: prev.e_cita_cita || ind.cita_cita || `Profesional & Akademisi di bidang ${prodi}`,
    e_rencana_setelah_lulus:
      prev.e_rencana_setelah_lulus ||
      `${student.rencana_lulus || 'Kuliah'} — melanjutkan pengembangan kompetensi di ${prodi}`,
    e_pilihan_studi_kerja: prev.e_pilihan_studi_kerja || prodi,
    e_dukungan_orang_tua:
      prev.e_dukungan_orang_tua || 'Orang tua mendukung penuh rencana studi lanjut dan memfasilitasi bimbingan belajar',
    f_harapan_layanan_bk:
      prev.f_harapan_layanan_bk || 'Pendampingan pemetaan minat karir, strategi SNBP/SNBT, dan konsultasi berkala',
    f_topik_konseling_diinginkan:
      prev.f_topik_konseling_diinginkan || 'Manajemen waktu belajar efektif & kesiapan mental menghadapi seleksi',
    f_kesediaan_orang_tua:
      prev.f_kesediaan_orang_tua || 'Bersedia hadir & berkoordinasi rutin bersama Guru Wali dan Tim BK',
  };
}

const FALLBACK_DUMMY_STUDENTS: WcStudent[] = [
  {
    id: 'dummy-std-01',
    nama_lengkap: 'Bimo Setiawan',
    nama_panggilan: 'Bimo',
    jenis_kelamin: 'L',
    kelas: 'XI MIPA 1',
    no_absen: '07',
    nis: '20241101',
    nisn: '0084512301',
    ttl: 'Jakarta, 14 Mei 2008',
    whatsapp: '081288901122',
    email: 'bimo.setiawan@student.sch.id',
    alamat: 'Jl. Cempaka Putih Tengah No. 18, Jakarta Pusat',
    agama: 'Islam',
    hobi: 'Robotika, Pemrograman Python, Catur',
    status_siswa: 'Aktif',
    nama_ayah: 'Hendra Setiawan, S.T.',
    pekerjaan_ayah: 'Insinyur Sipil',
    nama_ibu: 'Rina Kusuma, S.E.',
    pekerjaan_ibu: 'Akuntan',
    alamat_ortu: 'Jl. Cempaka Putih Tengah No. 18, Jakarta Pusat',
    kontak_ortu: '081288901100',
    deskripsi_diri: 'Tertarik pada pengembangan perangkat lunak, robotika, dan pemecahan masalah logika.',
    rencana_lulus: 'Kuliah',
    prodi_pilihan: 'Teknik Informatika / Ilmu Komputer',
    langkah_pencapaian: '1. Mempertahankan peringkat 3 besar.\n2. Menyiapkan portofolio lomba.\n3. Latihan intensif UTBK.',
    catatan_khusus: 'Antusias dan tekun; perlu pengingat jam istirahat malam.',
    foto_url: '/src/assets/images/pas_foto_siswa_putra_1795497576745.jpg',
    kehadiran: [true, true, true, true, true, true, true, true, false],
    perkembangan: {
      akademik: '',
      karakter: '',
      sosial_emosional: '',
      kedisiplinan: '',
      potensi_minat: '',
      periode: '1 Tahun',
    },
    bk_detail: createEmptyBkDetail(),
  },
  {
    id: 'dummy-std-02',
    nama_lengkap: 'Nadira Putri Maharani',
    nama_panggilan: 'Nadira',
    jenis_kelamin: 'P',
    kelas: 'XI IPS 2',
    no_absen: '18',
    nis: '20241102',
    nisn: '0089123402',
    ttl: 'Bandung, 22 Agustus 2008',
    whatsapp: '081377654321',
    email: 'nadira.putri@student.sch.id',
    alamat: 'Jl. Rawamangun Muka Selatan No. 9, Jakarta Timur',
    agama: 'Islam',
    hobi: 'Desain Grafis, Debat Bahasa Inggris, Fotografi',
    status_siswa: 'Aktif',
    nama_ayah: 'Budi Santoso',
    pekerjaan_ayah: 'Wiraswasta Kuliner',
    nama_ibu: 'Dewi Lestari, S.Pd.',
    pekerjaan_ibu: 'Guru SD',
    alamat_ortu: 'Jl. Rawamangun Muka Selatan No. 9, Jakarta Timur',
    kontak_ortu: '081377654300',
    deskripsi_diri: 'Menyukai desain komunikasi visual, publikasi acara sekolah, dan debat Bahasa Inggris.',
    rencana_lulus: 'Kuliah',
    prodi_pilihan: 'Desain Komunikasi Visual (DKV)',
    langkah_pencapaian: '1. Menyusun 12 karya portofolio.\n2. Menjaga nilai rapor konsisten.',
    catatan_khusus: 'Aktif berorganisasi; terus menjaga keseimbangan jadwal OSIS dan akademik.',
    foto_url: '/src/assets/images/pas_foto_siswa_putri_1795497575673.jpg',
    kehadiran: [true, true, true, true, true, true, true, false, true],
    perkembangan: {
      akademik: '',
      karakter: '',
      sosial_emosional: '',
      kedisiplinan: '',
      potensi_minat: '',
      periode: '1 Tahun',
    },
    bk_detail: createEmptyBkDetail(),
  },
  {
    id: 'dummy-std-03',
    nama_lengkap: 'Rafka Pratama Wijaya',
    nama_panggilan: 'Rafka',
    jenis_kelamin: 'L',
    kelas: 'XI MIPA 1',
    no_absen: '24',
    nis: '20241103',
    nisn: '0086678903',
    ttl: 'Bekasi, 03 Februari 2008',
    whatsapp: '081599887766',
    email: 'rafka.pratama@student.sch.id',
    alamat: 'Jl. Ahmad Yani No. 27, Kayuringin',
    agama: 'Islam',
    hobi: 'Elektronika, Basket, dan Desain Produk',
    status_siswa: 'Aktif',
    nama_ayah: 'Agus Wijaya',
    pekerjaan_ayah: 'Teknisi Otomotif',
    nama_ibu: 'Lestari Handayani',
    pekerjaan_ibu: 'Wirausaha',
    alamat_ortu: 'Jl. Ahmad Yani No. 27, Kayuringin',
    kontak_ortu: '081599887700',
    deskripsi_diri: 'Gemar merakit perangkat elektronika dan aktif di tim basket sekolah.',
    rencana_lulus: 'Bekerja',
    prodi_pilihan: 'Teknik Otomasi Industri / Vokasi Mekatronika',
    langkah_pencapaian: '1. Mengikuti pelatihan sertifikasi teknis.\n2. Menjaga kehadiran praktik 100%.',
    catatan_khusus: 'Kuat pada pembelajaran kinestetik dan praktik laboratorium.',
    foto_url: '/src/assets/images/pas_foto_siswa_putra_1795497576745.jpg',
    kehadiran: [true, true, false, true, true, true, true, true, true],
    perkembangan: {
      akademik: '',
      karakter: '',
      sosial_emosional: '',
      kedisiplinan: '',
      potensi_minat: '',
      periode: '1 Tahun',
    },
    bk_detail: createEmptyBkDetail(),
  },
];

const ATTENDANCE_PATTERNS: boolean[][] = [
  [true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, false],
  [true, true, true, false, true, true, true, true, true],
  [true, true, true, true, true, true, false, true, true],
  [true, true, true, true, true, true, true, false, true],
];

export function generateDummyReportBundle(
  realStudents: WcStudent[],
  activeStudentIds: string | string[],
  config: WcPrintConfig,
  options: DummyReportOptions,
  currentUser?: WcUser | null
): DummyReportBundle {
  const periodRanges = computeDummyPeriodRanges(options.startDate);
  const sessionDates = computeSessionDates(
    options.startDate,
    options.endDate,
    options.spanMode
  );

  // Build enriched student list without mutating real records
  const baseList: WcStudent[] =
    realStudents.length > 0 ? [...realStudents] : [...FALLBACK_DUMMY_STUDENTS];

  if (options.includeSampleClassmates !== false && baseList.length < 3) {
    const existingIds = new Set(baseList.map((s) => s.id));
    for (const sample of FALLBACK_DUMMY_STUDENTS) {
      if (!existingIds.has(sample.id) && baseList.length < 4) {
        baseList.push(sample);
      }
    }
  }

  const enrichedStudents: WcStudent[] = baseList.map((st, idx) => {
    const hasCustomAttendance =
      Array.isArray(st.kehadiran) && st.kehadiran.filter(Boolean).length >= 6;
    const kehadiran = hasCustomAttendance
      ? st.kehadiran.slice(0, 9).concat(Array(Math.max(0, 9 - st.kehadiran.length)).fill(true))
      : ATTENDANCE_PATTERNS[idx % ATTENDANCE_PATTERNS.length];

    return {
      ...st,
      kehadiran,
      perkembangan: buildStudentPerkembangan(st, options.startDate),
      bk_detail: buildCompleteBkDetail(st),
    };
  });

  const targetIdList = Array.isArray(activeStudentIds)
    ? activeStudentIds
    : activeStudentIds
      ? [activeStudentIds]
      : [];
  const selectedPool = enrichedStudents.filter((s) => targetIdList.includes(s.id));
  const focusList = selectedPool.length > 0 ? selectedPool : [enrichedStudents[0]];
  const focusStudent = focusList[0];

  const authorName = currentUser?.nama || config.nama_guru_wali || 'Dra. Ratna Sari Dewi, M.Pd.';
  const authorRole = currentUser?.role || 'Guru Wali';

  const photoSesi = '/src/assets/images/dokumentasi_perwalian_sesi_1795497577158.jpg';
  const photoAgenda = '/src/assets/images/poster_agenda_sekolah_1795497576721.jpg';
  const photoSiswa = focusStudent.foto_url || DEFAULT_LOGO_URL;

  const dummyLogs: WcLog[] = Array.from({ length: 9 }, (_, idx) => {
    const st = focusList[idx % focusList.length];
    const nama = st.nama_panggilan || st.nama_lengkap.split(' ')[0];
    const prodi = st.prodi_pilihan || 'program studi tujuan';
    const mapelSulit = st.bk_detail?.c_mapel_sulit || 'materi penalaran lanjut';
    const hobi = st.hobi || 'kegiatan ekstrakurikuler sekolah';

    const templates: Omit<
      WcLog,
      'id' | 'student_id' | 'student_name' | 'created_at' | 'author_name' | 'author_role'
    >[] = [
      {
        tanggal: sessionDates[0],
        sesi_ke: 1,
        kategori: 'Akademik',
        topik: 'Pemetaan Profil Awal, Gaya Belajar & Kontrak Perwalian (Awal Juli)',
        uraian: `Pertemuan perdana bersama ${st.nama_lengkap} untuk memetakan gaya belajar, target nilai semester ganjil, serta menyusun komitmen kehadiran bimbingan rutin selama 1 tahun ajaran.`,
        tindak_lanjut:
          '1. Mengisi lengkap formulir biodata & BK Bagian A–F.\n2. Menetapkan jadwal belajar mandiri harian pukul 19.30–21.00 WIB.',
        status_kanban: 'Selesai Tertangani',
        foto_url: photoSesi,
      },
      {
        tanggal: sessionDates[1],
        sesi_ke: 2,
        kategori: 'Karakter',
        topik: 'Adaptasi Lingkungan Kelas, Etika Pergaulan & Pembentukan Kebiasaan Baik',
        uraian: `${nama} merefleksikan pengalaman adaptasi di kelas ${st.kelas}. Pembiasaan sikap saling menghargai, kejujuran tugas, dan keaktifan positif dalam diskusi kelompok berjalan baik.`,
        tindak_lanjut:
          'Menerapkan checklist tanggung jawab tugas mingguan dan melaporkan perkembangan keaktifan kelas pada sesi berikutnya.',
        status_kanban: 'Selesai Tertangani',
      },
      {
        tanggal: sessionDates[2],
        sesi_ke: 3,
        kategori: 'Akademik',
        topik: `Evaluasi Triwulan I (3 Bulan): Strategi Penguatan ${mapelSulit}`,
        uraian: `Evaluasi hasil ulangan harian selama 3 bulan pertama. Nilai mata pelajaran unggulan sudah sangat baik; ditemukan kebutuhan latihan terarah pada ${mapelSulit}.`,
        tindak_lanjut:
          '1. Membentuk kelompok belajar sebaya seminggu sekali.\n2. Mengerjakan 5 soal latihan bertahap setiap akhir pekan untuk dibahas bersama guru mapel.',
        status_kanban: 'Selesai Tertangani',
      },
      {
        tanggal: sessionDates[3],
        sesi_ke: 4,
        kategori: 'Sosial-Emosional',
        topik: 'Pengelolaan Stres Tugas, Relasi Teman Sebaya & Dukungan Orang Tua',
        uraian: `Sesi konseling reflektif mengenai keseimbangan emosi saat jadwal tugas menumpuk. ${nama} merasa terbantu setelah membagi prioritas harian dan berdiskusi terbuka dengan orang tua di rumah.`,
        tindak_lanjut:
          'Menjaga komunikasi berkala dengan orang tua melalui pesan wali serta memastikan waktu tidur sebelum pukul 22.00 WIB.',
        status_kanban: 'Selesai Tertangani',
      },
      {
        tanggal: sessionDates[4],
        sesi_ke: 5,
        kategori: 'Kedisiplinan',
        topik: 'Monitoring Kedisiplinan Kehadiran, Ketepatan Tugas & Penggunaan Gawai',
        uraian: `Peninjauan kedisiplinan harian dan manajemen penggunaan gawai di luar jam belajar. Ketepatan waktu masuk kelas dan kelengkapan tugas mandiri menunjukkan peningkatan konsisten.`,
        tindak_lanjut:
          'Mempertahankan catatan kehadiran >90% dan membatasi penggunaan media sosial pada jam belajar efektif.',
        status_kanban: 'Selesai Tertangani',
      },
      {
        tanggal: sessionDates[5],
        sesi_ke: 6,
        kategori: 'Karir',
        topik: `Evaluasi Semester I (6 Bulan): Pemetaan Bakat ${hobi} & Konsultasi Orang Tua`,
        uraian: `Peninjauan capaian 6 bulan (5 Aspek) sekaligus sinkronisasi rencana lanjutan (${st.rencana_lulus || 'Kuliah'} — ${prodi}) bersama orang tua/wali murid.`,
        tindak_lanjut:
          '1. Menghimpun bukti karya/prestasi ke dalam folder portofolio.\n2. Menindaklanjuti rekomendasi pengembangan minat pada semester genap.',
        status_kanban: 'Selesai Tertangani',
        foto_url: photoAgenda,
      },
      {
        tanggal: sessionDates[6],
        sesi_ke: 7,
        kategori: 'Akademik',
        topik: 'Pendampingan Proyek Kompetensi, Ekstrakurikuler & Peningkatan Rapor',
        uraian: `Monitoring progres nilai semester genap serta keterlibatan aktif ${nama} dalam ${hobi}. Kemampuan manajemen waktu antara lomba/organisasi dan akademik semakin terarah.`,
        tindak_lanjut:
          'Menyelesaikan proyek unggulan sekolah tepat waktu dan melakukan evaluasi berkala bersama Guru Mapel terkait.',
        status_kanban: 'Dalam Proses',
      },
      {
        tanggal: sessionDates[7],
        sesi_ke: 8,
        kategori: 'Sosial-Emosional',
        topik: 'Evaluasi 9 Bulan: Kemandirian Emosi, Kepemimpinan & Ketahanan Diri',
        uraian: `Capaian 9 bulan menunjukkan kematangan sosial-emosional ${nama} dalam memimpin diskusi kelas, bersikap empatik kepada teman, dan menjaga stabilitas fokus belajar.`,
        tindak_lanjut:
          'Menguatkan peran positif di kelas dan menyiapkan refleksi akhir tahun sebelum evaluasi 12 bulan.',
        status_kanban: 'Dalam Proses',
      },
      {
        tanggal: sessionDates[8],
        sesi_ke: 9,
        kategori: 'Karir',
        topik: `Evaluasi 12 Bulan / Akhir Periode & Finalisasi Rencana ${prodi}`,
        uraian: `Evaluasi komprehensif 5 Aspek perkembangan selama pendampingan sejak ${formatLongIdDate(options.startDate)}. Seluruh target akademik, karakter, dan portofolio pasca-lulus (${prodi}) siap disahkan.`,
        tindak_lanjut:
          '1. Finalisasi Lampiran A–E Buku Jurnal Guru Wali.\n2. Penyerahan laporan perkembangan resmi kepada Kepala Sekolah dan Orang Tua.',
        status_kanban: 'Selesai Tertangani',
        foto_url: st.foto_url || photoSiswa,
      },
    ];

    const tpl = templates[idx];
    return {
      ...tpl,
      id: `dummy-log-${idx + 1}`,
      student_id: st.id,
      student_name: st.nama_lengkap,
      author_name: authorName,
      author_role: authorRole,
      created_at: `${tpl.tanggal}T09:00:00.000Z`,
    };
  });

  return {
    students: enrichedStudents,
    logs: dummyLogs,
    sessionDates,
    periodRanges,
  };
}
