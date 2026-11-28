import React, { useEffect, useState } from 'react';
import {
  LayoutGrid,
  Table2,
  Plus,
  Edit3,
  Trash2,
  Upload,
  FileText,
  Sparkles,
  ShieldAlert,
  Save,
  X,
  Loader2,
  UserCircle2,
  CheckSquare,
  Square,
  Lock,
  Unlock,
} from 'lucide-react';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import {
  COLLECTIONS,
  createEmptyBkDetail,
  createEmptyStudent,
  db,
  handleFirestoreError,
  OperationType,
  resolveStudentInduk,
} from '../lib/firebase';
import {
  calcAttendancePct,
  compressImageFile,
  isGoogleDriveUrl,
  normalizeExternalImageUrl,
} from '../lib/imageUtils';
import {
  downloadStudentsXlsTemplate,
  exportStudentsToPdf,
  exportStudentsToWord,
  exportStudentsToXls,
  importStudentsFromFile,
  triggerTablePrint,
} from '../lib/docExportImport';
import { SmartPhoto } from './SmartPhoto';
import { StudentInfoModal } from './StudentInfoModal';
import { PerwalianIndukForm } from './PerwalianIndukForm';
import { DataActionsBar } from './DataActionsBar';
import type { BkDetail, UserRole, WcStudent, WcUser } from '../types/waliconnect';

interface StudentsViewProps {
  students: WcStudent[];
  role: UserRole;
  linkedStudentId?: string;
  currentUser?: WcUser;
  users?: WcUser[];
  searchQuery: string;
  initialSelectedId?: string;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  role,
  linkedStudentId,
  currentUser,
  users = [],
  searchQuery,
  initialSelectedId,
}) => {
  const isStaff = role === 'Guru Wali' || role === 'Admin';
  const isSiswa = role === 'Siswa';
  const guruWaliUsers = users.filter((u) => u.role === 'Guru Wali' || u.role === 'Admin');

  const visibleStudents = isStaff
    ? students.filter((s) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          s.nama_lengkap.toLowerCase().includes(q) ||
          s.kelas.toLowerCase().includes(q) ||
          s.nis.toLowerCase().includes(q) ||
          (s.nisn || '').toLowerCase().includes(q) ||
          (s.no_absen || '').toLowerCase().includes(q) ||
          (s.wali_kelas || '').toLowerCase().includes(q) ||
          (s.guru_wali_nama || '').toLowerCase().includes(q) ||
          (s.guru_bk || '').toLowerCase().includes(q) ||
          (s.status_siswa || '').toLowerCase().includes(q)
        );
      })
    : students.filter((s) =>
        linkedStudentId
          ? s.id === linkedStudentId
          : currentUser
            ? s.nis.trim().toLowerCase() === currentUser.nip.trim().toLowerCase()
            : false
      );

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedId, setSelectedId] = useState<string>(
    initialSelectedId || visibleStudents[0]?.id || ''
  );
  const [profileSubTab, setProfileSubTab] = useState<'biodata' | 'mandiri' | 'bk'>(
    role === 'Siswa' ? 'biodata' : 'mandiri'
  );

  // Multi-select & Import/Export state
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [transferNotice, setTransferNotice] = useState('');
  const [transferError, setTransferError] = useState('');

  // Modal Lampiran A & Pop-up Info Siswa state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<WcStudent | null>(null);
  const [infoStudent, setInfoStudent] = useState<WcStudent | null>(null);
  const [savingModal, setSavingModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Inline Mandiri, Biodata & BK draft state synced with selectedStudent
  const selectedStudent =
    visibleStudents.find((s) => s.id === selectedId) ?? visibleStudents[0] ?? null;

  const isSelectedLocked = Boolean(selectedStudent?.data_locked);
  const isReadOnlyForUser = !isStaff && isSelectedLocked;
  const actorLabel = currentUser ? `${currentUser.nama} (${currentUser.role})` : role;

  const [mandiriDraft, setMandiriDraft] = useState<{
    foto_url: string;
    deskripsi_diri: string;
    rencana_lulus: 'Kuliah' | 'Bekerja' | 'Gap-year' | '';
    prodi_pilihan: string;
    langkah_pencapaian: string;
    catatan_khusus: string;
  }>({
    foto_url: '',
    deskripsi_diri: '',
    rencana_lulus: 'Kuliah',
    prodi_pilihan: '',
    langkah_pencapaian: '',
    catatan_khusus: '',
  });

  const [bkDraft, setBkDraft] = useState<BkDetail>(createEmptyBkDetail());
  const [bkSection, setBkSection] = useState<'A' | 'B' | 'C' | 'D' | 'E' | 'F'>('A');
  const [biodataDraft, setBiodataDraft] = useState<WcStudent>(() => {
    const empty = createEmptyStudent(`std-${Date.now()}`);
    if (currentUser && role === 'Siswa') {
      empty.nama_lengkap = currentUser.nama;
      empty.nama_panggilan = currentUser.nama.split(' ')[0] || '';
      empty.nis = currentUser.nip;
      empty.kelas = 'Belum Diisi';
    }
    return empty;
  });
  const [savingInline, setSavingInline] = useState(false);
  const [inlineToast, setInlineToast] = useState('');

  useEffect(() => {
    if (initialSelectedId) setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  useEffect(() => {
    if (selectedStudent) {
      let tempat = selectedStudent.tempat_lahir || '';
      let tanggal = selectedStudent.tanggal_lahir || '';
      if (!tempat && !tanggal && selectedStudent.ttl) {
        const idx = selectedStudent.ttl.indexOf(',');
        if (idx >= 0) {
          tempat = selectedStudent.ttl.slice(0, idx).trim();
          tanggal = selectedStudent.ttl.slice(idx + 1).trim();
        } else {
          tempat = selectedStudent.ttl.trim();
        }
      }
      setBiodataDraft({
        ...createEmptyStudent(selectedStudent.id),
        ...selectedStudent,
        tempat_lahir: tempat,
        tanggal_lahir: tanggal,
        status_siswa: selectedStudent.status_siswa || 'Aktif',
      });
      setMandiriDraft({
        foto_url: selectedStudent.foto_url || '',
        deskripsi_diri: selectedStudent.deskripsi_diri || '',
        rencana_lulus: selectedStudent.rencana_lulus || 'Kuliah',
        prodi_pilihan: selectedStudent.prodi_pilihan || '',
        langkah_pencapaian: selectedStudent.langkah_pencapaian || '',
        catatan_khusus: selectedStudent.catatan_khusus || '',
      });
      setBkDraft({ ...createEmptyBkDetail(), ...(selectedStudent.bk_detail || {}) });
    } else if (currentUser && role === 'Siswa') {
      const empty = createEmptyStudent(`std-${Date.now()}`);
      empty.nama_lengkap = currentUser.nama;
      empty.nama_panggilan = currentUser.nama.split(' ')[0] || '';
      empty.nis = currentUser.nip;
      empty.kelas = '';
      setBiodataDraft(empty);
    }
  }, [selectedStudent?.id, selectedStudent?.updated_at, currentUser?.id, role]);

  const openNewModal = () => {
    setEditingStudent(createEmptyStudent(`std-${Date.now()}`));
    setAiError('');
    setModalOpen(true);
  };

  const openEditModal = (st: WcStudent) => {
    if (!isStaff && st.data_locked) {
      setAiError('Data Anda sudah dikunci. Hubungi Guru Wali atau Admin untuk membuka kunci.');
      return;
    }
    let tempat = st.tempat_lahir || '';
    let tanggal = st.tanggal_lahir || '';
    if (!tempat && !tanggal && st.ttl) {
      const idx = st.ttl.indexOf(',');
      if (idx >= 0) {
        tempat = st.ttl.slice(0, idx).trim();
        tanggal = st.ttl.slice(idx + 1).trim();
      } else {
        tempat = st.ttl.trim();
      }
    }
    setEditingStudent({
      ...st,
      no_absen: st.no_absen || '',
      tempat_lahir: tempat,
      tanggal_lahir: tanggal,
      status_siswa: st.status_siswa || 'Aktif',
      wali_kelas: st.wali_kelas || '',
      guru_bk: st.guru_bk || '',
      data_locked: Boolean(st.data_locked),
      data_locked_at: st.data_locked_at || '',
      data_locked_by: st.data_locked_by || '',
    });
    setAiError('');
    setModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!editingStudent.nama_lengkap.trim() || !editingStudent.kelas.trim() || !editingStudent.nis.trim()) {
      setAiError('Nama Lengkap, Kelas, dan NIS wajib diisi.');
      return;
    }
    setSavingModal(true);
    try {
      const now = new Date().toISOString();
      const composedTtl =
        [editingStudent.tempat_lahir?.trim(), editingStudent.tanggal_lahir?.trim()]
          .filter(Boolean)
          .join(', ') || editingStudent.ttl;
      const normalizedFoto =
        normalizeExternalImageUrl(editingStudent.foto_url) || editingStudent.foto_url.trim();
      const ind = resolveStudentInduk(editingStudent);
      const nextLocked = isStaff ? Boolean(editingStudent.data_locked) : true;
      const payload: WcStudent = {
        ...editingStudent,
        foto_url: normalizedFoto,
        ttl: composedTtl,
        perwalian_induk: ind,
        data_locked: nextLocked,
        data_locked_at: nextLocked ? editingStudent.data_locked_at || now : '',
        data_locked_by: nextLocked ? editingStudent.data_locked_by || actorLabel : '',
        updated_at: now,
      };
      await setDoc(doc(db, COLLECTIONS.students, payload.id), payload);
      setSelectedId(payload.id);
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${COLLECTIONS.students}/${editingStudent.id}`);
    } finally {
      setSavingModal(false);
    }
  };

  const handleDeleteStudent = async (st: WcStudent) => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.students, st.id));
      setCheckedIds((prev) => prev.filter((id) => id !== st.id));
      setTransferNotice(`Data murid "${st.nama_lengkap}" berhasil dihapus.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${COLLECTIONS.students}/${st.id}`);
    }
  };

  const toggleCheckStudent = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const allVisibleChecked =
    visibleStudents.length > 0 && visibleStudents.every((s) => checkedIds.includes(s.id));

  const toggleCheckAll = () => {
    if (allVisibleChecked) {
      setCheckedIds([]);
    } else {
      setCheckedIds(visibleStudents.map((s) => s.id));
    }
  };

  const targetExportStudents =
    checkedIds.length > 0
      ? visibleStudents.filter((s) => checkedIds.includes(s.id))
      : visibleStudents;

  const handleBulkDelete = async () => {
    const targets = visibleStudents.filter((s) => checkedIds.includes(s.id));
    if (targets.length === 0) return;
    setTransferError('');
    setTransferNotice('');
    try {
      await Promise.all(targets.map((s) => deleteDoc(doc(db, COLLECTIONS.students, s.id))));
      setCheckedIds([]);
      setTransferNotice(`${targets.length} data murid terpilih berhasil dihapus.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, COLLECTIONS.students);
    }
  };

  const handleToggleLockStudent = async (st: WcStudent, targetLock?: boolean) => {
    if (!isStaff) return;
    const nextLocked = typeof targetLock === 'boolean' ? targetLock : !Boolean(st.data_locked);
    const now = new Date().toISOString();
    setTransferError('');
    try {
      await updateDoc(doc(db, COLLECTIONS.students, st.id), {
        data_locked: nextLocked,
        data_locked_at: nextLocked ? now : '',
        data_locked_by: nextLocked ? actorLabel : '',
        updated_at: now,
      });
      if (infoStudent && infoStudent.id === st.id) {
        setInfoStudent({
          ...infoStudent,
          data_locked: nextLocked,
          data_locked_at: nextLocked ? now : '',
          data_locked_by: nextLocked ? actorLabel : '',
          updated_at: now,
        });
      }
      const msg = nextLocked
        ? `Data murid "${st.nama_lengkap}" dikunci.`
        : `Kunci data murid "${st.nama_lengkap}" dibuka. Siswa dapat memperbarui data kembali.`;
      setInlineToast(msg);
      setTransferNotice(msg);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.students}/${st.id}`);
    }
  };

  const handleBulkLock = async (locked: boolean) => {
    if (!isStaff) return;
    const targets = visibleStudents.filter((s) => checkedIds.includes(s.id));
    if (targets.length === 0) return;
    setTransferError('');
    setTransferNotice('');
    const now = new Date().toISOString();
    try {
      await Promise.all(
        targets.map((s) =>
          updateDoc(doc(db, COLLECTIONS.students, s.id), {
            data_locked: locked,
            data_locked_at: locked ? now : '',
            data_locked_by: locked ? actorLabel : '',
            updated_at: now,
          })
        )
      );
      setTransferNotice(
        locked
          ? `${targets.length} data murid terpilih berhasil dikunci.`
          : `${targets.length} data murid terpilih berhasil dibuka kuncinya.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, COLLECTIONS.students);
    }
  };

  const handleImportStudentsFile = async (file: File) => {
    setTransferError('');
    setTransferNotice('');
    try {
      const parsed = await importStudentsFromFile(file);
      await Promise.all(
        parsed.map((st) => setDoc(doc(db, COLLECTIONS.students, st.id), st))
      );
      setSelectedId(parsed[0].id);
      setTransferNotice(
        `Berhasil mengimpor ${parsed.length} data murid dari "${file.name}" ke database.`
      );
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Gagal mengimpor file data murid.');
    }
  };

  const handlePrintStudents = () => {
    triggerTablePrint({
      title: 'DIREKTORI DATA MURID DAMPINGAN (LAMPIRAN A)',
      subtitle: `WaliConnect Pro · Jumlah Data: ${targetExportStudents.length} Murid`,
      landscape: true,
      headers: [
        'Absen',
        'NIS / NISN',
        'Nama Lengkap (L/P)',
        'Kelas',
        'Tempat, Tgl Lahir',
        'HP / Email',
        'Alamat Domisili',
        'Wali Kelas / Guru BK',
        'Status',
      ],
      rows: targetExportStudents.map((st, idx) => {
        const ttlStr =
          [st.tempat_lahir, st.tanggal_lahir].filter(Boolean).join(', ') || st.ttl || '-';
        return [
          st.no_absen || String(idx + 1),
          `${st.nis}\n${st.nisn || '-'}`,
          `${st.nama_lengkap} (${st.jenis_kelamin})`,
          st.kelas,
          ttlStr,
          `${st.whatsapp || '-'}\n${st.email || '-'}`,
          st.alamat || '-',
          `Wali: ${st.wali_kelas || '-'}\nBK: ${st.guru_bk || '-'}`,
          st.status_siswa || 'Aktif',
        ];
      }),
    });
  };

  const handlePhotoUpload = async (
    file: File | undefined,
    target: 'modal' | 'mandiri' | 'biodata'
  ) => {
    if (!file) return;
    const compressed = await compressImageFile(file, 640, 0.78);
    if (target === 'modal' && editingStudent) {
      setEditingStudent({ ...editingStudent, foto_url: compressed });
    } else if (target === 'mandiri') {
      setMandiriDraft((prev) => ({ ...prev, foto_url: compressed }));
    } else if (target === 'biodata') {
      setBiodataDraft((prev) => ({ ...prev, foto_url: compressed }));
    }
  };

  const handleSaveBiodata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlyForUser) {
      setAiError('Data Anda sudah dikunci. Hubungi Guru Wali atau Admin untuk membuka kunci.');
      return;
    }
    if (!biodataDraft.nama_lengkap.trim() || !biodataDraft.kelas.trim() || !biodataDraft.nis.trim()) {
      setAiError('Nama Lengkap, Kelas, dan NIS wajib diisi sebelum menyimpan data diri.');
      return;
    }
    setSavingInline(true);
    setInlineToast('');
    setAiError('');
    try {
      const now = new Date().toISOString();
      const targetId = selectedStudent?.id || biodataDraft.id || `std-${Date.now()}`;
      const composedTtl =
        [biodataDraft.tempat_lahir?.trim(), biodataDraft.tanggal_lahir?.trim()]
          .filter(Boolean)
          .join(', ') || biodataDraft.ttl;
      const normalizedFoto =
        normalizeExternalImageUrl(biodataDraft.foto_url) || biodataDraft.foto_url.trim();

      const ind = resolveStudentInduk(biodataDraft);
      const shouldAutoLock = !isStaff;
      const mergedDeskripsi =
        selectedStudent && mandiriDraft.deskripsi_diri !== (selectedStudent.deskripsi_diri || '')
          ? mandiriDraft.deskripsi_diri
          : biodataDraft.deskripsi_diri;
      const mergedLangkah =
        selectedStudent && mandiriDraft.langkah_pencapaian !== (selectedStudent.langkah_pencapaian || '')
          ? mandiriDraft.langkah_pencapaian
          : biodataDraft.langkah_pencapaian;
      const mergedCatatan =
        selectedStudent && mandiriDraft.catatan_khusus !== (selectedStudent.catatan_khusus || '')
          ? mandiriDraft.catatan_khusus
          : biodataDraft.catatan_khusus;

      const payload: WcStudent = {
        ...biodataDraft,
        id: targetId,
        foto_url: normalizedFoto,
        ttl: composedTtl,
        deskripsi_diri: mergedDeskripsi,
        langkah_pencapaian: mergedLangkah,
        catatan_khusus: mergedCatatan,
        perwalian_induk: ind,
        bk_detail: {
          ...createEmptyBkDetail(),
          ...(selectedStudent ? bkDraft : {}),
          ...(biodataDraft.bk_detail || {}),
          a1_nama_lengkap: biodataDraft.nama_lengkap,
          a2_nama_panggilan: biodataDraft.nama_panggilan,
          a3_ttl: composedTtl,
          a4_agama: biodataDraft.agama,
          a13_nama_ayah: biodataDraft.nama_ayah,
          a14_pendidikan_pekerjaan_ayah: [ind.pendidikan_ayah, biodataDraft.pekerjaan_ayah]
            .filter(Boolean)
            .join(' / '),
          a15_nama_ibu: biodataDraft.nama_ibu,
          a16_pendidikan_pekerjaan_ibu: [ind.pendidikan_ibu, biodataDraft.pekerjaan_ibu]
            .filter(Boolean)
            .join(' / '),
        },
        data_locked: shouldAutoLock ? true : Boolean(biodataDraft.data_locked),
        data_locked_at: shouldAutoLock ? now : biodataDraft.data_locked_at || '',
        data_locked_by: shouldAutoLock ? actorLabel : biodataDraft.data_locked_by || '',
        updated_at: now,
      };

      await setDoc(doc(db, COLLECTIONS.students, targetId), payload);

      if (currentUser && isSiswa && (currentUser.linked_student_id !== targetId || currentUser.nama !== payload.nama_lengkap)) {
        await updateDoc(doc(db, COLLECTIONS.users, currentUser.id), {
          linked_student_id: targetId,
          nama: payload.nama_lengkap,
        });
      }

      setSelectedId(targetId);
      setInlineToast(
        shouldAutoLock
          ? 'Data diri & Buku Induk (Bagian A–F) berhasil disimpan dan dikunci otomatis. Hubungi Guru Wali atau Admin untuk membuka kunci bila perlu diubah.'
          : 'Data diri & Buku Induk Siswa (Bagian A–F) berhasil disimpan ke database.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.students);
    } finally {
      setSavingInline(false);
    }
  };

  const handleAiLangkahLulus = async (source: 'modal' | 'mandiri') => {
    setAiError('');
    setAiLoading(true);
    try {
      const payload =
        source === 'modal' && editingStudent
          ? {
              nama: editingStudent.nama_lengkap,
              kelas: editingStudent.kelas,
              rencanaLulus: editingStudent.rencana_lulus,
              prodiPilihan: editingStudent.prodi_pilihan,
              deskripsiDiri: editingStudent.deskripsi_diri,
              hobi: editingStudent.hobi,
            }
          : {
              nama: selectedStudent?.nama_lengkap,
              kelas: selectedStudent?.kelas,
              rencanaLulus: mandiriDraft.rencana_lulus,
              prodiPilihan: mandiriDraft.prodi_pilihan,
              deskripsiDiri: mandiriDraft.deskripsi_diri,
              hobi: selectedStudent?.hobi,
            };

      const res = await fetch('/api/ai/langkah-lulus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memanggil asisten AI.');

      if (source === 'modal' && editingStudent) {
        setEditingStudent({ ...editingStudent, langkah_pencapaian: data.text });
      } else {
        setMandiriDraft((prev) => ({ ...prev, langkah_pencapaian: data.text }));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Gagal menyusun langkah AI.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveMandiri = async () => {
    if (!selectedStudent) return;
    if (isReadOnlyForUser) {
      setAiError('Data Anda sudah dikunci. Hubungi Guru Wali atau Admin untuk membuka kunci.');
      return;
    }
    setSavingInline(true);
    setInlineToast('');
    setAiError('');
    try {
      const now = new Date().toISOString();
      const shouldAutoLock = !isStaff;
      const normalizedFoto =
        normalizeExternalImageUrl(mandiriDraft.foto_url) || mandiriDraft.foto_url.trim();
      await updateDoc(doc(db, COLLECTIONS.students, selectedStudent.id), {
        foto_url: normalizedFoto,
        deskripsi_diri: mandiriDraft.deskripsi_diri,
        rencana_lulus: mandiriDraft.rencana_lulus,
        prodi_pilihan: mandiriDraft.prodi_pilihan,
        langkah_pencapaian: mandiriDraft.langkah_pencapaian,
        catatan_khusus: mandiriDraft.catatan_khusus,
        ...(shouldAutoLock
          ? {
              data_locked: true,
              data_locked_at: now,
              data_locked_by: actorLabel,
            }
          : {}),
        updated_at: now,
      });
      setInlineToast(
        shouldAutoLock
          ? 'Panel Isian Mandiri (Lampiran A) berhasil disimpan dan dikunci otomatis.'
          : 'Panel Isian Mandiri (Lampiran A) berhasil disimpan ke Firestore.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.students}/${selectedStudent.id}`);
    } finally {
      setSavingInline(false);
    }
  };

  const handleSaveBk = async () => {
    if (!selectedStudent) return;
    if (isReadOnlyForUser) {
      setAiError('Data Anda sudah dikunci. Hubungi Guru Wali atau Admin untuk membuka kunci.');
      return;
    }
    setSavingInline(true);
    setInlineToast('');
    setAiError('');
    try {
      const now = new Date().toISOString();
      const shouldAutoLock = !isStaff;
      await updateDoc(doc(db, COLLECTIONS.students, selectedStudent.id), {
        bk_detail: bkDraft,
        ...(shouldAutoLock
          ? {
              data_locked: true,
              data_locked_at: now,
              data_locked_by: actorLabel,
            }
          : {}),
        updated_at: now,
      });
      setInlineToast(
        shouldAutoLock
          ? 'Formulir Data Detail Peserta Didik (Layanan BK) berhasil disimpan dan dikunci otomatis.'
          : 'Formulir Data Detail Peserta Didik (Layanan BK) berhasil disimpan.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.students}/${selectedStudent.id}`);
    } finally {
      setSavingInline(false);
    }
  };

  const renderBkInput = (label: string, field: keyof BkDetail, multiline = false) => (
    <div key={field}>
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea
          rows={2}
          value={bkDraft[field] || ''}
          onChange={(e) => setBkDraft((prev) => ({ ...prev, [field]: e.target.value }))}
          className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <input
          type="text"
          value={bkDraft[field] || ''}
          onChange={(e) => setBkDraft((prev) => ({ ...prev, [field]: e.target.value }))}
          className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isStaff ? 'Direktori Murid Dampingan (Lampiran A & BK)' : 'Biodata & Rencana Lulus'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Menampilkan {visibleStudents.length} profil murid aktif
              {checkedIds.length > 0 && ` · ${checkedIds.length} dipilih`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isStaff && (
              <>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      viewMode === 'grid'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Mode Kotak</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      viewMode === 'table'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>Mode Detail Tabel</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={openNewModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Manual</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Universal Export / Import / Template / Print & Selection Action Bar */}
        <DataActionsBar
          totalCount={visibleStudents.length}
          selectedCount={checkedIds.length}
          allSelected={allVisibleChecked}
          onToggleSelectAll={toggleCheckAll}
          canManage={isStaff}
          onEditSelected={() => {
            const st = visibleStudents.find((s) => s.id === checkedIds[0]);
            if (st) openEditModal(st);
          }}
          onBulkLock={isStaff ? () => handleBulkLock(true) : undefined}
          onBulkUnlock={isStaff ? () => handleBulkLock(false) : undefined}
          onBulkDelete={handleBulkDelete}
          bulkDeleteLabel="murid"
          onDownloadTemplateXls={downloadStudentsXlsTemplate}
          onDownloadTemplateWord={() => exportStudentsToWord([], true)}
          onImportFile={handleImportStudentsFile}
          onExportXls={() => exportStudentsToXls(targetExportStudents)}
          onExportPdf={() => exportStudentsToPdf(targetExportStudents)}
          onExportWord={() => exportStudentsToWord(targetExportStudents, false)}
          onPrint={handlePrintStudents}
          notice={transferNotice}
          error={transferError}
        />
      </div>

      {/* Student List: Grid vs Detail Table (Staff) OR Empty Student Self-Profile Creator */}
      {!isStaff && visibleStudents.length === 0 ? (
        <form
          onSubmit={handleSaveBiodata}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5"
        >
          <div>
            <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
              Profil Data Diri &amp; Buku Induk Siswa Baru (Bagian A–F)
            </p>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
              Lengkapi Data Diri Profil Anda
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Akun Anda belum terhubung ke kartu murid. Silakan isi data diri lengkap (Bagian A–F) berikut untuk membuat profil resmi Anda.
            </p>
          </div>

          {aiError && (
            <div className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300">
              {aiError}
            </div>
          )}

          <PerwalianIndukForm
            student={biodataDraft}
            onChange={setBiodataDraft}
            guruWaliUsers={guruWaliUsers}
            isStaff={false}
            lockGuruWali={false}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>Setelah disimpan, data profil akan otomatis dikunci. Guru Wali atau Admin dapat membuka kunci kembali jika diperlukan.</span>
            </p>
            <button
              type="submit"
              disabled={savingInline}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {savingInline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Buat, Simpan &amp; Kunci Profil Saya</span>
            </button>
          </div>
        </form>
      ) : visibleStudents.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
          <UserCircle2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Belum Ada Data Murid Dampingan
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tambahkan profil murid manual, impor dari template Excel/Word, atau tetapkan siswa perwalian di menu Tautan Akun Wali.
          </p>
        </div>
      ) : !isStaff ? null : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleStudents.map((st) => {
            const active = selectedStudent?.id === st.id;
            const isChecked = checkedIds.includes(st.id);
            const pct = calcAttendancePct(st.kehadiran);
            return (
              <div
                key={st.id}
                onClick={() => setSelectedId(st.id)}
                className={`rounded-2xl p-5 border transition-all cursor-pointer bg-white dark:bg-slate-900 ${
                  active
                    ? 'border-blue-600 ring-1 ring-blue-600/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {isStaff && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCheckStudent(st.id);
                      }}
                      aria-label={`Pilih ${st.nama_lengkap}`}
                      className="pt-0.5 text-slate-400 hover:text-blue-600 cursor-pointer shrink-0"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoStudent(st);
                    }}
                    title="Klik untuk melihat pop-up informasi murid"
                    className="w-16 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-500/50 transition-all"
                  >
                    <SmartPhoto
                      src={st.foto_url}
                      alt={st.nama_lengkap}
                      fallback={<span className="text-sm font-bold text-slate-400">4×6</span>}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInfoStudent(st);
                        }}
                        title="Klik nama untuk melihat pop-up informasi murid"
                        className="text-left text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate cursor-pointer"
                      >
                        {st.nama_lengkap}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {st.data_locked && (
                          <span
                            title="Data sudah dikunci"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-bold"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            <span>Kunci</span>
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                          {st.status_siswa || 'Aktif'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {st.kelas}
                      {st.no_absen ? ` · Absen ${st.no_absen}` : ''} · NIS{' '}
                      <span className="font-mono-tabular">{st.nis}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                      Wali: {st.wali_kelas || '-'} · BK: {st.guru_bk || '-'}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">
                      Rencana: <strong>{st.rencana_lulus || '-'}</strong> · Hadir{' '}
                      <span className="font-mono-tabular font-bold text-blue-600 dark:text-blue-400">
                        {pct}%
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[60%]">
                    {st.whatsapp ? `HP: ${st.whatsapp}` : st.prodi_pilihan || 'Program studi belum ditentukan'}
                  </span>
                  <div className="flex items-center gap-1">
                    {isStaff && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleLockStudent(st);
                        }}
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          st.data_locked
                            ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                            : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                        }`}
                        title={st.data_locked ? 'Buka Kunci Data Murid' : 'Kunci Data Murid'}
                      >
                        {st.data_locked ? (
                          <Unlock className="w-3.5 h-3.5" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(st);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer"
                      title="Edit Lampiran A"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {isStaff && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStudent(st);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 cursor-pointer"
                        title="Hapus Murid"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  {isStaff && (
                    <th className="py-3 px-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleCheckAll}
                        aria-label="Pilih semua"
                        className="text-slate-500 hover:text-blue-600 cursor-pointer"
                      >
                        {allVisibleChecked ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="py-3 px-3 font-bold">Absen</th>
                  <th className="py-3 px-3 font-bold">NIS / NISN</th>
                  <th className="py-3 px-3 font-bold">Nama (L/P)</th>
                  <th className="py-3 px-3 font-bold">Kelas</th>
                  <th className="py-3 px-3 font-bold">Tempat, Tgl Lahir</th>
                  <th className="py-3 px-3 font-bold">NO_HP / Email</th>
                  <th className="py-3 px-3 font-bold">Alamat</th>
                  <th className="py-3 px-3 font-bold">Status</th>
                  <th className="py-3 px-3 font-bold">Wali Kelas / Guru BK</th>
                  <th className="py-3 px-3 font-bold text-right">Hadir</th>
                  <th className="py-3 px-3 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleStudents.map((st, idx) => {
                  const isChecked = checkedIds.includes(st.id);
                  const ttlDisplay =
                    [st.tempat_lahir, st.tanggal_lahir].filter(Boolean).join(', ') || st.ttl || '-';
                  return (
                    <tr
                      key={st.id}
                      onClick={() => setSelectedId(st.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedStudent?.id === st.id
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {isStaff && (
                        <td
                          className="py-3 px-3 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCheckStudent(st.id);
                          }}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 mx-auto" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 mx-auto" />
                          )}
                        </td>
                      )}
                      <td className="py-3 px-3 font-mono-tabular text-slate-600 dark:text-slate-300">
                        {st.no_absen || idx + 1}
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-slate-600 dark:text-slate-300">
                        <div>{st.nis}</div>
                        <div className="text-[11px] text-slate-400">{st.nisn || '-'}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-10 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                            <SmartPhoto
                              src={st.foto_url}
                              alt={st.nama_lengkap}
                              fallback={
                                <span className="text-[10px] font-bold text-slate-400">
                                  {st.nama_lengkap.slice(0, 2).toUpperCase()}
                                </span>
                              }
                            />
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInfoStudent(st);
                              }}
                              title="Klik nama untuk melihat pop-up informasi murid"
                              className="text-left font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                            >
                              {st.nama_lengkap}
                            </button>
                            <div className="text-[11px] font-normal text-slate-500">
                              {st.jenis_kelamin === 'P' ? 'Perempuan (P)' : 'Laki-laki (L)'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{st.kelas}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{ttlDisplay}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        <div className="font-mono-tabular">{st.whatsapp || '-'}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                          {st.email || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-[180px] truncate">
                        {st.alamat || '-'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                            {st.status_siswa || 'Aktif'}
                          </span>
                          {st.data_locked ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                              <Lock className="w-2.5 h-2.5" /> Terkunci
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-medium">
                              <Unlock className="w-2.5 h-2.5" /> Terbuka
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        <div className="truncate max-w-[150px]">{st.wali_kelas || '-'}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[150px]">
                          BK: {st.guru_bk || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular font-bold text-blue-600 dark:text-blue-400">
                        {calcAttendancePct(st.kehadiran)}%
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap space-x-2">
                        {isStaff && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleLockStudent(st);
                            }}
                            className={`font-semibold hover:underline cursor-pointer ${
                              st.data_locked
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {st.data_locked ? 'Buka Kunci' : 'Kunci'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(st);
                          }}
                          className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        {isStaff && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteStudent(st);
                            }}
                            className="text-rose-600 dark:text-rose-400 font-semibold hover:underline cursor-pointer"
                          >
                            Hapus
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected Student Workspace: Panel Isian Mandiri (Lampiran A) + Formulir Detail BK */}
      {selectedStudent && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Profil Terpilih · {selectedStudent.kelas}
                </p>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                    isSelectedLocked
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                      : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  }`}
                >
                  {isSelectedLocked ? (
                    <>
                      <Lock className="w-2.5 h-2.5" />
                      <span>Data Terkunci</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-2.5 h-2.5" />
                      <span>Akses Edit Terbuka</span>
                    </>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInfoStudent(selectedStudent)}
                title="Klik nama untuk melihat pop-up informasi murid"
                className="text-left text-lg font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
              >
                {selectedStudent.nama_lengkap}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setProfileSubTab('biodata')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    profileSubTab === 'biodata'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Data Diri &amp; Orang Tua (Lampiran A)
                </button>
                <button
                  type="button"
                  onClick={() => setProfileSubTab('mandiri')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    profileSubTab === 'mandiri'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Refleksi &amp; Rencana Lulus
                </button>
                <button
                  type="button"
                  onClick={() => setProfileSubTab('bk')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    profileSubTab === 'bk'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Formulir Detail BK (Bagian A–F)
                </button>
              </div>
              {isStaff && (
                <>
                  <button
                    type="button"
                    onClick={() => handleToggleLockStudent(selectedStudent)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      isSelectedLocked
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                        : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {isSelectedLocked ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Buka Kunci Data</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Kunci Data</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedStudent)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Edit Modal Lengkap</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {isSelectedLocked && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200">
                <p className="font-bold">
                  {isStaff
                    ? 'Status Data Terkunci untuk Siswa/Orang Tua'
                    : 'Data Profil Anda Sudah Dikunci (Mode Baca Saja)'}
                </p>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  {isStaff
                    ? `Siswa/orang tua tidak dapat mengubah data selama terkunci${selectedStudent.data_locked_by ? ` (dikunci oleh ${selectedStudent.data_locked_by})` : ''}. Anda sebagai ${role} tetap dapat mengedit atau menekan "Buka Kunci Data" kapan saja.`
                    : `Data telah disimpan dan dikunci${selectedStudent.data_locked_at ? ` pada ${new Date(selectedStudent.data_locked_at).toLocaleString('id-ID')}` : ''}${selectedStudent.data_locked_by ? ` oleh ${selectedStudent.data_locked_by}` : ''}. Hubungi Guru Wali atau Admin untuk membuka kunci bila terdapat perubahan data.`}
                </p>
              </div>
            </div>
          )}

          {inlineToast && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {inlineToast}
            </div>
          )}
          {aiError && (
            <div className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300">
              {aiError}
            </div>
          )}

          {profileSubTab === 'biodata' ? (
            <form onSubmit={handleSaveBiodata} className="space-y-5">
              {/* Photo + Google Drive URL */}
              <fieldset
                disabled={isReadOnlyForUser}
                className="border-0 p-0 m-0 min-w-0 disabled:opacity-80"
              >
                <div className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <div className="w-24 h-32 rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                    <SmartPhoto
                      src={biodataDraft.foto_url}
                      alt={`Pas Foto ${biodataDraft.nama_lengkap}`}
                      showDriveHint
                      fallback={<span className="text-xs text-slate-400">4 × 6</span>}
                    />
                  </div>
                  <div className="flex-1 space-y-2.5 w-full">
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold ${
                        isReadOnlyForUser
                          ? 'opacity-50 cursor-not-allowed'
                          : 'cursor-pointer hover:bg-blue-700'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Unggah Pas Foto 4×6</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isReadOnlyForUser}
                        className="hidden"
                        onChange={(e) => handlePhotoUpload(e.target.files?.[0], 'biodata')}
                      />
                    </label>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Atau Tempel URL Pas Foto / Link Google Drive
                      </label>
                      <input
                        type="text"
                        value={biodataDraft.foto_url}
                        onChange={(e) =>
                          setBiodataDraft({ ...biodataDraft, foto_url: e.target.value })
                        }
                        placeholder="https://drive.google.com/file/d/.../view atau URL gambar langsung"
                        className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* 66-Item Buku Induk Perwalian A-F */}
              <PerwalianIndukForm
                student={biodataDraft}
                onChange={setBiodataDraft}
                guruWaliUsers={guruWaliUsers}
                isStaff={isStaff}
                lockGuruWali={Boolean(selectedStudent.guru_wali_id)}
                readOnly={isReadOnlyForUser}
              />

              <div className="flex justify-end">
                {!isReadOnlyForUser ? (
                  <button
                    type="submit"
                    disabled={savingInline}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {savingInline ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isStaff
                        ? 'Simpan Data Diri & Buku Induk (A–F)'
                        : 'Simpan & Kunci Data Diri (A–F)'}
                    </span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Data Terkunci — Hubungi Guru Wali / Admin untuk Buka Kunci</span>
                  </span>
                )}
              </div>
            </form>
          ) : profileSubTab === 'mandiri' ? (
            <fieldset
              disabled={isReadOnlyForUser}
              className="border-0 p-0 m-0 min-w-0 disabled:opacity-80"
            >
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* 4x6 Photo Column */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Pas Foto Formal 4 × 6
                  </p>
                  <div className="w-36 h-48 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                    <SmartPhoto
                      src={mandiriDraft.foto_url}
                      alt="Pas Foto 4x6"
                      showDriveHint
                      fallback={<span className="text-xs text-slate-400">Belum ada foto 4×6</span>}
                    />
                  </div>
                  <label
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 ${
                      isReadOnlyForUser
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Unggah Pas Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isReadOnlyForUser}
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e.target.files?.[0], 'mandiri')}
                    />
                  </label>
                </div>

                {/* 5 Reflection Questions Inline */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        1. Pilihan Rencana Pasca Lulus
                      </label>
                      <select
                        value={mandiriDraft.rencana_lulus}
                        onChange={(e) =>
                          setMandiriDraft((p) => ({
                            ...p,
                            rencana_lulus: e.target.value as 'Kuliah' | 'Bekerja' | 'Gap-year',
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      >
                        <option value="Kuliah">Kuliah</option>
                        <option value="Bekerja">Bekerja</option>
                        <option value="Gap-year">Gap-year</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        2. Program Studi / Bidang Kerja Pilihan
                      </label>
                      <input
                        type="text"
                        value={mandiriDraft.prodi_pilihan}
                        onChange={(e) =>
                          setMandiriDraft((p) => ({ ...p, prodi_pilihan: e.target.value }))
                        }
                        placeholder="Contoh: Teknik Informatika / Desain Komunikasi Visual"
                        className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      3. Deskripsi Diri, Potensi &amp; Minat Utama
                    </label>
                    <textarea
                      rows={2}
                      value={mandiriDraft.deskripsi_diri}
                      onChange={(e) =>
                        setMandiriDraft((p) => ({ ...p, deskripsi_diri: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        4. Langkah Pencapaian Target Pasca Lulus
                      </label>
                      <button
                        type="button"
                        onClick={() => handleAiLangkahLulus('mandiri')}
                        disabled={aiLoading || isReadOnlyForUser}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold hover:bg-indigo-100 cursor-pointer disabled:opacity-60"
                      >
                        {aiLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        <span>Bantu Susun Langkah AI</span>
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={mandiriDraft.langkah_pencapaian}
                      onChange={(e) =>
                        setMandiriDraft((p) => ({ ...p, langkah_pencapaian: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      5. Catatan Khusus / Dukungan yang Dibutuhkan Siswa
                    </label>
                    <textarea
                      rows={2}
                      value={mandiriDraft.catatan_khusus}
                      onChange={(e) =>
                        setMandiriDraft((p) => ({ ...p, catatan_khusus: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex justify-end">
                    {!isReadOnlyForUser ? (
                      <button
                        type="button"
                        onClick={handleSaveMandiri}
                        disabled={savingInline}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {savingInline ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isStaff ? 'Simpan Isian Mandiri Lampiran A' : 'Simpan & Kunci Isian Mandiri'}
                        </span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Data Terkunci — Hubungi Guru Wali / Admin untuk Buka Kunci</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </fieldset>
          ) : (
            <div className="space-y-5">
              {/* Confidentiality Notice BK */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Catatan Kerahasiaan Layanan Bimbingan &amp; Konseling (BK)
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                    Seluruh data pada Formulir Data Detail Peserta Didik Bagian A–F bersifat rahasia profesional sesuai kode etik BK dan Permendikdasmen No. 11/2025, digunakan semata-mata untuk kepentingan pendampingan perkembangan murid.
                  </p>
                </div>
              </div>

              {/* Section Selector A–F */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'A', label: 'Bagian A: Identitas & Keluarga (18 Poin)' },
                  { id: 'B', label: 'Bagian B: Kesehatan Fisik & Psikis' },
                  { id: 'C', label: 'Bagian C: Akademik & Kebiasaan Belajar' },
                  { id: 'D', label: 'Bagian D: Pribadi & Sosial' },
                  { id: 'E', label: 'Bagian E: Karir & Masa Depan' },
                  { id: 'F', label: 'Bagian F: Harapan Layanan BK' },
                ].map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setBkSection(sec.id as 'A' | 'B' | 'C' | 'D' | 'E' | 'F')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      bkSection === sec.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {sec.label}
                  </button>
                ))}
              </div>

              <fieldset
                disabled={isReadOnlyForUser}
                className="border-0 p-0 m-0 min-w-0 space-y-5 disabled:opacity-80"
              >
              {bkSection === 'A' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {renderBkInput('1. Nama Lengkap', 'a1_nama_lengkap')}
                  {renderBkInput('2. Nama Panggilan', 'a2_nama_panggilan')}
                  {renderBkInput('3. Tempat, Tanggal Lahir', 'a3_ttl')}
                  {renderBkInput('4. Agama', 'a4_agama')}
                  {renderBkInput('5. Suku Bangsa', 'a5_suku_bangsa')}
                  {renderBkInput('6. Bahasa Sehari-hari di Rumah', 'a6_bahasa_rumah')}
                  {renderBkInput('7. Anak Ke-', 'a7_anak_ke')}
                  {renderBkInput('8. Jumlah Saudara Kandung', 'a8_jumlah_saudara')}
                  {renderBkInput('9. Status Anak dalam Keluarga', 'a9_status_keluarga')}
                  {renderBkInput('10. Tinggal Bersama', 'a10_tinggal_bersama')}
                  {renderBkInput('11. Jarak Rumah ke Sekolah', 'a11_jarak_rumah')}
                  {renderBkInput('12. Transportasi ke Sekolah', 'a12_transportasi')}
                  {renderBkInput('13. Nama Ayah / Wali', 'a13_nama_ayah')}
                  {renderBkInput('14. Pendidikan & Pekerjaan Ayah', 'a14_pendidikan_pekerjaan_ayah')}
                  {renderBkInput('15. Nama Ibu', 'a15_nama_ibu')}
                  {renderBkInput('16. Pendidikan & Pekerjaan Ibu', 'a16_pendidikan_pekerjaan_ibu')}
                  {renderBkInput('17. Kisaran Penghasilan Keluarga', 'a17_penghasilan_keluarga')}
                  {renderBkInput('18. Kontak Darurat Orang Tua / Wali', 'a18_wali_kontak_darurat')}
                </div>
              )}

              {bkSection === 'B' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderBkInput('Tinggi & Berat Badan', 'b_tinggi_berat')}
                  {renderBkInput('Golongan Darah', 'b_golongan_darah')}
                  {renderBkInput('Riwayat Penyakit / Rawat Inap', 'b_riwayat_penyakit', true)}
                  {renderBkInput('Alergi & Pantangan Khusus', 'b_alergi_pantangan', true)}
                  {renderBkInput('Kondisi Penglihatan & Pendengaran', 'b_kondisi_penglihatan_pendengaran', true)}
                  {renderBkInput('Kondisi Psikis / Emosional Umum', 'b_kondisi_psikis', true)}
                </div>
              )}

              {bkSection === 'C' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderBkInput('Mata Pelajaran yang Disukai', 'c_mapel_disukai')}
                  {renderBkInput('Mata Pelajaran yang Dianggap Sulit', 'c_mapel_sulit')}
                  {renderBkInput('Kebiasaan & Waktu Belajar di Rumah', 'c_waktu_belajar')}
                  {renderBkInput('Fasilitas Belajar yang Dimiliki', 'c_fasilitas_belajar')}
                  {renderBkInput('Hambatan Akademik yang Dirasakan', 'c_hambatan_akademik', true)}
                  {renderBkInput('Riwayat Prestasi Akademik / Lomba', 'c_prestasi_akademik', true)}
                </div>
              )}

              {bkSection === 'D' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderBkInput('Sifat & Kelebihan Diri', 'd_sifat_kelebihan', true)}
                  {renderBkInput('Aspek Pribadi yang Perlu Dikembangkan', 'd_aspek_perlu_dikembangkan', true)}
                  {renderBkInput('Hubungan dengan Anggota Keluarga', 'd_hubungan_keluarga')}
                  {renderBkInput('Hubungan dengan Teman Sebaya', 'd_hubungan_teman_sebaya')}
                  {renderBkInput('Keaktifan Organisasi / Ekstrakurikuler', 'd_organisasi_ekskul', true)}
                  {renderBkInput('Masalah Pribadi / Sosial yang Dihadapi', 'd_masalah_pribadi_sosial', true)}
                </div>
              )}

              {bkSection === 'E' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderBkInput('Cita-Cita Profesi', 'e_cita_cita')}
                  {renderBkInput('Rencana Setelah Lulus SMA/SMK', 'e_rencana_setelah_lulus')}
                  {renderBkInput('Pilihan Program Studi / Bidang Kerja', 'e_pilihan_studi_kerja', true)}
                  {renderBkInput('Dukungan & Harapan Orang Tua', 'e_dukungan_orang_tua', true)}
                </div>
              )}

              {bkSection === 'F' && (
                <div className="grid grid-cols-1 gap-4">
                  {renderBkInput('Harapan Murid Terhadap Layanan Guru Wali & BK', 'f_harapan_layanan_bk', true)}
                  {renderBkInput('Topik Konseling yang Ingin Dibahas', 'f_topik_konseling_diinginkan', true)}
                  {renderBkInput('Kesediaan Orang Tua Berkolaborasi dengan Sekolah', 'f_kesediaan_orang_tua')}
                </div>
              )}

              <div className="flex justify-end pt-2">
                {!isReadOnlyForUser ? (
                  <button
                    type="button"
                    onClick={handleSaveBk}
                    disabled={savingInline}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {savingInline ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isStaff ? 'Simpan Formulir BK Lengkap' : 'Simpan & Kunci Formulir BK'}
                    </span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Data Terkunci — Hubungi Guru Wali / Admin untuk Buka Kunci</span>
                  </span>
                )}
              </div>
              </fieldset>
            </div>
          )}
        </div>
      )}

      {/* Modal Full Form Lampiran A */}
      {modalOpen && editingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Lampiran A — Identitas Murid Dampingan
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lengkapi biodata resmi, data orang tua, pas foto 4×6, dan rencana pasca-lulus
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="flex-1 overflow-y-auto p-6 space-y-5">
              {aiError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {aiError}
                </div>
              )}

              {/* Photo Upload + Link */}
              <div className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="w-24 h-32 rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                  <SmartPhoto
                    src={editingStudent.foto_url}
                    alt="Pas Foto"
                    showDriveHint
                    fallback={<span className="text-xs text-slate-400">4 × 6</span>}
                  />
                </div>
                <div className="flex-1 space-y-2.5 w-full">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer hover:bg-blue-700">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Unggah Pas Foto 4×6 (Otomatis Kompres)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e.target.files?.[0], 'modal')}
                    />
                  </label>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Atau Tempel URL Pas Foto / Link Google Drive
                    </label>
                    <input
                      type="text"
                      value={editingStudent.foto_url}
                      onChange={(e) =>
                        setEditingStudent({ ...editingStudent, foto_url: e.target.value })
                      }
                      placeholder="https://drive.google.com/file/d/.../view atau URL gambar langsung"
                      className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      {isGoogleDriveUrl(editingStudent.foto_url)
                        ? 'Link Google Drive terdeteksi otomatis. Pastikan izin file di Drive diset "Siapa saja yang memiliki link".'
                        : 'Mendukung tautan Google Drive (file/d/.../view, open?id=...) maupun URL gambar langsung.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 66-Item Buku Induk Perwalian A-F */}
              <PerwalianIndukForm
                student={editingStudent}
                onChange={setEditingStudent}
                guruWaliUsers={guruWaliUsers}
                isStaff={isStaff}
                lockGuruWali={false}
              />

              {/* Post-graduation */}
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Pilihan Pasca Lulus</label>
                    <select
                      value={editingStudent.rencana_lulus}
                      onChange={(e) =>
                        setEditingStudent({
                          ...editingStudent,
                          rencana_lulus: e.target.value as 'Kuliah' | 'Bekerja' | 'Gap-year',
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      <option value="Kuliah">Kuliah</option>
                      <option value="Bekerja">Bekerja</option>
                      <option value="Gap-year">Gap-year</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Program Studi Pilihan</label>
                    <input
                      type="text"
                      value={editingStudent.prodi_pilihan}
                      onChange={(e) =>
                        setEditingStudent({ ...editingStudent, prodi_pilihan: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Deskripsi Diri &amp; Rencana Pasca Lulus</label>
                  <textarea
                    rows={2}
                    value={editingStudent.deskripsi_diri}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, deskripsi_diri: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold">Langkah Pencapaian</label>
                    <button
                      type="button"
                      onClick={() => handleAiLangkahLulus('modal')}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>Bantu Susun Langkah AI</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={editingStudent.langkah_pencapaian}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, langkah_pencapaian: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Catatan Khusus Siswa</label>
                  <textarea
                    rows={2}
                    value={editingStudent.catatan_khusus}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, catatan_khusus: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              {isStaff && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                    {editingStudent.data_locked ? (
                      <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    ) : (
                      <Unlock className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <div>
                      <p className="font-bold">
                        Kunci Pengisian Data Siswa: {editingStudent.data_locked ? 'Terkunci' : 'Terbuka'}
                      </p>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300">
                        Jika dikunci, siswa dan orang tua hanya dapat melihat data tanpa mengubahnya.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingStudent({
                        ...editingStudent,
                        data_locked: !editingStudent.data_locked,
                        data_locked_at: !editingStudent.data_locked ? new Date().toISOString() : '',
                        data_locked_by: !editingStudent.data_locked ? actorLabel : '',
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border ${
                      editingStudent.data_locked
                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                        : 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    {editingStudent.data_locked ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Buka Kunci</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Kunci Data</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingModal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Profil Murid</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <StudentInfoModal
        student={infoStudent}
        onClose={() => setInfoStudent(null)}
        onEdit={isStaff || role === 'Siswa' ? openEditModal : undefined}
        canEdit={isStaff || (role === 'Siswa' && !infoStudent?.data_locked)}
        onToggleLock={isStaff ? (st) => handleToggleLockStudent(st) : undefined}
      />
    </div>
  );
};
