import React, { useState } from 'react';
import {
  UserPlus,
  Trash2,
  Link2,
  Loader2,
  Edit3,
  X,
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  downloadRecordsXlsTemplate,
  exportRecordsToPdf,
  exportRecordsToWord,
  exportRecordsToXls,
  importRecordsFromFile,
  triggerTablePrint,
} from '../lib/docExportImport';
import { PerwalianAssignmentPanel } from './PerwalianAssignmentPanel';
import { DataActionsBar } from './DataActionsBar';
import type { UserRole, WcStudent, WcUser } from '../types/waliconnect';

interface AccountsViewProps {
  users: WcUser[];
  students: WcStudent[];
  currentUser: WcUser;
  focusMode?: 'add_only' | 'full';
}

const ACCOUNT_HEADERS = ['Nama', 'NIP_Login', 'Peran', 'PIN', 'Murid Tertaut'];

function pickAccountCell(row: Record<string, unknown>, ...keys: string[]): string {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(
      ([k]) => k.trim().toLowerCase() === key.trim().toLowerCase()
    );
    if (found && String(found[1] ?? '').trim()) {
      return String(found[1]).trim();
    }
  }
  return '';
}

function normalizeUserRole(raw: string, allowAdmin: boolean): UserRole {
  const lower = raw.toLowerCase();
  if (lower.includes('admin') && allowAdmin) return 'Admin';
  if (lower.includes('guru') && allowAdmin) return 'Guru Wali';
  if (lower.includes('siswa') || lower.includes('murid')) return 'Siswa';
  return 'Orang Tua';
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  users,
  students,
  currentUser,
  focusMode = 'full',
}) => {
  const isAdmin = currentUser.role === 'Admin';
  const canManage = isAdmin || currentUser.role === 'Guru Wali';
  const [nama, setNama] = useState('');
  const [nip, setNip] = useState('');
  const [role, setRole] = useState<UserRole>('Orang Tua');
  const [password, setPassword] = useState('123');
  const [showPin, setShowPin] = useState(false);
  const [jabatan, setJabatan] = useState('');
  const [linkedStudentId, setLinkedStudentId] = useState(students[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'Semua' | UserRole>('Semua');

  const [editingUser, setEditingUser] = useState<WcUser | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const filteredUsers =
    roleFilter === 'Semua' ? users : users.filter((u) => u.role === roleFilter);
  const allIds = filteredUsers.map((u) => u.id);
  const activeChecked = checkedIds.filter((id) => allIds.includes(id));
  const allSelected = allIds.length > 0 && activeChecked.length === allIds.length;
  const targetUsers =
    activeChecked.length > 0
      ? filteredUsers.filter((u) => activeChecked.includes(u.id))
      : filteredUsers;

  const toggleSelect = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setCheckedIds([]);
    } else {
      setCheckedIds(allIds);
    }
  };

  const getStudentLabel = (studentId?: string) => {
    if (!studentId) return '-';
    const st = students.find((s) => s.id === studentId);
    return st ? `${st.nama_lengkap} (${st.kelas})` : studentId;
  };

  const defaultJabatanFor = (r: UserRole, studentId?: string) => {
    const st = studentId ? students.find((s) => s.id === studentId) : undefined;
    if (r === 'Orang Tua') return st ? `Wali Murid dari ${st.nama_lengkap}` : 'Orang Tua / Wali Murid';
    if (r === 'Siswa') return st ? `Murid Kelas ${st.kelas}` : 'Peserta Didik';
    if (r === 'Guru Wali') return 'Guru Wali Pendamping';
    return 'Administrator / Koordinator BK';
  };

  const handlePrefillFromStudent = (studentId: string, targetRole: 'Siswa' | 'Orang Tua') => {
    const st = students.find((s) => s.id === studentId);
    if (!st) return;
    setRole(targetRole);
    setLinkedStudentId(st.id);
    if (targetRole === 'Siswa') {
      setNama(st.nama_lengkap);
      setNip(st.nis || st.nisn || st.whatsapp || '');
      setJabatan(`Murid Kelas ${st.kelas}`);
    } else {
      setNama(st.nama_ayah || st.nama_ibu || `Wali ${st.nama_lengkap}`);
      setNip(st.kontak_ortu || st.perwalian_induk?.hp_ayah || st.perwalian_induk?.hp_ibu || `ortu-${st.nis}`);
      setJabatan(`Wali Murid dari ${st.nama_lengkap}`);
    }
    setPassword('123');
    setActionError('');
    setNotice(`Formulir diisi otomatis untuk akun ${targetRole} dari data ${st.nama_lengkap}. Silakan cek lalu klik Simpan Akun.`);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setNotice('');
    const cleanNama = nama.trim();
    const cleanNip = nip.trim();
    const cleanPin = password.trim();
    if (!cleanNama || !cleanNip || !cleanPin) {
      setActionError('Nama Lengkap, NIP/NIS/Login, dan PIN wajib diisi.');
      return;
    }
    const duplicate = users.find(
      (u) => u.nip.trim().toLowerCase() === cleanNip.toLowerCase()
    );
    if (duplicate) {
      setActionError(
        `ID Login / NIP "${cleanNip}" sudah digunakan oleh akun "${duplicate.nama}". Gunakan NIP/NIS/No. HP lain.`
      );
      return;
    }

    setBusy(true);
    try {
      const id = `usr-${Date.now()}`;
      const newUser: WcUser = {
        id,
        nama: cleanNama,
        nip: cleanNip,
        role,
        password: cleanPin,
        ...(linkedStudentId ? { linked_student_id: linkedStudentId } : {}),
        jabatan: (jabatan.trim() || defaultJabatanFor(role, linkedStudentId)).slice(0, 160),
        created_at: new Date().toISOString(),
      };
      await setDoc(doc(db, COLLECTIONS.users, id), newUser);
      setNama('');
      setNip('');
      setJabatan('');
      setNotice(`Akun "${newUser.nama}" (${newUser.role}) berhasil ditambahkan dan siap digunakan untuk login.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menyimpan akun baru.');
      handleFirestoreError(err, OperationType.CREATE, COLLECTIONS.users);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editingUser.nama.trim() || !editingUser.nip.trim()) return;
    setSavingEdit(true);
    try {
      const payload: WcUser = {
        id: editingUser.id,
        nama: editingUser.nama.trim(),
        nip: editingUser.nip.trim(),
        role: editingUser.role,
        password: editingUser.password.trim() || '123',
        jabatan: (editingUser.jabatan?.trim() || editingUser.role).slice(0, 160),
        ...(editingUser.linked_student_id
          ? { linked_student_id: editingUser.linked_student_id }
          : {}),
        ...(editingUser.created_at ? { created_at: editingUser.created_at } : {}),
      };
      await setDoc(doc(db, COLLECTIONS.users, editingUser.id), payload);
      setNotice(`Akun "${editingUser.nama}" berhasil diperbarui.`);
      setEditingUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.users}/${editingUser.id}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleUpdateLink = async (userId: string, studentId: string) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.users, userId), {
        linked_student_id: studentId,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.users}/${userId}`);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.users, userId), {
        role: newRole,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.users}/${userId}`);
    }
  };

  const handleDelete = async (userId: string) => {
    if (userId === currentUser.id) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.users, userId));
      setCheckedIds((prev) => prev.filter((item) => item !== userId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${COLLECTIONS.users}/${userId}`);
    }
  };

  const handleBulkDelete = async () => {
    setActionError('');
    setNotice('');
    try {
      const deletableIds = activeChecked.filter((id) => id !== currentUser.id);
      if (deletableIds.length === 0) {
        setActionError('Akun yang sedang aktif digunakan tidak dapat dihapus.');
        return;
      }
      await Promise.all(
        deletableIds.map((id) => deleteDoc(doc(db, COLLECTIONS.users, id)))
      );
      setNotice(`${deletableIds.length} akun pengguna berhasil dihapus.`);
      setCheckedIds([]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghapus akun terpilih.');
    }
  };

  const handleDownloadTemplateXls = () => {
    downloadRecordsXlsTemplate(
      [
        {
          Nama: 'Bapak Budi Santoso',
          NIP_Login: 'ortu2025001',
          Peran: 'Orang Tua',
          PIN: '123',
          'Murid Tertaut': students[0]?.nama_lengkap || '',
        },
      ],
      [
        'Petunjuk Import Akun Pengguna WaliConnect Pro',
        'Kolom wajib: Nama | NIP_Login | Peran | PIN | Murid Tertaut',
        'Peran valid: Orang Tua, Siswa, Guru Wali, Admin',
        'Murid Tertaut boleh diisi Nama Murid atau NIS murid yang sudah terdaftar.',
      ],
      'Daftar_Akun',
      'Template_Akun_WaliConnect.xlsx'
    );
  };

  const handleDownloadTemplateWord = async () => {
    await exportRecordsToWord(
      'TEMPLATE IMPORT AKUN PENGGUNA',
      'Isi tabel berikut, simpan .docx, lalu unggah melalui tombol Import XLS / Word.',
      ACCOUNT_HEADERS,
      [
        [
          'Bapak Budi Santoso',
          'ortu2025001',
          'Orang Tua',
          '123',
          students[0]?.nama_lengkap || '',
        ],
      ],
      'Template_Akun_WaliConnect.docx',
      true
    );
  };

  const handleImportFile = async (file: File) => {
    setActionError('');
    setNotice('');
    try {
      const rows = await importRecordsFromFile(file);
      const baseTs = Date.now();
      const imported: WcUser[] = [];

      rows.forEach((row, idx) => {
        const nm = pickAccountCell(row, 'Nama', 'Nama Akun', 'Nama Lengkap');
        const loginId = pickAccountCell(row, 'NIP_Login', 'NIP', 'NIS', 'Login');
        if (!nm || !loginId) return;
        const rawRole = pickAccountCell(row, 'Peran', 'Role') || 'Orang Tua';
        const resolvedRole = normalizeUserRole(rawRole, isAdmin);
        const pin = pickAccountCell(row, 'PIN', 'Password', 'Sandi') || '123';
        const linkedRaw = pickAccountCell(row, 'Murid Tertaut', 'Murid', 'Nama Murid', 'NIS Murid');
        const matchedStudent = students.find(
          (s) =>
            s.nama_lengkap.toLowerCase() === linkedRaw.toLowerCase() ||
            s.nis.toLowerCase() === linkedRaw.toLowerCase()
        );

        imported.push({
          id: `usr-imp-${baseTs}-${idx}`,
          nama: nm,
          nip: loginId,
          role: resolvedRole,
          password: pin,
          ...(matchedStudent ? { linked_student_id: matchedStudent.id } : {}),
          jabatan: resolvedRole,
          created_at: new Date().toISOString(),
        });
      });

      if (imported.length === 0) {
        throw new Error('Tidak ada baris akun valid (wajib ada Nama dan NIP_Login).');
      }

      await Promise.all(
        imported.map((u) => setDoc(doc(db, COLLECTIONS.users, u.id), u))
      );
      setNotice(`Berhasil mengimpor ${imported.length} akun pengguna.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengimpor data akun.');
    }
  };

  const toAccountMatrix = (items: WcUser[]) =>
    items.map((u) => [
      u.nama,
      u.nip,
      u.role,
      '***',
      getStudentLabel(u.linked_student_id),
    ]);

  const studentsMissingAccount = students.filter((st) => {
    const hasStudentAcc = users.some(
      (u) => u.role === 'Siswa' && u.linked_student_id === st.id
    );
    const hasParentAcc = users.some(
      (u) => u.role === 'Orang Tua' && u.linked_student_id === st.id
    );
    return !hasStudentAcc || !hasParentAcc;
  });

  return (
    <div className="space-y-6">
      {focusMode !== 'add_only' && (
        <PerwalianAssignmentPanel users={users} students={students} currentUser={currentUser} />
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isAdmin ? 'Tambah Akun Pengguna Baru' : 'Buat Akun Orang Tua / Siswa Baru'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Isi data akun di bawah untuk membuat akun login baru dan menautkannya ke murid jika diperlukan.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            Total Akun: {users.length}
          </span>
        </div>

        <form onSubmit={handleAddAccount} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Nama Lengkap *
            </label>
            <input
              required
              type="text"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1 text-slate-700 dark:text-slate-300">
              ID Login (NIP / NIS / No. HP) *
            </label>
            <input
              required
              type="text"
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              placeholder="Contoh: 19780412... atau 20241101"
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Peran Akun *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="Orang Tua">Orang Tua</option>
              <option value="Siswa">Siswa</option>
              {isAdmin && <option value="Guru Wali">Guru Wali</option>}
              {isAdmin && <option value="Admin">Admin</option>}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Tautkan Murid (Opsional untuk Guru/Admin)
            </label>
            <select
              value={linkedStudentId}
              onChange={(e) => setLinkedStudentId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="">-- Tidak Tertaut --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama_lengkap} ({s.kelas})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Jabatan / Keterangan
            </label>
            <input
              type="text"
              value={jabatan}
              onChange={(e) => setJabatan(e.target.value)}
              placeholder={defaultJabatanFor(role, linkedStudentId)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1 text-slate-700 dark:text-slate-300">
              PIN / Kata Sandi *
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  required
                  type={showPin ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="PIN"
                  className="w-full pl-3 pr-8 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                >
                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                <span>Simpan Akun</span>
              </button>
            </div>
          </div>
        </form>

        {studentsMissingAccount.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Isi Cepat Formulir dari Daftar Murid Belum Memiliki Akun:</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {studentsMissingAccount.slice(0, 6).map((st) => {
                const hasSiswa = users.some(
                  (u) => u.role === 'Siswa' && u.linked_student_id === st.id
                );
                const hasOrtu = users.some(
                  (u) => u.role === 'Orang Tua' && u.linked_student_id === st.id
                );
                return (
                  <div
                    key={st.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[11px]"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {st.nama_lengkap}
                    </span>
                    {!hasSiswa && (
                      <button
                        type="button"
                        onClick={() => handlePrefillFromStudent(st.id, 'Siswa')}
                        className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 cursor-pointer"
                      >
                        + Akun Siswa
                      </button>
                    )}
                    {!hasOrtu && (
                      <button
                        type="button"
                        onClick={() => handlePrefillFromStudent(st.id, 'Orang Tua')}
                        className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-100 cursor-pointer"
                      >
                        + Akun Ortu
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Daftar Akun &amp; Tautan Murid
              </h3>
            </div>
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {(['Semua', 'Guru Wali', 'Orang Tua', 'Siswa', 'Admin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    roleFilter === r
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <DataActionsBar
            totalCount={filteredUsers.length}
            selectedCount={activeChecked.length}
            allSelected={allSelected}
            onToggleSelectAll={toggleSelectAll}
            canManage={canManage}
            onEditSelected={() => {
              const found = users.find((u) => u.id === activeChecked[0]);
              if (found) setEditingUser({ ...found });
            }}
            onBulkDelete={handleBulkDelete}
            bulkDeleteLabel="akun pengguna"
            onDownloadTemplateXls={handleDownloadTemplateXls}
            onDownloadTemplateWord={handleDownloadTemplateWord}
            onImportFile={handleImportFile}
            onExportXls={() =>
              exportRecordsToXls(
                targetUsers.map((u) => ({
                  Nama: u.nama,
                  NIP_Login: u.nip,
                  Peran: u.role,
                  'Murid Tertaut': getStudentLabel(u.linked_student_id),
                })),
                'Daftar_Akun',
                'Daftar_Akun_WaliConnect.xlsx'
              )
            }
            onExportPdf={() =>
              exportRecordsToPdf(
                'DAFTAR AKUN PENGGUNA & TAUTAN MURID',
                `Jumlah Akun: ${targetUsers.length}`,
                ACCOUNT_HEADERS,
                toAccountMatrix(targetUsers),
                'Daftar_Akun_WaliConnect.pdf',
                true
              )
            }
            onExportWord={() =>
              exportRecordsToWord(
                'DAFTAR AKUN PENGGUNA & TAUTAN MURID',
                `Jumlah Akun: ${targetUsers.length}`,
                ACCOUNT_HEADERS,
                toAccountMatrix(targetUsers),
                'Daftar_Akun_WaliConnect.docx',
                true
              )
            }
            onPrint={() =>
              triggerTablePrint({
                title: 'DAFTAR AKUN PENGGUNA & TAUTAN MURID',
                subtitle: `Jumlah Akun: ${targetUsers.length}`,
                headers: ACCOUNT_HEADERS,
                rows: toAccountMatrix(targetUsers),
                landscape: true,
              })
            }
            notice={notice}
            error={actionError}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-3 w-10">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    title="Pilih Semua"
                    className="p-0.5 text-slate-500 hover:text-blue-600 cursor-pointer"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 font-bold">Nama Akun</th>
                <th className="py-3 px-4 font-bold">NIP / NIS / Login</th>
                <th className="py-3 px-4 font-bold">Peran</th>
                <th className="py-3 px-4 font-bold">Murid Tertaut</th>
                <th className="py-3 px-4 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const isChecked = activeChecked.includes(u.id);
                return (
                  <tr
                    key={u.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      isChecked ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                    }`}
                  >
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => toggleSelect(u.id)}
                        className="p-0.5 text-slate-500 hover:text-blue-600 cursor-pointer"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {u.nama}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-600 dark:text-slate-300">
                      {u.nip}
                    </td>
                    <td className="py-3 px-4">
                      {isAdmin ? (
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateRole(u.id, e.target.value as UserRole)}
                          className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                        >
                          <option value="Guru Wali">Guru Wali</option>
                          <option value="Orang Tua">Orang Tua</option>
                          <option value="Siswa">Siswa</option>
                          <option value="Admin">Admin</option>
                        </select>
                      ) : (
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {u.role}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={u.linked_student_id || ''}
                        onChange={(e) => handleUpdateLink(u.id, e.target.value)}
                        className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        <option value="">-- Tidak Tertaut --</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nama_lengkap} ({s.kelas})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingUser({ ...u })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 cursor-pointer"
                          title="Edit Akun"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {u.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => handleDelete(u.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Hapus Akun"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edit Akun */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Akun Pengguna
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="p-6 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Lengkap *</label>
                <input
                  required
                  type="text"
                  value={editingUser.nama}
                  onChange={(e) => setEditingUser({ ...editingUser, nama: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">NIP / NIS / Login *</label>
                  <input
                    required
                    type="text"
                    value={editingUser.nip}
                    onChange={(e) => setEditingUser({ ...editingUser, nip: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">PIN / Sandi</label>
                  <input
                    required
                    type="text"
                    value={editingUser.password}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, password: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Peran Akun</label>
                <select
                  disabled={!isAdmin}
                  value={editingUser.role}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, role: e.target.value as UserRole })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-60"
                >
                  <option value="Orang Tua">Orang Tua</option>
                  <option value="Siswa">Siswa</option>
                  <option value="Guru Wali">Guru Wali</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Jabatan / Keterangan</label>
                <input
                  type="text"
                  value={editingUser.jabatan || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, jabatan: e.target.value })}
                  placeholder="Contoh: Guru Wali Kelas XI MIPA 1"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Murid Tertaut</label>
                <select
                  value={editingUser.linked_student_id || ''}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, linked_student_id: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="">-- Tidak Tertaut --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama_lengkap} ({s.kelas})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
