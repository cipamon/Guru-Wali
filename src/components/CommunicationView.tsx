import React, { useEffect, useMemo, useState } from 'react';
import {
  Send,
  Image as ImageIcon,
  X,
  Users,
  GraduationCap,
  Loader2,
  Search,
  MessageSquare,
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { compressImageFile } from '../lib/imageUtils';
import { SmartPhoto } from './SmartPhoto';
import { StudentInfoModal } from './StudentInfoModal';
import type { UserRole, WcMessage, WcStudent, WcUser } from '../types/waliconnect';

interface CommunicationViewProps {
  messages: WcMessage[];
  users: WcUser[];
  students: WcStudent[];
  currentUser: WcUser;
  searchQuery?: string;
}

const ROLE_FILTERS: ('Semua' | UserRole)[] = ['Semua', 'Guru Wali', 'Orang Tua', 'Siswa', 'Admin'];

function renderHighlightedText(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={idx}
        className="bg-amber-300 text-slate-950 rounded px-0.5 font-semibold"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

export const CommunicationView: React.FC<CommunicationViewProps> = ({
  messages,
  users,
  students,
  currentUser,
  searchQuery = '',
}) => {
  const isStaff = currentUser.role === 'Guru Wali' || currentUser.role === 'Admin';
  const [channelType, setChannelType] = useState<'student' | 'account'>('student');
  const [contactSearch, setContactSearch] = useState(searchQuery);
  const [classFilter, setClassFilter] = useState<string>('Semua');
  const [roleFilter, setRoleFilter] = useState<'Semua' | UserRole>('Semua');
  const [messageSearch, setMessageSearch] = useState('');
  const [infoStudent, setInfoStudent] = useState<WcStudent | null>(null);

  useEffect(() => {
    setContactSearch(searchQuery);
  }, [searchQuery]);

  const availableStudents = useMemo(
    () =>
      isStaff
        ? students
        : students.filter(
            (s) => !currentUser.linked_student_id || s.id === currentUser.linked_student_id
          ),
    [isStaff, students, currentUser.linked_student_id]
  );

  const availableAccounts = useMemo(
    () => users.filter((u) => u.id !== currentUser.id),
    [users, currentUser.id]
  );

  const uniqueClasses = useMemo(() => {
    const set = new Set(availableStudents.map((s) => s.kelas).filter(Boolean));
    return ['Semua', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [availableStudents]);

  const normalizedContactQuery = contactSearch.trim().toLowerCase();

  const filteredStudents = useMemo(() => {
    return availableStudents.filter((s) => {
      if (classFilter !== 'Semua' && s.kelas !== classFilter) return false;
      if (!normalizedContactQuery) return true;
      return (
        s.nama_lengkap.toLowerCase().includes(normalizedContactQuery) ||
        (s.nama_panggilan || '').toLowerCase().includes(normalizedContactQuery) ||
        s.kelas.toLowerCase().includes(normalizedContactQuery) ||
        s.nis.toLowerCase().includes(normalizedContactQuery) ||
        (s.nisn || '').toLowerCase().includes(normalizedContactQuery)
      );
    });
  }, [availableStudents, classFilter, normalizedContactQuery]);

  const filteredAccounts = useMemo(() => {
    return availableAccounts.filter((u) => {
      if (roleFilter !== 'Semua' && u.role !== roleFilter) return false;
      if (!normalizedContactQuery) return true;
      return (
        u.nama.toLowerCase().includes(normalizedContactQuery) ||
        u.role.toLowerCase().includes(normalizedContactQuery) ||
        u.nip.toLowerCase().includes(normalizedContactQuery) ||
        (u.jabatan || '').toLowerCase().includes(normalizedContactQuery)
      );
    });
  }, [availableAccounts, roleFilter, normalizedContactQuery]);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    availableStudents[0]?.id || ''
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    availableAccounts[0]?.id || ''
  );

  const activeTargetId =
    channelType === 'student'
      ? (filteredStudents.some((s) => s.id === selectedStudentId)
          ? selectedStudentId
          : filteredStudents[0]?.id || selectedStudentId || availableStudents[0]?.id || '')
      : (filteredAccounts.some((u) => u.id === selectedAccountId)
          ? selectedAccountId
          : filteredAccounts[0]?.id || selectedAccountId || availableAccounts[0]?.id || '');

  const [text, setText] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [sending, setSending] = useState(false);

  const getThreadStats = (type: 'student' | 'account', targetId: string) => {
    const list = messages
      .filter((m) => {
        if (m.channel_type !== type) return false;
        if (type === 'student') return m.target_id === targetId;
        return (
          (m.sender_id === currentUser.id && m.target_id === targetId) ||
          (m.sender_id === targetId && m.target_id === currentUser.id)
        );
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      count: list.length,
      lastText: list[0]?.text || (list[0]?.foto_url ? '[Lampiran foto]' : ''),
    };
  };

  const rawThreadMessages = useMemo(
    () =>
      messages
        .filter((m) => {
          if (m.channel_type !== channelType) return false;
          if (channelType === 'student') {
            return m.target_id === activeTargetId;
          }
          return (
            (m.sender_id === currentUser.id && m.target_id === activeTargetId) ||
            (m.sender_id === activeTargetId && m.target_id === currentUser.id)
          );
        })
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [messages, channelType, activeTargetId, currentUser.id]
  );

  const normalizedMsgQuery = messageSearch.trim().toLowerCase();
  const threadMessages = useMemo(() => {
    if (!normalizedMsgQuery) return rawThreadMessages;
    return rawThreadMessages.filter(
      (m) =>
        (m.text || '').toLowerCase().includes(normalizedMsgQuery) ||
        m.sender_name.toLowerCase().includes(normalizedMsgQuery) ||
        (m.sender_role || '').toLowerCase().includes(normalizedMsgQuery)
    );
  }, [rawThreadMessages, normalizedMsgQuery]);

  const handleImagePick = async (file: File | undefined) => {
    if (!file) return;
    const compressed = await compressImageFile(file, 720, 0.72);
    setFotoUrl(compressed);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTargetId || (!text.trim() && !fotoUrl)) return;

    setSending(true);
    try {
      const id = `msg-${Date.now()}`;
      const payload: WcMessage = {
        id,
        channel_type: channelType,
        target_id: activeTargetId,
        sender_id: currentUser.id,
        sender_name: currentUser.nama,
        sender_role: currentUser.role,
        text: text.trim(),
        ...(fotoUrl ? { foto_url: fotoUrl } : {}),
        created_at: new Date().toISOString(),
      };
      await setDoc(doc(db, COLLECTIONS.messages, id), payload);
      setText('');
      setFotoUrl('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, COLLECTIONS.messages);
    } finally {
      setSending(false);
    }
  };

  const activeStudent = availableStudents.find((s) => s.id === activeTargetId);
  const activeAccount = availableAccounts.find((u) => u.id === activeTargetId);
  const activeTitle =
    channelType === 'student'
      ? activeStudent?.nama_lengkap || 'Pilih Murid'
      : activeAccount?.nama || 'Pilih Akun';
  const activeSubtitle =
    channelType === 'student'
      ? activeStudent
        ? `${activeStudent.kelas} · NIS ${activeStudent.nis}`
        : ''
      : activeAccount
      ? `${activeAccount.role} · ${activeAccount.nip}`
      : '';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left Thread Selector + Search */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setChannelType('student')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              channelType === 'student'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Per Murid</span>
          </button>
          <button
            type="button"
            onClick={() => setChannelType('account')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              channelType === 'account'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Per Akun</span>
          </button>
        </div>

        {/* Contact / Student Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            placeholder={
              channelType === 'student'
                ? 'Cari nama murid, kelas, atau NIS...'
                : 'Cari nama, peran, atau NIP/NIS...'
            }
            aria-label="Cari kontak atau murid"
            className="w-full pl-8 pr-8 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {contactSearch && (
            <button
              type="button"
              onClick={() => setContactSearch('')}
              aria-label="Hapus pencarian kontak"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Role or Class Quick Filter */}
        {channelType === 'student' && uniqueClasses.length > 2 && (
          <div className="flex items-center gap-2">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              aria-label="Filter kelas murid"
              className="w-full px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {uniqueClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls === 'Semua' ? 'Semua Kelas' : `Kelas ${cls}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {channelType === 'account' && (
          <div className="flex flex-wrap gap-1">
            {ROLE_FILTERS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                  roleFilter === r
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5">
          <span>
            {channelType === 'student'
              ? `${filteredStudents.length} dari ${availableStudents.length} murid`
              : `${filteredAccounts.length} dari ${availableAccounts.length} akun`}
          </span>
          {(contactSearch || classFilter !== 'Semua' || roleFilter !== 'Semua') && (
            <button
              type="button"
              onClick={() => {
                setContactSearch('');
                setClassFilter('Semua');
                setRoleFilter('Semua');
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>

        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
          {channelType === 'student' ? (
            filteredStudents.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Tidak ada murid yang cocok dengan pencarian.
              </div>
            ) : (
              filteredStudents.map((s) => {
                const stats = getThreadStats('student', s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedStudentId(s.id)}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition-colors cursor-pointer ${
                      activeTargetId === s.id
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center">
                          <SmartPhoto
                            src={s.foto_url}
                            alt={s.nama_lengkap}
                            fallback={
                              <span className="text-[9px] font-bold text-slate-500">
                                {s.nama_lengkap.slice(0, 2).toUpperCase()}
                              </span>
                            }
                          />
                        </div>
                        <p className="font-bold truncate">{s.nama_lengkap}</p>
                      </div>
                      {stats.count > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[10px] font-semibold shrink-0">
                          <MessageSquare className="w-2.5 h-2.5" />
                          {stats.count}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {s.kelas} · NIS {s.nis}
                    </p>
                    {stats.lastText && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {stats.lastText}
                      </p>
                    )}
                  </button>
                );
              })
            )
          ) : filteredAccounts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Tidak ada akun yang cocok dengan pencarian.
            </div>
          ) : (
            filteredAccounts.map((u) => {
              const stats = getThreadStats('account', u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedAccountId(u.id)}
                  className={`w-full text-left p-3 rounded-xl border text-xs transition-colors cursor-pointer ${
                    activeTargetId === u.id
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold truncate">{u.nama}</p>
                    {stats.count > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[10px] font-semibold shrink-0">
                        <MessageSquare className="w-2.5 h-2.5" />
                        {stats.count}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {u.role} · {u.nip}
                  </p>
                  {stats.lastText && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                      {stats.lastText}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Chat Thread */}
      <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col min-h-[540px] max-h-[700px]">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
              {channelType === 'student'
                ? 'Ruang Komunikasi Perwalian Murid'
                : 'Pesan Langsung Antar Akun'}
            </p>
            {channelType === 'student' && activeStudent ? (
              <button
                type="button"
                onClick={() => setInfoStudent(activeStudent)}
                title="Klik nama untuk melihat pop-up informasi murid"
                className="text-left text-base font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate cursor-pointer block max-w-full"
              >
                {activeTitle}
              </button>
            ) : (
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {activeTitle}
              </h3>
            )}
            {activeSubtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {activeSubtitle}
              </p>
            )}
          </div>

          {/* Search inside active chat messages */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={messageSearch}
                onChange={(e) => setMessageSearch(e.target.value)}
                placeholder="Cari isi pesan atau pengirim..."
                aria-label="Cari isi pesan dalam obrolan"
                className="w-full pl-8 pr-8 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {messageSearch && (
                <button
                  type="button"
                  onClick={() => setMessageSearch('')}
                  aria-label="Hapus pencarian pesan"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {messageSearch && (
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                {threadMessages.length} hasil
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {threadMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center py-12">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {messageSearch
                  ? `Tidak ada pesan yang cocok dengan "${messageSearch}".`
                  : 'Belum ada pesan pada kanal ini. Mulai diskusi atau kirim lampiran foto di bawah.'}
              </p>
            </div>
          ) : (
            threadMessages.map((msg) => {
              const isMine = msg.sender_id === currentUser.id;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    <strong>{renderHighlightedText(msg.sender_name, messageSearch)}</strong> ·{' '}
                    {msg.sender_role} ·{' '}
                    <span className="font-mono-tabular">
                      {new Date(msg.created_at).toLocaleString('id-ID', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </p>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      isMine
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {msg.foto_url && (
                      <img
                        src={msg.foto_url}
                        alt="Lampiran pesan"
                        referrerPolicy="no-referrer"
                        className="max-w-xs rounded-xl mb-2 border border-white/20"
                      />
                    )}
                    {msg.text && (
                      <p className="whitespace-pre-line">
                        {renderHighlightedText(msg.text, messageSearch)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form
          onSubmit={handleSend}
          className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5"
        >
          {fotoUrl && (
            <div className="relative inline-block">
              <img
                src={fotoUrl}
                alt="Pratinjau lampiran"
                referrerPolicy="no-referrer"
                className="h-20 rounded-xl border border-slate-200 dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => setFotoUrl('')}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0">
              <ImageIcon className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImagePick(e.target.files?.[0])}
              />
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tulis pesan konsultasi atau koordinasi..."
              className="flex-1 px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={sending || !activeTargetId}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Kirim</span>
            </button>
          </div>
        </form>
      </div>
      <StudentInfoModal student={infoStudent} onClose={() => setInfoStudent(null)} />
    </div>
  );
};

