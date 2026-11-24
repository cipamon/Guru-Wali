import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  BkDetail,
  WcAnnouncement,
  WcAppConfig,
  WcLog,
  WcMessage,
  WcPrintConfig,
  WcStudent,
  WcUser,
} from '../types/waliconnect';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const APP_ID = 'waliconnect-pro';
export const BASE_DATA_PATH = `artifacts/${APP_ID}/public/data`;

export const COLLECTIONS = {
  users: `${BASE_DATA_PATH}/wc_users`,
  students: `${BASE_DATA_PATH}/wc_students`,
  logs: `${BASE_DATA_PATH}/wc_logs`,
  messages: `${BASE_DATA_PATH}/wc_messages`,
  announcements: `${BASE_DATA_PATH}/wc_announcements`,
  settings: `${BASE_DATA_PATH}/wc_settings`,
} as const;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Koneksi Firestore offline. Periksa konfigurasi Firebase Anda.');
    }
    return false;
  }
}

export function colRef(path: string) {
  return collection(db, path);
}

export function docRef(path: string, id: string) {
  return doc(db, path, id);
}

export const DEFAULT_LOGO_URL = '/src/assets/images/logo_tut_wuri_sekolah_1795497577574.jpg';

export const DEFAULT_PRINT_CONFIG: WcPrintConfig = {
  tahun_ajaran: '2025 / 2026',
  tempat_tanggal: 'Jakarta, 24 November 2025',
  logo_kiri: DEFAULT_LOGO_URL,
  logo_kanan: DEFAULT_LOGO_URL,
  nama_sekolah: 'SMA NEGERI 1 JAYAKARTA',
  nama_guru_wali: 'Dra. Ratna Sari Dewi, M.Pd.',
  nip_guru_wali: '197804122005012008',
  nama_kepsek: 'Dr. H. Ahmad Fauzan, M.M.',
  nip_kepsek: '197108171998021003',
  kop_lines: [
    {
      id: 'kop-1',
      text: 'PEMERINTAH PROVINSI DAERAH KHUSUS JAKARTA',
      fontFamily: 'serif',
      fontSize: 11,
      bold: true,
      italic: false,
      underline: false,
    },
    {
      id: 'kop-2',
      text: 'DINAS PENDIDIKAN MENENGAH DAN KEJURUAN',
      fontFamily: 'serif',
      fontSize: 12,
      bold: true,
      italic: false,
      underline: false,
    },
    {
      id: 'kop-3',
      text: 'SMA NEGERI 1 JAYAKARTA',
      fontFamily: 'serif',
      fontSize: 15,
      bold: true,
      italic: false,
      underline: false,
    },
    {
      id: 'kop-4',
      text: 'Jl. Pendidikan Raya No. 45, Menteng, Jakarta Pusat 10310',
      fontFamily: 'sans',
      fontSize: 9,
      bold: false,
      italic: false,
      underline: false,
    },
    {
      id: 'kop-5',
      text: 'Telp. (021) 3190-4455 | Laman: www.sman1jayakarta.sch.id | Pos-el: info@sman1jayakarta.sch.id',
      fontFamily: 'sans',
      fontSize: 8.5,
      bold: false,
      italic: true,
      underline: false,
    },
    {
      id: 'kop-6',
      text: 'TERAKREDITASI A (UNGGUL) — SK BAN-PDM NOMOR 104/BAN-PDM/2024',
      fontFamily: 'sans',
      fontSize: 8,
      bold: true,
      italic: false,
      underline: false,
    },
  ],
  ttd_layout: 'kepsek_guru',
  ttd_offset_x: 0,
  ttd_left_offset_x: 0,
  ttd_right_offset_x: 0,
  ttd_spacer: 48,
  ttd_align: 'left',
  ttd_left_rows: [
    { id: 'l1', text: 'Mengetahui,', bold: false, underline: false },
    { id: 'l2', text: 'Kepala SMA Negeri 1 Jayakarta', bold: true, underline: false },
    { id: 'l3', text: 'Dr. H. Ahmad Fauzan, M.M.', bold: true, underline: true, spacerBefore: true },
    { id: 'l4', text: 'NIP. 197108171998021003', bold: false, underline: false },
  ],
  ttd_right_rows: [
    { id: 'r1', text: 'Jakarta, 24 November 2025', bold: false, underline: false },
    { id: 'r2', text: 'Guru Wali Pendamping,', bold: true, underline: false },
    { id: 'r3', text: 'Dra. Ratna Sari Dewi, M.Pd.', bold: true, underline: true, spacerBefore: true },
    { id: 'r4', text: 'NIP. 197804122005012008', bold: false, underline: false },
  ],
  orientations: {
    sampul: 'portrait',
    sop: 'portrait',
    lampiran_a: 'portrait',
    lampiran_b: 'portrait',
    lampiran_c: 'portrait',
    lampiran_d: 'portrait',
    lampiran_e: 'portrait',
  },
  doc_font: 'times',
  ttd_landscape: {
    ttd_layout: 'kepsek_guru',
    ttd_offset_x: 0,
    ttd_left_offset_x: 0,
    ttd_right_offset_x: 0,
    ttd_spacer: 44,
    ttd_align: 'left',
    ttd_left_rows: [
      { id: 'ls-l1', text: 'Mengetahui,', bold: false, underline: false },
      { id: 'ls-l2', text: 'Kepala SMA Negeri 1 Jayakarta', bold: true, underline: false },
      { id: 'ls-l3', text: 'Dr. H. Ahmad Fauzan, M.M.', bold: true, underline: true, spacerBefore: true },
      { id: 'ls-l4', text: 'NIP. 197108171998021003', bold: false, underline: false },
    ],
    ttd_right_rows: [
      { id: 'ls-r1', text: 'Jakarta, 24 November 2025', bold: false, underline: false },
      { id: 'ls-r2', text: 'Guru Wali Pendamping,', bold: true, underline: false },
      { id: 'ls-r3', text: 'Dra. Ratna Sari Dewi, M.Pd.', bold: true, underline: true, spacerBefore: true },
      { id: 'ls-r4', text: 'NIP. 197804122005012008', bold: false, underline: false },
    ],
  },
};

export function createEmptyBkDetail(): BkDetail {
  return {
    a1_nama_lengkap: '',
    a2_nama_panggilan: '',
    a3_ttl: '',
    a4_agama: 'Islam',
    a5_suku_bangsa: 'Indonesia',
    a6_bahasa_rumah: 'Bahasa Indonesia',
    a7_anak_ke: '1',
    a8_jumlah_saudara: '2',
    a9_status_keluarga: 'Anak Kandung',
    a10_tinggal_bersama: 'Orang Tua Kandung',
    a11_jarak_rumah: '',
    a12_transportasi: '',
    a13_nama_ayah: '',
    a14_pendidikan_pekerjaan_ayah: '',
    a15_nama_ibu: '',
    a16_pendidikan_pekerjaan_ibu: '',
    a17_penghasilan_keluarga: '',
    a18_wali_kontak_darurat: '',
    b_tinggi_berat: '',
    b_golongan_darah: '',
    b_riwayat_penyakit: 'Tidak ada keluhan kronis',
    b_alergi_pantangan: 'Tidak ada',
    b_kondisi_penglihatan_pendengaran: 'Baik / Normal',
    b_kondisi_psikis: 'Stabil dan kooperatif',
    c_mapel_disukai: '',
    c_mapel_sulit: '',
    c_waktu_belajar: '',
    c_fasilitas_belajar: '',
    c_hambatan_akademik: '',
    c_prestasi_akademik: '',
    d_sifat_kelebihan: '',
    d_aspek_perlu_dikembangkan: '',
    d_hubungan_keluarga: 'Harmonis dan komunikatif',
    d_hubungan_teman_sebaya: 'Aktif berinteraksi baik',
    d_organisasi_ekskul: '',
    d_masalah_pribadi_sosial: 'Tidak ada masalah menonjol',
    e_cita_cita: '',
    e_rencana_setelah_lulus: '',
    e_pilihan_studi_kerja: '',
    e_dukungan_orang_tua: 'Mendukung penuh',
    f_harapan_layanan_bk: '',
    f_topik_konseling_diinginkan: '',
    f_kesediaan_orang_tua: 'Bersedia hadir saat diundang sekolah',
  };
}

export function createEmptyStudent(id: string): WcStudent {
  return {
    id,
    nama_lengkap: '',
    nama_panggilan: '',
    jenis_kelamin: 'L',
    kelas: 'XI-A',
    no_absen: '',
    nis: '',
    nisn: '',
    tempat_lahir: '',
    tanggal_lahir: '',
    ttl: '',
    whatsapp: '',
    email: '',
    alamat: '',
    agama: 'Islam',
    hobi: '',
    status_siswa: 'Aktif',
    guru_wali_id: '',
    guru_wali_nama: '',
    wali_kelas: '',
    guru_bk: '',
    nama_ayah: '',
    pekerjaan_ayah: '',
    nama_ibu: '',
    pekerjaan_ibu: '',
    alamat_ortu: '',
    kontak_ortu: '',
    deskripsi_diri: '',
    rencana_lulus: 'Kuliah',
    prodi_pilihan: '',
    langkah_pencapaian: '',
    catatan_khusus: '',
    foto_url: '',
    kehadiran: [false, false, false, false, false, false, false, false, false],
    perkembangan: {
      akademik: '',
      karakter: '',
      sosial_emosional: '',
      kedisiplinan: '',
      potensi_minat: '',
      periode: '3 Bulan',
      by_periode: {},
      updated_at: new Date().toISOString(),
    },
    bk_detail: createEmptyBkDetail(),
    updated_at: new Date().toISOString(),
  };
}

export async function seedFullEcosystem(): Promise<void> {
  const now = new Date().toISOString();

  const demoStudents: WcStudent[] = [
    {
      id: 'std-bimo-01',
      nama_lengkap: 'Bimo Setiawan',
      nama_panggilan: 'Bimo',
      jenis_kelamin: 'L',
      kelas: 'XI MIPA 1',
      no_absen: '05',
      nis: '20241101',
      nisn: '0084512301',
      tempat_lahir: 'Jakarta',
      tanggal_lahir: '14 Mei 2008',
      ttl: 'Jakarta, 14 Mei 2008',
      whatsapp: '081288901122',
      email: 'bimo.setiawan@student.sman1jayakarta.sch.id',
      alamat: 'Jl. Cempaka Putih Tengah No. 18, Jakarta Pusat',
      agama: 'Islam',
      hobi: 'Robotika, Pemrograman Python, Catur',
      status_siswa: 'Aktif',
      guru_wali_id: 'usr-guru-01',
      guru_wali_nama: 'Dra. Ratna Sari Dewi, M.Pd.',
      wali_kelas: 'Dra. Ratna Sari Dewi, M.Pd.',
      guru_bk: 'Drs. Wahyu Pratama, M.Psi.',
      nama_ayah: 'Hendra Setiawan, S.T.',
      pekerjaan_ayah: 'Insinyur Sipil',
      nama_ibu: 'Sri Wahyuni, S.E.',
      pekerjaan_ibu: 'Akuntan Publik',
      alamat_ortu: 'Jl. Cempaka Putih Tengah No. 18, Jakarta Pusat',
      kontak_ortu: '081288901100',
      deskripsi_diri:
        'Saya menyukai tantangan logika, eksperimen sains terapan, serta aktif sebagai pengurus ekstrakurikuler Robotika dan Tim Olimpiade Informatika sekolah.',
      rencana_lulus: 'Kuliah',
      prodi_pilihan: 'Teknik Informatika / Ilmu Komputer (ITB / UI)',
      langkah_pencapaian:
        '1. Menjaga rata-rata nilai rapor Matematika dan Fisika di atas 90.\n2. Mengikuti pembinaan intensif OSN Informatika tingkat provinsi.\n3. Menyusun portofolio proyek sistem otomasi sekolah.\n4. Mengikuti try-out SNBT berkala setiap bulan.',
      catatan_khusus:
        'Perlu pendampingan manajemen waktu agar persiapan lomba tidak mengganggu waktu istirahat malam.',
      foto_url: '/src/assets/images/pas_foto_siswa_putra_1795497576745.jpg',
      kehadiran: [true, true, true, true, true, true, true, false, false],
      perkembangan: {
        akademik:
          'Capaian nilai Matematika Peminatan dan Fisika sangat baik (rata-rata 91). Aktif berdiskusi di kelas dan konsisten mengumpulkan tugas tepat waktu.',
        karakter:
          'Menunjukkan integritas tinggi, jujur, santun terhadap guru, dan bertanggung jawab saat memimpin kelompok praktikum.',
        sosial_emosional:
          'Mampu bekerja sama dengan teman sebaya, namun sesekali tampak cemas menjelang jadwal ujian dan seleksi olimpiade.',
        kedisiplinan:
          'Kehadiran tatap muka di sekolah 98%, berpakaian rapi sesuai tata tertib, dan hadir tepat waktu di setiap sesi perwalian.',
        potensi_minat:
          'Memiliki bakat menonjol pada bidang komputasi, logika algoritmik, dan rekayasa teknologi tepat guna.',
        periode: '6 Bulan',
        by_periode: {
          '3 Bulan': {
            akademik:
              'Adaptasi sangat baik pada materi awal kelas XI MIPA; rata-rata nilai Matematika dan Fisika mencapai 88 dengan ketuntasan seluruh tugas awal.',
            karakter:
              'Sopan santun, jujur, dan langsung menunjukkan tanggung jawab saat ditunjuk menjadi koordinator kelompok praktikum fisika.',
            sosial_emosional:
              'Mudah membaur di klub robotika, masih perlu penyesuaian ritme belajar menghadapi target seleksi olimpiade.',
            kedisiplinan:
              'Hadir 100% pada 3 sesi perwalian pertama serta tertib mengenakan atribut sekolah.',
            potensi_minat:
              'Mulai terlihat minat kuat pada pemrograman Python, otomasi mikrokontroler, dan pemecahan soal logika.',
            updated_at: now,
          },
          '6 Bulan': {
            akademik:
              'Capaian nilai Matematika Peminatan dan Fisika sangat baik (rata-rata 91). Aktif berdiskusi di kelas dan konsisten mengumpulkan tugas tepat waktu.',
            karakter:
              'Menunjukkan integritas tinggi, jujur, santun terhadap guru, dan bertanggung jawab saat memimpin kelompok praktikum.',
            sosial_emosional:
              'Mampu bekerja sama dengan teman sebaya, namun sesekali tampak cemas menjelang jadwal ujian dan seleksi olimpiade.',
            kedisiplinan:
              'Kehadiran tatap muka di sekolah 98%, berpakaian rapi sesuai tata tertib, dan hadir tepat waktu di setiap sesi perwalian.',
            potensi_minat:
              'Memiliki bakat menonjol pada bidang komputasi, logika algoritmik, dan rekayasa teknologi tepat guna.',
            updated_at: now,
          },
        },
        updated_at: now,
      },
      bk_detail: {
        a1_nama_lengkap: 'Bimo Setiawan',
        a2_nama_panggilan: 'Bimo',
        a3_ttl: 'Jakarta, 14 Mei 2008',
        a4_agama: 'Islam',
        a5_suku_bangsa: 'Jawa',
        a6_bahasa_rumah: 'Bahasa Indonesia',
        a7_anak_ke: '1',
        a8_jumlah_saudara: '2',
        a9_status_keluarga: 'Anak Kandung',
        a10_tinggal_bersama: 'Orang Tua Kandung',
        a11_jarak_rumah: '4,5 km dari sekolah',
        a12_transportasi: 'Sepeda motor diantar orang tua / TransJakarta',
        a13_nama_ayah: 'Hendra Setiawan, S.T.',
        a14_pendidikan_pekerjaan_ayah: 'S1 Teknik Sipil / Konsultan Konstruksi',
        a15_nama_ibu: 'Sri Wahyuni, S.E.',
        a16_pendidikan_pekerjaan_ibu: 'S1 Akuntansi / Akuntan Publik',
        a17_penghasilan_keluarga: 'Rp 12.000.000 - Rp 18.000.000 / bulan',
        a18_wali_kontak_darurat: 'Hendra Setiawan (Ayah) - 081288901100',
        b_tinggi_berat: '171 cm / 60 kg',
        b_golongan_darah: 'O',
        b_riwayat_penyakit: 'Tidak ada riwayat penyakit berat',
        b_alergi_pantangan: 'Alergi debu ringan',
        b_kondisi_penglihatan_pendengaran: 'Menggunakan kacamata minus 1.25, pendengaran normal',
        b_kondisi_psikis: 'Stabil, antusias, terkadang perfeksionis saat mendekati lomba',
        c_mapel_disukai: 'Matematika Peminatan, Fisika, Informatika',
        c_mapel_sulit: 'Bahasa Indonesia (esai sastra) dan Sejarah',
        c_waktu_belajar: 'Pukul 19.30 - 21.30 WIB setiap hari kerja',
        c_fasilitas_belajar: 'Meja belajar pribadi, laptop, akses internet stabil',
        c_hambatan_akademik: 'Kesulitan membagi jadwal latihan OSN dengan tugas hafalan',
        c_prestasi_akademik: 'Juara 2 Lomba Karya Tulis Ilmiah Remaja Kota Jakarta Pusat 2024',
        d_sifat_kelebihan: 'Tekun, analitis, jujur, mudah diajak berdiskusi',
        d_aspek_perlu_dikembangkan: 'Public speaking di forum besar dan relaksasi stres',
        d_hubungan_keluarga: 'Sangat dekat dengan orang tua dan adik',
        d_hubungan_teman_sebaya: 'Memiliki lingkaran pertemanan positif di klub robotika',
        d_organisasi_ekskul: 'Ketua Divisi Pemrograman Ekskul Robotika, Anggota OSIS Sekbid TIK',
        d_masalah_pribadi_sosial: 'Belum ada kendala sosial berarti',
        e_cita_cita: 'Software Architect & Peneliti Kecerdasan Artifisial',
        e_rencana_setelah_lulus: 'Kuliah PTN jalur SNBP / SNBT',
        e_pilihan_studi_kerja: 'Teknik Informatika ITB atau Ilmu Komputer UI',
        e_dukungan_orang_tua: 'Orang tua mendukung penuh dan memfasilitasi bimbingan belajar',
        f_harapan_layanan_bk: 'Pendampingan strategi SNBP, manajemen stres lomba, dan pemetaan minat',
        f_topik_konseling_diinginkan: 'Strategi belajar efektif dan kesiapan kuliah teknik',
        f_kesediaan_orang_tua: 'Sangat bersedia berkolaborasi dengan Guru Wali dan BK',
      },
      updated_at: now,
    },
    {
      id: 'std-nadira-02',
      nama_lengkap: 'Nadira Putri Maharani',
      nama_panggilan: 'Nadira',
      jenis_kelamin: 'P',
      kelas: 'XI IPS 2',
      no_absen: '18',
      nis: '20241102',
      nisn: '0089123402',
      tempat_lahir: 'Bandung',
      tanggal_lahir: '22 Agustus 2008',
      ttl: 'Bandung, 22 Agustus 2008',
      whatsapp: '081377654321',
      email: 'nadira.putri@student.sman1jayakarta.sch.id',
      alamat: 'Jl. Rawamangun Muka Selatan No. 9, Jakarta Timur',
      agama: 'Islam',
      hobi: 'Desain Grafis, Debat Bahasa Inggris, Fotografi',
      status_siswa: 'Aktif',
      guru_wali_id: 'usr-guru-01',
      guru_wali_nama: 'Dra. Ratna Sari Dewi, M.Pd.',
      wali_kelas: 'Dra. Ratna Sari Dewi, M.Pd.',
      guru_bk: 'Drs. Wahyu Pratama, M.Psi.',
      nama_ayah: 'Budi Santoso',
      pekerjaan_ayah: 'Wiraswasta Kuliner',
      nama_ibu: 'Dewi Lestari, S.Pd.',
      pekerjaan_ibu: 'Guru Sekolah Dasar',
      alamat_ortu: 'Jl. Rawamangun Muka Selatan No. 9, Jakarta Timur',
      kontak_ortu: '081377654300',
      deskripsi_diri:
        'Saya senang berkomunikasi dengan banyak orang, tertarik pada dunia ekonomi kreatif, pemasaran digital, dan desain komunikasi visual.',
      rencana_lulus: 'Kuliah',
      prodi_pilihan: 'Desain Komunikasi Visual (DKV) / Manajemen Bisnis Kreatif',
      langkah_pencapaian:
        '1. Mengumpulkan 12 karya desain portofolio untuk seleksi SNBP jalur seni/desain.\n2. Mempertahankan peringkat 5 besar di kelas XI IPS 2.\n3. Mengikuti pelatihan kewirausahaan muda dan kompetisi debat Bahasa Inggris.',
      catatan_khusus:
        'Sangat aktif di kegiatan sekolah; perlu bimbingan menjaga fokus akademik mata pelajaran Ekonomi dan Sosiologi.',
      foto_url: '/src/assets/images/pas_foto_siswa_putri_1795497575673.jpg',
      kehadiran: [true, true, true, true, true, true, false, false, false],
      perkembangan: {
        akademik:
          'Unggul dalam Bahasa Inggris, Ekonomi, dan Seni Budaya. Nilai Matematika Umum meningkat dari 78 ke 84 dalam dua bulan terakhir.',
        karakter:
          'Ramah, empatik kepada teman yang kesulitan, serta berani mengambil inisiatif dalam kegiatan sosial sekolah.',
        sosial_emosional:
          'Memiliki kecerdasan interpersonal yang sangat baik, mudah beradaptasi, dan komunikatif saat sesi refleksi perwalian.',
        kedisiplinan:
          'Tertib mengikuti tata tertib sekolah, sesekali terlambat mengumpulkan ringkasan bacaan karena padatnya agenda OSIS.',
        potensi_minat:
          'Bakat kuat pada komunikasi visual, desain media sekolah, presentasi publik, dan manajemen acara.',
        periode: '6 Bulan',
        by_periode: {
          '3 Bulan': {
            akademik:
              'Menunjukkan minat tinggi pada Bahasa Inggris dan Seni Rupa; perlu penguatan latihan soal Matematika Umum.',
            karakter:
              'Aktif membantu teman sebaya dan sangat kooperatif dalam kegiatan kepanitiaan sekolah.',
            sosial_emosional:
              'Ekspresif dan percaya diri saat berdiskusi, perlu menjaga keseimbangan waktu istirahat di tengah agenda OSIS.',
            kedisiplinan:
              'Hadir rutin di kelas dan kegiatan ekstrakurikuler, perlu pengingat tenggat ringkasan tugas mandiri.',
            potensi_minat:
              'Menonjol dalam desain poster acara sekolah, fotografi dokumentasi, dan debat Bahasa Inggris.',
            updated_at: now,
          },
          '6 Bulan': {
            akademik:
              'Unggul dalam Bahasa Inggris, Ekonomi, dan Seni Budaya. Nilai Matematika Umum meningkat dari 78 ke 84 dalam dua bulan terakhir.',
            karakter:
              'Ramah, empatik kepada teman yang kesulitan, serta berani mengambil inisiatif dalam kegiatan sosial sekolah.',
            sosial_emosional:
              'Memiliki kecerdasan interpersonal yang sangat baik, mudah beradaptasi, dan komunikatif saat sesi refleksi perwalian.',
            kedisiplinan:
              'Tertib mengikuti tata tertib sekolah, sesekali terlambat mengumpulkan ringkasan bacaan karena padatnya agenda OSIS.',
            potensi_minat:
              'Bakat kuat pada komunikasi visual, desain media sekolah, presentasi publik, dan manajemen acara.',
            updated_at: now,
          },
        },
        updated_at: now,
      },
      bk_detail: {
        a1_nama_lengkap: 'Nadira Putri Maharani',
        a2_nama_panggilan: 'Nadira',
        a3_ttl: 'Bandung, 22 Agustus 2008',
        a4_agama: 'Islam',
        a5_suku_bangsa: 'Sunda',
        a6_bahasa_rumah: 'Bahasa Indonesia & Sunda',
        a7_anak_ke: '2',
        a8_jumlah_saudara: '3',
        a9_status_keluarga: 'Anak Kandung',
        a10_tinggal_bersama: 'Orang Tua Kandung',
        a11_jarak_rumah: '7 km dari sekolah',
        a12_transportasi: 'LRT / Angkutan umum',
        a13_nama_ayah: 'Budi Santoso',
        a14_pendidikan_pekerjaan_ayah: 'SMA / Pengusaha Kuliner',
        a15_nama_ibu: 'Dewi Lestari, S.Pd.',
        a16_pendidikan_pekerjaan_ibu: 'S1 PGSD / Guru SD Negeri',
        a17_penghasilan_keluarga: 'Rp 8.000.000 - Rp 12.000.000 / bulan',
        a18_wali_kontak_darurat: 'Dewi Lestari (Ibu) - 081377654300',
        b_tinggi_berat: '160 cm / 51 kg',
        b_golongan_darah: 'A',
        b_riwayat_penyakit: 'Maag ringan jika telat makan',
        b_alergi_pantangan: 'Tidak ada',
        b_kondisi_penglihatan_pendengaran: 'Normal',
        b_kondisi_psikis: 'Ceria, ekspresif, optimis',
        c_mapel_disukai: 'Bahasa Inggris, Ekonomi, Seni Rupa',
        c_mapel_sulit: 'Matematika Umum (statistika lanjut)',
        c_waktu_belajar: 'Pukul 20.00 - 21.30 WIB',
        c_fasilitas_belajar: 'Tablet gambar, laptop keluarga, koneksi Wi-Fi rumah',
        c_hambatan_akademik: 'Jadwal kegiatan ekstrakurikuler cukup padat di hari Rabu-Jumat',
        c_prestasi_akademik: 'Finalis English Debate Championship Jabodetabek 2025',
        d_sifat_kelebihan: 'Kreatif, komunikatif, percaya diri, kooperatif',
        d_aspek_perlu_dikembangkan: 'Prioritas tugas akademik dibanding aktivitas non-akademik',
        d_hubungan_keluarga: 'Hangat dan terbuka berdiskusi dengan ibu',
        d_hubungan_teman_sebaya: 'Disenangi teman sekelas dan aktif sebagai koordinator publikasi',
        d_organisasi_ekskul: 'English Club & Jurnalistik / Dokumentasi OSIS',
        d_masalah_pribadi_sosial: 'Terkadang kelelahan menjelang acara besar sekolah',
        e_cita_cita: 'Creative Director & Brand Strategist',
        e_rencana_setelah_lulus: 'Kuliah jurusan DKV atau Manajemen Pemasaran',
        e_pilihan_studi_kerja: 'FSRD ITB / DKV UNJ / Manajemen FEB',
        e_dukungan_orang_tua: 'Mendukung minat seni selama prestasi akademik terjaga',
        f_harapan_layanan_bk: 'Bimbingan penyusunan portofolio SNBP dan manajemen energi',
        f_topik_konseling_diinginkan: 'Keseimbangan organisasi dan nilai rapor',
        f_kesediaan_orang_tua: 'Siap berkomunikasi rutin dengan Guru Wali',
      },
      updated_at: now,
    },
  ];

  const demoUsers: WcUser[] = [
    {
      id: 'usr-guru-01',
      nama: 'Dra. Ratna Sari Dewi, M.Pd.',
      nip: '197804122005012008',
      role: 'Guru Wali',
      password: '123',
      jabatan: 'Guru Wali Kelas XI MIPA 1 & XI IPS 2',
      created_at: now,
    },
    {
      id: 'usr-ortu-01',
      nama: 'Hendra Setiawan, S.T.',
      nip: '081288901100',
      role: 'Orang Tua',
      password: '123',
      linked_student_id: 'std-bimo-01',
      jabatan: 'Wali Murid dari Bimo Setiawan',
      created_at: now,
    },
    {
      id: 'usr-siswa-01',
      nama: 'Bimo Setiawan',
      nip: '20241101',
      role: 'Siswa',
      password: '123',
      linked_student_id: 'std-bimo-01',
      jabatan: 'Murid Kelas XI MIPA 1',
      created_at: now,
    },
    {
      id: 'usr-admin-01',
      nama: 'Drs. Wahyu Pratama, M.Psi.',
      nip: '197503202003121004',
      role: 'Admin',
      password: '123',
      jabatan: 'Koordinator Bimbingan & Konseling (BK)',
      created_at: now,
    },
    {
      id: 'usr-admin-super',
      nama: 'Administrator Sekolah',
      nip: 'admin',
      role: 'Admin',
      password: 'admin123',
      jabatan: 'Akun Khusus Admin Sistem',
      created_at: now,
    },
  ];

  const demoLogs: WcLog[] = [
    {
      id: 'log-001',
      student_id: 'std-bimo-01',
      student_name: 'Bimo Setiawan',
      tanggal: '2025-11-18',
      sesi_ke: 7,
      kategori: 'Karir',
      topik: 'Pemetaan Portofolio SNBP & Keseimbangan Latihan OSN',
      uraian:
        'Bimo memaparkan progres persiapan seleksi olimpiade informatika tingkat provinsi sekaligus konsultasi pemilihan prodi Teknik Informatika sebagai pilihan utama.',
      tindak_lanjut:
        '1. Menyusun jadwal blok belajar malam maksimal pukul 21.30 WIB.\n2. Berkoordinasi dengan pembina olimpiade untuk simulasi soal akhir pekan.\n3. Menginformasikan jadwal persiapan SNBP kepada orang tua.',
      status_kanban: 'Dalam Proses',
      author_name: 'Dra. Ratna Sari Dewi, M.Pd.',
      author_role: 'Guru Wali',
      foto_url: '/src/assets/images/dokumentasi_perwalian_sesi_1795497577158.jpg',
      created_at: '2025-11-18T09:30:00.000Z',
    },
    {
      id: 'log-002',
      student_id: 'std-nadira-02',
      student_name: 'Nadira Putri Maharani',
      tanggal: '2025-11-19',
      sesi_ke: 6,
      kategori: 'Akademik',
      topik: 'Pendampingan Strategi Belajar Statistika & Prioritas OSIS',
      uraian:
        'Nadira menyampaikan kendala pembagian waktu saat menangani dokumentasi kegiatan OSIS yang berdekatan dengan ulangan harian Matematika Umum.',
      tindak_lanjut:
        '1. Membentuk kelompok belajar sebaya setiap Selasa sepulang sekolah.\n2. Delegasi tugas desain publikasi OSIS kepada anggota junior divisi.',
      status_kanban: 'Perlu Tindak Lanjut',
      author_name: 'Dra. Ratna Sari Dewi, M.Pd.',
      author_role: 'Guru Wali',
      foto_url: '/src/assets/images/dokumentasi_perwalian_sesi_1795497577158.jpg',
      created_at: '2025-11-19T10:15:00.000Z',
    },
    {
      id: 'log-003',
      student_id: 'std-bimo-01',
      student_name: 'Bimo Setiawan',
      tanggal: '2025-11-10',
      sesi_ke: 6,
      kategori: 'Sosial-Emosional',
      topik: 'Pengelolaan Kecemasan Menjelang Penilaian Akhir Semester',
      uraian:
        'Refleksi kondisi emosional murid selama masa persiapan ujian. Murid menunjukkan kesiapan lebih tenang setelah menerapkan teknik perencanaan mingguan.',
      tindak_lanjut:
        'Melakukan evaluasi berkala setiap dua minggu dan menjaga komunikasi dengan orang tua di rumah.',
      status_kanban: 'Selesai Tertangani',
      author_name: 'Dra. Ratna Sari Dewi, M.Pd.',
      author_role: 'Guru Wali',
      created_at: '2025-11-10T11:00:00.000Z',
    },
    {
      id: 'log-004',
      student_id: 'std-nadira-02',
      student_name: 'Nadira Putri Maharani',
      tanggal: '2025-11-12',
      sesi_ke: 5,
      kategori: 'Karakter',
      topik: 'Penguatan Etika Kepemimpinan dan Kedisiplinan Tugas',
      uraian:
        'Evaluasi sikap proaktif dalam kepanitiaan sekolah serta komitmen ketepatan pengumpulan tugas Bahasa Indonesia.',
      tindak_lanjut:
        'Nadira membuat daftar periksa mingguan tugas dan dilaporkan pada sesi perwalian berikutnya.',
      status_kanban: 'Selesai Tertangani',
      author_name: 'Drs. Wahyu Pratama, M.Psi.',
      author_role: 'Admin',
      created_at: '2025-11-12T13:20:00.000Z',
    },
  ];

  const demoMessages: WcMessage[] = [
    {
      id: 'msg-001',
      channel_type: 'student',
      target_id: 'std-bimo-01',
      sender_id: 'usr-guru-01',
      sender_name: 'Dra. Ratna Sari Dewi, M.Pd.',
      sender_role: 'Guru Wali',
      text: 'Selamat pagi Bapak Hendra dan Bimo. Terima kasih sudah meninjau target belajar semester ini. Mohon pastikan Bimo tetap beristirahat sebelum pukul 22.00 ya Pak.',
      created_at: '2025-11-20T08:10:00.000Z',
    },
    {
      id: 'msg-002',
      channel_type: 'student',
      target_id: 'std-bimo-01',
      sender_id: 'usr-ortu-01',
      sender_name: 'Hendra Setiawan, S.T.',
      sender_role: 'Orang Tua',
      text: 'Baik Bu Ratna, terima kasih atas perhatian dan pendampingannya. Kami di rumah juga sudah mulai membatasi jadwal latihan soal Bimo di malam hari.',
      created_at: '2025-11-20T09:05:00.000Z',
    },
    {
      id: 'msg-003',
      channel_type: 'account',
      target_id: 'usr-guru-01',
      sender_id: 'usr-admin-01',
      sender_name: 'Drs. Wahyu Pratama, M.Psi.',
      sender_role: 'Admin',
      text: 'Ibu Ratna, mohon rekap Lampiran A–D murid perwalian disiapkan sebelum supervisi BK hari Jumat pukul 13.00 WIB.',
      created_at: '2025-11-21T10:00:00.000Z',
    },
  ];

  const demoAnnouncements: WcAnnouncement[] = [
    {
      id: 'ann-001',
      judul: 'Pertemuan Konsultasi Orang Tua & Pemetaan Karir Kelas XI',
      isi: 'Mengundang seluruh orang tua/wali murid kelas XI untuk menghadiri sesi pemaparan sistem Guru Wali (Permendikdasmen No. 11/2025), evaluasi 5 aspek perkembangan semester ganjil, serta konsultasi rencana studi pasca-lulus bersama Guru Wali dan Tim BK.',
      tanggal: '2025-11-28',
      waktu: '08.30 - 11.30 WIB',
      lokasi: 'Aula Utama SMA Negeri 1 Jayakarta',
      kategori: 'Undangan Wali Murid',
      author_name: 'Drs. Wahyu Pratama, M.Psi.',
      foto_url: '/src/assets/images/poster_agenda_sekolah_1795497576721.jpg',
      created_at: '2025-11-20T07:00:00.000Z',
    },
    {
      id: 'ann-002',
      judul: 'Batas Akhir Pengisian Refleksi Diri & Pas Foto 4x6 Lampiran A',
      isi: 'Seluruh murid dampingan dimohon melengkapi biodata, pas foto 4x6 formal berseragam sekolah, dan 5 pertanyaan refleksi rencana pasca-lulus melalui menu Biodata & Rencana Lulus paling lambat akhir pekan ini.',
      tanggal: '2025-11-26',
      waktu: '16.00 WIB',
      lokasi: 'Portal WaliConnect Pro',
      kategori: 'Akademik & Perwalian',
      author_name: 'Dra. Ratna Sari Dewi, M.Pd.',
      created_at: '2025-11-21T08:00:00.000Z',
    },
  ];

  const batch = writeBatch(db);

  for (const s of demoStudents) {
    batch.set(doc(db, COLLECTIONS.students, s.id), s);
  }
  for (const u of demoUsers) {
    batch.set(doc(db, COLLECTIONS.users, u.id), u);
  }
  for (const l of demoLogs) {
    batch.set(doc(db, COLLECTIONS.logs, l.id), l);
  }
  for (const m of demoMessages) {
    batch.set(doc(db, COLLECTIONS.messages, m.id), m);
  }
  for (const a of demoAnnouncements) {
    batch.set(doc(db, COLLECTIONS.announcements, a.id), a);
  }
  batch.set(doc(db, COLLECTIONS.settings, 'print_config'), DEFAULT_PRINT_CONFIG);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, BASE_DATA_PATH);
  }
}

export const DEFAULT_APP_CONFIG: WcAppConfig = {
  app_name: 'WaliConnect Pro',
  app_subtitle: 'Sistem Guru Wali & Perwalian Sekolah Terpadu · Permendikdasmen No. 11/2025',
  app_logo: DEFAULT_LOGO_URL,
  school_name: 'SMA NEGERI 1 JAYAKARTA',
  sidebar_sop_title: 'SOP Guru Wali Resmi',
  sidebar_sop_desc:
    'Ekuivalensi beban kerja 2 JP / Minggu sesuai regulasi Permendikdasmen No. 11/2025.',
  allow_registration: true,
  allowed_register_roles: ['Guru Wali', 'Orang Tua', 'Siswa', 'Admin'],
  show_quick_login: true,
  show_demo_seed: true,
  default_theme_mode: 'light',
  theme_accent: 'blue',
  login_bg_preset: 'ice_blue',
  ui_density: 'comfortable',
};

export async function savePrintConfig(config: WcPrintConfig): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.settings, 'print_config'), config);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${COLLECTIONS.settings}/print_config`);
  }
}

export async function saveAppConfig(config: WcAppConfig): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.settings, 'app_config'), {
      ...config,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${COLLECTIONS.settings}/app_config`);
  }
}

