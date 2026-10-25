// Análisis del guardarropa basado en lo que REALMENTE te pones ("Lo usé hoy"):
// panorama por grupo, prendas sin usar, poco usadas y más usadas, y el
// resumen mensual de prendas que quizá no necesitas.

import { Archive, CalendarCheck, ChartColumn, CircleHelp, Eye, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWardrobeAnalysis } from '../app/analysisHook';
import { usePrefs } from '../data/hooks';
import { deleteGarments, resetGarmentStats, setStatus, updatePrefs } from '../data/repo';
import { formatExpected, MIN_LOGGED_DAYS, summaryReason, UNDERUSED_RATIO, type AnalysisRow, type WardrobeAnalysis } from '../domain/analysis';
import { monthKey, monthName, relativeDays } from '../domain/dates';
import { EmptyState, Loading, NumberStepper, Page, Tabs } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { GarmentPhoto, GarmentRow } from '../ui/GarmentViews';
import { Sheet } from '../ui/Sheet';

type Tab = 'idle' | 'underused' | 'top';

export function AnalysisScreen() {
  const { analysis, summaryPending } = useWardrobeAnalysis();
  const prefs = usePrefs();
  const [tab, setTab] = useState<Tab>('idle');
  const [acting, setActing] = useState<AnalysisRow | null>(null);
  const [help, setHelp] = useState(false);
  if (!analysis) return <Loading />;

  const now = new Date();
  const lists: Record<Tab, AnalysisRow[]> = { idle: analysis.idle, underused: analysis.underused, top: analysis.mostWorn };
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
        <div className="spread">
          <span className="hint">Periodo analizado: últimos</span>
          <div className="row">
            <NumberStepper label="días del periodo" value={prefs.unusedDays} min={7} max={365} onChange={(v) => void updatePrefs({ unusedDays: v })} />
            <span className="small">días</span>
          </div>
        </div>

        {!analysis.enoughData ? (
          <div className="callout info">
            <CalendarCheck />
            <span>
              Llevas <b>{analysis.loggedDays}</b> {analysis.loggedDays === 1 ? 'día registrado' : 'días registrados'} en este periodo. Marca <b>“Lo usé hoy”</b> cada día: con al
              menos {MIN_LOGGED_DAYS} días el análisis empieza a sacar conclusiones.
            </span>
          </div>
        ) : (
          <Overview analysis={analysis} />
        )}

        {analysis.summary.length > 0 && (
          <div className="card stack" style={summaryPending ? { borderColor: 'var(--accent)' } : undefined}>
            <div className="spread">
              <h2 className="row">
                <Sparkles width={20} /> Resumen de {monthName(now.getMonth())}
              </h2>
              {summaryPending && <span className="badge accent">Nuevo</span>}
            </div>
            <p className="muted small">
              {analysis.summary.length === 1 ? 'Esta prenda casi no la usas. ¿La necesitas?' : `Estas ${analysis.summary.length} prendas casi no las usas. ¿Las necesitas?`}
            </p>
            <div className="card-list">
              {analysis.summary.map((r) => (
                <GarmentRow key={r.garment.id} garment={r.garment} size="sm" sub={summaryReason(r)} onClick={() => setActing(r)} />
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
              { value: 'idle', label: `Sin usar (${analysis.idle.length})` },
              { value: 'underused', label: `Poco usadas (${analysis.underused.length})` },
              { value: 'top', label: 'Más usadas' },
            ]}
          />
          <p className="hint">
            {tab === 'idle' && `No las usaste en los últimos ${analysis.periodDays} días (solo cuentan las que tienes desde hace al menos 2 semanas).`}
            {tab === 'underused' && `Las usas menos del ${Math.round(UNDERUSED_RATIO * 100)} % de lo que les tocaría si rotaras parejo dentro de su grupo.`}
            {tab === 'top' && `Las que más te pusiste en los últimos ${analysis.periodDays} días.`}
          </p>
          {rows.length === 0 ? (
            <EmptyState icon={<ChartColumn />} title="Nada por aquí" text={analysis.loggedDays === 0 ? 'Aún no hay días registrados con “Lo usé hoy”.' : undefined} />
          ) : (
            <div className="card-list">
              {rows.map((r) => (
                <GarmentRow key={r.garment.id} garment={r.garment} onClick={() => setActing(r)} sub={subFor(tab, r)} right={tab !== 'idle' ? <UseMeter row={r} /> : undefined} />
              ))}
            </div>
          )}
        </div>
      </div>

      {acting && <ActionsSheet row={acting} onClose={() => setActing(null)} />}
      {help && (
        <Sheet title="¿Cómo se calcula?" onClose={() => setHelp(false)}>
          <div className="stack small">
            <p>
              El análisis solo usa lo que <b>de verdad te pones</b>: cada vez que tocas <b>“Lo usé hoy”</b>, esas prendas suman un uso. Lo que cambias en el generador no cuenta,
              porque cambiar una prenda puede ser porque no combinaba o porque había otra mejor.
            </p>
            <p>
              Cada prenda se compara con las de <b>su mismo grupo</b> (parte superior, capa intermedia, calzado…): de calzado usas un par al día, de accesorios varios, así que no
              se mezclan.
            </p>
            <p>
              <b>Uso esperado</b> = los usos de su grupo en el periodo repartidos parejo entre sus prendas (una prenda que agregaste hace poco espera menos). Si la usas mucho menos
              de lo esperado, sale como poco usada; si no la usaste nada, como sin usar.
            </p>
            <p>Las prendas archivadas no se analizan. “Reiniciar contadores” le da a una prenda un nuevo comienzo para el análisis.</p>
            <p>El generador favorece las prendas que llevas más tiempo sin ponerte, así que lo olvidado tiende a salir más.</p>
          </div>
        </Sheet>
      )}
    </Page>
  );
}

/** Panorama: concentración y uso por grupo. */
function Overview({ analysis }: { analysis: WardrobeAnalysis }) {
  const c = analysis.concentration;
  return (
    <div className="card stack">
      {c && (
        <p>
          <b>{c.garments}</b> de tus {c.of} prendas ({Math.round((c.garments / c.of) * 100)} %) suman el <b>80 %</b> de lo que te pusiste en {analysis.loggedDays} días registrados.
        </p>
      )}
      <div className="stack" style={{ gap: 10 }}>
        {analysis.groups.map((g) => (
          <div key={g.position.id} className="stack" style={{ gap: 4 }}>
            <div className="spread small">
              <span>{g.position.name}</span>
              <span className="muted">
                usaste {g.used} de {g.garments}
              </span>
            </div>
            <div className="meter">
              <i style={{ width: `${Math.round((g.used / g.garments) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function subFor(tab: Tab, r: AnalysisRow): string {
  const u = r.usage;
  if (tab === 'idle') return u.lastWornOn ? `Último uso ${relativeDays(u.daysSinceUse)}` : `Nunca usada · agregada ${relativeDays(u.daysSinceUse)}`;
  return `${u.recentWears} ${u.recentWears === 1 ? 'uso' : 'usos'} · esperado ~${formatExpected(r.expected)} · último ${relativeDays(u.daysSinceUse)}`;
}

/** Barra: usos reales frente a lo esperado (lleno = el doble o más). */
function UseMeter({ row }: { row: AnalysisRow }) {
  const rel = row.relative ?? 0;
  return (
    <div style={{ width: 54 }} title={`${Math.round(rel * 100)} % de lo esperado`}>
      <div className="meter">
        <i style={{ width: `${Math.min(100, Math.round(rel * 50))}%` }} />
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
            {row.usage.recentWears} {row.usage.recentWears === 1 ? 'uso' : 'usos'} en el periodo (esperado ~{formatExpected(row.expected)}) · {row.usage.timesWorn} en total ·{' '}
            {row.usage.lastWornOn ? `último uso ${relativeDays(row.usage.daysSinceUse)}` : 'nunca usada'}
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
