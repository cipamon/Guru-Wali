import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '5mb' }));

function isPrivateOrDisallowedIp(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(normalized)) {
    const lower = normalized.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80') || lower.startsWith('ff')) return true;
    return false;
  }
  return true;
}

async function validateExternalImageUrl(rawUrl: string): Promise<URL> {
  if (!rawUrl || rawUrl.length > 2048) {
    throw new Error('URL gambar tidak valid atau terlalu panjang.');
  }
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Hanya skema http/https yang diizinkan.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL dengan kredensial tidak diizinkan.');
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Host internal tidak diizinkan.');
  }
  if (net.isIP(host)) {
    if (isPrivateOrDisallowedIp(host)) {
      throw new Error('Alamat IP privat tidak diizinkan.');
    }
    return parsed;
  }
  const records = await dns.lookup(host, { all: true });
  if (!records || records.length === 0) {
    throw new Error('Host tidak dapat diresolusi.');
  }
  for (const rec of records) {
    if (isPrivateOrDisallowedIp(rec.address)) {
      throw new Error('Alamat IP tujuan tidak diizinkan.');
    }
  }
  return parsed;
}

function detectImageMimeFromBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

app.get('/api/image-proxy', async (req, res) => {
  try {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    let currentUrl = await validateExternalImageUrl(rawUrl);

    let finalResponse: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      const resp = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });

      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) {
          return res.status(502).json({ error: 'Redirect gambar tidak memiliki tujuan.' });
        }
        const resolved = new URL(loc, currentUrl);
        currentUrl = await validateExternalImageUrl(resolved.toString());
        continue;
      }

      finalResponse = resp;
      break;
    }

    if (!finalResponse || !finalResponse.ok) {
      return res.status(finalResponse?.status || 502).json({ error: 'Gagal mengunduh gambar.' });
    }

    const contentLength = Number(finalResponse.headers.get('content-length') || 0);
    const MAX_BYTES = 5 * 1024 * 1024;
    if (contentLength > MAX_BYTES) {
      return res.status(413).json({ error: 'Ukuran gambar melebihi batas 5MB.' });
    }

    const arrayBuf = await finalResponse.arrayBuffer();
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_BYTES) {
      return res.status(413).json({ error: 'Ukuran gambar tidak valid.' });
    }

    const buffer = Buffer.from(arrayBuf);
    const headerMime = (finalResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const sniffedMime = detectImageMimeFromBytes(buffer);
    const mime =
      headerMime.startsWith('image/') && !headerMime.includes('svg')
        ? headerMime
        : sniffedMime;

    if (!mime) {
      return res.status(415).json({ error: 'Konten URL bukan gambar raster yang didukung.' });
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(buffer);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Gagal memuat proxy gambar.';
    return res.status(400).json({ error: msg });
  }
});

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi pada environment server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateWithFallback(
  params: Parameters<InstanceType<typeof GoogleGenAI>['models']['generateContent']>[0]
) {
  const ai = getGeminiClient();
  try {
    return await ai.models.generateContent({
      ...params,
      model: 'gemini-3-flash-preview',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status;
    if (status === 404 || msg.includes('404') || msg.includes('NOT_FOUND')) {
      return await ai.models.generateContent({
        ...params,
        model: 'gemini-4-hydrogen',
      });
    }
    throw err;
  }
}

app.post('/api/ai/tindak-lanjut', async (req, res) => {
  try {
    const { studentName, kelas, kategori, topik, uraian } = req.body as {
      studentName?: string;
      kelas?: string;
      kategori?: string;
      topik?: string;
      uraian?: string;
    };

    if (!topik && !uraian) {
      return res.status(400).json({ error: 'Topik atau uraian pertemuan wajib diisi sebelum meminta saran AI.' });
    }

    const prompt = `Anda adalah Guru Wali dan Konselor Sekolah berpengalaman sesuai Permendikdasmen No. 11 Tahun 2025.
Susun rencana tindak lanjut (RTL) perwalian yang konkret, empatik, terukur, dan praktis dalam bahasa Indonesia baku namun hangat.

Data Pertemuan:
- Nama Murid: ${studentName || 'Murid Dampingan'}
- Kelas: ${kelas || '-'}
- Kategori Pendampingan: ${kategori || 'Umum'}
- Topik Pertemuan: ${topik || '-'}
- Uraian Permasalahan/Catatan: ${uraian || '-'}

Format keluaran:
Tuliskan 3 sampai 4 poin langkah tindak lanjut konkret (untuk guru wali, murid, dan koordinasi orang tua/BK bila relevan) dalam 1 paragraf ringkas atau daftar bernomor singkat tanpa markdown berlebihan.`;

    const response = await generateWithFallback({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction:
          'Berikan rekomendasi tindak lanjut pedagogis dan psikopedagogis yang realistis untuk sekolah menengah Indonesia, maksimal 160 kata.',
      },
    });

    res.json({ text: (response.text ?? '').trim() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghubungi Gemini AI.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/langkah-lulus', async (req, res) => {
  try {
    const { nama, kelas, rencanaLulus, prodiPilihan, deskripsiDiri, hobi } = req.body as {
      nama?: string;
      kelas?: string;
      rencanaLulus?: string;
      prodiPilihan?: string;
      deskripsiDiri?: string;
      hobi?: string;
    };

    const prompt = `Anda adalah Guru Wali yang membimbing perencanaan karir dan masa depan murid SMA/SMK.
Bantu susun langkah pencapaian konkret bagi murid berikut sesuai Lampiran A Jurnal Perwalian:
- Nama Murid: ${nama || 'Murid'}
- Kelas: ${kelas || '-'}
- Pilihan Pasca-Lulus: ${rencanaLulus || 'Kuliah'}
- Program Studi / Bidang Tujuan: ${prodiPilihan || '-'}
- Deskripsi Diri & Minat: ${deskripsiDiri || '-'}
- Hobi / Potensi: ${hobi || '-'}

Susun 4 langkah strategis bertahap (jangka pendek semester ini hingga persiapan kelulusan) yang realistis dan memotivasi dalam bahasa Indonesia.`;

    const response = await generateWithFallback({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction:
          'Berikan 4 langkah pencapaian yang terstruktur, jelas, dan memotivasi untuk murid SMA/SMK Indonesia, maksimal 180 kata.',
      },
    });

    res.json({ text: (response.text ?? '').trim() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghubungi Gemini AI.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/lima-aspek', async (req, res) => {
  try {
    const { studentName, kelas, periode, rencanaLulus, attendancePct, recentLogs } = req.body as {
      studentName?: string;
      kelas?: string;
      periode?: string;
      rencanaLulus?: string;
      attendancePct?: number;
      recentLogs?: string[];
    };

    const logsSummary = Array.isArray(recentLogs) && recentLogs.length > 0
      ? recentLogs.join('\n- ')
      : 'Belum ada catatan jurnal terbaru; buat evaluasi awal yang konstruktif.';

    const prompt = `Susun evaluasi perkembangan murid pada 5 aspek sesuai Lampiran B Buku Jurnal Guru Wali (Permendikdasmen No. 11/2025).
Data Murid:
- Nama: ${studentName || 'Murid'}
- Kelas: ${kelas || '-'}
- Periode Evaluasi: ${periode || '3 Bulan'} (pilihan siklus pendampingan: 3 Bulan, 6 Bulan, 9 Bulan, atau 1 Tahun)
- Rencana Pasca Lulus: ${rencanaLulus || '-'}
- Persentase Kehadiran Bimbingan: ${attendancePct ?? 100}%
- Ringkasan Jurnal Terbaru:
- ${logsSummary}

Sesuaikan kedalaman dan fokus evaluasi dengan jangka waktu periode "${periode || '3 Bulan'}" (misalnya adaptasi awal pada 3 Bulan, capaian tengah tahun pada 6 Bulan, akselerasi semester genap pada 9 Bulan, atau refleksi menyeluruh akhir tahun pada 1 Tahun).
Untuk setiap aspek (akademik, karakter, sosial_emosional, kedisiplinan, potensi_minat), berikan deskripsi capaian & catatan pembinaan yang objektif, konstruktif, dan spesifik dalam 1-2 kalimat bahasa Indonesia.`;

    const response = await generateWithFallback({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction:
          'Kembalikan strictly JSON sesuai skema 5 aspek perkembangan murid Guru Wali.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            akademik: { type: Type.STRING, description: 'Evaluasi aspek akademik murid' },
            karakter: { type: Type.STRING, description: 'Evaluasi aspek karakter dan akhlak murid' },
            sosial_emosional: { type: Type.STRING, description: 'Evaluasi aspek sosial-emosional murid' },
            kedisiplinan: { type: Type.STRING, description: 'Evaluasi aspek kedisiplinan dan kepatuhan tata tertib' },
            potensi_minat: { type: Type.STRING, description: 'Evaluasi potensi, bakat, minat, dan arah karir' },
          },
          required: ['akademik', 'karakter', 'sosial_emosional', 'kedisiplinan', 'potensi_minat'],
        },
      },
    });

    const raw = (response.text ?? '{}').trim();
    const parsed = JSON.parse(raw);
    res.json({ aspects: parsed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menyusun evaluasi 5 aspek AI.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WaliConnect Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
