export async function compressImageFile(
  file: File,
  maxDimension = 720,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak valid.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context tidak tersedia.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function calcAttendancePct(kehadiran?: boolean[]): number {
  if (!Array.isArray(kehadiran) || kehadiran.length === 0) return 0;
  const present = kehadiran.filter(Boolean).length;
  return Math.round((present / kehadiran.length) * 100);
}

/**
 * Mengekstrak ID file Google Drive dari berbagai format link Drive / Googleusercontent.
 */
export function extractGoogleDriveFileId(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;

  // Format: /file/d/{ID}/view, /file/d/{ID}/preview, atau lh3.googleusercontent.com/d/{ID}
  const pathMatch = trimmed.match(
    /(?:drive\.google\.com\/(?:file\/)?d\/|lh3\.googleusercontent\.com\/d\/)([a-zA-Z0-9_-]{10,})/i
  );
  if (pathMatch?.[1]) return pathMatch[1];

  // Format: ?id={ID} atau &id={ID} (open?id=, uc?id=, thumbnail?id=, usercontent?id=)
  if (
    /(?:drive\.google\.com|drive\.usercontent\.google\.com|docs\.google\.com)/i.test(trimmed)
  ) {
    const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/i);
    if (idMatch?.[1]) return idMatch[1];
  }

  return null;
}

export function isGoogleDriveUrl(rawUrl?: string): boolean {
  return Boolean(extractGoogleDriveFileId(rawUrl));
}

function ensureScheme(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  }
  if (
    /^(?:drive\.google\.com|lh3\.googleusercontent\.com|drive\.usercontent\.google\.com|www\.)/i.test(
      trimmed
    )
  ) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Menormalkan tautan gambar eksternal (termasuk link share Google Drive)
 * menjadi URL gambar langsung yang paling andal.
 */
export function normalizeExternalImageUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === '-') return '';
  if (/^(data:image\/|blob:|\/)/i.test(trimmed)) return trimmed;

  const withScheme = ensureScheme(trimmed);
  const driveId = extractGoogleDriveFileId(withScheme);
  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`;
  }

  return /^(https?:\/\/)/i.test(withScheme) ? withScheme : '';
}

/**
 * Mengembalikan daftar URL kandidat secara berurutan untuk fallback otomatis
 * apabila salah satu endpoint Google Drive diblokir oleh kebijakan browser/jaringan.
 */
export function getImageCandidateUrls(rawUrl?: string): string[] {
  if (!rawUrl) return [];
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === '-') return [];
  if (/^(data:image\/|blob:|\/)/i.test(trimmed)) return [trimmed];

  const withScheme = ensureScheme(trimmed);
  const driveId = extractGoogleDriveFileId(withScheme);
  if (!driveId) {
    return /^(https?:\/\/)/i.test(withScheme) ? [withScheme] : [];
  }

  return Array.from(
    new Set([
      `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
      `https://lh3.googleusercontent.com/d/${driveId}=w1000`,
      `https://drive.google.com/uc?export=view&id=${driveId}`,
      `https://drive.usercontent.google.com/download?id=${driveId}&export=view`,
    ])
  );
}
