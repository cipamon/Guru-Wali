import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { calcAttendancePct, normalizeExternalImageUrl } from './imageUtils';
import {
  EVALUASI_PERIODES,
  getSnapshotForPeriode,
  normalizeEvaluasiPeriode,
} from './aspectPeriods';
import { createEmptyStudent } from './firebase';
import type {
  EvaluasiPeriode,
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

// ---------- Shared Download & Signature Helpers ----------

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function getSignatureForOrientation(
  config: WcPrintConfig,
  orientation: PaperOrientation
): SignatureSettings {
  if (orientation === 'landscape' && config.ttd_landscape) {
    return config.ttd_landscape;
  }
  return {
    ttd_layout: config.ttd_layout,
    ttd_offset_x: config.ttd_offset_x ?? 0,
    ttd_left_offset_x: config.ttd_left_offset_x ?? 0,
    ttd_right_offset_x: config.ttd_right_offset_x ?? 0,
    ttd_spacer: config.ttd_spacer ?? 48,
    ttd_align: config.ttd_align ?? 'left',
    ttd_left_rows: config.ttd_left_rows || [],
    ttd_right_rows: config.ttd_right_rows || [],
  };
}

function splitTempatTanggalLahir(st: WcStudent): { tempat: string; tanggal: string } {
  if (st.tempat_lahir || st.tanggal_lahir) {
    return {
      tempat: st.tempat_lahir || '',
      tanggal: st.tanggal_lahir || '',
    };
  }
  const raw = (st.ttl || '').trim();
  if (!raw) return { tempat: '', tanggal: '' };
  const commaIdx = raw.indexOf(',');
  if (commaIdx === -1) return { tempat: raw, tanggal: '' };
  return {
    tempat: raw.slice(0, commaIdx).trim(),
    tanggal: raw.slice(commaIdx + 1).trim(),
  };
}

function formatExcelCellValue(val: unknown, isDateHint = false): string {
  if (val === null || val === undefined) return '';
  if (isDateHint && typeof val === 'number' && val > 1000 && val < 90000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const months = [
        'Januari',
        'Februari',
        'Maret',
        'April',
        'Mei',
        'Juni',
        'Juli',
        'Agustus',
        'September',
        'Oktober',
        'November',
        'Desember',
      ];
      const monthName = months[parsed.m - 1] || String(parsed.m).padStart(2, '0');
      return `${String(parsed.d).padStart(2, '0')} ${monthName} ${parsed.y}`;
    }
  }
  return String(val).trim();
}

function getStudentExportColumns(st: WcStudent): Record<string, string | number> {
  const { tempat, tanggal } = splitTempatTanggalLahir(st);
  return {
    NIS: st.nis,
    NISN: st.nisn,
    Nama: st.nama_lengkap,
    Kelas: st.kelas,
    'No Absen': st.no_absen || '',
    Tempat: tempat,
    'Tanggal Lahir': tanggal,
    Email: st.email,
    Foto: st.foto_url || '',
    ALAMAT: st.alamat,
    NO_HP: st.whatsapp,
    JENIS_KELAMIN: st.jenis_kelamin,
    Status: st.status_siswa || 'Aktif',
    'Wali Kelas': st.wali_kelas || '',
    'Guru BK': st.guru_bk || '',
    'Nama Panggilan': st.nama_panggilan,
    Agama: st.agama,
    Hobi: st.hobi,
    'Nama Ayah': st.nama_ayah,
    'Pekerjaan Ayah': st.pekerjaan_ayah,
    'Nama Ibu': st.nama_ibu,
    'Pekerjaan Ibu': st.pekerjaan_ibu,
    'Alamat Orang Tua': st.alamat_ortu,
    'Kontak Orang Tua': st.kontak_ortu,
    'Rencana Pasca Lulus': st.rencana_lulus,
    'Program Studi / Bidang': st.prodi_pilihan,
    'Deskripsi Diri': st.deskripsi_diri,
    'Langkah Pencapaian': st.langkah_pencapaian,
    'Catatan Khusus': st.catatan_khusus,
    'Kehadiran (%)': calcAttendancePct(st.kehadiran),
  };
}

const STUDENT_TEMPLATE_SAMPLE: Record<string, string> = {
  NIS: '20241199',
  NISN: '0081234599',
  Nama: 'Aulia Rahman',
  Kelas: 'XI MIPA 2',
  'No Absen': '04',
  Tempat: 'Jakarta',
  'Tanggal Lahir': '10 Mei 2008',
  Email: 'aulia.rahman@student.sch.id',
  Foto: '',
  ALAMAT: 'Jl. Melati No. 12, Jakarta',
  NO_HP: '081234567890',
  JENIS_KELAMIN: 'L',
  Status: 'Aktif',
  'Wali Kelas': 'Dra. Ratna Sari Dewi, M.Pd.',
  'Guru BK': 'Drs. Wahyu Pratama, M.Psi.',
};

function mapRowToStudent(raw: Record<string, unknown>, idx: number): WcStudent | null {
  const normMap = new Map<string, { val: unknown; str: string }>();
  Object.entries(raw).forEach(([k, v]) => {
    const normKey = k.trim().toLowerCase().replace(/\s+/g, ' ');
    normMap.set(normKey, { val: v, str: String(v ?? '').trim() });
  });

  const pick = (...aliases: string[]): string => {
    for (const a of aliases) {
      const hit = normMap.get(a.toLowerCase());
      if (hit && hit.str !== '') return hit.str;
    }
    return '';
  };

  const pickDate = (...aliases: string[]): string => {
    for (const a of aliases) {
      const hit = normMap.get(a.toLowerCase());
      if (hit && hit.str !== '') return formatExcelCellValue(hit.val, true);
    }
    return '';
  };

  const namaLengkap = pick('nama', 'nama lengkap', 'nama murid', 'nama siswa');
  const kelas = pick('kelas');
  const nis = pick('nis') || `IMP${Date.now().toString().slice(-5)}${idx + 1}`;

  if (!namaLengkap && !kelas && !pick('nis')) return null;

  const base = createEmptyStudent(`std-imp-${Date.now()}-${idx}`);
  const jkRaw = pick('jenis_kelamin', 'jenis kelamin', 'jenis kelamin (l/p)', 'l/p', 'jk').toUpperCase();
  const jenisKelamin: 'L' | 'P' = jkRaw.startsWith('P') || jkRaw.includes('WANITA') ? 'P' : 'L';

  const rencanaRaw = pick('rencana pasca lulus', 'rencana lulus', 'rencana');
  let rencanaLulus: 'Kuliah' | 'Bekerja' | 'Gap-year' | '' = 'Kuliah';
  if (/bekerja|kerja/i.test(rencanaRaw)) rencanaLulus = 'Bekerja';
  else if (/gap/i.test(rencanaRaw)) rencanaLulus = 'Gap-year';
  else if (/kuliah/i.test(rencanaRaw)) rencanaLulus = 'Kuliah';

  const namaPanggilan = pick('nama panggilan', 'panggilan') || namaLengkap.split(' ')[0] || '';
  const tempatLahir = pick('tempat', 'tempat lahir', 'tempat_lahir');
  const tanggalLahir = pickDate('tanggal lahir', 'tgl lahir', 'tanggal_lahir', 'tgl_lahir');
  const ttlRaw = pick('tempat, tanggal lahir', 'ttl');
  const ttl = [tempatLahir, tanggalLahir].filter(Boolean).join(', ') || ttlRaw;

  const fotoRaw = pick('foto', 'foto_url', 'url foto', 'pas foto', 'link foto');
  const fotoUrl = normalizeExternalImageUrl(fotoRaw);

  const noAbsen = pick('no absen', 'no_absen', 'no. absen', 'absen');
  const statusSiswa = pick('status', 'status_siswa', 'status murid', 'status siswa') || 'Aktif';
  const waliKelas = pick('wali kelas', 'wali_kelas', 'walikelas');
  const guruBk = pick('guru bk', 'guru_bk', 'konselor bk');

  const agama = pick('agama') || 'Islam';
  const namaAyah = pick('nama ayah', 'ayah');
  const pekerjaanAyah = pick('pekerjaan ayah');
  const namaIbu = pick('nama ibu', 'ibu');
  const pekerjaanIbu = pick('pekerjaan ibu');
  const prodiPilihan = pick('program studi / bidang', 'prodi pilihan', 'prodi', 'jurusan');

  return {
    ...base,
    nama_lengkap: namaLengkap || `Murid Impor ${idx + 1}`,
    nama_panggilan: namaPanggilan,
    jenis_kelamin: jenisKelamin,
    kelas: kelas || 'XI',
    no_absen: noAbsen,
    nis,
    nisn: pick('nisn'),
    tempat_lahir: tempatLahir,
    tanggal_lahir: tanggalLahir,
    ttl,
    whatsapp: pick('no_hp', 'no hp', 'no. hp', 'hp', 'no. whatsapp', 'whatsapp', 'no wa', 'wa', 'telepon', 'telp'),
    email: pick('email', 'email aktif'),
    alamat: pick('alamat', 'alamat domisili'),
    agama,
    hobi: pick('hobi'),
    status_siswa: statusSiswa,
    wali_kelas: waliKelas,
    guru_bk: guruBk,
    foto_url: fotoUrl,
    nama_ayah: namaAyah,
    pekerjaan_ayah: pekerjaanAyah,
    nama_ibu: namaIbu,
    pekerjaan_ibu: pekerjaanIbu,
    alamat_ortu: pick('alamat orang tua', 'alamat ortu'),
    kontak_ortu: pick('kontak orang tua', 'kontak ortu', 'kontak wali'),
    rencana_lulus: rencanaLulus,
    prodi_pilihan: prodiPilihan,
    deskripsi_diri: pick('deskripsi diri'),
    langkah_pencapaian: pick('langkah pencapaian'),
    catatan_khusus: pick('catatan khusus'),
    bk_detail: {
      ...base.bk_detail,
      a1_nama_lengkap: namaLengkap,
      a2_nama_panggilan: namaPanggilan,
      a3_ttl: ttl,
      a4_agama: agama,
      a13_nama_ayah: namaAyah,
      a14_pendidikan_pekerjaan_ayah: pekerjaanAyah,
      a15_nama_ibu: namaIbu,
      a16_pendidikan_pekerjaan_ibu: pekerjaanIbu,
      e_rencana_setelah_lulus: rencanaLulus,
      e_pilihan_studi_kerja: prodiPilihan,
    },
  };
}

// ---------- 1. STUDENTS EXPORT / TEMPLATE / IMPORT ----------

export function downloadStudentsXlsTemplate() {
  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet([STUDENT_TEMPLATE_SAMPLE]);
  wsData['!cols'] = Object.keys(STUDENT_TEMPLATE_SAMPLE).map((k) => ({
    wch: Math.max(15, k.length + 5),
  }));
  XLSX.utils.book_append_sheet(wb, wsData, 'Data_Murid');

  const guide = [
    ['Petunjuk Pengisian Template Import Data Murid WaliConnect Pro'],
    ['Urutan 15 Kolom Standar: NIS | NISN | Nama | Kelas | No Absen | Tempat | Tanggal Lahir | Email | Foto | ALAMAT | NO_HP | JENIS_KELAMIN | Status | Wali Kelas | Guru BK'],
    ['1. Jangan mengubah nama kolom pada baris pertama sheet Data_Murid.'],
    ['2. Kolom wajib diisi: NIS, Nama, dan Kelas.'],
    ['3. JENIS_KELAMIN diisi L (Laki-laki) atau P (Perempuan).'],
    ['4. Status dapat diisi Aktif, Pindah, Lulus, atau Cuti (bawaan: Aktif).'],
    ['5. Foto boleh dikosongkan atau diisi tautan URL foto / link Google Drive (pastikan akses "Siapa saja yang memiliki link").'],
    ['6. Simpan sebagai .xlsx / .xls / .csv lalu unggah lewat tombol Import XLS / Word.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk');

  XLSX.writeFile(wb, 'Template_Data_Murid_WaliConnect.xlsx');
}

export function exportStudentsToXls(students: WcStudent[], filename = 'Data_Murid_WaliConnect.xlsx') {
  const rows = students.map(getStudentExportColumns);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0 ? rows : [STUDENT_TEMPLATE_SAMPLE]
  );
  const keys = Object.keys(rows[0] || STUDENT_TEMPLATE_SAMPLE);
  ws['!cols'] = keys.map((k) => ({ wch: Math.max(15, k.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Data_Murid');
  XLSX.writeFile(wb, filename);
}

export function exportStudentsToPdf(students: WcStudent[], filename = 'Data_Murid_WaliConnect.pdf') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [215, 330] });
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text('DIREKTORI DATA MURID DAMPINGAN (LAMPIRAN A)', 14, 16);
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `WaliConnect Pro · Jumlah Data: ${students.length} Murid · Dicetak: ${new Date().toLocaleDateString('id-ID')}`,
    14,
    22
  );

  autoTable(doc, {
    startY: 27,
    head: [[
      'No Absen',
      'NIS / NISN',
      'Nama',
      'Kelas',
      'Tempat, Tgl Lahir',
      'NO_HP / Email',
      'ALAMAT',
      'L/P',
      'Status',
      'Wali Kelas / Guru BK',
    ]],
    body: students.map((st, idx) => {
      const { tempat, tanggal } = splitTempatTanggalLahir(st);
      const ttlStr = [tempat, tanggal].filter(Boolean).join(', ') || st.ttl || '-';
      return [
        st.no_absen || String(idx + 1),
        `${st.nis}\n${st.nisn || '-'}`,
        st.nama_lengkap,
        st.kelas,
        ttlStr,
        `${st.whatsapp || '-'}\n${st.email || '-'}`,
        st.alamat || '-',
        st.jenis_kelamin,
        st.status_siswa || 'Aktif',
        `Wali: ${st.wali_kelas || '-'}\nBK: ${st.guru_bk || '-'}`,
      ];
    }),
    styles: { font: 'times', fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
  });

  doc.save(filename);
}

export async function exportStudentsToWord(
  students: WcStudent[],
  isTemplate = false,
  filename?: string
) {
  const headers = [
    'NIS',
    'NISN',
    'Nama',
    'Kelas',
    'No Absen',
    'Tempat',
    'Tanggal Lahir',
    'Email',
    'Foto',
    'ALAMAT',
    'NO_HP',
    'JENIS_KELAMIN',
    'Status',
    'Wali Kelas',
    'Guru BK',
  ];

  const sourceRows: string[][] = isTemplate
    ? [
        [
          STUDENT_TEMPLATE_SAMPLE.NIS,
          STUDENT_TEMPLATE_SAMPLE.NISN,
          STUDENT_TEMPLATE_SAMPLE.Nama,
          STUDENT_TEMPLATE_SAMPLE.Kelas,
          STUDENT_TEMPLATE_SAMPLE['No Absen'],
          STUDENT_TEMPLATE_SAMPLE.Tempat,
          STUDENT_TEMPLATE_SAMPLE['Tanggal Lahir'],
          STUDENT_TEMPLATE_SAMPLE.Email,
          STUDENT_TEMPLATE_SAMPLE.Foto,
          STUDENT_TEMPLATE_SAMPLE.ALAMAT,
          STUDENT_TEMPLATE_SAMPLE.NO_HP,
          STUDENT_TEMPLATE_SAMPLE.JENIS_KELAMIN,
          STUDENT_TEMPLATE_SAMPLE.Status,
          STUDENT_TEMPLATE_SAMPLE['Wali Kelas'],
          STUDENT_TEMPLATE_SAMPLE['Guru BK'],
        ],
      ]
    : students.map((st) => {
        const { tempat, tanggal } = splitTempatTanggalLahir(st);
        return [
          st.nis,
          st.nisn,
          st.nama_lengkap,
          st.kelas,
          st.no_absen || '',
          tempat,
          tanggal,
          st.email,
          st.foto_url || '',
          st.alamat,
          st.whatsapp,
          st.jenis_kelamin,
          st.status_siswa || 'Aktif',
          st.wali_kelas || '',
          st.guru_bk || '',
        ];
      });

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: headers.map(
        (h) =>
          new TableCell({
            shading: { fill: 'E2E8F0' },
            children: [
              new Paragraph({
                children: [new TextRun({ text: h, bold: true, size: 15 })],
              }),
            ],
          })
      ),
    }),
    ...sourceRows.map(
      (r) =>
        new TableRow({
          children: r.map(
            (val) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: val || '-', size: 15 })],
                  }),
                ],
              })
          ),
        })
    ),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(330),
              height: convertMillimetersToTwip(215),
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: convertMillimetersToTwip(12),
              bottom: convertMillimetersToTwip(12),
              left: convertMillimetersToTwip(12),
              right: convertMillimetersToTwip(12),
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: isTemplate
                  ? 'TEMPLATE IMPORT DATA MURID — WALICONNECT PRO'
                  : 'DATA MURID DAMPINGAN (LAMPIRAN A) — WALICONNECT PRO',
                bold: true,
                size: 26,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: isTemplate
                  ? 'Isi atau tambahkan baris pada tabel di bawah ini, simpan file .docx, lalu unggah ke menu Import Data Murid.'
                  : `Total: ${students.length} Murid · Dicetak pada ${new Date().toLocaleDateString('id-ID')}`,
                italics: true,
                size: 18,
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(
    blob,
    filename ||
      (isTemplate ? 'Template_Data_Murid_WaliConnect.docx' : 'Data_Murid_WaliConnect.docx')
  );
}

async function readDocxTables(file: File): Promise<string[][][]> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) {
    throw new Error('File Word (.docx) tidak valid atau tidak berisi document.xml.');
  }

  const parser = new DOMParser();
  const xml = parser.parseFromString(docXml, 'application/xml');
  const tables = Array.from(xml.getElementsByTagNameNS('*', 'tbl'));

  return tables.map((tbl) => {
    const rows = Array.from(tbl.getElementsByTagNameNS('*', 'tr'));
    return rows.map((tr) => {
      const cells = Array.from(tr.getElementsByTagNameNS('*', 'tc'));
      return cells.map((tc) => {
        const paras = Array.from(tc.getElementsByTagNameNS('*', 'p'));
        return paras
          .map((p) => {
            const texts = Array.from(p.getElementsByTagNameNS('*', 't'));
            return texts.map((t) => t.textContent || '').join('');
          })
          .join('\n')
          .trim();
      });
    });
  });
}

export async function importStudentsFromFile(file: File): Promise<WcStudent[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.docx')) {
    const tables = await readDocxTables(file);
    const out: WcStudent[] = [];
    for (const tbl of tables) {
      if (tbl.length < 2) continue;
      const headers = tbl[0].map((h) => h.trim());
      if (!headers.some((h) => /nama|nis|kelas/i.test(h))) continue;
      for (let i = 1; i < tbl.length; i++) {
        const rowObj: Record<string, string> = {};
        headers.forEach((h, colIdx) => {
          rowObj[h] = tbl[i][colIdx] || '';
        });
        const st = mapRowToStudent(rowObj, out.length);
        if (st) out.push(st);
      }
    }
    if (out.length === 0) {
      throw new Error(
        'Tabel data murid tidak ditemukan di file Word (.docx). Gunakan Template Word (.docx) agar kolom terbaca otomatis.'
      );
    }
    return out;
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName =
      wb.SheetNames.find((n) => /murid|data/i.test(n)) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const out: WcStudent[] = [];
    json.forEach((row, idx) => {
      const st = mapRowToStudent(row, idx);
      if (st) out.push(st);
    });
    if (out.length === 0) {
      throw new Error('Tidak ada baris murid valid pada file Excel/CSV.');
    }
    return out;
  }

  throw new Error('Format file belum didukung untuk import. Gunakan file .xlsx, .xls, .csv, atau .docx.');
}

// ---------- 2. PRINT SYSTEM EXPORT / TEMPLATE / IMPORT ----------

export interface PrintExportContext {
  config: WcPrintConfig;
  selectedDoc: PrintDocumentType;
  students: WcStudent[];
  activeStudent: WcStudent | null;
  logs: WcLog[];
  lampiranBPeriode: EvaluasiPeriode | 'semua';
}

const SHEET_ORDER: SheetKey[] = [
  'sampul',
  'sop',
  'lampiran_a',
  'lampiran_b',
  'lampiran_c',
  'lampiran_d',
  'lampiran_e',
];

function getSheetsToRender(selectedDoc: PrintDocumentType): SheetKey[] {
  return selectedDoc === 'paket_lengkap' ? SHEET_ORDER : [selectedDoc];
}

function getSheetOri(config: WcPrintConfig, sheet: SheetKey): PaperOrientation {
  return config.orientations?.[sheet] ?? 'portrait';
}

function resolvePdfFontName(docFont?: string): 'times' | 'helvetica' {
  if (docFont === 'times' || docFont === 'serif' || docFont === 'georgia') return 'times';
  return 'helvetica';
}

function renderKopPdf(doc: jsPDF, config: WcPrintConfig, pageW: number): number {
  let y = 13;
  const pdfFont = resolvePdfFontName(config.doc_font);
  for (const line of config.kop_lines) {
    const style =
      line.bold && line.italic
        ? 'bolditalic'
        : line.bold
          ? 'bold'
          : line.italic
            ? 'italic'
            : 'normal';
    doc.setFont(pdfFont, style);
    doc.setFontSize(line.fontSize || 10);
    doc.text(line.text || '', pageW / 2, y, { align: 'center' });
    y += Math.max(4.3, (line.fontSize || 10) * 0.42);
  }
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.7);
  doc.line(15, y + 1, pageW - 15, y + 1);
  doc.setLineWidth(0.25);
  doc.line(15, y + 2.2, pageW - 15, y + 2.2);
  return y + 8;
}

function renderSignaturePdf(
  doc: jsPDF,
  config: WcPrintConfig,
  orientation: PaperOrientation,
  startY: number,
  pageW: number
) {
  const sig = getSignatureForOrientation(config, orientation);
  const leftRows = sig.ttd_layout === 'guru_kepsek' ? sig.ttd_right_rows : sig.ttd_left_rows;
  const rightRows = sig.ttd_layout === 'guru_kepsek' ? sig.ttd_left_rows : sig.ttd_right_rows;
  const pdfFont = resolvePdfFontName(config.doc_font);
  const align =
    sig.ttd_align === 'center'
      ? 'center'
      : sig.ttd_align === 'right'
        ? 'right'
        : 'left';

  const shiftMm = (sig.ttd_offset_x || 0) * 0.26;
  const leftShiftMm = (sig.ttd_left_offset_x || 0) * 0.26;
  const rightShiftMm = (sig.ttd_right_offset_x || 0) * 0.26;
  const spacerMm = Math.max(8, (sig.ttd_spacer || 48) * 0.26);

  const renderCol = (rows: SignatureRow[], baseX: number, y0: number) => {
    let y = y0;
    const hasExplicit = rows.some((r) => r.spacerBefore !== undefined);
    const fallbackIdx = Math.max(1, rows.length - 2);
    rows.forEach((r, idx) => {
      const applySpacer =
        r.spacerBefore !== undefined ? r.spacerBefore : !hasExplicit && idx === fallbackIdx;
      if (applySpacer) y += spacerMm;
      doc.setFont(pdfFont, r.bold ? 'bold' : 'normal');
      doc.setFontSize(10);
      doc.text(r.text || '', baseX, y, { align });
      if (r.underline && r.text) {
        const w = doc.getTextWidth(r.text);
        const lineX =
          align === 'center' ? baseX - w / 2 : align === 'right' ? baseX - w : baseX;
        doc.setLineWidth(0.25);
        doc.line(lineX, y + 0.8, lineX + w, y + 0.8);
      }
      y += 4.8;
    });
    return y;
  };

  const margin = 16;
  const colW = (pageW - margin * 2 - 12) / 2;
  const leftBaseX =
    (align === 'center'
      ? margin + colW / 2
      : align === 'right'
        ? margin + colW
        : margin) +
    shiftMm +
    leftShiftMm;
  const rightBaseX =
    (align === 'center'
      ? margin + colW + 12 + colW / 2
      : align === 'right'
        ? pageW - margin
        : margin + colW + 12) +
    shiftMm +
    rightShiftMm;

  if (sig.ttd_layout === 'stacked') {
    const nextY = renderCol(leftRows, leftBaseX, startY + 6);
    renderCol(rightRows, leftBaseX, nextY + 6);
  } else {
    renderCol(leftRows, leftBaseX, startY + 6);
    renderCol(rightRows, rightBaseX, startY + 6);
  }
}

export function exportPrintDocToPdf(ctx: PrintExportContext) {
  const sheets = getSheetsToRender(ctx.selectedDoc);
  const firstOri = getSheetOri(ctx.config, sheets[0]);
  const doc = new jsPDF({
    orientation: firstOri,
    unit: 'mm',
    format: [215, 330],
  });
  const pdfFont = resolvePdfFontName(ctx.config.doc_font);
  const st = ctx.activeStudent ?? ctx.students[0] ?? null;

  sheets.forEach((sheet, sheetIdx) => {
    const ori = getSheetOri(ctx.config, sheet);
    if (sheetIdx > 0) {
      doc.addPage([215, 330], ori);
    }
    const pageW = ori === 'landscape' ? 330 : 215;
    const pageH = ori === 'landscape' ? 215 : 330;

    // Halaman Sampul TANPA Kop Surat
    if (sheet === 'sampul') {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11);
      doc.text('DOKUMEN RESMI PENDAMPINGAN PERWALIAN SEKOLAH', pageW / 2, 48, {
        align: 'center',
      });
      doc.setFontSize(22);
      doc.text('BUKU JURNAL GURU WALI', pageW / 2, 62, { align: 'center' });
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(11.5);
      doc.text(
        'Berdasarkan Peraturan Menteri Pendidikan Dasar dan Menengah Nomor 11 Tahun 2025',
        pageW / 2,
        72,
        { align: 'center' }
      );

      autoTable(doc, {
        startY: 112,
        margin: { left: pageW / 2 - 65, right: pageW / 2 - 65 },
        theme: 'grid',
        body: [
          ['Satuan Pendidikan', `: ${ctx.config.nama_sekolah}`],
          ['Nama Guru Wali', `: ${ctx.config.nama_guru_wali}`],
          ['NIP / NUPTK', `: ${ctx.config.nip_guru_wali}`],
          ['Jumlah Dampingan', `: ${ctx.students.length} Murid Aktif`],
          ['Tahun Ajaran', `: ${ctx.config.tahun_ajaran}`],
        ],
        styles: { font: pdfFont, fontSize: 10.5, cellPadding: 3 },
      });

      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(10.5);
      doc.text(ctx.config.nama_sekolah, pageW / 2, pageH - 28, { align: 'center' });
      doc.setFont(pdfFont, 'normal');
      doc.text(`Tahun Pelajaran ${ctx.config.tahun_ajaran}`, pageW / 2, pageH - 22, {
        align: 'center',
      });
      return;
    }

    let y = renderKopPdf(doc, ctx.config, pageW);

    if (sheet === 'sop') {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('STANDAR OPERASIONAL PROSEDUR (SOP) GURU WALI', pageW / 2, y, {
        align: 'center',
      });
      y += 5;
      doc.setFont(pdfFont, 'italic');
      doc.setFontSize(9.5);
      doc.text(
        'Implementasi Tugas Pendampingan Murid Sesuai Permendikdasmen Nomor 11 Tahun 2025',
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 7;

      autoTable(doc, {
        startY: y,
        head: [['No', 'Tahapan Prosedur', 'Aktivitas Utama & Bukti Fisik']],
        body: [
          ['1', 'Pemetaan Profil Awal', 'Pengisian identitas lengkap & rencana pasca-lulus (Lampiran A) serta formulir BK.'],
          ['2', 'Penyusunan Jadwal Pendampingan', 'Penetapan jadwal tatap muka rutin minimal 9 sesi per semester (Lampiran D).'],
          ['3', 'Sesi Pertemuan Perwalian', 'Pelaksanaan konseling ringan, motivasi belajar, & pencatatan jurnal (Lampiran C).'],
          ['4', 'Evaluasi 5 Aspek Berkala', 'Penilaian akademik, karakter, sosial-emosional, disiplin, & minat (Lampiran B).'],
          ['5', 'Koordinasi Orang Tua & BK', 'Komunikasi dua arah orang tua serta rujukan kasus khusus ke koordinator BK.'],
          ['6', 'Pelaporan & Pengarsipan SOP', 'Verifikasi dan pengesahan Buku Jurnal Guru Wali oleh Kepala Sekolah.'],
        ],
        styles: { font: pdfFont, fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
      autoTable(doc, {
        startY: y,
        head: [['No', 'Nama Murid', 'Kelas', 'Hadir', 'Target Pasca Lulus']],
        body: ctx.students.map((s, idx) => [
          idx + 1,
          s.nama_lengkap,
          s.kelas,
          `${calcAttendancePct(s.kehadiran)}%`,
          `${s.rencana_lulus || '-'} (${s.prodi_pilihan || '-'})`,
        ]),
        styles: { font: pdfFont, fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW);
    } else if (sheet === 'lampiran_a' && st) {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('LAMPIRAN A — IDENTITAS MURID DAMPINGAN', pageW / 2, y, { align: 'center' });
      y += 5;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(`Tahun Ajaran ${ctx.config.tahun_ajaran}`, pageW / 2, y, { align: 'center' });
      y += 5;

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        body: [
          ['Nama Lengkap', st.nama_lengkap],
          ['Nama Panggilan', st.nama_panggilan],
          ['Jenis Kelamin', st.jenis_kelamin === 'L' ? 'Laki-Laki' : 'Perempuan'],
          ['Kelas / NIS / NISN', `${st.kelas} / ${st.nis} / ${st.nisn || '-'}`],
          ['Tempat, Tanggal Lahir', st.ttl || '-'],
          ['Agama / Hobi', `${st.agama || '-'} / ${st.hobi || '-'}`],
          ['WhatsApp / Email', `${st.whatsapp || '-'} / ${st.email || '-'}`],
          ['Alamat Domisili', st.alamat || '-'],
          ['Nama & Pekerjaan Ayah', `${st.nama_ayah || '-'} (${st.pekerjaan_ayah || '-'})`],
          ['Nama & Pekerjaan Ibu', `${st.nama_ibu || '-'} (${st.pekerjaan_ibu || '-'})`],
          ['Alamat & Kontak Ortu', `${st.alamat_ortu || '-'} · ${st.kontak_ortu || '-'}`],
          ['Deskripsi Diri', st.deskripsi_diri || '-'],
          ['Rencana Pasca Lulus', `${st.rencana_lulus || '-'} · ${st.prodi_pilihan || '-'}`],
          ['Langkah Pencapaian', st.langkah_pencapaian || '-'],
          ['Catatan Khusus Siswa', st.catatan_khusus || '-'],
        ],
        styles: { font: pdfFont, fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW);
    } else if (sheet === 'lampiran_b' && st) {
      const isAll = ctx.lampiranBPeriode === 'semua';
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('LAMPIRAN B — CATATAN PERKEMBANGAN MURID (5 ASPEK)', pageW / 2, y, {
        align: 'center',
      });
      y += 5;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(
        `Nama: ${st.nama_lengkap} · Kelas: ${st.kelas} · Periode: ${
          isAll ? '3 Bulan, 6 Bulan, 9 Bulan & 1 Tahun' : ctx.lampiranBPeriode
        }`,
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 6;

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

      if (ctx.lampiranBPeriode === 'semua') {
        autoTable(doc, {
          startY: y,
          head: [['No', 'Aspek', ...EVALUASI_PERIODES.map((p) => p.label)]],
          body: aspectRows.map((r) => [
            r.no,
            r.label,
            ...EVALUASI_PERIODES.map(
              (p) => getSnapshotForPeriode(st.perkembangan, p.value)[r.key] || '-'
            ),
          ]),
          styles: { font: pdfFont, fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
        });
      } else {
        const snap = getSnapshotForPeriode(st.perkembangan, ctx.lampiranBPeriode);
        autoTable(doc, {
          startY: y,
          head: [
            ['No', 'Aspek Perkembangan', `Catatan Capaian & Pembinaan (${ctx.lampiranBPeriode})`],
          ],
          body: aspectRows.map((r) => [r.no, r.label, snap[r.key] || '-']),
          styles: { font: pdfFont, fontSize: 9.2, cellPadding: 2.8 },
          headStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
        });
      }
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW);
    } else if (sheet === 'lampiran_c') {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('LAMPIRAN C — REKAP PERTEMUAN & JURNAL PERWALIAN', pageW / 2, y, {
        align: 'center',
      });
      y += 5;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(`Tahun Ajaran ${ctx.config.tahun_ajaran}`, pageW / 2, y, { align: 'center' });
      y += 6;

      autoTable(doc, {
        startY: y,
        head: [['No', 'Tanggal / Sesi', 'Murid & Bidang', 'Topik & Uraian', 'Tindak Lanjut']],
        body: ctx.logs.map((l, idx) => [
          idx + 1,
          `${l.tanggal}\nSesi ${l.sesi_ke}`,
          `${l.student_name}\n${l.kategori}`,
          `${l.topik}\n${l.uraian}`,
          l.tindak_lanjut || '-',
        ]),
        styles: { font: pdfFont, fontSize: 8.5, cellPadding: 2 },
        headStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW);
    } else if (sheet === 'lampiran_d') {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(12);
      doc.text('LAMPIRAN D — DAFTAR HADIR PERTEMUAN PERWALIAN (SESI 1–9)', pageW / 2, y, {
        align: 'center',
      });
      y += 5;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(`Tahun Ajaran ${ctx.config.tahun_ajaran}`, pageW / 2, y, { align: 'center' });
      y += 6;

      autoTable(doc, {
        startY: y,
        head: [['No', 'Nama Murid', 'Kelas', '1', '2', '3', '4', '5', '6', '7', '8', '9', '%']],
        body: ctx.students.map((s, idx) => [
          idx + 1,
          s.nama_lengkap,
          s.kelas,
          ...Array.from({ length: 9 }, (_, i) => (s.kehadiran?.[i] ? 'v' : '-')),
          `${calcAttendancePct(s.kehadiran)}%`,
        ]),
        styles: { font: pdfFont, fontSize: 8.5, cellPadding: 2 },
        headStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW);
    } else if (sheet === 'lampiran_e' && st) {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11.5);
      doc.text(
        'LAMPIRAN E — FORMULIR DATA DETAIL PESERTA DIDIK (BK)',
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 5;
      doc.setFont(pdfFont, 'italic');
      doc.setFontSize(9);
      doc.text(
        `Murid: ${st.nama_lengkap} (${st.kelas}) — Rahasia Profesional Layanan Bimbingan & Konseling`,
        pageW / 2,
        y,
        { align: 'center' }
      );
      y += 6;

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        body: [
          [
            'Bagian A (Identitas & Keluarga)',
            `Anak ke-${st.bk_detail?.a7_anak_ke || '-'} dari ${st.bk_detail?.a8_jumlah_saudara || '-'} bersaudara · Tinggal bersama: ${st.bk_detail?.a10_tinggal_bersama || '-'} · Kontak Darurat: ${st.bk_detail?.a18_wali_kontak_darurat || '-'}`,
          ],
          [
            'Bagian B (Kesehatan Fisik & Psikis)',
            `TB/BB: ${st.bk_detail?.b_tinggi_berat || '-'} · Gol. Darah: ${st.bk_detail?.b_golongan_darah || '-'} · Riwayat: ${st.bk_detail?.b_riwayat_penyakit || '-'} · Psikis: ${st.bk_detail?.b_kondisi_psikis || '-'}`,
          ],
          [
            'Bagian C (Akademik & Belajar)',
            `Disukai: ${st.bk_detail?.c_mapel_disukai || '-'} · Sulit: ${st.bk_detail?.c_mapel_sulit || '-'} · Hambatan: ${st.bk_detail?.c_hambatan_akademik || '-'}`,
          ],
          [
            'Bagian D (Pribadi & Sosial)',
            `Kelebihan: ${st.bk_detail?.d_sifat_kelebihan || '-'} · Organisasi: ${st.bk_detail?.d_organisasi_ekskul || '-'}`,
          ],
          [
            'Bagian E (Karir & Masa Depan)',
            `Cita-cita: ${st.bk_detail?.e_cita_cita || '-'} · Rencana: ${st.bk_detail?.e_rencana_setelah_lulus || '-'} · Pilihan: ${st.bk_detail?.e_pilihan_studi_kerja || '-'}`,
          ],
          [
            'Bagian F (Harapan Layanan BK)',
            `Harapan: ${st.bk_detail?.f_harapan_layanan_bk || '-'} · Topik: ${st.bk_detail?.f_topik_konseling_diinginkan || '-'} · Kesediaan Ortu: ${st.bk_detail?.f_kesediaan_orang_tua || '-'}`,
          ],
        ],
        styles: { font: pdfFont, fontSize: 8.5, cellPadding: 2.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;
      renderSignaturePdf(doc, ctx.config, ori, y, pageW);
    }
  });

  doc.save(`Laporan_SOP_F4_${ctx.selectedDoc}.pdf`);
}

function buildKopWordParagraphs(config: WcPrintConfig): Paragraph[] {
  const paras: Paragraph[] = config.kop_lines.map(
    (line, idx) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: idx === config.kop_lines.length - 1 ? 80 : 20 },
        border:
          idx === config.kop_lines.length - 1
            ? {
                bottom: {
                  style: BorderStyle.DOUBLE,
                  size: 12,
                  color: '0F172A',
                },
              }
            : undefined,
        children: [
          new TextRun({
            text: line.text || '',
            bold: line.bold,
            italics: line.italic,
            underline: line.underline ? {} : undefined,
            size: Math.round((line.fontSize || 10) * 2),
          }),
        ],
      })
  );
  return paras;
}

function buildSignatureWordNodes(
  config: WcPrintConfig,
  orientation: PaperOrientation
): (Paragraph | Table)[] {
  const sig = getSignatureForOrientation(config, orientation);
  const leftRows = sig.ttd_layout === 'guru_kepsek' ? sig.ttd_right_rows : sig.ttd_left_rows;
  const rightRows = sig.ttd_layout === 'guru_kepsek' ? sig.ttd_left_rows : sig.ttd_right_rows;
  const align =
    sig.ttd_align === 'center'
      ? AlignmentType.CENTER
      : sig.ttd_align === 'right'
        ? AlignmentType.RIGHT
        : sig.ttd_align === 'justify'
          ? AlignmentType.JUSTIFIED
          : AlignmentType.LEFT;

  const toParas = (rows: SignatureRow[]) => {
    const hasExplicit = rows.some((r) => r.spacerBefore !== undefined);
    const fallbackIdx = Math.max(1, rows.length - 2);
    return rows.map((r, idx) => {
      const applySpacer =
        r.spacerBefore !== undefined ? r.spacerBefore : !hasExplicit && idx === fallbackIdx;
      return new Paragraph({
        alignment: align,
        spacing: {
          before: applySpacer ? Math.round((sig.ttd_spacer || 48) * 15) : 30,
          after: 20,
        },
        children: [
          new TextRun({
            text: r.text || ' ',
            bold: r.bold,
            underline: r.underline ? {} : undefined,
            size: 21,
          }),
        ],
      });
    });
  };

  if (sig.ttd_layout === 'stacked') {
    return [
      new Paragraph({ spacing: { before: 240 }, children: [] }),
      ...toParas(leftRows),
      new Paragraph({ spacing: { before: 180 }, children: [] }),
      ...toParas(rightRows),
    ];
  }

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  return [
    new Paragraph({ spacing: { before: 240 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        ...noBorders,
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: noBorders,
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: toParas(leftRows),
            }),
            new TableCell({
              borders: noBorders,
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: toParas(rightRows),
            }),
          ],
        }),
      ],
    }),
  ];
}

function makeWordTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (h) =>
            new TableCell({
              shading: { fill: 'F1F5F9' },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true, size: 18 })],
                }),
              ],
            })
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map(
              (cell) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: cell || '-', size: 18 })],
                    }),
                  ],
                })
            ),
          })
      ),
    ],
  });
}

export async function exportPrintDocToWord(ctx: PrintExportContext) {
  const sheets = getSheetsToRender(ctx.selectedDoc);
  const st = ctx.activeStudent ?? ctx.students[0] ?? null;

  const sections = sheets.map((sheet) => {
    const ori = getSheetOri(ctx.config, sheet);
    const isLandscape = ori === 'landscape';
    const children: (Paragraph | Table)[] = [];

    if (sheet === 'sampul') {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 1200, after: 120 },
          children: [
            new TextRun({
              text: 'DOKUMEN RESMI PENDAMPINGAN PERWALIAN SEKOLAH',
              bold: true,
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: 'BUKU JURNAL GURU WALI', bold: true, size: 42 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [
            new TextRun({
              text: 'Berdasarkan Peraturan Menteri Pendidikan Dasar dan Menengah Nomor 11 Tahun 2025',
              bold: true,
              size: 22,
            }),
          ],
        }),
        makeWordTable(
          ['Keterangan', 'Isian'],
          [
            ['Satuan Pendidikan', ctx.config.nama_sekolah],
            ['Nama Guru Wali', ctx.config.nama_guru_wali],
            ['NIP / NUPTK', ctx.config.nip_guru_wali],
            ['Jumlah Dampingan', `${ctx.students.length} Murid Aktif`],
            ['Tahun Ajaran', ctx.config.tahun_ajaran],
          ]
        )
      );
    } else {
      children.push(...buildKopWordParagraphs(ctx.config));
      children.push(new Paragraph({ spacing: { before: 120 }, children: [] }));

      if (sheet === 'sop') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: 'STANDAR OPERASIONAL PROSEDUR (SOP) GURU WALI',
                bold: true,
                size: 26,
              }),
            ],
          }),
          makeWordTable(
            ['No', 'Tahapan Prosedur', 'Aktivitas Utama & Bukti Fisik'],
            [
              ['1', 'Pemetaan Profil Awal', 'Identitas murid & rencana pasca-lulus (Lampiran A) serta formulir BK.'],
              ['2', 'Penyusunan Jadwal Pendampingan', 'Jadwal tatap muka minimal 9 sesi per semester (Lampiran D).'],
              ['3', 'Sesi Pertemuan Perwalian', 'Konseling ringan, motivasi belajar & pencatatan jurnal (Lampiran C).'],
              ['4', 'Evaluasi 5 Aspek Berkala', 'Penilaian 5 aspek periode 3, 6, 9 bulan & 1 tahun (Lampiran B).'],
              ['5', 'Koordinasi Orang Tua & BK', 'Komunikasi dua arah orang tua serta rujukan kasus khusus ke tim BK.'],
              ['6', 'Pelaporan & Pengarsipan SOP', 'Verifikasi dan pengesahan Buku Jurnal oleh Kepala Sekolah.'],
            ]
          )
        );
      } else if (sheet === 'lampiran_a' && st) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: 'LAMPIRAN A — IDENTITAS MURID DAMPINGAN',
                bold: true,
                size: 24,
              }),
            ],
          }),
          makeWordTable(
            ['Bidang Data', 'Keterangan'],
            [
              ['Nama Lengkap', st.nama_lengkap],
              ['Kelas / NIS / NISN', `${st.kelas} / ${st.nis} / ${st.nisn || '-'}`],
              ['Tempat, Tanggal Lahir', st.ttl || '-'],
              ['WhatsApp / Email', `${st.whatsapp || '-'} / ${st.email || '-'}`],
              ['Orang Tua', `${st.nama_ayah || '-'} & ${st.nama_ibu || '-'} (${st.kontak_ortu || '-'})`],
              ['Rencana Pasca Lulus', `${st.rencana_lulus || '-'} · ${st.prodi_pilihan || '-'}`],
              ['Langkah Pencapaian', st.langkah_pencapaian || '-'],
            ]
          )
        );
      } else if (sheet === 'lampiran_b' && st) {
        const isAll = ctx.lampiranBPeriode === 'semua';
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: `LAMPIRAN B — CATATAN PERKEMBANGAN MURID (${
                  isAll ? '3 Bln, 6 Bln, 9 Bln & 1 Thn' : ctx.lampiranBPeriode
                })`,
                bold: true,
                size: 24,
              }),
            ],
          })
        );
        const rowsMeta: {
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
        if (ctx.lampiranBPeriode === 'semua') {
          children.push(
            makeWordTable(
              ['No', 'Aspek', ...EVALUASI_PERIODES.map((p) => p.label)],
              rowsMeta.map((r) => [
                r.no,
                r.label,
                ...EVALUASI_PERIODES.map(
                  (p) => getSnapshotForPeriode(st.perkembangan, p.value)[r.key] || '-'
                ),
              ])
            )
          );
        } else {
          const snap = getSnapshotForPeriode(st.perkembangan, ctx.lampiranBPeriode);
          children.push(
            makeWordTable(
              ['No', 'Aspek Perkembangan', `Catatan (${ctx.lampiranBPeriode})`],
              rowsMeta.map((r) => [r.no, r.label, snap[r.key] || '-'])
            )
          );
        }
      } else if (sheet === 'lampiran_c') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: 'LAMPIRAN C — REKAP PERTEMUAN & JURNAL PERWALIAN',
                bold: true,
                size: 24,
              }),
            ],
          }),
          makeWordTable(
            ['No', 'Tanggal / Sesi', 'Murid & Bidang', 'Topik & Uraian', 'Tindak Lanjut'],
            ctx.logs.map((l, idx) => [
              String(idx + 1),
              `${l.tanggal} (Sesi ${l.sesi_ke})`,
              `${l.student_name} (${l.kategori})`,
              `${l.topik}: ${l.uraian}`,
              l.tindak_lanjut || '-',
            ])
          )
        );
      } else if (sheet === 'lampiran_d') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: 'LAMPIRAN D — DAFTAR HADIR PERTEMUAN PERWALIAN (SESI 1–9)',
                bold: true,
                size: 24,
              }),
            ],
          }),
          makeWordTable(
            ['No', 'Nama Murid', 'Kelas', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', '%'],
            ctx.students.map((s, idx) => [
              String(idx + 1),
              s.nama_lengkap,
              s.kelas,
              ...Array.from({ length: 9 }, (_, i) => (s.kehadiran?.[i] ? '✓' : '-')),
              `${calcAttendancePct(s.kehadiran)}%`,
            ])
          )
        );
      } else if (sheet === 'lampiran_e' && st) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: `LAMPIRAN E — FORMULIR DETAIL BK (${st.nama_lengkap})`,
                bold: true,
                size: 24,
              }),
            ],
          }),
          makeWordTable(
            ['Bagian BK', 'Ringkasan Data'],
            [
              ['Bagian A (Keluarga)', `Tinggal: ${st.bk_detail?.a10_tinggal_bersama || '-'} · Kontak: ${st.bk_detail?.a18_wali_kontak_darurat || '-'}`],
              ['Bagian B (Kesehatan)', `TB/BB: ${st.bk_detail?.b_tinggi_berat || '-'} · Psikis: ${st.bk_detail?.b_kondisi_psikis || '-'}`],
              ['Bagian C (Akademik)', `Mapel Disukai: ${st.bk_detail?.c_mapel_disukai || '-'} · Hambatan: ${st.bk_detail?.c_hambatan_akademik || '-'}`],
              ['Bagian D (Sosial)', `Kelebihan: ${st.bk_detail?.d_sifat_kelebihan || '-'} · Ekskul: ${st.bk_detail?.d_organisasi_ekskul || '-'}`],
              ['Bagian E (Karir)', `Cita-cita: ${st.bk_detail?.e_cita_cita || '-'} · Pilihan: ${st.bk_detail?.e_pilihan_studi_kerja || '-'}`],
              ['Bagian F (Harapan BK)', `Harapan: ${st.bk_detail?.f_harapan_layanan_bk || '-'}`],
            ]
          )
        );
      }

      children.push(...buildSignatureWordNodes(ctx.config, ori));
    }

    return {
      properties: {
        page: {
          size: {
            width: convertMillimetersToTwip(isLandscape ? 330 : 215),
            height: convertMillimetersToTwip(isLandscape ? 215 : 330),
            orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
          margin: {
            top: convertMillimetersToTwip(14),
            bottom: convertMillimetersToTwip(14),
            left: convertMillimetersToTwip(16),
            right: convertMillimetersToTwip(16),
          },
        },
      },
      children,
    };
  });

  const doc = new Document({ sections });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `Laporan_SOP_F4_${ctx.selectedDoc}.docx`);
}

export function exportPrintReportXls(ctx: PrintExportContext, isTemplate = false) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Identitas & Kop Surat (editable template & export)
  const configRows: Record<string, string | number>[] = [
    { Field: 'Nama Sekolah', Nilai: ctx.config.nama_sekolah },
    { Field: 'Tahun Ajaran', Nilai: ctx.config.tahun_ajaran },
    { Field: 'Tempat & Tanggal', Nilai: ctx.config.tempat_tanggal },
    { Field: 'Nama Guru Wali', Nilai: ctx.config.nama_guru_wali },
    { Field: 'NIP Guru Wali', Nilai: ctx.config.nip_guru_wali },
    { Field: 'Nama Kepala Sekolah', Nilai: ctx.config.nama_kepsek },
    { Field: 'NIP Kepala Sekolah', Nilai: ctx.config.nip_kepsek },
    ...ctx.config.kop_lines.map((line, i) => ({
      Field: `Kop Baris ${i + 1}`,
      Nilai: line.text,
    })),
  ];
  const wsConfig = XLSX.utils.json_to_sheet(configRows);
  wsConfig['!cols'] = [{ wch: 24 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsConfig, 'Identitas_Kop');

  // Sheet 2: Lampiran A (Data Murid)
  const studentRows = (ctx.students.length > 0 ? ctx.students : []).map(getStudentExportColumns);
  const wsMurid = XLSX.utils.json_to_sheet(
    studentRows.length > 0 ? studentRows : [STUDENT_TEMPLATE_SAMPLE]
  );
  XLSX.utils.book_append_sheet(wb, wsMurid, 'Data_Murid');

  if (!isTemplate) {
    // Sheet 3: Lampiran B (5 Aspek 4 Periode)
    const aspekRows: Record<string, string>[] = [];
    ctx.students.forEach((st) => {
      EVALUASI_PERIODES.forEach((p) => {
        const snap = getSnapshotForPeriode(st.perkembangan, p.value);
        aspekRows.push({
          'Nama Murid': st.nama_lengkap,
          Kelas: st.kelas,
          Periode: p.label,
          Akademik: snap.akademik || '-',
          Karakter: snap.karakter || '-',
          'Sosial-Emosional': snap.sosial_emosional || '-',
          Kedisiplinan: snap.kedisiplinan || '-',
          'Potensi & Minat': snap.potensi_minat || '-',
        });
      });
    });
    const wsAspek = XLSX.utils.json_to_sheet(aspekRows);
    XLSX.utils.book_append_sheet(wb, wsAspek, 'Lampiran_B_5_Aspek');

    // Sheet 4: Lampiran C (Jurnal)
    const logRows = ctx.logs.map((l, idx) => ({
      No: idx + 1,
      Tanggal: l.tanggal,
      Sesi: l.sesi_ke,
      Murid: l.student_name,
      Bidang: l.kategori,
      Topik: l.topik,
      Uraian: l.uraian,
      'Tindak Lanjut': l.tindak_lanjut,
      Status: l.status_kanban,
    }));
    const wsLogs = XLSX.utils.json_to_sheet(logRows);
    XLSX.utils.book_append_sheet(wb, wsLogs, 'Lampiran_C_Jurnal');

    // Sheet 5: Lampiran D (Daftar Hadir 1-9)
    const attRows = ctx.students.map((st, idx) => ({
      No: idx + 1,
      'Nama Murid': st.nama_lengkap,
      Kelas: st.kelas,
      P1: st.kehadiran?.[0] ? 'Hadir' : '-',
      P2: st.kehadiran?.[1] ? 'Hadir' : '-',
      P3: st.kehadiran?.[2] ? 'Hadir' : '-',
      P4: st.kehadiran?.[3] ? 'Hadir' : '-',
      P5: st.kehadiran?.[4] ? 'Hadir' : '-',
      P6: st.kehadiran?.[5] ? 'Hadir' : '-',
      P7: st.kehadiran?.[6] ? 'Hadir' : '-',
      P8: st.kehadiran?.[7] ? 'Hadir' : '-',
      P9: st.kehadiran?.[8] ? 'Hadir' : '-',
      'Persentase (%)': calcAttendancePct(st.kehadiran),
    }));
    const wsAtt = XLSX.utils.json_to_sheet(attRows);
    XLSX.utils.book_append_sheet(wb, wsAtt, 'Lampiran_D_Presensi');
  }

  XLSX.writeFile(
    wb,
    isTemplate
      ? 'Template_Cetak_SOP_F4_WaliConnect.xlsx'
      : `Laporan_Cetak_SOP_F4_${ctx.selectedDoc}.xlsx`
  );
}

export async function downloadPrintTemplateWord(config: WcPrintConfig) {
  const rows: [string, string][] = [
    ['Nama Sekolah', config.nama_sekolah],
    ['Tahun Ajaran', config.tahun_ajaran],
    ['Tempat & Tanggal', config.tempat_tanggal],
    ['Nama Guru Wali', config.nama_guru_wali],
    ['NIP Guru Wali', config.nip_guru_wali],
    ['Nama Kepala Sekolah', config.nama_kepsek],
    ['NIP Kepala Sekolah', config.nip_kepsek],
    ...config.kop_lines.map((line, i): [string, string] => [`Kop Baris ${i + 1}`, line.text]),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(215),
              height: convertMillimetersToTwip(330),
              orientation: PageOrientation.PORTRAIT,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: 'TEMPLATE KONFIGURASI CETAK & KOP SURAT F4 — WALICONNECT PRO',
                bold: true,
                size: 26,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: 'Ubah kolom Nilai di bawah, simpan sebagai .docx, lalu unggah kembali lewat tombol Import XLS / Word.',
                italics: true,
                size: 18,
              }),
            ],
          }),
          makeWordTable(['Field', 'Nilai'], rows),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, 'Template_Cetak_SOP_F4_WaliConnect.docx');
}

export interface ImportedPrintPayload {
  configPatch: Partial<WcPrintConfig>;
  importedStudents: WcStudent[];
}

function applyKeyValueConfigRows(
  pairs: { field: string; val: string }[],
  currentConfig: WcPrintConfig
): Partial<WcPrintConfig> {
  const patch: Partial<WcPrintConfig> = {};
  const nextKop: KopLine[] = currentConfig.kop_lines.map((l) => ({ ...l }));

  pairs.forEach(({ field, val }) => {
    const f = field.trim().toLowerCase();
    const v = val.trim();
    if (!v) return;
    if (f.includes('nama sekolah')) patch.nama_sekolah = v;
    else if (f.includes('tahun ajaran')) patch.tahun_ajaran = v;
    else if (f.includes('tempat')) patch.tempat_tanggal = v;
    else if (f.includes('nama guru')) patch.nama_guru_wali = v;
    else if (f.includes('nip guru')) patch.nip_guru_wali = v;
    else if (f.includes('nama kepala') || f.includes('nama kepsek')) patch.nama_kepsek = v;
    else if (f.includes('nip kepala') || f.includes('nip kepsek')) patch.nip_kepsek = v;
    else {
      const m = f.match(/kop baris\s*(\d+)/);
      if (m) {
        const idx = Number(m[1]) - 1;
        if (idx >= 0 && idx < nextKop.length) {
          nextKop[idx] = { ...nextKop[idx], text: v };
          patch.kop_lines = nextKop;
        }
      }
    }
  });

  return patch;
}

export async function importPrintTemplateFromFile(
  file: File,
  currentConfig: WcPrintConfig
): Promise<ImportedPrintPayload> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.docx')) {
    const tables = await readDocxTables(file);
    const pairs: { field: string; val: string }[] = [];
    const importedStudents: WcStudent[] = [];

    tables.forEach((tbl) => {
      if (tbl.length < 2) return;
      const h0 = tbl[0].map((c) => c.toLowerCase());
      if (h0.some((c) => c.includes('field')) && h0.some((c) => c.includes('nilai'))) {
        for (let i = 1; i < tbl.length; i++) {
          pairs.push({ field: tbl[i][0] || '', val: tbl[i][1] || '' });
        }
      } else if (h0.some((c) => /nama|nis|kelas/i.test(c))) {
        const headers = tbl[0];
        for (let i = 1; i < tbl.length; i++) {
          const obj: Record<string, string> = {};
          headers.forEach((h, ci) => {
            obj[h] = tbl[i][ci] || '';
          });
          const st = mapRowToStudent(obj, importedStudents.length);
          if (st) importedStudents.push(st);
        }
      }
    });

    const configPatch = applyKeyValueConfigRows(pairs, currentConfig);
    if (Object.keys(configPatch).length === 0 && importedStudents.length === 0) {
      throw new Error(
        'Format tabel pada file Word (.docx) tidak dikenali. Gunakan Template Word Cetak F4.'
      );
    }
    return { configPatch, importedStudents };
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    let configPatch: Partial<WcPrintConfig> = {};
    const importedStudents: WcStudent[] = [];

    const cfgSheetName = wb.SheetNames.find((n) => /identitas|kop|konfig/i.test(n));
    if (cfgSheetName) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[cfgSheetName], {
        defval: '',
      });
      const pairs = rows.map((r) => ({
        field: String(r.Field ?? r.field ?? Object.values(r)[0] ?? ''),
        val: String(r.Nilai ?? r.nilai ?? Object.values(r)[1] ?? ''),
      }));
      configPatch = applyKeyValueConfigRows(pairs, currentConfig);
    }

    const muridSheetName = wb.SheetNames.find((n) => /murid|data/i.test(n));
    if (muridSheetName) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[muridSheetName], {
        defval: '',
      });
      rows.forEach((r, idx) => {
        const st = mapRowToStudent(r, idx);
        if (st) importedStudents.push(st);
      });
    }

    if (Object.keys(configPatch).length === 0 && importedStudents.length === 0) {
      throw new Error('Tidak ditemukan data Identitas/Kop atau Data Murid valid pada file Excel.');
    }
    return { configPatch, importedStudents };
  }

  throw new Error('Format file import harus .xlsx, .xls, .csv, atau .docx.');
}
