import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BusFront, Crosshair, Moon, Navigation, RefreshCw, Route, Search, Sun, X } from 'lucide-react';
import TransitMap, { type MapFit, type MapFocus, type MapViewState } from './components/TransitMap';
import { getShapes, getVehicles } from './services/transit';
import type { Vehicle } from './types';
import { agoLabel, lineColor, lineTextColor } from './utils/stcp';

const REFRESH_MS = 15_000;

function movementLabel(speedKmh: number): string {
  if (speedKmh < 1) return 'Parado';
  if (speedKmh < 8) return 'Em marcha lenta';
  return 'Em movimento';
}

function movementClass(speedKmh: number): string {
  if (speedKmh < 1) return 'is-stopped';
  if (speedKmh < 8) return 'is-slow';
  return 'is-moving';
}

function directionLabel(directionId: number | null): string {
  if (directionId === 0) return 'Ida';
  if (directionId === 1) return 'Volta';
  return 'Por confirmar';
}

export default function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [fit, setFit] = useState<MapFit | null>(null);
  const [routeShapes, setRouteShapes] = useState<Record<string, Array<[number, number]>>>({});
  const [userPosition, setUserPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const currentViewRef = useRef<MapViewState>({ lat: 41.1579, lon: -8.6291, zoom: 13 });
  const viewBeforeSelectionRef = useRef<MapViewState | null>(null);
  const requestedShapesRef = useRef(new Set<string>());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('porto-movi:theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const result = await getVehicles();
      setVehicles(result.payload.vehicles);
      setUpdatedAt(result.payload.updatedAt);
      setStale(result.payload.stale);
      setError(result.ok ? null : result.message);
      setSelected((current) => current ? result.payload.vehicles.find((vehicle) => vehicle.id === current.id) ?? current : null);
    } catch {
      setError('Não foi possível ligar ao serviço. Confirma se o backend está disponível.');
    } finally {
      setLoading(false);
      if (manual) window.setTimeout(() => setRefreshing(false), 450);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), REFRESH_MS);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { window.clearInterval(refreshTimer); window.clearInterval(clockTimer); };
  }, [refresh]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('porto-movi:theme', theme);
  }, [theme]);

  useEffect(() => {
    const missing = [...new Set(vehicles.map((vehicle) => vehicle.shapeId).filter((id): id is string => Boolean(id)))]
      .filter((id) => !requestedShapesRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requestedShapesRef.current.add(id));
    void getShapes(missing).then((shapes) => {
      setRouteShapes((current) => {
        const next = { ...current };
        shapes.forEach((shape) => { next[shape.id] = shape.path; });
        return next;
      });
    }).catch(() => missing.forEach((id) => requestedShapesRef.current.delete(id)));
  }, [vehicles]);

  const lines = useMemo(() => {
    const counts = new Map<string, number>();
    vehicles.forEach((vehicle) => counts.set(vehicle.line, (counts.get(vehicle.line) ?? 0) + 1));
    return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id, 'pt', { numeric: true }));
  }, [vehicles]);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? lines.filter((line) => line.id.toLowerCase().includes(normalized)) : lines;
  }, [lines, query]);

  const visibleVehicles = useMemo(() => selectedLine ? vehicles.filter((vehicle) => vehicle.line === selectedLine) : vehicles, [selectedLine, vehicles]);
  const updatedSeconds = updatedAt ? Math.max(0, Math.round((clock - new Date(updatedAt).getTime()) / 1000)) : 0;

  const chooseVehicle = useCallback((vehicle: Vehicle) => {
    if (!selected) viewBeforeSelectionRef.current = currentViewRef.current;
    setSelected(vehicle);
    setSelectedLine(vehicle.line);
    setFit(null);
    setFocus({ lat: vehicle.lat, lon: vehicle.lon, zoom: 16.5, key: Date.now() });
  }, [selected]);

  const chooseLine = useCallback((line: string) => {
    setSelectedLine(line);
    setSelected(null);
    setSearchOpen(false);
    setQuery('');
    const buses = vehicles.filter((vehicle) => vehicle.line === line);
    setFit({ points: buses.map((vehicle) => [vehicle.lat, vehicle.lon]), key: Date.now() });
  }, [vehicles]);

  const showWholeLine = useCallback((line: string) => {
    const buses = vehicles.filter((vehicle) => vehicle.line === line);
    setSelectedLine(line);
    setFit({ points: buses.map((vehicle) => [vehicle.lat, vehicle.lon]), key: Date.now() });
  }, [vehicles]);

  const closeVehicle = useCallback(() => {
    setSelected(null);
    setSelectedLine(null);
    setFit(null);
    const previous = viewBeforeSelectionRef.current;
    if (previous) setFocus({ ...previous, key: Date.now() });
    viewBeforeSelectionRef.current = null;
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setError('A localização não é suportada neste dispositivo.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { lat: position.coords.latitude, lon: position.coords.longitude };
        setUserPosition(location);
        setFocus({ ...location, zoom: 16, key: Date.now() });
        setLocating(false);
      },
      () => { setError('Não foi possível obter a tua localização. Verifica a permissão do browser.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-zinc-100 text-zinc-950 dark:bg-[#08101c] dark:text-white">
      <TransitMap
        vehicles={visibleVehicles}
        selectedId={selected?.id ?? null}
        theme={theme}
        focus={focus}
        fit={fit}
        shapes={routeShapes}
        userPosition={userPosition}
        onSelect={chooseVehicle}
        onViewChange={(view) => { currentViewRef.current = view; }}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-5">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-2 rounded-[22px] border border-white/70 bg-white/95 p-2 shadow-[0_10px_35px_rgba(15,23,42,.16)] backdrop-blur-xl dark:border-white/10 dark:bg-[#101827]/95">
          <button className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 text-left" onClick={() => setSearchOpen(true)}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#005BAC] text-white shadow-lg shadow-blue-700/20"><BusFront size={21} /></span>
            <span className="min-w-0"><strong className="block truncate text-[15px] font-extrabold tracking-tight">Porto Movi</strong><span className="block truncate text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Autocarros em tempo real</span></span>
          </button>
          <button className="icon-button" aria-label="Pesquisar linha" onClick={() => setSearchOpen(true)}><Search size={19} /></button>
          <button className="icon-button" aria-label="Alternar tema" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-0 top-[92px] z-[490] flex justify-center px-4 pt-[env(safe-area-inset-top)]">
        {loading ? <div className="status-pill"><RefreshCw className="animate-spin" size={12} /> A ligar à rede STCP</div> : error ? <button className="pointer-events-auto status-pill !bg-rose-600 !text-white" onClick={() => void refresh(true)}>{error}</button> : <div className="status-pill"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {vehicles.length} em circulação · {agoLabel(updatedSeconds)}</div>}
      </div>

      <div className="absolute right-3 z-[500] flex flex-col gap-2 sm:right-5" style={{ bottom: selected ? 286 : 76 }}>
        <button className="map-action" aria-label="Usar a minha localização" onClick={locate}><Crosshair className={locating ? 'animate-pulse' : ''} size={20} /></button>
        <button className="map-action" aria-label="Atualizar posições" onClick={() => void refresh(true)}><RefreshCw className={refreshing ? 'animate-spin' : ''} size={19} /></button>
      </div>

      {selected && (
        <section className="absolute inset-x-3 bottom-[72px] z-[510] mx-auto max-w-md rounded-[22px] border border-black/5 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-[#101725]">
          <div className="flex items-center gap-3">
            <span className="grid h-12 min-w-14 place-items-center rounded-2xl text-lg font-black shadow-sm" style={{ backgroundColor: lineColor(selected.line), color: lineTextColor(selected.line) }}>{selected.line}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-zinc-400">Viatura {selected.id}</p>
              <h2 className="truncate text-base font-extrabold">Linha {selected.line}</h2>
            </div>
            <button className="icon-button !h-9 !w-9" aria-label="Fechar e regressar ao mapa anterior" onClick={closeVehicle}><X size={17} /></button>
          </div>
          <div className="mt-2 grid grid-cols-[1.2fr_.85fr_1.25fr] gap-1.5">
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-zinc-100 px-2.5 py-2 dark:bg-white/5">
              <span className={`motion-dot ${movementClass(selected.speedKmh)}`} aria-hidden="true" />
              <div className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-wide text-zinc-400">Estado</span><strong className="mt-0.5 block truncate text-[11px]">{movementLabel(selected.speedKmh)}</strong></div>
            </div>
            <div className="rounded-xl bg-zinc-100 px-2 py-2 dark:bg-white/5"><span className="block text-[9px] font-bold uppercase tracking-wide text-zinc-400">Velocidade</span><strong className="mt-0.5 block text-[12px] tabular-nums">{Math.round(selected.speedKmh)} <small className="text-[9px] font-bold text-zinc-400">km/h</small></strong></div>
            <div className="rounded-xl bg-zinc-100 px-2 py-2 dark:bg-white/5"><span className="block text-[9px] font-bold uppercase tracking-wide text-zinc-400">Destino</span><strong className="mt-0.5 block truncate text-[11px]" title={selected.headsign ?? undefined}>{selected.headsign ?? directionLabel(selected.directionId)}</strong></div>
          </div>
          <p className="mt-1.5 text-center text-[10px] font-semibold text-zinc-400">Posição atualizada {agoLabel(selected.ageSec)} · {new Date(selected.observedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-100 py-2 text-[11px] font-extrabold dark:bg-white/10" onClick={() => setFocus({ lat: selected.lat, lon: selected.lon, zoom: 17, key: Date.now() })}><Navigation size={13} /> Centrar</button>
            <button className="flex items-center justify-center gap-1.5 rounded-xl bg-[#005BAC] py-2 text-[11px] font-extrabold text-white" onClick={() => showWholeLine(selected.line)}><Route size={13} /> Ver linha completa</button>
          </div>
        </section>
      )}

      <section className="filter-dock absolute inset-x-2 bottom-2 z-[500] h-14 overflow-hidden rounded-2xl border border-black/5 bg-white/95 px-2 shadow-xl backdrop-blur-lg dark:border-white/10 dark:bg-[#101725]/95">
        <div className="flex h-full items-center gap-2">
          <span className="hidden shrink-0 pl-2 text-[11px] font-extrabold text-zinc-500 sm:block">Filtrar por:</span>
          <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-2">
            <button className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${selectedLine === null ? 'bg-zinc-800 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'}`} onClick={() => { setSelected(null); setSelectedLine(null); setFit(null); }}>Todas</button>
            {lines.map((line) => <button key={line.id} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black shadow-sm transition active:scale-95 ${selectedLine === line.id ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-400 dark:ring-offset-zinc-800' : ''}`} style={{ backgroundColor: lineColor(line.id), color: lineTextColor(line.id) }} onClick={() => chooseLine(line.id)}>{line.id}</button>)}
          </div>
          <span className="shrink-0 pr-1 text-[10px] font-bold text-zinc-400">{visibleVehicles.length}</span>
        </div>
      </section>

      {searchOpen && (
        <div className="absolute inset-0 z-[1000] overflow-y-auto bg-zinc-100/98 px-4 pb-10 pt-[max(18px,env(safe-area-inset-top))] backdrop-blur-xl dark:bg-[#08101c]/98">
          <div className="mx-auto min-h-full max-w-xl">
            <div className="flex items-center gap-2">
              <label className="flex h-14 flex-1 items-center gap-3 rounded-2xl bg-white px-4 shadow-sm dark:bg-white/10"><Search className="text-[#005BAC]" size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar linha, ex. 500" className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:text-zinc-400" />{query && <button aria-label="Limpar pesquisa" onClick={() => setQuery('')}><X size={18} /></button>}</label>
              <button className="icon-button !h-14 !w-14 !bg-white dark:!bg-white/10" aria-label="Fechar pesquisa" onClick={() => setSearchOpen(false)}><X size={21} /></button>
            </div>
            <p className="mb-3 mt-7 text-xs font-extrabold uppercase tracking-[.14em] text-zinc-400">Linhas atualmente em circulação</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{searchResults.map((line) => <button key={line.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition active:scale-[.98] dark:bg-white/10" onClick={() => chooseLine(line.id)}><span className="grid h-11 min-w-12 place-items-center rounded-xl font-black" style={{ backgroundColor: lineColor(line.id), color: lineTextColor(line.id) }}>{line.id}</span><span><strong className="block text-sm">Linha {line.id}</strong><small className="text-zinc-500 dark:text-zinc-400">{line.count} em circulação</small></span></button>)}</div>
            {!loading && searchResults.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-zinc-500 dark:bg-white/10">Nenhuma linha ativa corresponde à pesquisa.</p>}
          </div>
        </div>
      )}

      {stale && <div className="absolute bottom-[70px] left-3 z-[510] rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-extrabold text-amber-950">A mostrar a última atualização válida</div>}
    </main>
  );
}
