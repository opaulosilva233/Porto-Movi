import { api } from './api';
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

export async function getStops(query?: string): Promise<StopInfo[]> {
  const response = await api.get<ApiResponse<{ count: number; stops: StopInfo[] }>>('/stops', {
    params: query ? { q: query } : undefined,
  });
  return response.data.data.stops;
}

export async function getStopArrivals(code: string): Promise<ArrivalsPayload> {
  const response = await api.get<ApiResponse<ArrivalsPayload>>(`/stops/${encodeURIComponent(code)}/arrivals`);
  return response.data.data;
}

export async function getStopSchedule(code: string): Promise<SchedulePayload> {
  const response = await api.get<ApiResponse<SchedulePayload>>(`/stops/${encodeURIComponent(code)}/schedule`);
  return response.data.data;
}

export async function getPatternRoute(pattern: string): Promise<PatternRoutePayload> {
  const response = await api.get<ApiResponse<PatternRoutePayload>>(`/patterns/${encodeURIComponent(pattern)}`);
  return response.data.data;
}
