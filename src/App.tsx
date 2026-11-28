import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  BookOpen,
  MessageSquare,
  Megaphone,
  UserCog,
  UserPlus,
  Printer,
  Search,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { onSnapshot } from 'firebase/firestore';
import {
  COLLECTIONS,
  DEFAULT_APP_CONFIG,
  DEFAULT_LOGO_URL,
  DEFAULT_PRINT_CONFIG,
  colRef,
  docRef,
  handleFirestoreError,
  OperationType,
  seedFullEcosystem,
  testConnection,
} from './lib/firebase';
import { applyAppTheme } from './lib/themeUtils';
import type { PrintTablePayload } from './lib/docExportImport';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { DashboardHome } from './components/DashboardHome';
import { StudentsView } from './components/StudentsView';
import { AttendanceAspectsView } from './components/AttendanceAspectsView';
import { JournalView } from './components/JournalView';
import { CommunicationView } from './components/CommunicationView';
import { AnnouncementsView } from './components/AnnouncementsView';
import { AccountsView } from './components/AccountsView';
import { PrintSystemView } from './components/PrintSystemView';
import { AdminSettingsView } from './components/AdminSettingsView';
import type {
  NavTabId,
  UserRole,
  WcAnnouncement,
  WcAppConfig,
  WcLog,
  WcMessage,
  WcPrintConfig,
  WcStudent,
  WcUser,
} from './types/waliconnect';

interface MenuItem {
  id: NavTabId;
  label: string;
  icon: React.ReactNode;
}

function getMenuForRole(role: UserRole): MenuItem[] {
  if (role === 'Guru Wali') {
    return [
      { id: 'home', label: 'Beranda Guru Wali', icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: 'students', label: 'Murid Dampingan', icon: <Users className="w-4 h-4" /> },
      { id: 'attendance_aspects', label: 'Presensi & 5 Aspek', icon: <ClipboardCheck className="w-4 h-4" /> },
      { id: 'journal', label: 'Buku Jurnal Perwalian', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'communication', label: 'Komunikasi Wali & Siswa', icon: <MessageSquare className="w-4 h-4" /> },
      { id: 'announcements', label: 'Agenda & Pengumuman', icon: <Megaphone className="w-4 h-4" /> },
      { id: 'add_account', label: 'Tambah Akun', icon: <UserPlus className="w-4 h-4" /> },
      { id: 'accounts', label: 'Tautan Akun Wali', icon: <UserCog className="w-4 h-4" /> },
      { id: 'print_f4', label: 'Cetak Laporan SOP (F4)', icon: <Printer className="w-4 h-4" /> },
    ];
  }
  if (role === 'Orang Tua') {
    return [
      { id: 'home', label: 'Beranda Wali Murid', icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: 'students', label: 'Profil Putra/Putri', icon: <Users className="w-4 h-4" /> },
      { id: 'attendance_aspects', label: 'Kehadiran & Perkembangan', icon: <ClipboardCheck className="w-4 h-4" /> },
      { id: 'journal', label: 'Catatan Konseling Anak', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'communication', label: 'Konsultasi Guru Wali', icon: <MessageSquare className="w-4 h-4" /> },
      { id: 'announcements', label: 'Info & Undangan Sekolah', icon: <Megaphone className="w-4 h-4" /> },
    ];
  }
  if (role === 'Siswa') {
    return [
      { id: 'home', label: 'Beranda Saya', icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: 'students', label: 'Profil & Data Diri Saya', icon: <Users className="w-4 h-4" /> },
      { id: 'attendance_aspects', label: 'Rekap Hadir & 5 Aspek', icon: <ClipboardCheck className="w-4 h-4" /> },
      { id: 'journal', label: 'Riwayat Bimbingan Saya', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'communication', label: 'Tanya Guru Wali', icon: <MessageSquare className="w-4 h-4" /> },
      { id: 'announcements', label: 'Pengumuman Sekolah', icon: <Megaphone className="w-4 h-4" /> },
    ];
  }
  // Admin (Koordinator BK)
  return [
    { id: 'home', label: 'Beranda Supervisi BK', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'students', label: 'Direktori Seluruh Murid', icon: <Users className="w-4 h-4" /> },
    { id: 'attendance_aspects', label: 'Rekap Hadir & 5 Aspek', icon: <ClipboardCheck className="w-4 h-4" /> },
    { id: 'journal', label: 'Log Konseling Lintas Kelas', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'communication', label: 'Koordinasi Guru & Wali', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'announcements', label: 'Papan Informasi Sekolah', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'add_account', label: 'Tambah Akun', icon: <UserPlus className="w-4 h-4" /> },
    { id: 'accounts', label: 'Manajemen Akun & Role', icon: <UserCog className="w-4 h-4" /> },
    { id: 'print_f4', label: 'Arsip & Cetak SOP (F4)', icon: <Printer className="w-4 h-4" /> },
    { id: 'admin_settings', label: 'Pengaturan Aplikasi & Tema', icon: <SlidersHorizontal className="w-4 h-4" /> },
  ];
}

function WaliConnectApp() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('wc_dark_mode') === 'true';
  });

  const [users, setUsers] = useState<WcUser[]>([]);
  const [students, setStudents] = useState<WcStudent[]>([]);
  const [logs, setLogs] = useState<WcLog[]>([]);
  const [messages, setMessages] = useState<WcMessage[]>([]);
  const [announcements, setAnnouncements] = useState<WcAnnouncement[]>([]);
  const [printConfig, setPrintConfig] = useState<WcPrintConfig>(DEFAULT_PRINT_CONFIG);
  const [appConfig, setAppConfig] = useState<WcAppConfig>(DEFAULT_APP_CONFIG);

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    return localStorage.getItem('wc_session_user_id');
  });
  const [fallbackUser, setFallbackUser] = useState<WcUser | null>(null);
  const [activeTab, setActiveTab] = useState<NavTabId>('home');
  const [focusStudentId, setFocusStudentId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [printTableData, setPrintTableData] = useState<PrintTablePayload | null>(null);

  useEffect(() => {
    const onPrintTable = (e: Event) => {
      const payload = (e as CustomEvent<PrintTablePayload>).detail;
      if (!payload) return;
      setPrintTableData(payload);
      document.body.classList.add('printing-table-mode');
      const cleanup = () => {
        document.body.classList.remove('printing-table-mode');
        setPrintTableData(null);
      };
      window.addEventListener('afterprint', cleanup, { once: true });
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          document.body.classList.remove('printing-table-mode');
        }, 1200);
      }, 90);
    };
    window.addEventListener('wc-print-table', onPrintTable);
    return () => window.removeEventListener('wc-print-table', onPrintTable);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('wc_dark_mode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    applyAppTheme(appConfig);
  }, [appConfig]);

  useEffect(() => {
    testConnection();

    const unsubUsers = onSnapshot(
      colRef(COLLECTIONS.users),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as WcUser), id: d.id }));
        setUsers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, COLLECTIONS.users)
    );

    const unsubStudents = onSnapshot(
      colRef(COLLECTIONS.students),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as WcStudent), id: d.id }));
        setStudents(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, COLLECTIONS.students)
    );

    const unsubLogs = onSnapshot(
      colRef(COLLECTIONS.logs),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as WcLog), id: d.id }))
          .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
        setLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, COLLECTIONS.logs)
    );

    const unsubMessages = onSnapshot(
      colRef(COLLECTIONS.messages),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as WcMessage), id: d.id }));
        setMessages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, COLLECTIONS.messages)
    );

    const unsubAnnouncements = onSnapshot(
      colRef(COLLECTIONS.announcements),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as WcAnnouncement), id: d.id }))
          .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
        setAnnouncements(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, COLLECTIONS.announcements)
    );

    const unsubSettings = onSnapshot(
      docRef(COLLECTIONS.settings, 'print_config'),
      (snap) => {
        if (snap.exists()) {
          setPrintConfig({ ...DEFAULT_PRINT_CONFIG, ...(snap.data() as Partial<WcPrintConfig>) });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `${COLLECTIONS.settings}/print_config`)
    );

    const unsubAppSettings = onSnapshot(
      docRef(COLLECTIONS.settings, 'app_config'),
      (snap) => {
        if (snap.exists()) {
          const next = { ...DEFAULT_APP_CONFIG, ...(snap.data() as Partial<WcAppConfig>) };
          setAppConfig(next);
          if (localStorage.getItem('wc_dark_mode') === null) {
            setDarkMode(next.default_theme_mode === 'dark');
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `${COLLECTIONS.settings}/app_config`)
    );

    return () => {
      unsubUsers();
      unsubStudents();
      unsubLogs();
      unsubMessages();
      unsubAnnouncements();
      unsubSettings();
      unsubAppSettings();
    };
  }, []);

  const currentUser =
    users.find((u) => u.id === currentUserId) ??
    (fallbackUser && fallbackUser.id === currentUserId ? fallbackUser : null);

  const handleLoginSuccess = (user: WcUser) => {
    setFallbackUser(user);
    setCurrentUserId(user.id);
    localStorage.setItem('wc_session_user_id', user.id);
    setActiveTab('home');
    setSearchQuery('');
  };

  const handleLogout = () => {
    setCurrentUserId(null);
    setFallbackUser(null);
    localStorage.removeItem('wc_session_user_id');
    setMobileMenuOpen(false);
  };

  const handleSeedDemo = async () => {
    setIsSeeding(true);
    try {
      await seedFullEcosystem();
    } finally {
      setIsSeeding(false);
    }
  };

  const handleNavigate = (tab: NavTabId, studentId?: string) => {
    setActiveTab(tab);
    if (studentId) setFocusStudentId(studentId);
    setMobileMenuOpen(false);
  };

  if (!currentUser) {
    return (
      <LoginView
        users={users}
        students={students}
        appConfig={appConfig}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        onLoginSuccess={handleLoginSuccess}
        onSeedDemo={handleSeedDemo}
        isSeeding={isSeeding}
      />
    );
  }

  const menuItems = getMenuForRole(currentUser.role);
  const currentMenu = menuItems.find((m) => m.id === activeTab) ?? menuItems[0];
  const appTitle = appConfig.app_name || DEFAULT_APP_CONFIG.app_name;
  const appLogo = appConfig.app_logo || DEFAULT_LOGO_URL;

  const anyPerwalianConfigured = students.some((s) => Boolean(s.guru_wali_id));
  const myPerwalianStudents = students.filter((s) => s.guru_wali_id === currentUser.id);
  const effectiveStudents =
    currentUser.role === 'Guru Wali' && anyPerwalianConfigured ? myPerwalianStudents : students;
  const effectiveLogs =
    currentUser.role === 'Guru Wali' && anyPerwalianConfigured
      ? logs.filter((l) => effectiveStudents.some((s) => s.id === l.student_id))
      : logs;

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
        <img
          src={appLogo}
          alt={`Logo ${appTitle}`}
          referrerPolicy="no-referrer"
          className="w-9 h-9 rounded-xl object-contain border border-slate-200 dark:border-slate-700 bg-white p-0.5 shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
            {appTitle}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {currentUser.role}
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {menuItems.map((item) => {
          const active = currentMenu.id === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                active
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Sidebar Highlight Card for Guru Wali / Admin */}
      {(currentUser.role === 'Guru Wali' || currentUser.role === 'Admin') && (
        <div className="m-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1.5">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-bold">
              {appConfig.sidebar_sop_title || DEFAULT_APP_CONFIG.sidebar_sop_title}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {appConfig.sidebar_sop_desc || DEFAULT_APP_CONFIG.sidebar_sop_desc}
          </p>
        </div>
      )}

      <div className="p-3 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Keluar Akun</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="app-shell min-h-screen bg-[#f4f7fe] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full border-r border-slate-200 dark:border-slate-800 z-10">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {appTitle} / {currentUser.role}
              </p>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {currentMenu.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:flex items-center relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari murid, NIS, atau topik jurnal..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Ganti Tema"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[160px]">
                {currentUser.nama}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                {currentUser.nip}
              </p>
            </div>
          </div>
        </header>

        {/* Active View Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {currentUser.role === 'Guru Wali' &&
            anyPerwalianConfigured &&
            myPerwalianStudents.length === 0 &&
            currentMenu.id !== 'accounts' &&
            currentMenu.id !== 'add_account' && (
              <div className="mb-5 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
                <span>
                  Belum ada siswa perwalian yang ditetapkan untuk akun Anda. Silakan pilih siswa perwalian di menu{' '}
                  <strong>Tautan Akun Wali</strong> atau hubungi Admin.
                </span>
                <button
                  type="button"
                  onClick={() => handleNavigate('accounts')}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer"
                >
                  Pilih Siswa Perwalian
                </button>
              </div>
            )}

          {currentMenu.id === 'home' && (
            <DashboardHome
              currentUser={currentUser}
              users={users}
              students={effectiveStudents}
              logs={effectiveLogs}
              announcements={announcements}
              darkMode={darkMode}
              onNavigate={handleNavigate}
            />
          )}

          {currentMenu.id === 'students' && (
            <StudentsView
              students={effectiveStudents}
              role={currentUser.role}
              linkedStudentId={currentUser.linked_student_id}
              currentUser={currentUser}
              users={users}
              searchQuery={searchQuery}
              initialSelectedId={focusStudentId}
            />
          )}

          {currentMenu.id === 'attendance_aspects' && (
            <AttendanceAspectsView
              students={effectiveStudents}
              logs={effectiveLogs}
              role={currentUser.role}
              linkedStudentId={currentUser.linked_student_id}
            />
          )}

          {currentMenu.id === 'journal' && (
            <JournalView
              logs={effectiveLogs}
              students={effectiveStudents}
              currentUser={currentUser}
              searchQuery={searchQuery}
            />
          )}

          {currentMenu.id === 'communication' && (
            <CommunicationView
              messages={messages}
              users={users}
              students={effectiveStudents}
              currentUser={currentUser}
              searchQuery={searchQuery}
            />
          )}

          {currentMenu.id === 'announcements' && (
            <AnnouncementsView
              announcements={announcements}
              currentUser={currentUser}
            />
          )}

          {currentMenu.id === 'add_account' && (
            <AccountsView
              users={users}
              students={students}
              currentUser={currentUser}
              focusMode="add_only"
            />
          )}

          {currentMenu.id === 'accounts' && (
            <AccountsView
              users={users}
              students={students}
              currentUser={currentUser}
            />
          )}

          {currentMenu.id === 'print_f4' && (
            <PrintSystemView
              config={printConfig}
              students={effectiveStudents}
              logs={effectiveLogs}
              currentUser={currentUser}
            />
          )}

          {currentMenu.id === 'admin_settings' && currentUser.role === 'Admin' && (
            <AdminSettingsView
              appConfig={appConfig}
              printConfig={printConfig}
              darkMode={darkMode}
              onSetDarkMode={setDarkMode}
              users={users}
              students={students}
              currentUser={currentUser}
            />
          )}
        </main>
      </div>
    </div>
    {printTableData && (
      <div className="hidden print-table-portal bg-white text-slate-900">
        <div className="mb-4 pb-2 border-b-2 border-slate-900">
          <h1 className="text-base font-bold uppercase tracking-wide">{printTableData.title}</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            {printTableData.subtitle ? `${printTableData.subtitle} · ` : ''}
            Dicetak: {new Date().toLocaleDateString('id-ID')}
          </p>
        </div>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {printTableData.headers.map((h, i) => (
                <th
                  key={i}
                  className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-bold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printTableData.rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className="border border-slate-300 px-2 py-1.5 align-top whitespace-pre-line"
                  >
                    {cell || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WaliConnectApp />
    </ErrorBoundary>
  );
}
