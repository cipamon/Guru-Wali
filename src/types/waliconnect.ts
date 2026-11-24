export type UserRole = 'Guru Wali' | 'Orang Tua' | 'Siswa' | 'Admin';

export interface WcUser {
  id: string;
  nama: string;
  nip: string;
  role: UserRole;
  password: string;
  linked_student_id?: string;
  jabatan?: string;
  created_at?: string;
}

export type EvaluasiPeriode = '3 Bulan' | '6 Bulan' | '9 Bulan' | '1 Tahun';

export interface PerkembanganSnapshot {
  akademik: string;
  karakter: string;
  sosial_emosional: string;
  kedisiplinan: string;
  potensi_minat: string;
  updated_at?: string;
}

export interface PerkembanganAspek extends PerkembanganSnapshot {
  periode: EvaluasiPeriode | 'Semester' | 'Tahun';
  by_periode?: Partial<Record<EvaluasiPeriode, PerkembanganSnapshot>>;
}

export interface BkDetail {
  // Bagian A (18 Poin Identitas & Latar Belakang Keluarga)
  a1_nama_lengkap: string;
  a2_nama_panggilan: string;
  a3_ttl: string;
  a4_agama: string;
  a5_suku_bangsa: string;
  a6_bahasa_rumah: string;
  a7_anak_ke: string;
  a8_jumlah_saudara: string;
  a9_status_keluarga: string;
  a10_tinggal_bersama: string;
  a11_jarak_rumah: string;
  a12_transportasi: string;
  a13_nama_ayah: string;
  a14_pendidikan_pekerjaan_ayah: string;
  a15_nama_ibu: string;
  a16_pendidikan_pekerjaan_ibu: string;
  a17_penghasilan_keluarga: string;
  a18_wali_kontak_darurat: string;
  // Bagian B (Riwayat Kesehatan Fisik & Psikis)
  b_tinggi_berat: string;
  b_golongan_darah: string;
  b_riwayat_penyakit: string;
  b_alergi_pantangan: string;
  b_kondisi_penglihatan_pendengaran: string;
  b_kondisi_psikis: string;
  // Bagian C (Bidang Akademik & Kebiasaan Belajar)
  c_mapel_disukai: string;
  c_mapel_sulit: string;
  c_waktu_belajar: string;
  c_fasilitas_belajar: string;
  c_hambatan_akademik: string;
  c_prestasi_akademik: string;
  // Bagian D (Bidang Pribadi & Sosial)
  d_sifat_kelebihan: string;
  d_aspek_perlu_dikembangkan: string;
  d_hubungan_keluarga: string;
  d_hubungan_teman_sebaya: string;
  d_organisasi_ekskul: string;
  d_masalah_pribadi_sosial: string;
  // Bagian E (Bidang Karir & Perencanaan Masa Depan)
  e_cita_cita: string;
  e_rencana_setelah_lulus: string;
  e_pilihan_studi_kerja: string;
  e_dukungan_orang_tua: string;
  // Bagian F (Harapan Terhadap Layanan BK)
  f_harapan_layanan_bk: string;
  f_topik_konseling_diinginkan: string;
  f_kesediaan_orang_tua: string;
}

export interface WcStudent {
  id: string;
  nama_lengkap: string;
  nama_panggilan: string;
  jenis_kelamin: 'L' | 'P';
  kelas: string;
  no_absen?: string;
  nis: string;
  nisn: string;
  tempat_lahir?: string;
  tanggal_lahir?: string;
  ttl: string;
  whatsapp: string;
  email: string;
  alamat: string;
  agama: string;
  hobi: string;
  status_siswa?: string;
  guru_wali_id?: string;
  guru_wali_nama?: string;
  wali_kelas?: string;
  guru_bk?: string;
  nama_ayah: string;
  pekerjaan_ayah: string;
  nama_ibu: string;
  pekerjaan_ibu: string;
  alamat_ortu: string;
  kontak_ortu: string;
  deskripsi_diri: string;
  rencana_lulus: 'Kuliah' | 'Bekerja' | 'Gap-year' | '';
  prodi_pilihan: string;
  langkah_pencapaian: string;
  catatan_khusus: string;
  foto_url: string;
  kehadiran: boolean[]; // 9 sessions
  perkembangan: PerkembanganAspek;
  bk_detail: BkDetail;
  updated_at?: string;
}

export type LogKategori = 'Akademik' | 'Karakter' | 'Sosial-Emosional' | 'Kedisiplinan' | 'Karir';
export type KanbanStatus = 'Dalam Proses' | 'Perlu Tindak Lanjut' | 'Selesai Tertangani';

export interface WcLog {
  id: string;
  student_id: string;
  student_name: string;
  tanggal: string;
  sesi_ke: number;
  kategori: LogKategori;
  topik: string;
  uraian: string;
  tindak_lanjut: string;
  status_kanban: KanbanStatus;
  author_name: string;
  author_role: string;
  foto_url?: string;
  created_at: string;
}

export interface WcMessage {
  id: string;
  channel_type: 'account' | 'student';
  target_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  text: string;
  foto_url?: string;
  created_at: string;
}

export interface WcAnnouncement {
  id: string;
  judul: string;
  isi: string;
  tanggal: string;
  waktu?: string;
  lokasi?: string;
  kategori?: string;
  author_name?: string;
  foto_url?: string;
  created_at?: string;
}

export type FontFamilyChoice =
  | 'serif'
  | 'sans'
  | 'times'
  | 'tahoma'
  | 'verdana'
  | 'arial'
  | 'calibri'
  | 'georgia'
  | 'trebuchet';

export interface KopLine {
  id: string;
  text: string;
  fontFamily: FontFamilyChoice;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface SignatureRow {
  id: string;
  text: string;
  bold: boolean;
  underline: boolean;
  spacerBefore?: boolean;
}

export type SheetKey =
  | 'sampul'
  | 'sop'
  | 'lampiran_a'
  | 'lampiran_b'
  | 'lampiran_c'
  | 'lampiran_d'
  | 'lampiran_e';

export type PaperOrientation = 'portrait' | 'landscape';

export interface SignatureSettings {
  ttd_layout: 'kepsek_guru' | 'guru_kepsek' | 'stacked';
  ttd_offset_x: number;
  ttd_left_offset_x?: number;
  ttd_right_offset_x?: number;
  ttd_spacer: number;
  ttd_align: 'left' | 'center' | 'right' | 'justify';
  ttd_left_rows: SignatureRow[];
  ttd_right_rows: SignatureRow[];
}

export interface WcPrintConfig extends SignatureSettings {
  tahun_ajaran: string;
  tempat_tanggal: string;
  logo_kiri: string;
  logo_kanan: string;
  kop_lines: KopLine[];
  nama_sekolah: string;
  nama_guru_wali: string;
  nip_guru_wali: string;
  nama_kepsek: string;
  nip_kepsek: string;
  orientations?: Partial<Record<SheetKey, PaperOrientation>>;
  doc_font?: FontFamilyChoice;
  ttd_landscape?: SignatureSettings;
}

export type ThemeAccentId =
  | 'blue'
  | 'indigo'
  | 'emerald'
  | 'teal'
  | 'violet'
  | 'rose'
  | 'amber'
  | 'slate';

export type LoginBgPreset = 'ice_blue' | 'emerald_mint' | 'indigo_dusk' | 'warm_slate';

export type UiDensity = 'comfortable' | 'compact';

export interface WcAppConfig {
  app_name: string;
  app_subtitle: string;
  app_logo: string;
  school_name: string;
  sidebar_sop_title: string;
  sidebar_sop_desc: string;
  allow_registration: boolean;
  allowed_register_roles: UserRole[];
  show_quick_login: boolean;
  show_demo_seed: boolean;
  default_theme_mode: 'light' | 'dark';
  theme_accent: ThemeAccentId;
  login_bg_preset: LoginBgPreset;
  ui_density: UiDensity;
  updated_at?: string;
}

export type PrintDocumentType = 'paket_lengkap' | SheetKey;

export type NavTabId =
  | 'home'
  | 'students'
  | 'attendance_aspects'
  | 'journal'
  | 'communication'
  | 'announcements'
  | 'accounts'
  | 'print_f4'
  | 'admin_settings';

