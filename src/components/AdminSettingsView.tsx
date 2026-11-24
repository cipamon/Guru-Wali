import React, { useEffect, useState } from 'react';
import {
  Palette,
  Save,
  RotateCcw,
  Upload,
  Sun,
  Moon,
  Shield,
  SlidersHorizontal,
  LogIn,
  UserPlus,
  Check,
  Loader2,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import {
  DEFAULT_APP_CONFIG,
  DEFAULT_LOGO_URL,
  saveAppConfig,
  savePrintConfig,
} from '../lib/firebase';
import { compressImageFile } from '../lib/imageUtils';
import {
  applyAppTheme,
  getAccentOption,
  getLoginBgPreset,
  LOGIN_BG_PRESETS,
  THEME_ACCENTS,
} from '../lib/themeUtils';
import { PerwalianAssignmentPanel } from './PerwalianAssignmentPanel';
import type {
  LoginBgPreset,
  ThemeAccentId,
  UiDensity,
  UserRole,
  WcAppConfig,
  WcPrintConfig,
  WcStudent,
  WcUser,
} from '../types/waliconnect';

interface AdminSettingsViewProps {
  appConfig: WcAppConfig;
  printConfig: WcPrintConfig;
  darkMode: boolean;
  onSetDarkMode: (dark: boolean) => void;
  users?: WcUser[];
  students?: WcStudent[];
  currentUser?: WcUser;
}

const ALL_ROLES: { role: UserRole; label: string }[] = [
  { role: 'Guru Wali', label: 'Guru Wali' },
  { role: 'Orang Tua', label: 'Orang Tua' },
  { role: 'Siswa', label: 'Siswa' },
  { role: 'Admin', label: 'Admin (Koordinator BK)' },
];

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  appConfig,
  printConfig,
  darkMode,
  onSetDarkMode,
  users = [],
  students = [],
  currentUser,
}) => {
  const [settingsTab, setSettingsTab] = useState<'theme_app' | 'perwalian'>('theme_app');
  const [draft, setDraft] = useState<WcAppConfig>(appConfig || DEFAULT_APP_CONFIG);
  const [saving, setSaving] = useState(false);
  const [syncingLogo, setSyncingLogo] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setDraft(appConfig || DEFAULT_APP_CONFIG);
  }, [appConfig]);

  // Live preview of theme accent / density while Admin edits, restored on unmount
  useEffect(() => {
    applyAppTheme(draft);
    return () => {
      applyAppTheme(appConfig);
    };
  }, [draft, appConfig]);

  const handleUploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg('');
    try {
      const compressed = await compressImageFile(file, 360, 0.88);
      setDraft((prev) => ({ ...prev, app_logo: compressed }));
    } catch {
      setErrorMsg('Gagal memproses file logo. Pastikan file berupa gambar JPG/PNG/WebP.');
    }
  };

  const toggleAllowedRole = (role: UserRole) => {
    setDraft((prev) => {
      const exists = prev.allowed_register_roles.includes(role);
      if (exists && prev.allowed_register_roles.length <= 1) {
        return prev;
      }
      const next = exists
        ? prev.allowed_register_roles.filter((r) => r !== role)
        : [...prev.allowed_register_roles, role];
      return { ...prev, allowed_register_roles: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice('');
    setErrorMsg('');
    try {
      const cleanConfig: WcAppConfig = {
        ...draft,
        app_name: draft.app_name.trim() || DEFAULT_APP_CONFIG.app_name,
        app_subtitle: draft.app_subtitle.trim() || DEFAULT_APP_CONFIG.app_subtitle,
        school_name: draft.school_name.trim() || DEFAULT_APP_CONFIG.school_name,
        sidebar_sop_title:
          draft.sidebar_sop_title.trim() || DEFAULT_APP_CONFIG.sidebar_sop_title,
        sidebar_sop_desc: draft.sidebar_sop_desc.trim() || DEFAULT_APP_CONFIG.sidebar_sop_desc,
        app_logo: draft.app_logo || DEFAULT_LOGO_URL,
      };
      await saveAppConfig(cleanConfig);
      applyAppTheme(cleanConfig);
      setNotice('Pengaturan aplikasi, halaman login, dan tema berhasil disimpan ke database.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan aplikasi.');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncLogoToPrint = async () => {
    setSyncingLogo(true);
    setNotice('');
    setErrorMsg('');
    try {
      await savePrintConfig({
        ...printConfig,
        logo_kiri: draft.app_logo || DEFAULT_LOGO_URL,
        logo_kanan: draft.app_logo || DEFAULT_LOGO_URL,
        nama_sekolah: draft.school_name.trim() || printConfig.nama_sekolah,
      });
      setNotice('Logo & nama sekolah berhasil disinkronkan ke Kop Surat Cetak SOP (F4).');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyinkronkan logo ke Kop Surat.');
    } finally {
      setSyncingLogo(false);
    }
  };

  const handleResetDefault = async () => {
    setDraft(DEFAULT_APP_CONFIG);
    applyAppTheme(DEFAULT_APP_CONFIG);
    setNotice('Draft dikembalikan ke pengaturan bawaan. Klik "Simpan Pengaturan" untuk menerapkan permanen.');
  };

  const accentOption = getAccentOption(draft.theme_accent);
  const bgPreset = getLoginBgPreset(draft.login_bg_preset);
  const previewIsDark = draft.default_theme_mode === 'dark';

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Pengaturan Sistem, Login &amp; Tema Aplikasi
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Khusus Admin: atur logo, nama aplikasi, opsi pendaftaran/login, serta tema warna dan tampilan.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {settingsTab === 'theme_app' && (
            <>
              <button
                type="button"
                onClick={handleResetDefault}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Bawaan</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs disabled:opacity-60 cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Simpan Pengaturan</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setSettingsTab('theme_app')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
            settingsTab === 'theme_app'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Branding, Login &amp; Tema
        </button>
        <button
          type="button"
          onClick={() => setSettingsTab('perwalian')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
            settingsTab === 'perwalian'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Pemilihan Guru &amp; Siswa Perwalian
        </button>
      </div>

      {settingsTab === 'perwalian' && currentUser ? (
        <PerwalianAssignmentPanel users={users} students={students} currentUser={currentUser} />
      ) : (
        <>

      {notice && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left & Center Controls (2 columns) */}
        <div className="xl:col-span-2 space-y-6">
          {/* 1. Branding & Identitas Aplikasi */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Identitas Aplikasi, Logo &amp; Sidebar
              </h3>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 dark:border-slate-700 p-1.5 flex items-center justify-center shrink-0">
                <img
                  src={draft.app_logo || DEFAULT_LOGO_URL}
                  alt="Logo Aplikasi"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Logo Utama Aplikasi (Tampil di Login, Sidebar &amp; Judul)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Unggah Logo Baru</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUploadLogo(e.target.files?.[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, app_logo: DEFAULT_LOGO_URL }))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Logo Default
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncLogoToPrint}
                    disabled={syncingLogo}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer disabled:opacity-60"
                  >
                    {syncingLogo ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>Samakan ke Kop Surat F4</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nama Aplikasi
                </label>
                <input
                  type="text"
                  value={draft.app_name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, app_name: e.target.value }))}
                  placeholder="Contoh: WaliConnect Pro"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nama Sekolah
                </label>
                <input
                  type="text"
                  value={draft.school_name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, school_name: e.target.value }))}
                  placeholder="Contoh: SMA NEGERI 1 JAYAKARTA"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Subjudul / Tagline Halaman Login
              </label>
              <input
                type="text"
                value={draft.app_subtitle}
                onChange={(e) => setDraft((prev) => ({ ...prev, app_subtitle: e.target.value }))}
                placeholder="Sistem Guru Wali & Perwalian Sekolah Terpadu · Permendikdasmen No. 11/2025"
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Judul Kartu SOP Sidebar
                </label>
                <input
                  type="text"
                  value={draft.sidebar_sop_title}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, sidebar_sop_title: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Keterangan Kartu SOP Sidebar
                </label>
                <input
                  type="text"
                  value={draft.sidebar_sop_desc}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, sidebar_sop_desc: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* 2. Pengaturan Halaman Login & Pendaftaran */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Kontrol Halaman Login &amp; Pendaftaran Akun
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.allow_registration}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, allow_registration: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Tab Daftar Akun Baru
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Izinkan pengguna membuat akun baru langsung dari halaman login.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.show_quick_login}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, show_quick_login: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Login Sekali Klik
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Tampilkan daftar akun terhubung di bawah form login (nonaktifkan untuk produksi).
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.show_demo_seed}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, show_demo_seed: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Tombol Muat Data Demo
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Tampilkan tombol pengisian data contoh di halaman login.
                  </p>
                </div>
              </label>
            </div>

            {draft.allow_registration && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 space-y-2.5">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Peran Akun yang Diizinkan Saat Daftar Mandiri
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((item) => {
                    const active = draft.allowed_register_roles.includes(item.role);
                    return (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => toggleAllowedRole(item.role)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {active && <Check className="w-3.5 h-3.5" />}
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 3. Tema & Warna Tampilan */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Pengaturan Tema, Warna Aksen &amp; Tata Letak
              </h3>
            </div>

            {/* Mode Terang / Gelap */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Mode Tema Bawaan Aplikasi
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((prev) => ({ ...prev, default_theme_mode: 'light' }));
                      onSetDarkMode(false);
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                      draft.default_theme_mode === 'light'
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>Tema Terang</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((prev) => ({ ...prev, default_theme_mode: 'dark' }));
                      onSetDarkMode(true);
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                      draft.default_theme_mode === 'dark'
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Moon className="w-4 h-4 text-indigo-400" />
                    <span>Tema Gelap</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mode layar Anda saat ini: <strong>{darkMode ? 'Gelap' : 'Terang'}</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Kepadatan Tata Letak UI
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['comfortable', 'compact'] as UiDensity[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, ui_density: mode }))}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                        draft.ui_density === mode
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {mode === 'comfortable' ? 'Nyaman (Standar)' : 'Ringkas (Padat)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Palet Warna Aksen */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Warna Aksen Utama ({accentOption.label})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {THEME_ACCENTS.map((item) => {
                  const selected = draft.theme_accent === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, theme_accent: item.id as ThemeAccentId }))
                      }
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-lg shrink-0 border border-black/10 flex items-center justify-center text-white"
                        style={{ backgroundColor: item.swatchHex }}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Latar Halaman Login */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Gaya Latar Belakang Halaman Login
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {LOGIN_BG_PRESETS.map((preset) => {
                  const selected = draft.login_bg_preset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          login_bg_preset: preset.id as LoginBgPreset,
                        }))
                      }
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                      }`}
                    >
                      <div
                        className="h-9 rounded-lg border border-black/10 mb-1.5"
                        style={{
                          background: previewIsDark ? preset.darkGradient : preset.lightGradient,
                        }}
                      />
                      <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {preset.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Live Visual Preview matching User's Screenshots */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5 xl:sticky xl:top-20">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Pratinjau Langsung Tampilan
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Menggambarkan tampilan Header Sidebar &amp; Kartu Login sesuai pengaturan aktif.
            </p>
          </div>

          {/* Preview 1: Sidebar Header */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Header Sidebar
            </p>
            <div
              className={`rounded-2xl border p-4 flex items-center gap-3 ${
                previewIsDark
                  ? 'bg-[#0b1324] border-slate-800 text-white'
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <img
                src={draft.app_logo || DEFAULT_LOGO_URL}
                alt="Preview Logo"
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-xl object-contain bg-white border border-slate-200 p-0.5 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-extrabold tracking-tight truncate">
                  {draft.app_name || 'WaliConnect Pro'}
                </p>
                <p
                  className={`text-[11px] truncate ${
                    previewIsDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Admin
                </p>
              </div>
            </div>
          </div>

          {/* Preview 2: Login Screen */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Kartu Halaman Login
            </p>
            <div
              className={`rounded-2xl p-5 pt-9 relative border ${
                previewIsDark
                  ? 'border-slate-800 text-white'
                  : 'border-slate-200 text-slate-900'
              }`}
              style={{
                background: previewIsDark ? bgPreset.darkGradient : bgPreset.lightGradient,
              }}
            >
              <div className="flex justify-center -mb-6 relative z-10">
                <div
                  className={`w-12 h-12 rounded-xl p-1.5 flex items-center justify-center shadow-md ${
                    previewIsDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-white'
                  }`}
                >
                  <img
                    src={draft.app_logo || DEFAULT_LOGO_URL}
                    alt="Preview Login Logo"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
              </div>

              <div
                className={`rounded-2xl pt-8 pb-4 px-4 border ${
                  previewIsDark
                    ? 'bg-slate-900/85 border-slate-700/60'
                    : 'bg-white/85 border-white shadow-sm'
                }`}
              >
                <div className="text-center mb-3">
                  <p className="text-sm font-extrabold truncate">
                    {draft.app_name || 'WaliConnect Pro'}
                  </p>
                  <p
                    className={`text-[10px] leading-snug mt-0.5 ${
                      previewIsDark ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {draft.app_subtitle}
                  </p>
                </div>

                <div
                  className={`grid ${
                    draft.allow_registration ? 'grid-cols-2' : 'grid-cols-1'
                  } gap-1 p-1 rounded-lg mb-3 ${
                    previewIsDark ? 'bg-slate-800' : 'bg-slate-200/70'
                  }`}
                >
                  <div
                    className={`py-1.5 px-2 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 ${
                      previewIsDark ? 'bg-slate-900 text-blue-400' : 'bg-white text-blue-600'
                    }`}
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Masuk Akun</span>
                  </div>
                  {draft.allow_registration && (
                    <div
                      className={`py-1.5 px-2 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 ${
                        previewIsDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>Daftar Baru</span>
                    </div>
                  )}
                </div>

                <div className="py-2 rounded-lg text-center text-[11px] font-semibold text-white bg-blue-600">
                  Masuk ke Sistem
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[9px] opacity-75">
                  <span>Login Sekali Klik: {draft.show_quick_login ? 'Aktif' : 'Nonaktif'}</span>
                  <span>Data Demo: {draft.show_demo_seed ? 'Aktif' : 'Nonaktif'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
