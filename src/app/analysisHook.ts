// Análisis del guardarropa memorizado + si hay un resumen mensual pendiente.

import { useMemo } from 'react';
import { useCatalog, useGarments, usePrefs, useUsage, useWearLog } from '../data/hooks';
import { analyzeWardrobe, type WardrobeAnalysis } from '../domain/analysis';
import { monthKey } from '../domain/dates';

export function useWardrobeAnalysis(): { analysis: WardrobeAnalysis | undefined; summaryPending: boolean } {
  const garments = useGarments();
  const usage = useUsage();
  const wearLog = useWearLog();
  const catalog = useCatalog();
  const prefs = usePrefs();
  return useMemo(() => {
    if (!garments || !usage || !wearLog || !catalog) return { analysis: undefined, summaryPending: false };
    const analysis = analyzeWardrobe({ garments, usage, wearLog, catalog, prefs });
    return { analysis, summaryPending: analysis.summary.length > 0 && prefs.lastSummaryMonth !== monthKey() };
  }, [garments, usage, wearLog, catalog, prefs]);
}
