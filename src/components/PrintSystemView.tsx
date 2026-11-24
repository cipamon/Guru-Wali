import React, { useEffect, useRef, useState } from 'react';
import {
  Printer,
  PanelLeftClose,
  PanelLeftOpen,
  Columns2,
  Rows2,
  Save,
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  FileType2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  GripVertical,
  Loader2,
  ZoomIn,
  ZoomOut,
  RectangleVertical,
  RectangleHorizontal,
  Type,
  CheckCheck,
  Copy,
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, db, DEFAULT_PRINT_CONFIG, savePrintConfig } from '../lib/firebase';
import { calcAttendancePct, compressImageFile } from '../lib/imageUtils';
import { SmartPhoto } from './SmartPhoto';
import {
  EVALUASI_PERIODES,
  getSnapshotForPeriode,
  normalizeEvaluasiPeriode,
} from '../lib/aspectPeriods';
import {
  downloadPrintTemplateWord,
  exportPrintDocToPdf,
  exportPrintDocToWord,
  exportPrintReportXls,
  getSignatureForOrientation,
  importPrintTemplateFromFile,
} from '../lib/docExportImport';
import type {
  EvaluasiPeriode,
  FontFamilyChoice,
  KopLine,
  PaperOrientation,
  PrintDocumentType,
  SheetKey,
  SignatureRow,
  SignatureSettings,
  WcLog,
  WcPrintConfig,
  WcStudent,
} from '../types/waliconnect';

const FONT_OPTIONS: { value: FontFamilyChoice; label: string; stack: string }[] = [
  { value: 'times', label: 'Times New Roman (Resmi)', stack: "'Times New Roman', 'Noto Serif', Times, serif" },
  { value: 'tahoma', label: 'Tahoma', stack: "Tahoma, Verdana, 'Segoe UI', sans-serif" },
  { value: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, Tahoma, sans-serif' },
  { value: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { value: 'calibri', label: 'Calibri', stack: "Calibri, 'Segoe UI', Arial, sans-serif" },
  { value: 'georgia', label: 'Georgia', stack: "Georgia, 'Noto Serif', serif" },
  { value: 'trebuchet', label: 'Trebuchet MS', stack: "'Trebuchet MS', 'Lucida Sans Unicode', sans-serif" },
  { value: 'sans', label: 'Plus Jakarta Sans', stack: "'Plus Jakarta Sans', Arial, sans-serif" },
];

const normalizeFontChoice = (font?: FontFamilyChoice): FontFamilyChoice =>
  !font || font === 'serif' ? 'times' : font;

const resolveFontStack = (font?: FontFamilyChoice): string => {
  const normalized = normalizeFontChoice(font);
  return FONT_OPTIONS.find((f) => f.value === normalized)?.stack ?? FONT_OPTIONS[0].stack;
};

interface PrintSystemViewProps {
  config: WcPrintConfig;
  students: WcStudent[];
  logs: WcLog[];
}

const DOC_OPTIONS: { id: PrintDocumentType; label: string }[] = [
  { id: 'paket_lengkap', label: '1. Paket Lengkap (Sampul + SOP + Lampiran A–E)' },
  { id: 'sampul', label: '2. Halaman Sampul Buku Jurnal Guru Wali' },
  { id: 'sop', label: '3. Naskah SOP Guru Wali (Permendikdasmen No. 11/2025)' },
  { id: 'lampiran_a', label: '4. Lampiran A — Identitas Murid Dampingan' },
  { id: 'lampiran_b', label: '5. Lampiran B — Catatan Perkembangan Murid (5 Aspek)' },
  { id: 'lampiran_c', label: '6. Lampiran C — Rekap Pertemuan dengan Murid' },
  { id: 'lampiran_d', label: '7. Lampiran D — Daftar Hadir Pertemuan (1–9)' },
  { id: 'lampiran_e', label: '8. Lampiran E — Dokumentasi Foto & Formulir Detail BK' },
];

const SHEET_META: { key: SheetKey; label: string }[] = [
  { key: 'sampul', label: 'Halaman Sampul' },
  { key: 'sop', label: 'Naskah SOP Guru Wali' },
  { key: 'lampiran_a', label: 'Lampiran A — Identitas Murid' },
  { key: 'lampiran_b', label: 'Lampiran B — 5 Aspek' },
  { key: 'lampiran_c', label: 'Lampiran C — Rekap Pertemuan' },
  { key: 'lampiran_d', label: 'Lampiran D — Daftar Hadir' },
  { key: 'lampiran_e', label: 'Lampiran E — Foto & Form BK' },
];

export const PrintSystemView: React.FC<PrintSystemViewProps> = ({
  config,
  students,
  logs,
}) => {
  const [draft, setDraft] = useState<WcPrintConfig>(config || DEFAULT_PRINT_CONFIG);
  const [selectedDoc, setSelectedDoc] = useState<PrintDocumentType>('paket_lengkap');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id || '');
  const [lampiranBPeriode, setLampiranBPeriode] = useState<EvaluasiPeriode | 'semua'>(() =>
    normalizeEvaluasiPeriode(students[0]?.perkembangan?.periode)
  );
  const [showSettings, setShowSettings] = useState(true);
  const [previewPos, setPreviewPos] = useState<'side' | 'bottom'>('side');
  const [previewZoom, setPreviewZoom] = useState<number>(0.72);
  const [sigEditMode, setSigEditMode] = useState<PaperOrientation>('portrait');
  const [saving, setSaving] = useState(false);
  const [importingPrint, setImportingPrint] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const [printError, setPrintError] = useState('');
  const [dragInfo, setDragInfo] = useState<{ side: 'left' | 'right'; index: number } | null>(null);
  const printImportInputRef = useRef<HTMLInputElement | null>(null);

  const getOrientation = (sheet: SheetKey): PaperOrientation =>
    draft.orientations?.[sheet] ?? 'portrait';

  const setSheetOrientation = (sheet: SheetKey, orientation: PaperOrientation) => {
    setDraft((prev) => ({
      ...prev,
      orientations: {
        ...(prev.orientations || {}),
        [sheet]: orientation,
      },
    }));
    setSigEditMode(orientation);
  };

  const getPageClass = (sheet: SheetKey, extra = '') =>
    `f4-page ${getOrientation(sheet) === 'landscape' ? 'f4-page-landscape' : ''} border border-slate-300 shadow-sm ${extra}`;

  const getPageStyle = (): React.CSSProperties => ({
    fontFamily: resolveFontStack(draft.doc_font),
  });

  const applyGlobalFont = (font: FontFamilyChoice) => {
    setDraft((prev) => ({
      ...prev,
      doc_font: font,
      kop_lines: prev.kop_lines.map((line) => ({ ...line, fontFamily: font })),
    }));
  };

  const renderSheetControlStrip = (sheet: SheetKey, title: string) => {
    const ori = getOrientation(sheet);
    return (
      <div className="no-print w-full flex items-center justify-between gap-2 px-1 pb-1.5 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="font-semibold">
          {title} · {ori === 'landscape' ? 'F4 Lanskap (330 × 215 mm)' : 'F4 Potret (215 × 330 mm)'}
        </span>
        <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-white/90 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setSheetOrientation(sheet, 'portrait')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
              ori === 'portrait'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <RectangleVertical className="w-3 h-3" />
            <span>Potret</span>
          </button>
          <button
            type="button"
            onClick={() => setSheetOrientation(sheet, 'landscape')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
              ori === 'landscape'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <RectangleHorizontal className="w-3 h-3" />
            <span>Lanskap</span>
          </button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    setDraft(config || DEFAULT_PRINT_CONFIG);
  }, [config]);

  useEffect(() => {
    if (!selectedStudentId && students[0]?.id) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  const activeStudent =
    students.find((s) => s.id === selectedStudentId) ?? students[0] ?? null;

  const handleSave = async () => {
    setSaving(true);
    setSavedNotice('');
    try {
      await savePrintConfig(draft);
      setSavedNotice('Pengaturan Kop Surat & TTD F4 berhasil disimpan ke Firestore.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (side: 'logo_kiri' | 'logo_kanan', file: File | undefined) => {
    if (!file) return;
    const compressed = await compressImageFile(file, 320, 0.8);
    setDraft((p) => ({ ...p, [side]: compressed }));
  };

  const updateKopLine = (index: number, patch: Partial<KopLine>) => {
    setDraft((p) => {
      const next = [...p.kop_lines];
      next[index] = { ...next[index], ...patch };
      return { ...p, kop_lines: next };
    });
  };

  const editingSig: SignatureSettings = getSignatureForOrientation(draft, sigEditMode);

  const updateEditingSig = (
    updater:
      | Partial<SignatureSettings>
      | ((curr: SignatureSettings) => Partial<SignatureSettings>)
  ) => {
    setDraft((p) => {
      const curr = getSignatureForOrientation(p, sigEditMode);
      const patch = typeof updater === 'function' ? updater(curr) : updater;
      if (sigEditMode === 'landscape') {
        return {
          ...p,
          ttd_landscape: {
            ...curr,
            ...patch,
          },
        };
      }
      return {
        ...p,
        ...patch,
      };
    });
  };

  const copyPortraitSigToLandscape = () => {
    setDraft((p) => {
      const portraitSig = getSignatureForOrientation(p, 'portrait');
      return {
        ...p,
        ttd_landscape: {
          ...portraitSig,
          ttd_left_rows: portraitSig.ttd_left_rows.map((r) => ({ ...r })),
          ttd_right_rows: portraitSig.ttd_right_rows.map((r) => ({ ...r })),
        },
      };
    });
    setSavedNotice('Pengaturan Tanda Tangan Potret berhasil disalin ke Mode Lanskap.');
  };

  const updateSigRow = (
    side: 'ttd_left_rows' | 'ttd_right_rows',
    index: number,
    patch: Partial<SignatureRow>
  ) => {
    updateEditingSig((curr) => {
      const next = [...curr[side]];
      next[index] = { ...next[index], ...patch };
      return { [side]: next };
    });
  };

  const stabilizeSpacer = (rows: SignatureRow[]) => {
    if (rows.some((r) => r.spacerBefore !== undefined)) return rows;
    const fallbackIdx = Math.max(1, rows.length - 2);
    return rows.map((r, i) => ({ ...r, spacerBefore: i === fallbackIdx }));
  };

  const addSigRow = (side: 'ttd_left_rows' | 'ttd_right_rows') => {
    updateEditingSig((curr) => {
      const stabilized = stabilizeSpacer(curr[side]);
      return {
        [side]: [
          ...stabilized,
          {
            id: `row-${Date.now()}`,
            text: 'Baris Tanda Tangan Baru',
            bold: false,
            underline: false,
            spacerBefore: false,
          },
        ],
      };
    });
  };

  const removeSigRow = (side: 'ttd_left_rows' | 'ttd_right_rows', index: number) => {
    updateEditingSig((curr) => {
      const stabilized = stabilizeSpacer(curr[side]);
      return {
        [side]: stabilized.filter((_, i) => i !== index),
      };
    });
  };

  const moveSigRow = (
    side: 'ttd_left_rows' | 'ttd_right_rows',
    from: number,
    to: number
  ) => {
    updateEditingSig((curr) => {
      const arr = [...stabilizeSpacer(curr[side])];
      if (to < 0 || to >= arr.length) return {};
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { [side]: arr };
    });
  };

  const handleImportPrintFile = async (file: File | undefined) => {
    if (!file) return;
    setImportingPrint(true);
    setPrintError('');
    setSavedNotice('');
    try {
      const { configPatch, importedStudents } = await importPrintTemplateFromFile(file, draft);
      setDraft((prev) => ({
        ...prev,
        ...configPatch,
      }));
      if (importedStudents.length > 0) {
        await Promise.all(
          importedStudents.map((st) => setDoc(doc(db, COLLECTIONS.students, st.id), st))
        );
      }
      setSavedNotice(
        `Berhasil mengimpor "${file.name}"${
          importedStudents.length > 0
            ? ` (${importedStudents.length} murid disimpan ke database)`
            : ''
        }. Klik Simpan Format untuk menyimpan perubahan Kop ke Firestore.`
      );
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Gagal mengimpor file template.');
    } finally {
      setImportingPrint(false);
      if (printImportInputRef.current) printImportInputRef.current.value = '';
    }
  };

  const renderKopSurat = () => (
    <div className="border-b-[3px] border-double border-slate-900 pb-2.5 mb-4 flex items-center justify-between gap-3">
      <div className="w-16 h-16 shrink-0 flex items-center justify-center">
        {draft.logo_kiri && (
          <img
            src={draft.logo_kiri}
            alt="Logo Kiri"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>
      <div className="flex-1 text-center leading-snug">
        {draft.kop_lines.map((line) => (
          <div
            key={line.id}
            style={{
              fontFamily: resolveFontStack(line.fontFamily),
              fontSize: `${line.fontSize}pt`,
              fontWeight: line.bold ? 700 : 400,
              fontStyle: line.italic ? 'italic' : 'normal',
              textDecoration: line.underline ? 'underline' : 'none',
            }}
          >
            {line.text}
          </div>
        ))}
      </div>
      <div className="w-16 h-16 shrink-0 flex items-center justify-center">
        {draft.logo_kanan && (
          <img
            src={draft.logo_kanan}
            alt="Logo Kanan"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>
    </div>
  );

  // Independent per-column signature block using orientation-specific settings
  const renderColumnRows = (rows: SignatureRow[], spacerPx: number, colOffsetX = 0) => {
    const hasExplicitSpacer = rows.some((r) => r.spacerBefore !== undefined);
    const fallbackIdx = Math.max(1, rows.length - 2);
    return (
      <div
        className="min-w-0"
        style={{
          transform: colOffsetX ? `translateX(${colOffsetX}px)` : undefined,
        }}
      >
        {rows.map((r, ri) => {
          const applySpacer =
            r.spacerBefore !== undefined ? r.spacerBefore : !hasExplicitSpacer && ri === fallbackIdx;
          return (
            <div
              key={r.id}
              style={{
                marginTop: applySpacer ? `${spacerPx}px` : ri === 0 ? '0px' : '2px',
                fontWeight: r.bold ? 700 : 400,
                textDecoration: r.underline ? 'underline' : 'none',
              }}
            >
              {r.text || '\u00A0'}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSignatureBlock = (orientation: PaperOrientation = 'portrait') => {
    const sig = getSignatureForOrientation(draft, orientation);
    const leftRows =
      sig.ttd_layout === 'guru_kepsek' ? sig.ttd_right_rows : sig.ttd_left_rows;
    const rightRows =
      sig.ttd_layout === 'guru_kepsek' ? sig.ttd_left_rows : sig.ttd_right_rows;

    if (sig.ttd_layout === 'stacked') {
      return (
        <div
          className="mt-8 text-[10.5pt] space-y-6"
          style={{
            transform: `translateX(${sig.ttd_offset_x}px)`,
            textAlign: sig.ttd_align,
          }}
        >
          {renderColumnRows(leftRows, sig.ttd_spacer, sig.ttd_left_offset_x ?? 0)}
          {renderColumnRows(rightRows, sig.ttd_spacer, sig.ttd_right_offset_x ?? 0)}
        </div>
      );
    }

    return (
      <div
        className="mt-8 text-[10.5pt]"
        style={{
          transform: `translateX(${sig.ttd_offset_x}px)`,
          textAlign: sig.ttd_align,
        }}
      >
        <div className="grid grid-cols-2 gap-8 items-start">
          {renderColumnRows(leftRows, sig.ttd_spacer, sig.ttd_left_offset_x ?? 0)}
          {renderColumnRows(rightRows, sig.ttd_spacer, sig.ttd_right_offset_x ?? 0)}
        </div>
      </div>
    );
  };

  const renderSampulPage = () => (
    <div className="flex flex-col items-center">
      {renderSheetControlStrip('sampul', 'Halaman Sampul')}
      <div
        className={getPageClass('sampul', 'flex flex-col justify-between')}
        style={getPageStyle()}
      >
      <div className="pt-14">
        <div className="text-center space-y-4">
          <p className="text-[11pt] font-bold tracking-widest uppercase text-slate-700">
            DOKUMEN RESMI PENDAMPINGAN PERWALIAN SEKOLAH
          </p>
          <h1 className="text-[22pt] font-bold tracking-tight leading-tight text-slate-900">
            BUKU JURNAL GURU WALI
          </h1>
          <p className="text-[12pt] font-semibold text-slate-800">
            Berdasarkan Peraturan Menteri Pendidikan Dasar dan Menengah Nomor 11 Tahun 2025
          </p>
        </div>

        <div className="my-12 flex justify-center">
          {draft.logo_kiri && (
            <img
              src={draft.logo_kiri}
              alt="Lambang Sekolah"
              referrerPolicy="no-referrer"
              className="w-36 h-36 object-contain"
            />
          )}
        </div>

        <div className="max-w-md mx-auto border border-slate-800 p-5 text-[11pt] space-y-2">
          <div className="flex">
            <span className="w-40 font-semibold">Satuan Pendidikan</span>
            <span>: {draft.nama_sekolah}</span>
          </div>
          <div className="flex">
            <span className="w-40 font-semibold">Nama Guru Wali</span>
            <span>: {draft.nama_guru_wali}</span>
          </div>
          <div className="flex">
            <span className="w-40 font-semibold">NIP / NUPTK</span>
            <span>: {draft.nip_guru_wali}</span>
          </div>
          <div className="flex">
            <span className="w-40 font-semibold">Jumlah Dampingan</span>
            <span>: {students.length} Murid Aktif</span>
          </div>
          <div className="flex">
            <span className="w-40 font-semibold">Tahun Ajaran</span>
            <span>: {draft.tahun_ajaran}</span>
          </div>
        </div>
      </div>

      <div className="text-center pt-8 border-t border-slate-300 text-[10.5pt]">
        <p className="font-bold">{draft.nama_sekolah}</p>
        <p>Tahun Pelajaran {draft.tahun_ajaran}</p>
      </div>
    </div>
    </div>
  );

  const renderSopPage = () => (
    <div className="flex flex-col items-center">
      {renderSheetControlStrip('sop', 'Naskah SOP Guru Wali')}
      <div className={getPageClass('sop', 'text-[10pt] leading-relaxed')} style={getPageStyle()}>
      {renderKopSurat()}
      <div className="text-center mb-4">
        <h2 className="text-[13pt] font-bold uppercase">
          STANDAR OPERASIONAL PROSEDUR (SOP) GURU WALI
        </h2>
        <p className="text-[10pt] italic">
          Implementasi Tugas Pendampingan Murid Sesuai Permendikdasmen Nomor 11 Tahun 2025
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="font-bold text-[10.5pt]">1. Tugas Pokok &amp; Fungsi Guru Wali</h3>
          <p>
            Guru Wali melaksanakan pendampingan personal berkelanjutan kepada murid dampingan sejak masuk hingga lulus pada aspek akademik, karakter, sosial-emosional, kedisiplinan, serta pengembangan potensi dan perencanaan pasca-lulus.
          </p>
        </div>

        <div>
          <h3 className="font-bold text-[10.5pt]">2. Kolaborasi &amp; Ekuivalensi Beban Kerja</h3>
          <p>
            Guru Wali berkolaborasi aktif dengan Guru Bimbingan dan Konseling (BK), Wali Kelas, Guru Mata Pelajaran, serta Orang Tua/Wali Murid. Pelaksanaan tugas Guru Wali diekuivalensikan sebesar{' '}
            <strong>2 Jam Pelajaran (2 JP) per minggu</strong> dalam pemenuhan beban kerja <strong>37,5 jam kerja efektif</strong> sesuai ketentuan regulasi.
          </p>
        </div>

        <div>
          <h3 className="font-bold text-[10.5pt] mb-1.5">3. Tabel 6 Prosedur Pelaksanaan Perwalian</h3>
          <table className="w-full border-collapse border border-slate-800 text-[9.2pt]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-800 px-2 py-1.5 w-8 text-center">No</th>
                <th className="border border-slate-800 px-2 py-1.5 text-left">Tahapan Prosedur</th>
                <th className="border border-slate-800 px-2 py-1.5 text-left">Aktivitas Utama &amp; Bukti Fisik</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['1', 'Pemetaan Profil Awal', 'Pengisian identitas lengkap & rencana pasca-lulus (Lampiran A) serta formulir BK.'],
                ['2', 'Penyusunan Jadwal Pendampingan', 'Penetapan jadwal tatap muka rutin minimal 9 sesi per semester (Lampiran D).'],
                ['3', 'Sesi Pertemuan Perwalian', 'Pelaksanaan konseling ringan, motivasi belajar, & pencatatan jurnal (Lampiran C).'],
                ['4', 'Evaluasi 5 Aspek Berkala', 'Penilaian akademik, karakter, sosial-emosional, disiplin, & minat (Lampiran B).'],
                ['5', 'Koordinasi Orang Tua & BK', 'Komunikasi dua arah orang tua serta rujukan kasus khusus ke koordinator BK.'],
                ['6', 'Pelaporan & Pengarsipan SOP', 'Verifikasi dan pengesahan Buku Jurnal Guru Wali oleh Kepala Sekolah.'],
              ].map(([no, tahap, akt]) => (
                <tr key={no}>
                  <td className="border border-slate-800 px-2 py-1 text-center">{no}</td>
                  <td className="border border-slate-800 px-2 py-1 font-semibold">{tahap}</td>
                  <td className="border border-slate-800 px-2 py-1">{akt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="font-bold text-[10.5pt] mb-1.5">4. Ringkasan Otomatis Kondisi Murid Dampingan</h3>
          <table className="w-full border-collapse border border-slate-800 text-[9pt]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-800 px-2 py-1 w-8 text-center">No</th>
                <th className="border border-slate-800 px-2 py-1 text-left">Nama Murid</th>
                <th className="border border-slate-800 px-2 py-1 text-left">Kelas</th>
                <th className="border border-slate-800 px-2 py-1 text-center">Hadir</th>
                <th className="border border-slate-800 px-2 py-1 text-left">Target Pasca Lulus</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, idx) => (
                <tr key={s.id}>
                  <td className="border border-slate-800 px-2 py-1 text-center">{idx + 1}</td>
                  <td className="border border-slate-800 px-2 py-1 font-semibold">{s.nama_lengkap}</td>
                  <td className="border border-slate-800 px-2 py-1">{s.kelas}</td>
                  <td className="border border-slate-800 px-2 py-1 text-center">
                    {calcAttendancePct(s.kehadiran)}%
                  </td>
                  <td className="border border-slate-800 px-2 py-1">
                    {s.rencana_lulus || '-'} ({s.prodi_pilihan || '-'})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {renderSignatureBlock(getOrientation('sop'))}
    </div>
    </div>
  );

  const renderLampiranA = (st: WcStudent) => {
    const choices: ('Kuliah' | 'Bekerja' | 'Gap-year')[] = ['Kuliah', 'Bekerja', 'Gap-year'];
    return (
      <div key={`a-${st.id}`} className="flex flex-col items-center">
        {renderSheetControlStrip('lampiran_a', 'Lampiran A — Identitas Murid')}
        <div className={getPageClass('lampiran_a', 'text-[9.8pt] leading-snug')} style={getPageStyle()}>
        {renderKopSurat()}
        <div className="text-center mb-3">
          <h2 className="text-[12pt] font-bold uppercase">
            LAMPIRAN A — IDENTITAS MURID DAMPINGAN
          </h2>
          <p className="text-[9.5pt]">Tahun Ajaran {draft.tahun_ajaran}</p>
        </div>

        <div className="flex items-start gap-4 mb-3">
          <table className="flex-1 border-collapse text-[9.5pt]">
            <tbody>
              {[
                ['Nama Lengkap', st.nama_lengkap],
                ['Nama Panggilan', st.nama_panggilan],
                ['Jenis Kelamin', st.jenis_kelamin === 'L' ? 'Laki-Laki' : 'Perempuan'],
                ['Kelas / NIS / NISN', `${st.kelas} / ${st.nis} / ${st.nisn || '-'}`],
                ['Tempat, Tanggal Lahir', st.ttl],
                ['Agama / Hobi', `${st.agama} / ${st.hobi}`],
                ['No. WhatsApp / Email', `${st.whatsapp} / ${st.email}`],
                ['Alamat Domisili', st.alamat],
                ['Nama & Pekerjaan Ayah', `${st.nama_ayah} (${st.pekerjaan_ayah})`],
                ['Nama & Pekerjaan Ibu', `${st.nama_ibu} (${st.pekerjaan_ibu})`],
                ['Alamat & Kontak Ortu', `${st.alamat_ortu} · ${st.kontak_ortu}`],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1 pr-2 font-semibold w-44 align-top">{k}</td>
                  <td className="py-1 pr-1 w-3 align-top">:</td>
                  <td className="py-1 align-top">{v || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 4x6 Photo Frame */}
          <div className="w-[34mm] h-[46mm] border border-slate-900 shrink-0 flex items-center justify-center overflow-hidden bg-slate-50">
            <SmartPhoto
              src={st.foto_url}
              alt={`Pas Foto ${st.nama_lengkap}`}
              fallback={
                <span className="text-[8pt] text-center text-slate-500">Pas Foto<br />4 × 6 cm</span>
              }
            />
          </div>
        </div>

        <div className="border border-slate-800 p-3 space-y-2 text-[9.5pt]">
          <div>
            <span className="font-bold">Deskripsi Diri &amp; Minat:</span>
            <p className="mt-0.5">{st.deskripsi_diri || '-'}</p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <span className="font-bold">Pilihan Rencana Pasca Lulus:</span>
            <div className="flex items-center gap-4">
              {choices.map((c) => {
                const selected = st.rencana_lulus === c;
                return (
                  <span
                    key={c}
                    className={`px-2.5 py-0.5 ${
                      selected
                        ? 'border-2 border-slate-900 rounded-full font-bold'
                        : 'text-slate-600'
                    }`}
                  >
                    {c}
                  </span>
                );
              })}
            </div>
          </div>

          <div>
            <span className="font-bold">Program Studi / Bidang Tujuan:</span>{' '}
            <span>{st.prodi_pilihan || '-'}</span>
          </div>
          <div>
            <span className="font-bold">Langkah Pencapaian:</span>
            <p className="whitespace-pre-line mt-0.5">{st.langkah_pencapaian || '-'}</p>
          </div>
          <div>
            <span className="font-bold">Catatan Khusus Siswa:</span>
            <p className="mt-0.5">{st.catatan_khusus || '-'}</p>
          </div>
        </div>

        {renderSignatureBlock(getOrientation('lampiran_a'))}
      </div>
      </div>
    );
  };

  const renderLampiranB = (st: WcStudent) => {
    const isAllPeriods = lampiranBPeriode === 'semua';
    const singleSnap = !isAllPeriods
      ? getSnapshotForPeriode(st.perkembangan, lampiranBPeriode)
      : null;

    const aspectRows: {
      no: string;
      label: string;
      key: 'akademik' | 'karakter' | 'sosial_emosional' | 'kedisiplinan' | 'potensi_minat';
    }[] = [
      { no: '1', label: 'Akademik', key: 'akademik' },
      { no: '2', label: 'Karakter & Akhlak', key: 'karakter' },
      { no: '3', label: 'Sosial-Emosional', key: 'sosial_emosional' },
      { no: '4', label: 'Kedisiplinan', key: 'kedisiplinan' },
      { no: '5', label: 'Potensi & Minat', key: 'potensi_minat' },
    ];

    return (
      <div key={`b-${st.id}`} className="flex flex-col items-center">
        {renderSheetControlStrip('lampiran_b', 'Lampiran B — 5 Aspek Perkembangan')}
        <div className={getPageClass('lampiran_b', 'text-[9.8pt]')} style={getPageStyle()}>
          {renderKopSurat()}
          <div className="text-center mb-3">
            <h2 className="text-[12pt] font-bold uppercase">
              LAMPIRAN B — CATATAN PERKEMBANGAN MURID (5 ASPEK)
            </h2>
            <p className="text-[9.5pt]">
              Nama: <strong>{st.nama_lengkap}</strong> · Kelas: <strong>{st.kelas}</strong> · Periode:{' '}
              <strong>
                {isAllPeriods ? 'Rekap 3 Bulan, 6 Bulan, 9 Bulan & 1 Tahun' : lampiranBPeriode}
              </strong>
            </p>
            {!isAllPeriods && (
              <div className="mt-1.5 flex items-center justify-center gap-2 text-[8.5pt]">
                {EVALUASI_PERIODES.map((p) => (
                  <span
                    key={p.value}
                    className={`px-2 py-0.5 ${
                      lampiranBPeriode === p.value
                        ? 'border border-slate-900 font-bold'
                        : 'text-slate-500'
                    }`}
                  >
                    {lampiranBPeriode === p.value ? `✓ ${p.label}` : p.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {isAllPeriods ? (
            <table className="w-full border-collapse border border-slate-800 text-[8.2pt]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-800 px-2 py-1.5 w-7 text-center">No</th>
                  <th className="border border-slate-800 px-2 py-1.5 w-32 text-left">Aspek</th>
                  {EVALUASI_PERIODES.map((p) => (
                    <th key={p.value} className="border border-slate-800 px-2 py-1.5 text-left">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aspectRows.map((row) => (
                  <tr key={row.no}>
                    <td className="border border-slate-800 px-2 py-2 text-center align-top">
                      {row.no}
                    </td>
                    <td className="border border-slate-800 px-2 py-2 font-bold align-top">
                      {row.label}
                    </td>
                    {EVALUASI_PERIODES.map((p) => {
                      const snap = getSnapshotForPeriode(st.perkembangan, p.value);
                      return (
                        <td
                          key={p.value}
                          className="border border-slate-800 px-2 py-2 align-top leading-snug"
                        >
                          {snap[row.key] || '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse border border-slate-800 text-[9.5pt]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-800 px-3 py-2 w-10 text-center">No</th>
                  <th className="border border-slate-800 px-3 py-2 w-48 text-left">
                    Aspek Perkembangan
                  </th>
                  <th className="border border-slate-800 px-3 py-2 text-left">
                    Catatan Capaian &amp; Pembinaan Guru Wali ({lampiranBPeriode})
                  </th>
                </tr>
              </thead>
              <tbody>
                {aspectRows.map((row) => (
                  <tr key={row.no}>
                    <td className="border border-slate-800 px-3 py-3 text-center align-top">
                      {row.no}
                    </td>
                    <td className="border border-slate-800 px-3 py-3 font-bold align-top">
                      {row.label}
                    </td>
                    <td className="border border-slate-800 px-3 py-3 align-top leading-relaxed">
                      {singleSnap?.[row.key] || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {renderSignatureBlock(getOrientation('lampiran_b'))}
        </div>
      </div>
    );
  };

  const renderLampiranC = () => (
    <div className="flex flex-col items-center">
      {renderSheetControlStrip('lampiran_c', 'Lampiran C — Rekap Pertemuan')}
      <div className={getPageClass('lampiran_c', 'text-[9.5pt]')} style={getPageStyle()}>
      {renderKopSurat()}
      <div className="text-center mb-4">
        <h2 className="text-[12pt] font-bold uppercase">
          LAMPIRAN C — REKAP PERTEMUAN &amp; JURNAL PERWALIAN
        </h2>
        <p className="text-[9.5pt]">Tahun Ajaran {draft.tahun_ajaran}</p>
      </div>

      <table className="w-full border-collapse border border-slate-800 text-[9pt]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-800 px-2 py-1.5 w-8 text-center">No</th>
            <th className="border border-slate-800 px-2 py-1.5 w-24 text-left">Tanggal / Sesi</th>
            <th className="border border-slate-800 px-2 py-1.5 w-32 text-left">Murid &amp; Bidang</th>
            <th className="border border-slate-800 px-2 py-1.5 text-left">Topik &amp; Uraian</th>
            <th className="border border-slate-800 px-2 py-1.5 text-left">Tindak Lanjut</th>
            <th className="border border-slate-800 px-2 py-1.5 w-20 text-center">Foto</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l, idx) => (
            <tr key={l.id}>
              <td className="border border-slate-800 px-2 py-1.5 text-center align-top">{idx + 1}</td>
              <td className="border border-slate-800 px-2 py-1.5 align-top">
                {l.tanggal}
                <br />
                Sesi {l.sesi_ke}
              </td>
              <td className="border border-slate-800 px-2 py-1.5 align-top">
                <strong>{l.student_name}</strong>
                <br />
                {l.kategori}
              </td>
              <td className="border border-slate-800 px-2 py-1.5 align-top">
                <strong>{l.topik}</strong>
                <p className="mt-0.5">{l.uraian}</p>
              </td>
              <td className="border border-slate-800 px-2 py-1.5 align-top whitespace-pre-line">
                {l.tindak_lanjut || '-'}
              </td>
              <td className="border border-slate-800 px-1.5 py-1.5 text-center align-top">
                {l.foto_url ? (
                  <SmartPhoto
                    src={l.foto_url}
                    alt="Doc"
                    className="w-16 h-12 object-cover mx-auto border border-slate-400"
                    fallback={<span>-</span>}
                  />
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {renderSignatureBlock(getOrientation('lampiran_c'))}
    </div>
    </div>
  );

  const renderLampiranD = () => (
    <div className="flex flex-col items-center">
      {renderSheetControlStrip('lampiran_d', 'Lampiran D — Daftar Hadir')}
      <div className={getPageClass('lampiran_d', 'text-[9.5pt]')} style={getPageStyle()}>
      {renderKopSurat()}
      <div className="text-center mb-4">
        <h2 className="text-[12pt] font-bold uppercase">
          LAMPIRAN D — DAFTAR HADIR PERTEMUAN PERWALIAN (SESI 1–9)
        </h2>
        <p className="text-[9.5pt]">Tahun Ajaran {draft.tahun_ajaran}</p>
      </div>

      <table className="w-full border-collapse border border-slate-800 text-[9pt]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-800 px-2 py-2 w-8 text-center">No</th>
            <th className="border border-slate-800 px-2 py-2 text-left">Nama Murid</th>
            <th className="border border-slate-800 px-2 py-2 w-20 text-left">Kelas</th>
            {Array.from({ length: 9 }, (_, i) => (
              <th key={i} className="border border-slate-800 px-1.5 py-2 w-7 text-center">
                {i + 1}
              </th>
            ))}
            <th className="border border-slate-800 px-2 py-2 w-14 text-center">%</th>
          </tr>
        </thead>
        <tbody>
          {students.map((st, idx) => (
            <tr key={st.id}>
              <td className="border border-slate-800 px-2 py-1.5 text-center">{idx + 1}</td>
              <td className="border border-slate-800 px-2 py-1.5 font-semibold">{st.nama_lengkap}</td>
              <td className="border border-slate-800 px-2 py-1.5">{st.kelas}</td>
              {Array.from({ length: 9 }, (_, i) => (
                <td key={i} className="border border-slate-800 px-1.5 py-1.5 text-center font-bold">
                  {st.kehadiran?.[i] ? '✓' : '—'}
                </td>
              ))}
              <td className="border border-slate-800 px-2 py-1.5 text-center font-bold">
                {calcAttendancePct(st.kehadiran)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {renderSignatureBlock(getOrientation('lampiran_d'))}
    </div>
    </div>
  );

  const renderLampiranE = (st: WcStudent) => {
    const docPhotos = logs.filter((l) => l.foto_url);
    return (
      <div key={`e-${st.id}`} className="flex flex-col items-center">
        {renderSheetControlStrip('lampiran_e', 'Lampiran E — Dokumentasi & Form BK')}
        <div className={getPageClass('lampiran_e', 'text-[9.2pt]')} style={getPageStyle()}>
        {renderKopSurat()}
        <div className="text-center mb-3">
          <h2 className="text-[11.5pt] font-bold uppercase">
            LAMPIRAN E — DOKUMENTASI FOTO &amp; FORMULIR DATA DETAIL PESERTA DIDIK (BK)
          </h2>
          <p className="text-[9pt] italic">Rahasia Profesional Layanan Bimbingan &amp; Konseling</p>
        </div>

        {/* Documentation Photos */}
        <div className="mb-3">
          <p className="font-bold text-[9.5pt] mb-1.5">A. Dokumentasi Foto Kegiatan Pendampingan</p>
          <div className="grid grid-cols-3 gap-2">
            {docPhotos.slice(0, 3).map((l) => (
              <div key={l.id} className="border border-slate-700 p-1 text-center">
                <SmartPhoto
                  src={l.foto_url}
                  alt={l.topik}
                  className="w-full h-24 object-cover mb-1"
                />
                <p className="text-[8pt] truncate font-semibold">{l.topik}</p>
                <p className="text-[7.5pt] text-slate-600">{l.tanggal}</p>
              </div>
            ))}
            {docPhotos.length === 0 && (
              <p className="text-[8.5pt] text-slate-500 col-span-3">
                Belum ada foto dokumentasi pada jurnal pertemuan.
              </p>
            )}
          </div>
        </div>

        {/* Formulir Data Detail BK Bagian A-F Ringkasan Resmi */}
        <p className="font-bold text-[9.5pt] mb-1">
          B. Formulir Data Detail Peserta Didik (Bagian A–F) — {st.nama_lengkap} ({st.kelas})
        </p>
        <table className="w-full border-collapse border border-slate-800 text-[8.5pt]">
          <tbody>
            <tr>
              <td className="border border-slate-800 px-2 py-1 font-bold w-44 bg-slate-50">
                Bagian A (Identitas &amp; Keluarga)
              </td>
              <td className="border border-slate-800 px-2 py-1">
                Anak ke-{st.bk_detail?.a7_anak_ke || '-'} dari {st.bk_detail?.a8_jumlah_saudara || '-'} bersaudara · Tinggal bersama: {st.bk_detail?.a10_tinggal_bersama || '-'} · Jarak: {st.bk_detail?.a11_jarak_rumah || '-'} ({st.bk_detail?.a12_transportasi || '-'}) · Kontak Darurat: {st.bk_detail?.a18_wali_kontak_darurat || '-'}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-800 px-2 py-1 font-bold bg-slate-50">
                Bagian B (Kesehatan Fisik &amp; Psikis)
              </td>
              <td className="border border-slate-800 px-2 py-1">
                TB/BB: {st.bk_detail?.b_tinggi_berat || '-'} · Gol. Darah: {st.bk_detail?.b_golongan_darah || '-'} · Riwayat: {st.bk_detail?.b_riwayat_penyakit || '-'} · Psikis: {st.bk_detail?.b_kondisi_psikis || '-'}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-800 px-2 py-1 font-bold bg-slate-50">
                Bagian C (Akademik &amp; Belajar)
              </td>
              <td className="border border-slate-800 px-2 py-1">
                Mapel Disukai: {st.bk_detail?.c_mapel_disukai || '-'} · Sulit: {st.bk_detail?.c_mapel_sulit || '-'} · Hambatan: {st.bk_detail?.c_hambatan_akademik || '-'} · Prestasi: {st.bk_detail?.c_prestasi_akademik || '-'}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-800 px-2 py-1 font-bold bg-slate-50">
                Bagian D (Pribadi &amp; Sosial)
              </td>
              <td className="border border-slate-800 px-2 py-1">
                Kelebihan: {st.bk_detail?.d_sifat_kelebihan || '-'} · Organisasi: {st.bk_detail?.d_organisasi_ekskul || '-'} · Hubungan Sosial: {st.bk_detail?.d_hubungan_teman_sebaya || '-'}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-800 px-2 py-1 font-bold bg-slate-50">
                Bagian E (Karir &amp; Masa Depan)
              </td>
              <td className="border border-slate-800 px-2 py-1">
                Cita-cita: {st.bk_detail?.e_cita_cita || '-'} · Rencana Lulus: {st.bk_detail?.e_rencana_setelah_lulus || '-'} · Pilihan Studi/Kerja: {st.bk_detail?.e_pilihan_studi_kerja || '-'}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-800 px-2 py-1 font-bold bg-slate-50">
                Bagian F (Harapan Layanan BK)
              </td>
              <td className="border border-slate-800 px-2 py-1">
                Harapan: {st.bk_detail?.f_harapan_layanan_bk || '-'} · Topik Konseling: {st.bk_detail?.f_topik_konseling_diinginkan || '-'} · Kesediaan Ortu: {st.bk_detail?.f_kesediaan_orang_tua || '-'}
              </td>
            </tr>
          </tbody>
        </table>

        {renderSignatureBlock(getOrientation('lampiran_e'))}
      </div>
      </div>
    );
  };

  const renderPages = () => {
    const targetStudent = activeStudent;
    switch (selectedDoc) {
      case 'sampul':
        return renderSampulPage();
      case 'sop':
        return renderSopPage();
      case 'lampiran_a':
        return targetStudent ? renderLampiranA(targetStudent) : null;
      case 'lampiran_b':
        return targetStudent ? renderLampiranB(targetStudent) : null;
      case 'lampiran_c':
        return renderLampiranC();
      case 'lampiran_d':
        return renderLampiranD();
      case 'lampiran_e':
        return targetStudent ? renderLampiranE(targetStudent) : null;
      case 'paket_lengkap':
      default:
        return (
          <>
            {renderSampulPage()}
            {renderSopPage()}
            {targetStudent && renderLampiranA(targetStudent)}
            {targetStudent && renderLampiranB(targetStudent)}
            {renderLampiranC()}
            {renderLampiranD()}
            {targetStudent && renderLampiranE(targetStudent)}
          </>
        );
    }
  };

  const renderSignatureEditor = (
    title: string,
    sideKey: 'ttd_left_rows' | 'ttd_right_rows',
    sideTag: 'left' | 'right'
  ) => (
    <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{title}</span>
        <button
          type="button"
          onClick={() => addSigRow(sideKey)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          <span>Baris</span>
        </button>
      </div>
      <div className="space-y-1.5">
        {editingSig[sideKey].map((row, idx) => (
          <div
            key={row.id}
            draggable
            onDragStart={() => setDragInfo({ side: sideTag, index: idx })}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragInfo && dragInfo.side === sideTag && dragInfo.index !== idx) {
                moveSigRow(sideKey, dragInfo.index, idx);
              }
              setDragInfo(null);
            }}
            className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <GripVertical className="w-3.5 h-3.5 text-slate-400 cursor-grab shrink-0" />
            <input
              type="text"
              value={row.text}
              onChange={(e) => updateSigRow(sideKey, idx, { text: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-transparent text-slate-900 dark:text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => updateSigRow(sideKey, idx, { bold: !row.bold })}
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                row.bold ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => updateSigRow(sideKey, idx, { underline: !row.underline })}
              className={`px-1.5 py-0.5 rounded text-[11px] underline cursor-pointer ${
                row.underline ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
              title="Underline"
            >
              U
            </button>
            {(() => {
              const colRows = editingSig[sideKey];
              const hasExplicit = colRows.some((r) => r.spacerBefore !== undefined);
              const fallbackIdx = Math.max(1, colRows.length - 2);
              const isSpaced =
                row.spacerBefore !== undefined ? row.spacerBefore : !hasExplicit && idx === fallbackIdx;
              return (
                <button
                  type="button"
                  onClick={() => {
                    updateEditingSig((curr) => {
                      const rows = curr[sideKey];
                      const nextRows = rows.map((r, i) => {
                        const currVal =
                          r.spacerBefore !== undefined
                            ? r.spacerBefore
                            : !hasExplicit && i === fallbackIdx;
                        return i === idx
                          ? { ...r, spacerBefore: !currVal }
                          : { ...r, spacerBefore: currVal };
                      });
                      return { [sideKey]: nextRows };
                    });
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                    isSpaced
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                  title="Beri jarak spasi tanda tangan sebelum baris ini"
                >
                  Spasi
                </button>
              );
            })()}
            <button
              type="button"
              onClick={() => moveSigRow(sideKey, idx, idx - 1)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              title="Naik"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => moveSigRow(sideKey, idx, idx + 1)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              title="Turun"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => removeSigRow(sideKey, idx)}
              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
              title="Hapus"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Control Header */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedDoc}
              onChange={(e) => setSelectedDoc(e.target.value as PrintDocumentType)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              {DOC_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  Murid: {s.nama_lengkap} ({s.kelas})
                </option>
              ))}
            </select>

            {(selectedDoc === 'lampiran_b' || selectedDoc === 'paket_lengkap') && (
              <select
                value={lampiranBPeriode}
                onChange={(e) =>
                  setLampiranBPeriode(e.target.value as EvaluasiPeriode | 'semua')
                }
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {EVALUASI_PERIODES.map((p) => (
                  <option key={p.value} value={p.value}>
                    Lampiran B: {p.label}
                  </option>
                ))}
                <option value="semua">Lampiran B: Rekap 4 Periode (3, 6, 9 Bln &amp; 1 Thn)</option>
              </select>
            )}

            {selectedDoc !== 'paket_lengkap' && (
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setSheetOrientation(selectedDoc, 'portrait')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                    getOrientation(selectedDoc) === 'portrait'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <RectangleVertical className="w-3.5 h-3.5" />
                  <span>Potret</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSheetOrientation(selectedDoc, 'landscape')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                    getOrientation(selectedDoc) === 'landscape'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <RectangleHorizontal className="w-3.5 h-3.5" />
                  <span>Lanskap</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextShow = !showSettings;
                setShowSettings(nextShow);
                if (!nextShow && previewZoom < 0.9) setPreviewZoom(0.92);
                if (nextShow && previewPos === 'side' && previewZoom > 0.85) setPreviewZoom(0.72);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              {showSettings ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
              <span>{showSettings ? 'Ciutkan Pengaturan' : 'Tampilkan Pengaturan'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const nextPos = previewPos === 'side' ? 'bottom' : 'side';
                setPreviewPos(nextPos);
                setPreviewZoom(nextPos === 'bottom' ? 0.92 : 0.72);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              {previewPos === 'side' ? (
                <Rows2 className="w-4 h-4" />
              ) : (
                <Columns2 className="w-4 h-4" />
              )}
              <span>Posisi Pratinjau: {previewPos === 'side' ? 'Di Samping' : 'Di Bawah'}</span>
            </button>

            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.max(0.45, Number((z - 0.1).toFixed(2))))}
                aria-label="Perkecil pratinjau"
                className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono-tabular font-semibold px-1.5 min-w-[42px] text-center">
                {Math.round(previewZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.min(1.2, Number((z + 0.1).toFixed(2))))}
                aria-label="Perbesar pratinjau"
                className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Simpan Format</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak F4 (215×330mm)</span>
            </button>
          </div>
        </div>

        {/* Export / Import / Template Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                exportPrintReportXls(
                  {
                    config: draft,
                    selectedDoc,
                    students,
                    activeStudent,
                    logs,
                    lampiranBPeriode,
                  },
                  true
                )
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Template XLS</span>
            </button>
            <button
              type="button"
              onClick={() => downloadPrintTemplateWord(draft)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Template Word</span>
            </button>

            <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-semibold cursor-pointer hover:bg-slate-800">
              {importingPrint ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>Import XLS / Word</span>
              <input
                ref={printImportInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.docx"
                className="hidden"
                onChange={(e) => handleImportPrintFile(e.target.files?.[0])}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                exportPrintReportXls(
                  {
                    config: draft,
                    selectedDoc,
                    students,
                    activeStudent,
                    logs,
                    lampiranBPeriode,
                  },
                  false
                )
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Ekspor XLS</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportPrintDocToPdf({
                  config: draft,
                  selectedDoc,
                  students,
                  activeStudent,
                  logs,
                  lampiranBPeriode,
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[11px] font-semibold cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ekspor PDF</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportPrintDocToWord({
                  config: draft,
                  selectedDoc,
                  students,
                  activeStudent,
                  logs,
                  lampiranBPeriode,
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[11px] font-semibold cursor-pointer"
            >
              <FileType2 className="w-3.5 h-3.5" />
              <span>Ekspor Word</span>
            </button>
          </div>
        </div>
      </div>

      {savedNotice && (
        <div className="no-print px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          {savedNotice}
        </div>
      )}
      {printError && (
        <div className="no-print px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
          {printError}
        </div>
      )}

      {/* Split / Stacked Workspace */}
      <div
        className={`grid gap-6 ${
          showSettings && previewPos === 'side'
            ? 'grid-cols-1 xl:grid-cols-12 items-start'
            : 'grid-cols-1'
        }`}
      >
        {showSettings && (
          <div
            className={`no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-6 ${
              previewPos === 'side'
                ? 'xl:col-span-5 xl:max-h-[calc(100vh-170px)] xl:overflow-y-auto'
                : ''
            }`}
          >
            {/* Identitas Dokumen */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Identitas Dokumen &amp; Tahun Ajaran
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Nama Sekolah</label>
                  <input
                    type="text"
                    value={draft.nama_sekolah}
                    onChange={(e) => setDraft({ ...draft, nama_sekolah: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Tahun Ajaran</label>
                  <input
                    type="text"
                    value={draft.tahun_ajaran}
                    onChange={(e) => setDraft({ ...draft, tahun_ajaran: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Nama Guru Wali</label>
                  <input
                    type="text"
                    value={draft.nama_guru_wali}
                    onChange={(e) => setDraft({ ...draft, nama_guru_wali: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">NIP Guru Wali</label>
                  <input
                    type="text"
                    value={draft.nip_guru_wali}
                    onChange={(e) => setDraft({ ...draft, nip_guru_wali: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>
            </div>

            {/* Pengaturan Font Global (Sekali Atur untuk Semua) */}
            <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-blue-600" />
                  <span>Jenis Font Global (Sekali Atur untuk Semua)</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pilih satu jenis font untuk langsung mengubah seluruh isi dokumen cetak &amp; semua baris Kop Surat
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={normalizeFontChoice(draft.doc_font)}
                  onChange={(e) => applyGlobalFont(e.target.value as FontFamilyChoice)}
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.stack }}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => applyGlobalFont(normalizeFontChoice(draft.doc_font))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Samakan Semua</span>
                </button>
              </div>
            </div>

            {/* Orientasi Kertas Per Lembar F4 */}
            <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Orientasi Kertas Per Lembar (F4)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Atur Potret (215×330mm) atau Lanskap (330×215mm) sesuai kebutuhan tiap lembar
                </p>
              </div>
              <div className="space-y-1.5">
                {SHEET_META.map((item) => {
                  const ori = getOrientation(item.key);
                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                    >
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {item.label}
                      </span>
                      <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSheetOrientation(item.key, 'portrait')}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                            ori === 'portrait'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <RectangleVertical className="w-3 h-3" />
                          <span>Potret</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSheetOrientation(item.key, 'landscape')}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                            ori === 'landscape'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <RectangleHorizontal className="w-3 h-3" />
                          <span>Lanskap</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Logo Ganda */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Logo Kiri &amp; Logo Kanan Kop Surat
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['logo_kiri', 'logo_kanan'] as const).map((side) => (
                  <div key={side} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold">
                        {side === 'logo_kiri' ? 'Logo Kiri' : 'Logo Kanan'}
                      </span>
                      <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>Upload</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleLogoUpload(side, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                    <input
                      type="text"
                      value={draft[side]}
                      onChange={(e) => setDraft({ ...draft, [side]: e.target.value })}
                      placeholder="Link URL logo..."
                      className="w-full px-2.5 py-1.5 rounded-lg text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 6-Line Kop Surat */}
            <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Pengaturan 6 Baris Kop Surat
              </h3>
              {draft.kop_lines.map((line, idx) => (
                <div
                  key={line.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono-tabular font-bold text-slate-400 w-4">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={line.text}
                      onChange={(e) => updateKopLine(idx, { text: e.target.value })}
                      className="flex-1 px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-6">
                    <select
                      value={normalizeFontChoice(line.fontFamily)}
                      onChange={(e) =>
                        updateKopLine(idx, { fontFamily: e.target.value as FontFamilyChoice })
                      }
                      className="px-2 py-1 rounded text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={6}
                      max={28}
                      step={0.5}
                      value={line.fontSize}
                      onChange={(e) =>
                        updateKopLine(idx, { fontSize: Number(e.target.value) || 10 })
                      }
                      className="w-16 px-2 py-1 rounded text-[11px] font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    />
                    <span className="text-[10px] text-slate-400">pt</span>
                    <button
                      type="button"
                      onClick={() => updateKopLine(idx, { bold: !line.bold })}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                        line.bold ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => updateKopLine(idx, { italic: !line.italic })}
                      className={`px-2 py-0.5 rounded text-[11px] italic cursor-pointer ${
                        line.italic ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => updateKopLine(idx, { underline: !line.underline })}
                      className={`px-2 py-0.5 rounded text-[11px] underline cursor-pointer ${
                        line.underline ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      U
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Dynamic Signature Settings — Separate Portrait & Landscape */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Pengaturan Tanda Tangan &amp; Pengesahan Dinamis
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pengaturan Potret dan Lanskap disimpan terpisah agar posisi TTD selalu presisi
                  </p>
                </div>
                {sigEditMode === 'landscape' && (
                  <button
                    type="button"
                    onClick={copyPortraitSigToLandscape}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Salin dari Potret</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setSigEditMode('portrait')}
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    sigEditMode === 'portrait'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-900'
                  }`}
                >
                  <RectangleVertical className="w-3.5 h-3.5" />
                  <span>Mode Potret</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSigEditMode('landscape')}
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    sigEditMode === 'landscape'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-900'
                  }`}
                >
                  <RectangleHorizontal className="w-3.5 h-3.5" />
                  <span>Mode Lanskap</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Susunan Kolom</label>
                  <select
                    value={editingSig.ttd_layout}
                    onChange={(e) =>
                      updateEditingSig({
                        ttd_layout: e.target.value as 'kepsek_guru' | 'guru_kepsek' | 'stacked',
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <option value="kepsek_guru">Kepsek Kiri — Guru Kanan</option>
                    <option value="guru_kepsek">Guru Kiri — Kepsek Kanan</option>
                    <option value="stacked">Bertumpuk (Atas — Bawah)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1">Perataan Teks</label>
                  <div className="flex gap-1">
                    {[
                      { id: 'left', icon: <AlignLeft className="w-3.5 h-3.5" /> },
                      { id: 'center', icon: <AlignCenter className="w-3.5 h-3.5" /> },
                      { id: 'right', icon: <AlignRight className="w-3.5 h-3.5" /> },
                      { id: 'justify', icon: <AlignJustify className="w-3.5 h-3.5" /> },
                    ].map((al) => (
                      <button
                        key={al.id}
                        type="button"
                        onClick={() =>
                          updateEditingSig({
                            ttd_align: al.id as 'left' | 'center' | 'right' | 'justify',
                          })
                        }
                        className={`flex-1 py-1.5 rounded-lg flex items-center justify-center cursor-pointer border ${
                          editingSig.ttd_align === al.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {al.icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center text-[11px] font-semibold mb-1">
                      <span>Geser Horizontal (Semua)</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono-tabular">{editingSig.ttd_offset_x}px</span>
                        {editingSig.ttd_offset_x !== 0 && (
                          <button
                            type="button"
                            onClick={() => updateEditingSig({ ttd_offset_x: 0 })}
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min={-300}
                      max={300}
                      value={editingSig.ttd_offset_x}
                      onChange={(e) =>
                        updateEditingSig({ ttd_offset_x: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold mb-1">
                      <span>Spasi Area TTD</span>
                      <span className="font-mono-tabular">{editingSig.ttd_spacer}px</span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={110}
                      value={editingSig.ttd_spacer}
                      onChange={(e) =>
                        updateEditingSig({ ttd_spacer: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center text-[11px] font-semibold mb-1">
                      <span>Geser Kolom Kiri</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono-tabular">{editingSig.ttd_left_offset_x ?? 0}px</span>
                        {(editingSig.ttd_left_offset_x ?? 0) !== 0 && (
                          <button
                            type="button"
                            onClick={() => updateEditingSig({ ttd_left_offset_x: 0 })}
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min={-250}
                      max={250}
                      value={editingSig.ttd_left_offset_x ?? 0}
                      onChange={(e) =>
                        updateEditingSig({ ttd_left_offset_x: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-[11px] font-semibold mb-1">
                      <span>Geser Kolom Kanan</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono-tabular">{editingSig.ttd_right_offset_x ?? 0}px</span>
                        {(editingSig.ttd_right_offset_x ?? 0) !== 0 && (
                          <button
                            type="button"
                            onClick={() => updateEditingSig({ ttd_right_offset_x: 0 })}
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min={-250}
                      max={250}
                      value={editingSig.ttd_right_offset_x ?? 0}
                      onChange={(e) =>
                        updateEditingSig({ ttd_right_offset_x: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {renderSignatureEditor(
                `Kolom Tanda Tangan Kiri — ${sigEditMode === 'landscape' ? 'Lanskap' : 'Potret'}`,
                'ttd_left_rows',
                'left'
              )}
              {renderSignatureEditor(
                `Kolom Tanda Tangan Kanan — ${sigEditMode === 'landscape' ? 'Lanskap' : 'Potret'}`,
                'ttd_right_rows',
                'right'
              )}
            </div>
          </div>
        )}

        {/* Live F4 Scrollable Preview Viewport */}
        <div
          className={`print-only-root max-h-[calc(100vh-170px)] overflow-y-auto overflow-x-auto rounded-2xl bg-slate-200/75 dark:bg-slate-900/75 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 ${
            showSettings && previewPos === 'side' ? 'xl:col-span-7' : ''
          }`}
        >
          <div
            className="print-zoom-wrapper flex flex-col items-center gap-6 mx-auto w-fit"
            style={{ zoom: previewZoom }}
          >
            {renderPages()}
          </div>
        </div>
      </div>
    </div>
  );
};
