import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import type { StopInfo, Vehicle } from '../types';
import { lineColor, lineTextColor } from '../utils/stcp';

interface MapFocus {
  lat: number;
  lon: number;
  zoom?: number;
  key: number;
}

interface MapFit {
  points: Array<[number, number]>;
  key: number;
}

interface MapViewState {
  lat: number;
  lon: number;
  zoom: number;
}

interface Props {
  vehicles: Vehicle[];
  stops: StopInfo[];
  mode: 'buses' | 'stops';
  showOnlySelectedStop: boolean;
  selectedId: string | null;
  selectedStopId: string | null;
  theme: 'light' | 'dark';
  focus: MapFocus | null;
  fit: MapFit | null;
  shapes: Record<string, Array<[number, number]>>;
  routePath: Array<[number, number]>;
  routeStops: StopInfo[];
  routeLine: string | null;
  userPosition: { lat: number; lon: number } | null;
  onSelect: (vehicle: Vehicle) => void;
  onStopSelect: (stop: StopInfo) => void;
  onViewChange: (view: MapViewState) => void;
}

interface MapKit {
  leaflet: typeof Leaflet;
  map: Leaflet.Map;
  tiles: Leaflet.TileLayer;
  vehicles: Leaflet.LayerGroup;
  stops: Leaflet.LayerGroup;
  route: Leaflet.LayerGroup;
  busMarkers: Map<string, Leaflet.Marker>;
  busAnimations: Map<string, number>;
  user: Leaflet.Marker | null;
}

type Point = [number, number];

function nearestPointIndex(path: Point[], point: Point): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const lonScale = Math.cos(point[0] * Math.PI / 180);
  path.forEach(([lat, lon], index) => {
    const latDelta = lat - point[0];
    const lonDelta = (lon - point[1]) * lonScale;
    const distance = latDelta * latDelta + lonDelta * lonDelta;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function pathBetween(shape: Point[], from: Point, to: Point): Point[] | null {
  if (shape.length < 2) return null;
  const start = nearestPointIndex(shape, from);
  const end = nearestPointIndex(shape, to);
  if (end < start - 2) return null;
  if (end <= start) return [from, to];
  return [from, ...shape.slice(start + 1, end + 1), to];
}

function cumulativeDistances(path: Point[]): number[] {
  const distances = [0];
  for (let index = 1; index < path.length; index++) {
    const [previousLat, previousLon] = path[index - 1];
    const [lat, lon] = path[index];
    const x = (lon - previousLon) * Math.cos(((lat + previousLat) / 2) * Math.PI / 180);
    const y = lat - previousLat;
    distances.push(distances[index - 1] + Math.sqrt(x * x + y * y));
  }
  return distances;
}

function animateMarker(marker: Leaflet.Marker, path: Point[], durationMs = 12_000): number {
  const distances = cumulativeDistances(path);
  const total = distances[distances.length - 1];
  if (total <= 0) {
    marker.setLatLng(path[path.length - 1]);
    return 0;
  }
  const startedAt = performance.now();
  const timer = window.setInterval(() => {
    const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
    const target = total * progress;
    let segment = 1;
    while (segment < distances.length - 1 && distances[segment] < target) segment++;
    const segmentStart = distances[segment - 1];
    const segmentLength = Math.max(Number.EPSILON, distances[segment] - segmentStart);
    const local = (target - segmentStart) / segmentLength;
    const from = path[segment - 1];
    const to = path[segment];
    marker.setLatLng([from[0] + (to[0] - from[0]) * local, from[1] + (to[1] - from[1]) * local]);
    if (progress >= 1) window.clearInterval(timer);
  }, 250);
  return timer;
}

function busSvg(line: string): string {
  const fontSize = line.length <= 2 ? 13 : line.length === 3 ? 10.5 : 8.2;
  return `<svg viewBox="0 0 44 44" class="bus-svg" aria-hidden="true">
    <rect x="11.6" y="4" width="20.8" height="36" rx="6.6" fill="var(--line)" stroke="#fff" stroke-width="2.3"/>
    <rect x="9.2" y="12.6" width="2.4" height="4.2" rx="1.2" fill="var(--line)" stroke="#fff" stroke-width="1"/>
    <rect x="32.4" y="12.6" width="2.4" height="4.2" rx="1.2" fill="var(--line)" stroke="#fff" stroke-width="1"/>
    <circle cx="15.7" cy="6.6" r="1.5" fill="#FDE68A"/><circle cx="28.3" cy="6.6" r="1.5" fill="#FDE68A"/>
    <rect x="14.4" y="9.6" width="15.2" height="5.6" rx="2.2" fill="#fff" opacity=".93"/>
    <rect x="13.5" y="18" width="2" height="11" rx="1" fill="#fff" opacity=".34"/>
    <rect x="28.5" y="18" width="2" height="11" rx="1" fill="#fff" opacity=".34"/>
    <circle cx="15.7" cy="37" r="1.2" fill="#FCA5A5"/><circle cx="28.3" cy="37" r="1.2" fill="#FCA5A5"/>
    <text x="22" y="26.6" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="900" fill="var(--text)">${line}</text>
  </svg>`;
}

function vehicleIcon(leaflet: typeof Leaflet, vehicle: Vehicle, selected: boolean): Leaflet.DivIcon {
  const color = lineColor(vehicle.line);
  return leaflet.divIcon({
    className: 'bus-marker-wrap',
    html: `<div class="bus-marker${selected ? ' is-selected' : ''}" style="--line:${color};--text:${lineTextColor(vehicle.line)}"><div class="bus-rotation" style="transform:rotate(${vehicle.bearing}deg)">${busSvg(vehicle.line)}</div></div>`,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
  });
}

function stopIcon(leaflet: typeof Leaflet, selected: boolean): Leaflet.DivIcon {
  return leaflet.divIcon({
    className: 'stop-marker-wrap',
    html: `<div class="stop-marker${selected ? ' is-selected' : ''}" aria-hidden="true">
      <svg viewBox="0 0 30 42">
        <path d="M15 28v11" stroke="#D6E9FA" stroke-width="3" stroke-linecap="round"/>
        <path d="M10 40h10" stroke="#D6E9FA" stroke-width="3" stroke-linecap="round"/>
        <rect x="3" y="2" width="24" height="28" rx="7" fill="#005BAC" stroke="#fff" stroke-width="2.2"/>
        <path d="M9 11.5c0-2 1.5-3.5 3.5-3.5h5c2 0 3.5 1.5 3.5 3.5v8.8H9v-8.8Z" fill="#fff"/>
        <path d="M11 12h8v4h-8z" fill="#005BAC"/>
        <circle cx="11.5" cy="20.3" r="1.8" fill="#fff" stroke="#005BAC" stroke-width="1.2"/>
        <circle cx="18.5" cy="20.3" r="1.8" fill="#fff" stroke="#005BAC" stroke-width="1.2"/>
      </svg>
    </div>`,
    iconSize: selected ? [38, 52] : [30, 42],
    iconAnchor: selected ? [19, 48] : [15, 39],
  });
}

export default function TransitMap({ vehicles, stops, mode, showOnlySelectedStop, selectedId, selectedStopId, theme, focus, fit, shapes, routePath, routeStops, routeLine, userPosition, onSelect, onStopSelect, onViewChange }: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const kitRef = useRef<MapKit | null>(null);
  const onSelectRef = useRef(onSelect);
  const onStopSelectRef = useRef(onStopSelect);
  const onViewChangeRef = useRef(onViewChange);
  const initialThemeRef = useRef(theme);
  const vehiclesRef = useRef(vehicles);
  const selectedIdRef = useRef(selectedId);
  const stopsRef = useRef(stops);
  const modeRef = useRef(mode);
  const selectedStopIdRef = useRef(selectedStopId);
  onSelectRef.current = onSelect;
  onStopSelectRef.current = onStopSelect;
  onViewChangeRef.current = onViewChange;
  vehiclesRef.current = vehicles;
  selectedIdRef.current = selectedId;
  stopsRef.current = stops;
  modeRef.current = mode;
  selectedStopIdRef.current = selectedStopId;

  useEffect(() => {
    let disposed = false;
    void import('leaflet').then((module) => {
      if (disposed || !elementRef.current || kitRef.current) return;
      const leaflet = module.default;
      const map = leaflet.map(elementRef.current, { zoomControl: false, attributionControl: false }).setView([41.1579, -8.6291], 13);
      const tiles = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors · STCP / Porto Digital',
      }).addTo(map);
      leaflet.control.attribution({ position: 'topleft' }).addTo(map);
      const reportView = () => {
        const center = map.getCenter();
        onViewChangeRef.current({ lat: center.lat, lon: center.lng, zoom: map.getZoom() });
      };
      map.on('moveend', reportView);
      reportView();
      elementRef.current.dataset.theme = initialThemeRef.current;
      const vehicleLayer = leaflet.layerGroup().addTo(map);
      const routeLayer = leaflet.layerGroup().addTo(map);
      const stopLayer = leaflet.layerGroup().addTo(map);
      const busMarkers = new Map<string, Leaflet.Marker>();
      kitRef.current = { leaflet, map, tiles, vehicles: vehicleLayer, stops: stopLayer, route: routeLayer, busMarkers, busAnimations: new Map(), user: null };
      vehiclesRef.current.forEach((vehicle) => {
        const marker = leaflet.marker([vehicle.lat, vehicle.lon], { icon: vehicleIcon(leaflet, vehicle, vehicle.id === selectedIdRef.current), keyboard: true });
        marker.on('click', () => onSelectRef.current(vehicle));
        marker.addTo(vehicleLayer);
        busMarkers.set(vehicle.id, marker);
      });
    });
    return () => {
      disposed = true;
      kitRef.current?.busAnimations.forEach((timer) => window.clearInterval(timer));
      kitRef.current?.map.remove();
      kitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const kit = kitRef.current;
    if (!kit) return;
    if (elementRef.current) elementRef.current.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const kit = kitRef.current;
    if (!kit) return;
    const activeIds = new Set(vehicles.map((vehicle) => vehicle.id));
    kit.busMarkers.forEach((marker, id) => {
      if (activeIds.has(id)) return;
      const timer = kit.busAnimations.get(id);
      if (timer) window.clearInterval(timer);
      kit.busAnimations.delete(id);
      kit.busMarkers.delete(id);
      marker.remove();
    });
    vehicles.forEach((vehicle) => {
      let marker = kit.busMarkers.get(vehicle.id);
      if (!marker) {
        marker = kit.leaflet.marker([vehicle.lat, vehicle.lon], { keyboard: true }).addTo(kit.vehicles);
        kit.busMarkers.set(vehicle.id, marker);
      }
      marker.setIcon(vehicleIcon(kit.leaflet, vehicle, vehicle.id === selectedId));
      marker.off('click');
      marker.on('click', () => onSelectRef.current(vehicle));
      const running = kit.busAnimations.get(vehicle.id);
      if (running) window.clearInterval(running);
      const current = marker.getLatLng();
      const route = vehicle.shapeId ? shapes[vehicle.shapeId] : undefined;
      const guidedPath = route ? pathBetween(route, [current.lat, current.lng], [vehicle.lat, vehicle.lon]) : null;
      if (guidedPath && guidedPath.length >= 2) {
        const timer = animateMarker(marker, guidedPath);
        if (timer) kit.busAnimations.set(vehicle.id, timer);
      } else {
        marker.setLatLng([vehicle.lat, vehicle.lon]);
      }
    });
  }, [vehicles, selectedId, shapes]);

  useEffect(() => {
    const kit = kitRef.current;
    if (!kit) return;
    const drawStops = () => {
      kit.stops.clearLayers();
      if (mode !== 'stops') return;
      const selectedStop = selectedStopId ? stops.find((stop) => stop.id === selectedStopId) : null;
      if (showOnlySelectedStop) {
        if (selectedStop) {
          kit.leaflet.marker([selectedStop.lat, selectedStop.lon], {
            icon: stopIcon(kit.leaflet, true),
            keyboard: true,
            zIndexOffset: 1200,
          }).on('click', () => onStopSelectRef.current(selectedStop)).addTo(kit.stops);
        }
        return;
      }
      if (routeStops.length > 0) {
        routeStops.forEach((stop) => {
          const selected = stop.id === selectedStopId;
          kit.leaflet.marker([stop.lat, stop.lon], {
            icon: stopIcon(kit.leaflet, selected),
            keyboard: true,
            zIndexOffset: selected ? 1200 : 300,
          }).on('click', () => onStopSelectRef.current(stop)).addTo(kit.stops);
        });
        return;
      }
      if (selectedStop) {
        kit.leaflet.marker([selectedStop.lat, selectedStop.lon], {
          icon: stopIcon(kit.leaflet, true),
          keyboard: true,
          zIndexOffset: 1200,
        }).on('click', () => onStopSelectRef.current(selectedStop)).addTo(kit.stops);
        return;
      }
      if (kit.map.getZoom() < 13) return;
      const bounds = kit.map.getBounds().pad(0.18);
      const center = kit.map.getCenter();
      const zoom = kit.map.getZoom();
      const limit = zoom < 14 ? 55 : zoom < 15 ? 110 : zoom < 16 ? 180 : 260;
      stops
        .filter((stop) => bounds.contains([stop.lat, stop.lon]))
        .sort((first, second) => {
          const firstDistance = (first.lat - center.lat) ** 2 + (first.lon - center.lng) ** 2;
          const secondDistance = (second.lat - center.lat) ** 2 + (second.lon - center.lng) ** 2;
          return firstDistance - secondDistance;
        })
        .slice(0, limit)
        .forEach((stop) => {
        const marker = kit.leaflet.marker([stop.lat, stop.lon], {
          icon: stopIcon(kit.leaflet, false),
          keyboard: true,
        });
        marker.on('click', () => onStopSelectRef.current(stop));
        marker.addTo(kit.stops);
        });
    };
    drawStops();
    kit.map.on('zoomend', drawStops);
    kit.map.on('moveend', drawStops);
    return () => {
      kit.map.off('zoomend', drawStops);
      kit.map.off('moveend', drawStops);
      kit.stops.clearLayers();
    };
  }, [mode, routeStops, selectedStopId, showOnlySelectedStop, stops]);

  useEffect(() => {
    const kit = kitRef.current;
    if (!kit) return;
    kit.route.clearLayers();
    if (routePath.length < 2 || !routeLine) return;
    kit.leaflet.polyline(routePath, {
      color: '#ffffff',
      weight: 8,
      opacity: theme === 'dark' ? 0.34 : 0.78,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(kit.route);
    kit.leaflet.polyline(routePath, {
      color: lineColor(routeLine),
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(kit.route);
  }, [routeLine, routePath, theme]);

  useEffect(() => {
    const kit = kitRef.current;
    if (kit && focus) kit.map.flyTo([focus.lat, focus.lon], focus.zoom ?? 16, { duration: 0.7 });
  }, [focus]);

  useEffect(() => {
    const kit = kitRef.current;
    if (!kit || !fit || fit.points.length === 0) return;
    if (fit.points.length === 1) {
      kit.map.flyTo(fit.points[0], 16, { duration: 0.7 });
      return;
    }
    kit.map.fitBounds(fit.points, { paddingTopLeft: [42, 118], paddingBottomRight: [42, 98], maxZoom: 15, animate: true });
  }, [fit]);

  useEffect(() => {
    const kit = kitRef.current;
    if (!kit) return;
    if (kit.user) {
      kit.user.remove();
      kit.user = null;
    }
    if (userPosition) {
      const icon = kit.leaflet.divIcon({ className: 'user-marker-wrap', html: '<span class="user-marker"><i /></span>', iconSize: [34, 34], iconAnchor: [17, 17] });
      kit.user = kit.leaflet.marker([userPosition.lat, userPosition.lon], { icon }).addTo(kit.map);
    }
  }, [userPosition]);

  return <div ref={elementRef} className="absolute inset-0" aria-label="Mapa dos autocarros STCP" />;
}

export type { MapFit, MapFocus, MapViewState };
