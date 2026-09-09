import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BusFront, Clock3, Crosshair, MapPin, Moon, Navigation, RefreshCw, Route, Search, Star, Sun, X } from 'lucide-react';
import TransitMap, { type MapFit, type MapFocus, type MapViewState } from './components/TransitMap';
import { getPatternRoute, getShapes, getStopArrivals, getStopSchedule, getStops, getVehicles } from './services/transit';
import type { ArrivalsPayload, PatternRoutePayload, ScheduleItem, StopInfo, Vehicle } from './types';
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

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function distanceMetres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const radius = 6_371_000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function distanceLabel(metres: number): string {
  return metres < 950 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

function etaLabel(seconds: number, atStop: boolean): string {
  if (atStop) return 'A chegar';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `≈ ${minutes} min`;
}

export default function App() {
  const [mode, setMode] = useState<'buses' | 'stops'>('buses');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stops, setStops] = useState<StopInfo[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [selectedStop, setSelectedStop] = useState<StopInfo | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [arrivals, setArrivals] = useState<ArrivalsPayload | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[] | null>(null);
  const [stopLoading, setStopLoading] = useState(false);
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
  const [routeContext, setRouteContext] = useState<PatternRoutePayload | null>(null);
  const [userPosition, setUserPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('porto-movi:favorite-stops') ?? '[]');
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const currentViewRef = useRef<MapViewState>({ lat: 41.1579, lon: -8.6291, zoom: 13 });
  const viewBeforeSelectionRef = useRef<MapViewState | null>(null);
  const requestedShapesRef = useRef(new Set<string>());
  const selectedStopRef = useRef<StopInfo | null>(null);
  selectedStopRef.current = selectedStop;
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
      if (selectedStopRef.current) {
        const nextArrivals = await getStopArrivals(selectedStopRef.current.id);
        setArrivals(nextArrivals);
      }
    } catch {
      setError('Não foi possível ligar ao serviço. Confirma se o backend está disponível.');
    } finally {
      setLoading(false);
      if (manual) window.setTimeout(() => setRefreshing(false), 450);
    }
  }, []);

  useEffect(() => {
    void getStops().then(setStops).catch(() => setError('Não foi possível carregar as paragens STCP.'));
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
    localStorage.setItem('porto-movi:favorite-stops', JSON.stringify(favoriteIds));
  }, [favoriteIds]);

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
    return [...counts.entries()].map(([id, count]) => ({ id, count }))
      .sort((a, b) => a.id.localeCompare(b.id, 'pt', { numeric: true }));
  }, [vehicles]);

  const searchLines = useMemo(() => {
    const term = normalize(query);
    return term ? lines.filter((line) => normalize(line.id).includes(term)) : lines;
  }, [lines, query]);

  const searchStops = useMemo(() => {
    const term = normalize(query);
    const results = term
      ? stops.filter((stop) => normalize(stop.name).includes(term) || normalize(stop.code).includes(term) || normalize(stop.id).includes(term))
      : stops;
    return results.slice(0, 30);
  }, [query, stops]);

  const favoriteStops = useMemo(() => favoriteIds.map((id) => stops.find((stop) => stop.id === id)).filter((stop): stop is StopInfo => Boolean(stop)), [favoriteIds, stops]);
  const nearbyStops = useMemo(() => {
    if (!userPosition) return [];
    return stops.map((stop) => ({ stop, distance: distanceMetres(userPosition, stop) }))
      .sort((a, b) => a.distance - b.distance).slice(0, 5);
  }, [stops, userPosition]);
  const visibleVehicles = useMemo(() => selectedLine ? vehicles.filter((vehicle) => vehicle.line === selectedLine) : vehicles, [selectedLine, vehicles]);
  const stopVehicles = useMemo(() => {
    if (!selectedStop || !arrivals) return [];
    const arrivingIds = new Set(arrivals.arrivals.map((arrival) => arrival.vehicleId));
    return vehicles.filter((vehicle) => arrivingIds.has(vehicle.id));
  }, [arrivals, selectedStop, vehicles]);
  const mapVehicles = useMemo(() => {
    if (mode === 'buses') return visibleVehicles;
    if (!selected) return stopVehicles;
    return stopVehicles.filter((vehicle) =>
      vehicle.line === selected.line && vehicle.directionId === selected.directionId,
    );
  }, [mode, selected, stopVehicles, visibleVehicles]);
  const updatedSeconds = updatedAt ? Math.max(0, Math.round((clock - new Date(updatedAt).getTime()) / 1000)) : 0;

  const chooseVehicle = useCallback((vehicle: Vehicle) => {
    if (!selected && !selectedStop) viewBeforeSelectionRef.current = currentViewRef.current;
    setSelected(vehicle);
    setSelectedLine(vehicle.line);
    setFit(null);
    if (mode === 'stops' && selectedStop) {
      if (!vehicle.pattern) {
        setFocus({ lat: vehicle.lat, lon: vehicle.lon, zoom: 16.5, key: Date.now() });
        return;
      }
      void getPatternRoute(vehicle.pattern)
        .then((route) => {
          setRouteContext(route);
          setFit({ points: route.path, key: Date.now() });
        })
        .catch(() => setError('Não foi possível carregar o percurso completo desta viatura.'));
      return;
    }
    setMode('buses');
    setSelectedStop(null);
    setArrivals(null);
    setSchedule(null);
    setRouteContext(null);
    setFocus({ lat: vehicle.lat, lon: vehicle.lon, zoom: 16.5, key: Date.now() });
  }, [mode, selected, selectedStop]);

  const chooseLine = useCallback((line: string) => {
    setMode('buses');
    setSelectedLine(line);
    setSelected(null);
    setSelectedStop(null);
    setRouteContext(null);
    setSearchOpen(false);
    setQuery('');
    const buses = vehicles.filter((vehicle) => vehicle.line === line);
    setFit({ points: buses.map((vehicle) => [vehicle.lat, vehicle.lon]), key: Date.now() });
  }, [vehicles]);

  const chooseStop = useCallback((stop: StopInfo) => {
    if (!selected && !selectedStop) viewBeforeSelectionRef.current = currentViewRef.current;
    setMode('stops');
    setSelected(null);
    setSelectedLine(null);
    setSelectedStop(stop);
    setRouteContext(null);
    setArrivals(null);
    setSchedule(null);
    setStopLoading(true);
    setSearchOpen(false);
    setQuery('');
    setFit(null);
    setFocus({ lat: stop.lat, lon: stop.lon, zoom: 17, key: Date.now() });
    void Promise.all([getStopArrivals(stop.id), getStopSchedule(stop.id)])
      .then(([nextArrivals, nextSchedule]) => {
        setArrivals(nextArrivals);
        setSchedule(nextSchedule.schedule);
      })
      .catch(() => setError('Não foi possível carregar a informação desta paragem.'))
      .finally(() => setStopLoading(false));
  }, [selected, selectedStop]);

  const showWholeLine = useCallback((line: string) => {
    if (routeContext?.line === line && routeContext.path.length > 1) {
      setFit({ points: routeContext.path, key: Date.now() });
      return;
    }
    const buses = vehicles.filter((vehicle) => vehicle.line === line);
    setSelectedLine(line);
    setFit({ points: buses.map((vehicle) => [vehicle.lat, vehicle.lon]), key: Date.now() });
  }, [routeContext, vehicles]);

  const closeSelection = useCallback(() => {
    setSelected(null);
    setSelectedStop(null);
    setSelectedLine(null);
    setArrivals(null);
    setSchedule(null);
    setRouteContext(null);
    setFit(null);
    const previous = viewBeforeSelectionRef.current;
    if (previous) setFocus({ ...previous, key: Date.now() });
    viewBeforeSelectionRef.current = null;
  }, []);

  const closeVehicle = useCallback(() => {
    if (mode === 'stops' && selectedStop) {
      setSelected(null);
      setSelectedLine(null);
      setRouteContext(null);
      setFit(null);
      setFocus({ lat: selectedStop.lat, lon: selectedStop.lon, zoom: 17, key: Date.now() });
      return;
    }
    closeSelection();
  }, [closeSelection, mode, selectedStop]);

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

  const changeMode = (nextMode: 'buses' | 'stops') => {
    setMode(nextMode);
    setSelected(null);
    setSelectedStop(null);
    setSelectedLine(null);
    setArrivals(null);
    setSchedule(null);
    setRouteContext(null);
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-zinc-100 text-zinc-950 dark:bg-[#08101c] dark:text-white">
      <TransitMap
        vehicles={mapVehicles}
        stops={stops}
        mode={mode}
        showOnlySelectedStop={Boolean(selected && selectedStop)}
        selectedId={selected?.id ?? null}
        selectedStopId={selectedStop?.id ?? null}
        theme={theme}
        focus={focus}
        fit={fit}
        shapes={routeShapes}
        routePath={routeContext?.path ?? []}
        routeStops={routeContext?.stops ?? []}
        routeLine={routeContext?.line ?? null}
        userPosition={userPosition}
        onSelect={chooseVehicle}
        onStopSelect={chooseStop}
        onViewChange={(view) => { currentViewRef.current = view; }}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-5">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-2 rounded-[22px] border border-white/70 bg-white/95 p-2 shadow-[0_10px_35px_rgba(15,23,42,.16)] backdrop-blur-xl dark:border-white/10 dark:bg-[#101827]/95">
          <button className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 text-left" onClick={() => setSearchOpen(true)}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#005BAC] text-white shadow-lg shadow-blue-700/20"><BusFront size={21} /></span>
            <span className="min-w-0"><strong className="block truncate text-[15px] font-extrabold tracking-tight">Porto Movi</strong><span className="block truncate text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{mode === 'buses' ? 'Autocarros em tempo real' : `${stops.length} paragens STCP`}</span></span>
          </button>
          <button className="icon-button" aria-label="Pesquisar linha ou paragem" onClick={() => setSearchOpen(true)}><Search size={19} /></button>
          <button className="icon-button" aria-label="Alternar tema" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        </div>
        <div className="pointer-events-auto mx-auto mt-2 flex w-fit rounded-2xl border border-white/70 bg-white/95 p-1 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-[#101827]/95">
          <button onClick={() => changeMode('buses')} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11px] font-extrabold transition ${mode === 'buses' ? 'bg-[#005BAC] text-white' : 'text-zinc-500 dark:text-zinc-300'}`}><BusFront size={14} /> Autocarros</button>
          <button onClick={() => changeMode('stops')} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11px] font-extrabold transition ${mode === 'stops' ? 'bg-[#005BAC] text-white' : 'text-zinc-500 dark:text-zinc-300'}`}><MapPin size={14} /> Paragens</button>
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-0 top-[137px] z-[490] flex justify-center px-4 pt-[env(safe-area-inset-top)]">
        {loading ? <div className="status-pill"><RefreshCw className="animate-spin" size={12} /> A ligar à rede STCP</div> : error ? <button className="pointer-events-auto status-pill !bg-rose-600 !text-white" onClick={() => void refresh(true)}>{error}</button> : <div className="status-pill"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {vehicles.length} em circulação · {agoLabel(updatedSeconds)}</div>}
      </div>

      <div className="absolute right-3 z-[500] flex flex-col gap-2 sm:right-5" style={{ bottom: selected ? 286 : selectedStop ? 'calc(min(42vh, 390px) + 24px)' : mode === 'stops' ? 210 : 76 }}>
        <button className="map-action" aria-label="Usar a minha localização" onClick={locate}><Crosshair className={locating ? 'animate-pulse' : ''} size={20} /></button>
        <button className="map-action" aria-label="Atualizar dados" onClick={() => void refresh(true)}><RefreshCw className={refreshing ? 'animate-spin' : ''} size={19} /></button>
      </div>

      {selected && (
        <section className={`absolute inset-x-3 ${mode === 'stops' ? 'bottom-3' : 'bottom-[72px]'} z-[510] mx-auto max-w-md rounded-[22px] border border-black/5 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-[#101725]`}>
          <div className="flex items-center gap-3">
            <span className="grid h-12 min-w-14 place-items-center rounded-2xl text-lg font-black shadow-sm" style={{ backgroundColor: lineColor(selected.line), color: lineTextColor(selected.line) }}>{selected.line}</span>
            <div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-zinc-400">Viatura {selected.id}</p><h2 className="truncate text-base font-extrabold">Linha {selected.line}</h2></div>
            <button className="icon-button !h-9 !w-9" aria-label={selectedStop ? 'Voltar à paragem' : 'Fechar e regressar ao mapa anterior'} onClick={closeVehicle}><X size={17} /></button>
          </div>
          {selectedStop && <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#005BAC] dark:text-sky-400"><MapPin size={11} /> A caminho de {selectedStop.name} · percurso completo e viaturas anteriores</p>}
          <div className="mt-2 grid grid-cols-[1.2fr_.85fr_1.25fr] gap-1.5">
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-zinc-100 px-2.5 py-2 dark:bg-white/5"><span className={`motion-dot ${movementClass(selected.speedKmh)}`} /><div className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-wide text-zinc-400">Estado</span><strong className="mt-0.5 block truncate text-[11px]">{movementLabel(selected.speedKmh)}</strong></div></div>
            <div className="rounded-xl bg-zinc-100 px-2 py-2 dark:bg-white/5"><span className="block text-[9px] font-bold uppercase tracking-wide text-zinc-400">Velocidade</span><strong className="mt-0.5 block text-[12px] tabular-nums">{Math.round(selected.speedKmh)} <small className="text-[9px] font-bold text-zinc-400">km/h</small></strong></div>
            <div className="rounded-xl bg-zinc-100 px-2 py-2 dark:bg-white/5"><span className="block text-[9px] font-bold uppercase tracking-wide text-zinc-400">Destino</span><strong className="mt-0.5 block truncate text-[11px]">{selected.headsign ?? directionLabel(selected.directionId)}</strong></div>
          </div>
          <p className="mt-1.5 text-center text-[10px] font-semibold text-zinc-400">Posição atualizada {agoLabel(selected.ageSec)} · {new Date(selected.observedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-100 py-2 text-[11px] font-extrabold dark:bg-white/10" onClick={() => setFocus({ lat: selected.lat, lon: selected.lon, zoom: 17, key: Date.now() })}><Navigation size={13} /> Centrar</button>
            <button className="flex items-center justify-center gap-1.5 rounded-xl bg-[#005BAC] py-2 text-[11px] font-extrabold text-white" onClick={() => showWholeLine(selected.line)}><Route size={13} /> Ver linha completa</button>
          </div>
        </section>
      )}

      {selectedStop && !selected && (
        <section className="stop-panel absolute inset-x-3 bottom-3 z-[520] mx-auto max-h-[42vh] max-w-md overflow-y-auto rounded-[22px] border border-black/5 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-[#101725]">
          <div className="sticky top-0 z-10 flex items-center gap-3 bg-white pb-2 dark:bg-[#101725]">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#005BAC] text-white shadow-sm"><MapPin size={21} /></span>
            <div className="min-w-0 flex-1"><p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-zinc-400">Paragem {selectedStop.code}</p><h2 className="truncate text-[15px] font-extrabold">{selectedStop.name}</h2><p className="mt-0.5 text-[10px] font-semibold text-zinc-400">{arrivals?.arrivals.length ?? 0} autocarro{arrivals?.arrivals.length === 1 ? '' : 's'} em aproximação</p></div>
            <button className={`icon-button !h-9 !w-9 ${favoriteIds.includes(selectedStop.id) ? '!bg-amber-100 !text-amber-500 dark:!bg-amber-400/15' : ''}`} aria-label="Adicionar ou remover favorita" onClick={() => setFavoriteIds((current) => current.includes(selectedStop.id) ? current.filter((id) => id !== selectedStop.id) : [...current, selectedStop.id])}><Star size={16} className={favoriteIds.includes(selectedStop.id) ? 'fill-current' : ''} /></button>
            <button className="icon-button !h-9 !w-9" aria-label="Fechar paragem" onClick={closeSelection}><X size={17} /></button>
          </div>

          <div className="mt-1">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-extrabold uppercase tracking-[.14em] text-zinc-400">A chegar agora</h3><span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> GPS em tempo real</span></div>
            {stopLoading && <div className="h-14 animate-pulse rounded-2xl bg-zinc-100 dark:bg-white/5" />}
            {!stopLoading && arrivals?.arrivals.length === 0 && <p className="rounded-2xl border border-dashed border-zinc-200 p-3 text-[12px] font-semibold text-zinc-500 dark:border-white/10 dark:text-zinc-400">Sem veículos reportados em aproximação neste momento.</p>}
            <div className="space-y-2">
              {arrivals?.arrivals.map((arrival) => (
                <button key={arrival.vehicleId} onClick={() => { const vehicle = vehicles.find((item) => item.id === arrival.vehicleId); if (vehicle) chooseVehicle(vehicle); }} className="flex w-full items-center gap-2.5 rounded-xl bg-zinc-100 px-2.5 py-2 text-left active:scale-[.985] dark:bg-white/5">
                  <span className="grid h-10 min-w-11 place-items-center rounded-xl text-sm font-black" style={{ backgroundColor: lineColor(arrival.line), color: lineTextColor(arrival.line) }}>{arrival.line}</span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{arrival.headsign ? `→ ${arrival.headsign}` : `Linha ${arrival.line}`}</strong><small className="text-[10px] font-semibold text-zinc-400">{distanceLabel(arrival.distanceM)} de distância</small></span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-extrabold text-emerald-600">{etaLabel(arrival.etaSeconds, arrival.atStop)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[.14em] text-zinc-400"><Clock3 size={12} /> Horário programado — hoje</h3>
            {!stopLoading && schedule?.length === 0 && <p className="text-[12px] font-semibold text-zinc-400">Sem partidas programadas para hoje.</p>}
            <div className="space-y-1.5">
              {schedule?.map((item) => (
                <div key={`${item.line}-${item.directionId}-${item.headsign}`} className="flex items-center gap-2 rounded-xl bg-zinc-100 px-2.5 py-2 dark:bg-white/5">
                  <span className="rounded-lg px-2 py-1 text-[11px] font-black" style={{ backgroundColor: lineColor(item.line), color: lineTextColor(item.line) }}>{item.line}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-zinc-500 dark:text-zinc-300">{item.headsign ? `→ ${item.headsign}` : ''}</span>
                  <span className="flex gap-1">{item.times.map((time) => <b key={time} className="rounded-md bg-white px-1.5 py-1 font-mono text-[10px] dark:bg-white/10">{time}</b>)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {mode === 'buses' && !selectedStop && (
        <section className="absolute inset-x-2 bottom-2 z-[500] h-14 overflow-hidden rounded-2xl border border-black/5 bg-white/95 px-2 shadow-xl backdrop-blur-lg dark:border-white/10 dark:bg-[#101725]/95">
          <div className="flex h-full items-center gap-2"><span className="hidden shrink-0 pl-2 text-[11px] font-extrabold text-zinc-500 sm:block">Filtrar por:</span><div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-2">
            <button className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${selectedLine === null ? 'bg-zinc-800 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'}`} onClick={() => { setSelected(null); setSelectedLine(null); setFit(null); }}>Todas</button>
            {lines.map((line) => <button key={line.id} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black shadow-sm active:scale-95 ${selectedLine === line.id ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-400' : ''}`} style={{ backgroundColor: lineColor(line.id), color: lineTextColor(line.id) }} onClick={() => chooseLine(line.id)}>{line.id}</button>)}
          </div><span className="pr-1 text-[10px] font-bold text-zinc-400">{visibleVehicles.length}</span></div>
        </section>
      )}

      {mode === 'stops' && !selectedStop && (
        <section className="absolute inset-x-2 bottom-2 z-[500] mx-auto max-w-md rounded-[22px] border border-black/5 bg-white/95 p-3 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#101725]/95">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-extrabold">Paragens perto de ti</h2><p className="text-[10px] font-semibold text-zinc-400">Seleciona uma paragem no mapa ou na lista</p></div><button className="icon-button !h-9 !w-9" onClick={locate} aria-label="Encontrar paragens próximas"><Crosshair size={16} /></button></div>
          {favoriteStops.length > 0 && <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">{favoriteStops.map((stop) => <button key={stop.id} onClick={() => chooseStop(stop)} className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5 text-[10px] font-extrabold text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"><Star size={10} className="fill-current" /> {stop.name}</button>)}</div>}
          {nearbyStops.length > 0 ? <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">{nearbyStops.map(({ stop, distance }) => <button key={stop.id} onClick={() => chooseStop(stop)} className="min-w-[160px] rounded-xl bg-zinc-100 px-3 py-2 text-left dark:bg-white/5"><strong className="block truncate text-[11px]">{stop.name}</strong><small className="font-mono text-[9px] text-zinc-400">{stop.code} · {distanceLabel(distance)}</small></button>)}</div> : <button onClick={locate} className="mt-2 w-full rounded-xl bg-blue-50 py-2 text-[11px] font-extrabold text-[#005BAC] dark:bg-blue-500/10">Ativar localização para ver as mais próximas</button>}
        </section>
      )}

      {searchOpen && (
        <div className="absolute inset-0 z-[1000] overflow-y-auto bg-zinc-100/98 px-4 pb-10 pt-[max(18px,env(safe-area-inset-top))] backdrop-blur-xl dark:bg-[#08101c]/98">
          <div className="mx-auto min-h-full max-w-xl">
            <div className="flex items-center gap-2"><label className="flex h-14 flex-1 items-center gap-3 rounded-2xl bg-white px-4 shadow-sm dark:bg-white/10"><Search className="text-[#005BAC]" size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Linha, paragem ou código" className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:text-zinc-400" />{query && <button aria-label="Limpar pesquisa" onClick={() => setQuery('')}><X size={18} /></button>}</label><button className="icon-button !h-14 !w-14 !bg-white dark:!bg-white/10" aria-label="Fechar pesquisa" onClick={() => setSearchOpen(false)}><X size={21} /></button></div>
            <p className="mb-3 mt-6 text-xs font-extrabold uppercase tracking-[.14em] text-zinc-400">Linhas</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">{searchLines.slice(0, 20).map((line) => <button key={line.id} className="flex shrink-0 items-center gap-2 rounded-2xl bg-white p-2.5 shadow-sm dark:bg-white/10" onClick={() => chooseLine(line.id)}><span className="grid h-10 min-w-11 place-items-center rounded-xl font-black" style={{ backgroundColor: lineColor(line.id), color: lineTextColor(line.id) }}>{line.id}</span><small className="pr-1 text-zinc-500">{line.count} ativos</small></button>)}</div>
            <p className="mb-3 mt-6 text-xs font-extrabold uppercase tracking-[.14em] text-zinc-400">Paragens</p>
            <div className="space-y-2">{searchStops.map((stop) => <button key={stop.id} onClick={() => chooseStop(stop)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm active:scale-[.99] dark:bg-white/10"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#005BAC] dark:bg-blue-500/15"><MapPin size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[13px]">{stop.name}</strong><small className="font-mono text-[10px] text-zinc-400">{stop.code}</small></span>{favoriteIds.includes(stop.id) && <Star size={14} className="fill-amber-500 text-amber-500" />}</button>)}</div>
            {query && searchLines.length === 0 && searchStops.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-zinc-500 dark:bg-white/10">Nenhuma linha ou paragem corresponde à pesquisa.</p>}
          </div>
        </div>
      )}

      {stale && <div className="absolute bottom-[70px] left-3 z-[510] rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-extrabold text-amber-950">A mostrar a última atualização válida</div>}
    </main>
  );
}
