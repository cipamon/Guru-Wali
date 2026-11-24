import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Sun,
  Moon,
  LogIn,
  UserPlus,
  Database,
  ShieldCheck,
  GraduationCap,
  Users,
  UserCheck,
  Briefcase,
  Loader2,
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, DEFAULT_LOGO_URL, db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { UserRole, WcStudent, WcUser } from '../types/waliconnect';

interface LoginViewProps {
  users: WcUser[];
  students: WcStudent[];
  darkMode: boolean;
  onToggleDark: () => void;
  onLoginSuccess: (user: WcUser) => void;
  onSeedDemo: () => Promise<void>;
  isSeeding: boolean;
}

const ROLE_ICON: Record<UserRole, React.ReactNode> = {
  'Guru Wali': <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
  'Orang Tua': <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
  Siswa: <GraduationCap className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
  Admin: <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
};

export const LoginView: React.FC<LoginViewProps> = ({
  users,
  students,
  darkMode,
  onToggleDark,
  onLoginSuccess,
  onSeedDemo,
  isSeeding,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [regNama, setRegNama] = useState('');
  const [regNip, setRegNip] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('Guru Wali');
  const [regPass, setRegPass] = useState('');
  const [regStudentId, setRegStudentId] = useState('');
  const [regBusy, setRegBusy] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const key = identifier.trim().toLowerCase();
    const pwd = password.trim();
    if (!key || !pwd) {
      setErrorMsg('Mohon masukkan Username / NIP / NIS / Nama Lengkap serta Kata Sandi atau PIN.');
      return;
    }

    const found = users.find(
      (u) =>
        (u.nip.toLowerCase() === key || u.nama.toLowerCase() === key) &&
        u.password === pwd
    );

    if (found) {
      onLoginSuccess(found);
      return;
    }

    // Special dedicated admin account fallback & auto-registration to Firestore
    if (key === 'admin' && pwd === 'admin123') {
      const adminUser: WcUser = {
        id: 'usr-admin-super',
        nama: 'Administrator Sekolah',
        nip: 'admin',
        role: 'Admin',
        password: 'admin123',
        jabatan: 'Akun Khusus Admin Sistem',
        created_at: new Date().toISOString(),
      };
      try {
        await setDoc(doc(db, COLLECTIONS.users, adminUser.id), adminUser);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${COLLECTIONS.users}/${adminUser.id}`);
      }
      onLoginSuccess(adminUser);
      return;
    }

    setErrorMsg('Akun tidak ditemukan atau kata sandi salah. Periksa kembali atau gunakan Akun Terhubung Database di bawah.');
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!regNama.trim() || !regNip.trim() || !regPass.trim()) {
      setErrorMsg('Nama Lengkap, NIP/NIS/No. HP, dan Kata Sandi wajib diisi.');
      return;
    }

    const duplicate = users.find((u) => u.nip.toLowerCase() === regNip.trim().toLowerCase());
    if (duplicate) {
      setErrorMsg('NIP / NIS / Identitas tersebut sudah terdaftar pada database.');
      return;
    }

    setRegBusy(true);
    try {
      const newId = `usr-${Date.now()}`;
      const newUser: WcUser = {
        id: newId,
        nama: regNama.trim(),
        nip: regNip.trim(),
        role: regRole,
        password: regPass.trim(),
        ...(regStudentId ? { linked_student_id: regStudentId } : {}),
        jabatan:
          regRole === 'Guru Wali'
            ? 'Guru Wali Pendamping'
            : regRole === 'Admin'
            ? 'Koordinator BK'
            : regRole === 'Orang Tua'
            ? 'Wali Murid'
            : 'Murid Dampingan',
        created_at: new Date().toISOString(),
      };
      await setDoc(doc(db, COLLECTIONS.users, newId), newUser);
      setInfoMsg('Akun baru berhasil didaftarkan dan langsung masuk.');
      onLoginSuccess(newUser);
    } catch (err) {
      if (err instanceof Error && err.message.includes('{')) {
        throw err;
      }
      handleFirestoreError(err, OperationType.CREATE, COLLECTIONS.users);
    } finally {
      setRegBusy(false);
    }
  };

  const handleSeedClick = async () => {
    setErrorMsg('');
    setInfoMsg('');
    await onSeedDemo();
    setInfoMsg('Data demo ekosistem lengkap berhasil dimuat ke Firestore.');
  };

  return (
    <div
      className={`min-h-screen relative overflow-x-hidden flex flex-col items-center justify-center px-4 py-12 transition-colors duration-200 ${
        darkMode ? 'login-bg-dark text-slate-100' : 'login-bg-light text-slate-900'
      }`}
    >
      {/* Subtle 3D Soft Geometric Circles */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed -top-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-60 ${
          darkMode ? 'bg-blue-900/30' : 'bg-blue-200/70'
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed bottom-0 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-55 ${
          darkMode ? 'bg-indigo-900/25' : 'bg-sky-200/70'
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed top-1/3 left-10 w-36 h-36 rounded-full border opacity-30 ${
          darkMode
            ? 'border-blue-400/20 bg-gradient-to-br from-blue-500/10 to-transparent'
            : 'border-white bg-gradient-to-br from-white/80 to-blue-100/40 shadow-lg'
        }`}
      />

      {/* Top-Right Theme Switch */}
      <div className="fixed top-5 right-5 z-30">
        <button
          type="button"
          onClick={onToggleDark}
          aria-label={darkMode ? 'Aktifkan Tema Terang' : 'Aktifkan Tema Gelap'}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            darkMode
              ? 'bg-slate-800/80 text-amber-300 border border-slate-700 hover:bg-slate-700'
              : 'bg-white/85 text-slate-700 border border-white shadow-sm hover:bg-white'
          }`}
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{darkMode ? 'Tema Terang' : 'Tema Gelap'}</span>
        </button>
      </div>

      {/* Main Auth Glass Card */}
      <div className="relative z-10 w-full max-w-xl mt-6">
        {/* Floating Center-Top 3D Logo Emblem */}
        <div className="flex justify-center -mb-10 relative z-20">
          <div
            className={`w-20 h-20 rounded-2xl p-2 flex items-center justify-center transition-transform duration-200 hover:-translate-y-0.5 ${
              darkMode
                ? 'bg-slate-800 border border-slate-700 shadow-2xl'
                : 'bg-white border border-white shadow-[0_14px_30px_rgba(37,99,235,0.18)]'
            }`}
          >
            <img
              src={DEFAULT_LOGO_URL}
              alt="Logo WaliConnect Pro"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain rounded-xl"
            />
          </div>
        </div>

        <div
          className={`rounded-3xl pt-14 pb-7 px-6 sm:px-9 transition-all ${
            darkMode ? 'neumorphic-glass-dark' : 'neumorphic-glass-light'
          }`}
        >
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              WaliConnect Pro
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1.5">
              Sistem Guru Wali &amp; Perwalian Sekolah Terpadu · Permendikdasmen No. 11/2025
            </p>
          </div>

          {/* Auth Tab Switcher */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80 mb-6">
            <button
              type="button"
              onClick={() => {
                setAuthTab('login');
                setErrorMsg('');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                authTab === 'login'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Masuk Akun</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('register');
                setErrorMsg('');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                authTab === 'register'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Daftar Akun Baru</span>
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {infoMsg}
            </div>
          )}

          {authTab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Username / NIP / NIS / Nama Lengkap
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Contoh: admin, 197804122005012008, atau 20241101"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Kata Sandi / PIN
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi atau PIN"
                    className="w-full pl-3.5 pr-11 py-2.5 rounded-xl text-sm bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'Sembunyikan sandi' : 'Lihat sandi'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer p-1"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
              >
                Masuk ke Sistem
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    value={regNama}
                    onChange={(e) => setRegNama(e.target.value)}
                    placeholder="Nama lengkap & gelar"
                    className="w-full px-3 py-2 rounded-xl text-sm bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    NIP / NIS / No. HP
                  </label>
                  <input
                    type="text"
                    value={regNip}
                    onChange={(e) => setRegNip(e.target.value)}
                    placeholder="Nomor identitas login"
                    className="w-full px-3 py-2 rounded-xl text-sm bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Pilih Peran Akun
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl text-sm bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Guru Wali">Guru Wali</option>
                    <option value="Orang Tua">Orang Tua</option>
                    <option value="Siswa">Siswa</option>
                    <option value="Admin">Admin (Koordinator BK)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kata Sandi / PIN
                  </label>
                  <input
                    type="password"
                    value={regPass}
                    onChange={(e) => setRegPass(e.target.value)}
                    placeholder="Buat sandi / PIN"
                    className="w-full px-3 py-2 rounded-xl text-sm bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {(regRole === 'Orang Tua' || regRole === 'Siswa') && students.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tautkan ke Profil Murid
                  </label>
                  <select
                    value={regStudentId}
                    onChange={(e) => setRegStudentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Pilih Murid (Opsional) --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama_lengkap} ({s.kelas} · NIS {s.nis})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={regBusy}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
              >
                {regBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Daftar &amp; Simpan ke Database</span>
              </button>
            </form>
          )}

          {/* Divider + Connected Accounts & Demo Seeder */}
          <div className="mt-7 pt-5 border-t border-slate-200/80 dark:border-slate-700/80">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h2 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Akun Terhubung Database (Login Sekali Klik)
                </h2>
              </div>
              <button
                type="button"
                onClick={handleSeedClick}
                disabled={isSeeding}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
              >
                {isSeeding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Database className="w-3.5 h-3.5" />
                )}
                <span>Muat Data Demo</span>
              </button>
            </div>

            {users.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Database belum memiliki akun. Klik tombol <strong>Muat Data Demo</strong> untuk mengisi 2 murid lengkap, 4 akun multi-peran, jurnal, dan pengumuman.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-0.5">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => onLoginSuccess(u)}
                    className="text-left p-3 rounded-xl bg-white/80 dark:bg-slate-900/75 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer flex items-start gap-2.5"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                      {ROLE_ICON[u.role]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {u.nama}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {u.role} · <span className="font-mono-tabular">{u.nip}</span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
