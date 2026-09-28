// Análisis del guardarropa: prendas evitadas, sin usar, nunca usadas, más
// usadas y el resumen mensual "quizá ya no te gustan".

import { Archive, ChartColumn, CircleHelp, Eye, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWardrobeAnalysis } from '../app/analysisHook';
import { usePrefs } from '../data/hooks';
import { deleteGarments, resetGarmentStats, setStatus, updatePrefs } from '../data/repo';
import { summaryReason, type AnalysisRow } from '../domain/analysis';
import { monthKey, monthName, relativeDays } from '../domain/dates';
import { EmptyState, Loading, NumberStepper, Page, Tabs } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { GarmentPhoto, GarmentRow } from '../ui/GarmentViews';
import { Sheet } from '../ui/Sheet';

type Tab = 'avoided' | 'unused' | 'never' | 'top';

export function AnalysisScreen() {
  const { analysis, summaryPending } = useWardrobeAnalysis();
  const prefs = usePrefs();
  const [tab, setTab] = useState<Tab>('avoided');
  const [acting, setActing] = useState<AnalysisRow | null>(null);
  const [help, setHelp] = useState(false);
  if (!analysis) return <Loading />;

  const now = new Date();
  const lists: Record<Tab, AnalysisRow[]> = { avoided: analysis.avoided, unused: analysis.unused, never: analysis.neverWorn, top: analysis.mostWorn };
  const rows = lists[tab];

  return (
    <Page
      title="Análisis"
      actions={
        <button className="icon-btn" aria-label="Cómo se calcula" onClick={() => setHelp(true)}>
          <CircleHelp />
        </button>
      }
    >
      <div className="stack-lg">
        {analysis.summary.length > 0 && (
          <div className="card stack" style={summaryPending ? { borderColor: 'var(--accent)' } : undefined}>
            <div className="spread">
              <h2 className="row">
                <Sparkles width={20} /> Resumen de {monthName(now.getMonth())}
              </h2>
              {summaryPending && <span className="badge accent">Nuevo</span>}
            </div>
            <p className="muted small">
              {analysis.summary.length === 1 ? 'Esta prenda quizá ya no te gusta:' : `Estas ${analysis.summary.length} prendas quizá ya no te gustan:`}
            </p>
            <div className="card-list">
              {analysis.summary.map((r) => (
                <GarmentRow key={r.garment.id} garment={r.garment} size="sm" sub={summaryReason(r, prefs)} onClick={() => setActing(r)} />
              ))}
            </div>
            {summaryPending && (
              <button className="btn block" onClick={() => void updatePrefs({ lastSummaryMonth: monthKey() })}>
                Entendido, lo reviso
              </button>
            )}
          </div>
        )}

        <div className="stack">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'avoided', label: `Evitadas (${analysis.avoided.length})` },
              { value: 'unused', label: `Sin usar (${analysis.unused.length})` },
              { value: 'never', label: `Nunca usadas (${analysis.neverWorn.length})` },
              { value: 'top', label: 'Más usadas' },
            ]}
          />
          {tab === 'avoided' && (
            <p className="hint">
              Tasa de rechazo ≥ {Math.round(prefs.avoidThreshold * 100)} % con al menos {prefs.minAppearances} apariciones.
              {analysis.insufficientData > 0 && ` ${analysis.insufficientData} prendas aún no tienen datos suficientes.`}
            </p>
          )}
          {tab === 'unused' && (
            <div className="spread">
              <span className="hint">Sin usar desde hace al menos</span>
              <div className="row">
                <NumberStepper label="días" value={prefs.unusedDays} min={1} max={730} onChange={(v) => void updatePrefs({ unusedDays: v })} />
                <span className="small">días</span>
              </div>
            </div>
          )}
          {rows.length === 0 ? (
            <EmptyState icon={<ChartColumn />} title={tab === 'avoided' ? 'Ninguna prenda evitada' : 'Nada por aquí'} text={tab === 'avoided' ? 'Sigue generando outfits: con el tiempo verás qué prendas cambias más.' : undefined} />
          ) : (
            <div className="card-list">
              {rows.map((r) => (
                <GarmentRow key={r.garment.id} garment={r.garment} onClick={() => setActing(r)} sub={subFor(tab, r)} right={tab === 'avoided' ? <RateMeter rate={r.usage.rejectionRate ?? 0} /> : undefined} />
              ))}
            </div>
          )}
        </div>
      </div>

      {acting && <ActionsSheet row={acting} onClose={() => setActing(null)} />}
      {help && (
        <Sheet title="¿Cómo se calcula?" onClose={() => setHelp(false)}>
          <div className="stack small">
            <p>Por cada prenda se cuenta, desde que se agregó o desde que reiniciaste sus contadores:</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                <b>Veces mostrada</b> en un outfit generado.
              </li>
              <li>
                <b>Rechazo fuerte</b>: la cambiaste con su botón 🔄 (sabemos que era ella).
              </li>
              <li>
                <b>Rechazo débil</b>: regeneraste todo el outfit estando ella (vale {prefs.weakRejectWeight}, porque no sabemos cuál prenda no te gustó).
              </li>
            </ul>
            <p>
              <b>Tasa de rechazo</b> = (fuertes + débiles × {prefs.weakRejectWeight}) ÷ veces mostrada. Así una prenda que aparece mucho no sale perjudicada: 3 rechazos en 30
              apariciones (10 %) no es lo mismo que 3 en 4 (75 %).
            </p>
            <p>
              Para no sacar conclusiones con pocos datos, una prenda necesita al menos <b>{prefs.minAppearances} apariciones</b> antes de marcarse como evitada. Puedes cambiar
              estos valores en Ajustes.
            </p>
            <p>El generador también usa estos datos: las prendas muy rechazadas salen algo menos (nunca desaparecen) y las que no usas hace tiempo salen más.</p>
          </div>
        </Sheet>
      )}
    </Page>
  );
}

function subFor(tab: Tab, r: AnalysisRow): string {
  const u = r.usage;
  if (tab === 'avoided') return `Rechazada ${Math.round((u.rejectionRate ?? 0) * 100)} % · ${u.shown} apariciones · ${u.strongRejects} fuertes, ${u.weakRejects} débiles`;
  if (tab === 'unused') return u.lastWornOn ? `Último uso ${relativeDays(u.daysSinceUse)}` : `Nunca usada · agregada ${relativeDays(u.daysSinceUse)}`;
  if (tab === 'never') return `Agregada ${relativeDays(u.daysSinceUse)} · mostrada ${u.shown} ${u.shown === 1 ? 'vez' : 'veces'}`;
  return `${u.timesWorn} ${u.timesWorn === 1 ? 'uso' : 'usos'} · último ${relativeDays(u.daysSinceUse)}`;
}

function RateMeter({ rate }: { rate: number }) {
  return (
    <div style={{ width: 54 }} title={`${Math.round(rate * 100)} %`}>
      <div className="meter">
        <i style={{ width: `${Math.round(rate * 100)}%` }} />
      </div>
    </div>
  );
}

function ActionsSheet({ row, onClose }: { row: AnalysisRow; onClose: () => void }) {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const g = row.garment;
  const act = async (what: 'archive' | 'delete' | 'reset') => {
    if (what === 'delete') {
      const ok = await confirm({ title: `¿Eliminar “${g.name}”?`, message: 'Se borra junto con su foto. Si prefieres conservar el historial, archívala.', confirmText: 'Eliminar', danger: true });
      if (!ok) return;
      await deleteGarments([g]);
      toast('Prenda eliminada');
    } else if (what === 'archive') {
      await setStatus([g], 'archived');
      toast('Archivada: ya no saldrá en outfits');
    } else {
      await resetGarmentStats([g]);
      toast('Contadores reiniciados');
    }
    onClose();
  };
  return (
    <Sheet title={g.name} onClose={onClose}>
      <div className="stack">
        <div className="row">
          <GarmentPhoto garment={g} className="thumb lg" />
          <div className="small muted">
            Mostrada {row.usage.shown} veces · usada {row.usage.timesWorn} · {row.usage.lastWornOn ? `último uso ${relativeDays(row.usage.daysSinceUse)}` : 'nunca usada'}
          </div>
        </div>
        <div className="card-list">
          <button className="list-item" onClick={() => navigate(`/guardarropa/${g.id}`)}>
            <Eye width={20} /> <span className="grow">Ver ficha</span>
          </button>
          <button className="list-item" onClick={() => void act('archive')}>
            <Archive width={20} /> <span className="grow">Archivar (conserva su historial)</span>
          </button>
          <button className="list-item" onClick={() => void act('reset')}>
            <RotateCcw width={20} /> <span className="grow">Reiniciar contadores (darle otra oportunidad)</span>
          </button>
          <button className="list-item" style={{ color: 'var(--danger)' }} onClick={() => void act('delete')}>
            <Trash2 width={20} /> <span className="grow">Eliminar</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
