import React, { useState } from 'react';
import { Send, Image as ImageIcon, X, Users, GraduationCap, Loader2 } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { compressImageFile } from '../lib/imageUtils';
import type { WcMessage, WcStudent, WcUser } from '../types/waliconnect';

interface CommunicationViewProps {
  messages: WcMessage[];
  users: WcUser[];
  students: WcStudent[];
  currentUser: WcUser;
}

export const CommunicationView: React.FC<CommunicationViewProps> = ({
  messages,
  users,
  students,
  currentUser,
}) => {
  const isStaff = currentUser.role === 'Guru Wali' || currentUser.role === 'Admin';
  const [channelType, setChannelType] = useState<'student' | 'account'>('student');

  const availableStudents = isStaff
    ? students
    : students.filter((s) => !currentUser.linked_student_id || s.id === currentUser.linked_student_id);

  const availableAccounts = users.filter((u) => u.id !== currentUser.id);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    availableStudents[0]?.id || ''
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    availableAccounts[0]?.id || ''
  );

  const activeTargetId =
    channelType === 'student'
      ? selectedStudentId || availableStudents[0]?.id || ''
      : selectedAccountId || availableAccounts[0]?.id || '';

  const [text, setText] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [sending, setSending] = useState(false);

  const threadMessages = messages
    .filter((m) => {
      if (m.channel_type !== channelType) return false;
      if (channelType === 'student') {
        return m.target_id === activeTargetId;
      }
      // For account-to-account chat, show messages between currentUser and selectedAccount
      return (
        (m.sender_id === currentUser.id && m.target_id === activeTargetId) ||
        (m.sender_id === activeTargetId && m.target_id === currentUser.id) ||
        m.target_id === activeTargetId
      );
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

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

  const activeTitle =
    channelType === 'student'
      ? availableStudents.find((s) => s.id === activeTargetId)?.nama_lengkap || 'Pilih Murid'
      : availableAccounts.find((u) => u.id === activeTargetId)?.nama || 'Pilih Akun';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left Thread Selector */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
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

        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {channelType === 'student' ? (
            availableStudents.map((s) => (
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
                <p className="font-bold truncate">{s.nama_lengkap}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.kelas}</p>
              </button>
            ))
          ) : (
            availableAccounts.map((u) => (
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
                <p className="font-bold truncate">{u.nama}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{u.role}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Chat Thread */}
      <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col min-h-[520px] max-h-[680px]">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
              {channelType === 'student' ? 'Ruang Komunikasi Perwalian Murid' : 'Pesan Langsung Antar Akun'}
            </p>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeTitle}</h3>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {threadMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center py-12">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belum ada pesan pada kanal ini. Mulai diskusi atau kirim lampiran foto di bawah.
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
                    <strong>{msg.sender_name}</strong> · {msg.sender_role} ·{' '}
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
                    {msg.text && <p className="whitespace-pre-line">{msg.text}</p>}
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
    </div>
  );
};
