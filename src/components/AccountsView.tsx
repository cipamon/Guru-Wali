import React, { useState } from 'react';
import { UserPlus, Trash2, Link2, Loader2 } from 'lucide-react';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { UserRole, WcStudent, WcUser } from '../types/waliconnect';

interface AccountsViewProps {
  users: WcUser[];
  students: WcStudent[];
  currentUser: WcUser;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  users,
  students,
  currentUser,
}) => {
  const isAdmin = currentUser.role === 'Admin';
  const [nama, setNama] = useState('');
  const [nip, setNip] = useState('');
  const [role, setRole] = useState<UserRole>('Orang Tua');
  const [password, setPassword] = useState('123');
  const [linkedStudentId, setLinkedStudentId] = useState(students[0]?.id || '');
  const [busy, setBusy] = useState(false);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim() || !nip.trim() || !password.trim()) return;
    setBusy(true);
    try {
      const id = `usr-${Date.now()}`;
      const newUser: WcUser = {
        id,
        nama: nama.trim(),
        nip: nip.trim(),
        role,
        password: password.trim(),
        ...(linkedStudentId ? { linked_student_id: linkedStudentId } : {}),
        jabatan: role,
        created_at: new Date().toISOString(),
      };
      await setDoc(doc(db, COLLECTIONS.users, id), newUser);
      setNama('');
      setNip('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, COLLECTIONS.users);
    } finally {
      setBusy(false);
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
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${COLLECTIONS.users}/${userId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {isAdmin ? 'Tambah Akun Pengguna Baru' : 'Buat Tautan Akun Orang Tua / Siswa'}
          </h2>
        </div>

        <form onSubmit={handleAddAccount} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            required
            type="text"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Nama Lengkap"
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          />
          <input
            required
            type="text"
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            placeholder="NIP / NIS / No. HP"
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="Orang Tua">Orang Tua</option>
            <option value="Siswa">Siswa</option>
            {isAdmin && <option value="Guru Wali">Guru Wali</option>}
            {isAdmin && <option value="Admin">Admin</option>}
          </select>
          <select
            value={linkedStudentId}
            onChange={(e) => setLinkedStudentId(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="">-- Tautkan Murid --</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama_lengkap} ({s.kelas})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              required
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="PIN"
              className="w-20 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Simpan</span>
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Daftar Akun &amp; Tautan Murid
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold">Nama Akun</th>
                <th className="py-3 px-4 font-bold">NIP / NIS / Login</th>
                <th className="py-3 px-4 font-bold">Peran</th>
                <th className="py-3 px-4 font-bold">Murid Tertaut</th>
                <th className="py-3 px-4 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
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
                  <td className="py-3 px-4 text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
