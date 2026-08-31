import { api } from './api';
import type { ApiResponse, ShapePayload, VehiclesPayload } from '../types';

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
