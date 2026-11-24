import type {
  EvaluasiPeriode,
  PerkembanganAspek,
  PerkembanganSnapshot,
} from '../types/waliconnect';

export const EVALUASI_PERIODES: {
  value: EvaluasiPeriode;
  label: string;
  shortLabel: string;
  hint: string;
}[] = [
  { value: '3 Bulan', label: '3 Bulan', shortLabel: '3 Bln', hint: 'Triwulan I' },
  { value: '6 Bulan', label: '6 Bulan', shortLabel: '6 Bln', hint: 'Semester I' },
  { value: '9 Bulan', label: '9 Bulan', shortLabel: '9 Bln', hint: 'Triwulan III' },
  { value: '1 Tahun', label: '1 Tahun', shortLabel: '1 Thn', hint: 'Akhir Tahun' },
];

export function normalizeEvaluasiPeriode(periode?: string): EvaluasiPeriode {
  switch (periode) {
    case '3 Bulan':
      return '3 Bulan';
    case '6 Bulan':
    case 'Semester':
      return '6 Bulan';
    case '9 Bulan':
      return '9 Bulan';
    case '1 Tahun':
    case 'Tahun':
      return '1 Tahun';
    default:
      return '3 Bulan';
  }
}

export function createEmptySnapshot(): PerkembanganSnapshot {
  return {
    akademik: '',
    karakter: '',
    sosial_emosional: '',
    kedisiplinan: '',
    potensi_minat: '',
  };
}

export function hasSnapshotContent(snap?: Partial<PerkembanganSnapshot>): boolean {
  if (!snap) return false;
  return Boolean(
    snap.akademik?.trim() ||
      snap.karakter?.trim() ||
      snap.sosial_emosional?.trim() ||
      snap.kedisiplinan?.trim() ||
      snap.potensi_minat?.trim()
  );
}

export function getSnapshotForPeriode(
  perkembangan: PerkembanganAspek | undefined,
  periode: EvaluasiPeriode
): PerkembanganSnapshot {
  if (!perkembangan) return createEmptySnapshot();

  const fromMap = perkembangan.by_periode?.[periode];
  if (fromMap) {
    return {
      akademik: fromMap.akademik || '',
      karakter: fromMap.karakter || '',
      sosial_emosional: fromMap.sosial_emosional || '',
      kedisiplinan: fromMap.kedisiplinan || '',
      potensi_minat: fromMap.potensi_minat || '',
      updated_at: fromMap.updated_at,
    };
  }

  // Fallback for legacy single-period records (e.g., periode: 'Semester' -> '6 Bulan')
  if (normalizeEvaluasiPeriode(perkembangan.periode) === periode) {
    return {
      akademik: perkembangan.akademik || '',
      karakter: perkembangan.karakter || '',
      sosial_emosional: perkembangan.sosial_emosional || '',
      kedisiplinan: perkembangan.kedisiplinan || '',
      potensi_minat: perkembangan.potensi_minat || '',
      updated_at: perkembangan.updated_at,
    };
  }

  return createEmptySnapshot();
}

export function buildUpdatedPerkembangan(
  current: PerkembanganAspek | undefined,
  periode: EvaluasiPeriode,
  snapshot: PerkembanganSnapshot
): PerkembanganAspek {
  const now = new Date().toISOString();
  const existingMap: Partial<Record<EvaluasiPeriode, PerkembanganSnapshot>> = {
    ...(current?.by_periode || {}),
  };

  // Preserve any legacy top-level period data before overwriting top-level fields
  if (current) {
    const prevNorm = normalizeEvaluasiPeriode(current.periode);
    if (!existingMap[prevNorm] && hasSnapshotContent(current)) {
      existingMap[prevNorm] = {
        akademik: current.akademik || '',
        karakter: current.karakter || '',
        sosial_emosional: current.sosial_emosional || '',
        kedisiplinan: current.kedisiplinan || '',
        potensi_minat: current.potensi_minat || '',
        updated_at: current.updated_at,
      };
    }
  }

  const nextSnap: PerkembanganSnapshot = {
    akademik: snapshot.akademik || '',
    karakter: snapshot.karakter || '',
    sosial_emosional: snapshot.sosial_emosional || '',
    kedisiplinan: snapshot.kedisiplinan || '',
    potensi_minat: snapshot.potensi_minat || '',
    updated_at: now,
  };

  existingMap[periode] = nextSnap;

  return {
    ...nextSnap,
    periode,
    by_periode: existingMap,
  };
}
