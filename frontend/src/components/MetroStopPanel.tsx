import { useState } from 'react';
import { Clock3, MapPin, Route, Star, TrainFront, X } from 'lucide-react';
import type { PatternRoutePayload, ScheduleItem, StopInfo } from '../types';
import type { MetroDepartures } from '../services/transit';
import { lineColor, lineTextColor } from '../utils/stcp';

interface Props {
  stop: StopInfo;
  routes: PatternRoutePayload[];
  route: PatternRoutePayload | null;
  routeError: boolean;
  departures: MetroDepartures | null;
  clock: number;
  schedule: ScheduleItem[] | null;
  loading: boolean;
  scheduleAvailable: boolean;
  favorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
  onRoute: (route: PatternRoutePayload) => void;
}

export default function MetroStopPanel({ stop, routes, route, routeError, departures, clock, schedule, loading, scheduleAvailable, favorite, onFavorite, onClose, onRoute }: Props) {
  const [tab, setTab] = useState<'departures' | 'schedule' | 'route'>('departures');
  const [line, setLine] = useState<string | null>(null);
  const fresh = departures?.available && clock - new Date(departures.checkedAt).getTime() < 60_000;
  const upcoming = fresh ? departures.departures.filter((item) => (!line || item.line === line) && new Date(item.departureAt).getTime() >= clock - 30_000) : [];
  const timetable = schedule?.filter((item) => !line || item.line === line) ?? [];
  const lines = [...new Set([...routes.map((item) => item.line), ...(stop.lines ?? []), ...(schedule ?? []).map((item) => item.line)])];
  const live = upcoming.some((item) => item.realtime && !item.cancelled);
  const buttonClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-300';

  const renderSchedule = () => loading ? <div className="h-20 animate-pulse rounded-2xl bg-zinc-100 dark:bg-white/5" aria-label="A carregar horários" /> : !scheduleAvailable ? <p className="py-4 text-sm text-zinc-500">O calendário disponível não abrange o dia de hoje.</p> : timetable.length === 0 ? <p className="py-4 text-sm text-zinc-500">Sem mais partidas programadas para {line ? `a linha ${line}` : 'esta estação'} hoje.</p> : <div className="space-y-2">{timetable.map((item) => <div key={`${item.line}-${item.directionId}-${item.headsign}`} className="rounded-2xl bg-zinc-100 p-3 dark:bg-white/5">
    <div className="flex items-center gap-2"><span className="rounded-lg px-2 py-1 text-xs font-black" style={{ backgroundColor: lineColor(item.line), color: lineTextColor(item.line) }}>{item.line}</span><strong className="min-w-0 text-[13px] leading-snug">{item.headsign ?? `Linha ${item.line}`}</strong></div>
    <div className="mt-2 flex gap-2 pl-9">{item.times.map((time) => <span key={time} className="rounded-lg bg-white px-2 py-1.5 font-mono text-sm font-bold dark:bg-white/10">{time}</span>)}</div>
  </div>)}</div>;

  return <section aria-label={`Detalhes da estação ${stop.name}`} className="absolute inset-x-3 bottom-3 z-[520] mx-auto flex h-[42vh] max-w-md flex-col overflow-hidden rounded-[24px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#101725]">
    <header className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#005BAC] dark:bg-blue-500/15 dark:text-sky-400"><TrainFront size={20} /></span>
      <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Estação de metro</p><h2 className="truncate text-base font-extrabold" title={stop.name}>{stop.name}</h2></div>
      <button className={`${buttonClass} ${favorite ? '!text-amber-500' : ''}`} aria-label={favorite ? 'Remover estação dos favoritos' : 'Guardar estação nos favoritos'} aria-pressed={favorite} onClick={onFavorite}><Star size={18} className={favorite ? 'fill-current' : ''} /></button>
      <button className={buttonClass} aria-label="Fechar estação" onClick={onClose}><X size={20} /></button>
    </header>
    <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-3 pb-2" aria-label="Filtrar por linha">
      <button aria-pressed={line === null} onClick={() => setLine(null)} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-extrabold ${line === null ? 'bg-zinc-800 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400'}`}>Todas</button>
      {lines.map((id) => <button key={id} aria-label={`Filtrar linha ${id}`} aria-pressed={line === id} onClick={() => { setLine(id); const selectedRoute = routes.find((item) => item.line === id); if (selectedRoute) onRoute(selectedRoute); }} className={`min-h-10 min-w-10 shrink-0 rounded-xl px-3 text-sm font-black ${line !== null && line !== id ? 'opacity-50' : ''}`} style={{ backgroundColor: lineColor(id), color: lineTextColor(id) }}>{id}</button>)}
    </div>
    <div className="mx-3 mb-2 flex shrink-0 rounded-xl bg-zinc-100 p-1 dark:bg-white/5" role="tablist" aria-label="Informação da estação">
      {([['departures', 'Partidas'], ['schedule', 'Horários'], ['route', 'Percurso']] as const).map(([id, label]) => <button key={id} id={`metro-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="metro-station-content" onClick={() => setTab(id)} className={`min-h-10 flex-1 rounded-lg text-xs font-extrabold ${tab === id ? 'bg-white text-[#005BAC] shadow-sm dark:bg-white/10 dark:text-sky-400' : 'text-zinc-500 dark:text-zinc-400'}`}>{label}</button>)}
    </div>
    <div key={tab} id="metro-station-content" role="tabpanel" aria-labelledby={`metro-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
      {tab === 'departures' && <>
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px]"><span className="font-semibold text-zinc-500 dark:text-zinc-400">{line ? `Linha ${line}` : 'Todas as linhas'} · próximas partidas</span><span className={`shrink-0 rounded-full px-2 py-1 font-bold ${live ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400'}`}>{live ? 'Em direto' : 'Programado'}</span></div>
        {!departures ? <p className="py-4 text-sm text-zinc-400">A consultar partidas…</p> : !fresh ? <><p className="mb-2 text-xs text-zinc-500">A mostrar os horários previstos. As chegadas estão indisponíveis.</p>{renderSchedule()}</> : upcoming.length === 0 ? <p className="py-4 text-sm text-zinc-500">Sem partidas para {line ? `a linha ${line}` : 'esta estação'} nas próximas duas horas.</p> : <div className="space-y-2">{upcoming.slice(0, 12).map((item) => {
          const minutes = Math.max(0, Math.ceil((new Date(item.departureAt).getTime() - clock) / 60_000));
          return <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-zinc-100 p-3 dark:bg-white/5">
            <span className="grid h-9 min-w-9 place-items-center rounded-xl text-sm font-black" style={{ backgroundColor: lineColor(item.line), color: lineTextColor(item.line) }}>{item.line}</span>
            <div className="min-w-0 flex-1"><strong className="block text-[13px] leading-snug">{item.headsign}</strong><span className={`text-[11px] ${item.cancelled ? 'text-rose-500' : item.realtime ? 'text-emerald-600' : 'text-zinc-500 dark:text-zinc-400'}`}>{item.cancelled ? 'Suprimido' : item.realtime ? 'Em tempo real' : 'Horário previsto'}</span></div>
            <span className="shrink-0 text-right"><b className="block text-lg font-extrabold tabular-nums">{item.cancelled ? '—' : minutes === 0 ? 'Agora' : <>{minutes}<small className="ml-1 text-[11px] font-semibold text-zinc-400">min</small></>}</b><small className="text-[10px] tabular-nums text-zinc-400">{new Date(item.departureAt).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' })}</small></span>
          </div>;
        })}</div>}
      </>}
      {tab === 'schedule' && <><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><Clock3 size={13} /> Horários previstos para hoje</p>{renderSchedule()}</>}
      {tab === 'route' && <>
        {routeError ? <p className="py-3 text-sm text-zinc-500">Percurso indisponível. Volta a selecionar a estação para tentar novamente.</p> : !route ? <p className="py-3 text-sm text-zinc-400">A carregar percurso…</p> : <>
          <div className="flex items-center justify-between gap-2"><strong className="text-sm">Linha {route.line}</strong><button onClick={() => onRoute(route)} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-xs font-bold text-[#005BAC] dark:bg-blue-500/15 dark:text-sky-400"><Route size={14} /> Ver no mapa</button></div>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">{route.stops.length} estações · toca numa linha para mudar o percurso</p>
          <ol className="space-y-1">{route.stops.map((station) => <li key={station.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] ${station.id === stop.id ? 'bg-blue-50 font-extrabold text-[#005BAC] dark:bg-blue-500/15 dark:text-sky-400' : 'text-zinc-500 dark:text-zinc-300'}`}><MapPin size={14} className="shrink-0" />{station.name}{station.id === stop.id && <small className="ml-auto text-[10px]">Selecionada</small>}</li>)}</ol>
        </>}
      </>}
    </div>
  </section>;
}
