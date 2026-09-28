// Análisis del guardarropa memorizado + si hay un resumen mensual pendiente.

import { useMemo } from 'react';
import { useGarments, usePrefs, useUsage } from '../data/hooks';
import { analyzeWardrobe, type WardrobeAnalysis } from '../domain/analysis';
import { monthKey } from '../domain/dates';

export function useWardrobeAnalysis(): { analysis: WardrobeAnalysis | undefined; summaryPending: boolean } {
  const garments = useGarments();
  const usage = useUsage();
  const prefs = usePrefs();
  return useMemo(() => {
    if (!garments || !usage) return { analysis: undefined, summaryPending: false };
    const analysis = analyzeWardrobe(garments, usage, prefs);
    return { analysis, summaryPending: analysis.summary.length > 0 && prefs.lastSummaryMonth !== monthKey() };
  }, [garments, usage, prefs]);
}
