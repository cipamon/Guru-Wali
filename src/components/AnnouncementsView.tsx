import React, { useState } from 'react';
import { Calendar, Clock, MapPin, Plus, Trash2, Upload, X, Loader2 } from 'lucide-react';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { compressImageFile } from '../lib/imageUtils';
import type { WcAnnouncement, WcUser } from '../types/waliconnect';

interface AnnouncementsViewProps {
  announcements: WcAnnouncement[];
  currentUser: WcUser;
}

export const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({
  announcements,
  currentUser,
}) => {
  const canManage = currentUser.role === 'Guru Wali' || currentUser.role === 'Admin';
  const [modalOpen, setModalOpen] = useState(false);
  const [judul, setJudul] = useState('');
  const [isi, setIsi] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [waktu, setWaktu] = useState('08.00 - 10.00 WIB');
  const [lokasi, setLokasi] = useState('Ruang Bimbingan Sekolah');
  const [kategori, setKategori] = useState('Agenda Perwalian');
  const [fotoUrl, setFotoUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const handleUploadPoster = async (file: File | undefined) => {
    if (!file) return;
    const compressed = await compressImageFile(file, 960, 0.74);
    setFotoUrl(compressed);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!judul.trim() || !isi.trim()) return;
    setSaving(true);
    try {
      const id = `ann-${Date.now()}`;
      const payload: WcAnnouncement = {
        id,
        judul: judul.trim(),
        isi: isi.trim(),
        tanggal,
        waktu: waktu.trim(),
        lokasi: lokasi.trim(),
        kategori: kategori.trim(),
        author_name: currentUser.nama,
        ...(fotoUrl ? { foto_url: fotoUrl } : {}),
        created_at: new Date().toISOString(),
      };
      await setDoc(doc(db, COLLECTIONS.announcements, id), payload);
      setModalOpen(false);
      setJudul('');
      setIsi('');
      setFotoUrl('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, COLLECTIONS.announcements);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.announcements, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${COLLECTIONS.announcements}/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Agenda &amp; Papan Pengumuman Sekolah
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Informasi kegiatan perwalian, undangan orang tua, dan pengumuman akademik
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Agenda / Pengumuman</span>
          </button>
        )}
      </div>

      {announcements.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Belum Ada Agenda atau Pengumuman
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col"
            >
              {ann.foto_url && (
                <div className="aspect-video w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <img
                    src={ann.foto_url}
                    alt={ann.judul}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                      {ann.kategori || 'Pengumuman'}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDelete(ann.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {ann.judul}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed whitespace-pre-line">
                    {ann.isi}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 font-mono-tabular">
                    <Calendar className="w-3.5 h-3.5" /> {ann.tanggal}
                  </span>
                  {ann.waktu && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {ann.waktu}
                    </span>
                  )}
                  {ann.lokasi && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {ann.lokasi}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Terbitkan Agenda &amp; Pengumuman
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Judul Agenda *</label>
                <input
                  required
                  type="text"
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Tanggal</label>
                  <input
                    type="date"
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Waktu</label>
                  <input
                    type="text"
                    value={waktu}
                    onChange={(e) => setWaktu(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Kategori</label>
                  <input
                    type="text"
                    value={kategori}
                    onChange={(e) => setKategori(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Lokasi</label>
                <input
                  type="text"
                  value={lokasi}
                  onChange={(e) => setLokasi(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Isi Pengumuman *</label>
                <textarea
                  required
                  rows={3}
                  value={isi}
                  onChange={(e) => setIsi(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer hover:bg-slate-200">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Unggah Poster Pengumuman</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleUploadPoster(e.target.files?.[0])}
                  />
                </label>
                {fotoUrl && (
                  <img
                    src={fotoUrl}
                    alt="Poster"
                    referrerPolicy="no-referrer"
                    className="h-12 rounded-lg border border-slate-200"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Terbitkan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
