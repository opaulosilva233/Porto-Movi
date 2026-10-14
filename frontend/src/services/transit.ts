import { api } from './api';
export interface MetroDepartures {
  available: boolean;
  checkedAt: string;
  departures: Array<{ id: string; line: string; headsign: string; departureAt: string; realtime: boolean; cancelled: boolean }>;
}
export async function getMetroDepartures(code: string): Promise<MetroDepartures> {
  const response = await api.get<ApiResponse<MetroDepartures>>(`/metro/stops/${encodeURIComponent(code)}/departures`);
  return response.data.data;
}
export async function getMetroRoutes(code: string): Promise<PatternRoutePayload[]> {
  const response = await api.get<ApiResponse<{ routes: PatternRoutePayload[] }>>(`/metro/stops/${encodeURIComponent(code)}/routes`);
  return response.data.data.routes;
}
import type { ApiResponse, ArrivalsPayload, PatternRoutePayload, SchedulePayload, ShapePayload, StopInfo, VehiclesPayload } from '../types';

export async function getVehicles(): Promise<{ payload: VehiclesPayload; message: string; ok: boolean }> {
  const response = await api.get<ApiResponse<VehiclesPayload>>('/vehicles');
  return {
    payload: response.data.data,
    message: response.data.message,
    ok: response.data.success,
  };
}

export async function getShapes(ids: string[]): Promise<ShapePayload[]> {
  const response = await api.get<ApiResponse<{ shapes: ShapePayload[] }>>('/shapes', { params: { ids } });
  return response.data.data.shapes;
}

export async function getStops(query?: string, operator: 'stcp' | 'metro' | 'unir' = 'stcp'): Promise<StopInfo[]> {
  const response = await api.get<ApiResponse<{ count: number; stops: StopInfo[] }>>(operator === 'stcp' ? '/stops' : '/' + operator + '/stops', {
    params: query ? { q: query } : undefined,
  });
  return response.data.data.stops;
}

export async function getStopArrivals(code: string): Promise<ArrivalsPayload> {
  const response = await api.get<ApiResponse<ArrivalsPayload>>(`/stops/${encodeURIComponent(code)}/arrivals`);
  return response.data.data;
}

export async function getStopSchedule(code: string, operator: 'stcp' | 'metro' | 'unir' = 'stcp'): Promise<SchedulePayload> {
  const response = await api.get<ApiResponse<SchedulePayload>>(`${operator === 'stcp' ? '' : '/' + operator}/stops/${encodeURIComponent(code)}/schedule`);
  return response.data.data;
}

export async function getPatternRoute(pattern: string): Promise<PatternRoutePayload> {
  const response = await api.get<ApiResponse<PatternRoutePayload>>(`/patterns/${encodeURIComponent(pattern)}`);
  return response.data.data;
}

export async function getUnirRoutes(code: string): Promise<PatternRoutePayload[]> {
  const response = await api.get<ApiResponse<{ routes: PatternRoutePayload[] }>>(`/unir/stops/${encodeURIComponent(code)}/routes`);
  return response.data.data.routes;
}
export async function getUnirRoute(trip: string): Promise<PatternRoutePayload> {
  const response = await api.get<ApiResponse<PatternRoutePayload>>(`/unir/trips/${encodeURIComponent(trip)}`);
  return response.data.data;
}
