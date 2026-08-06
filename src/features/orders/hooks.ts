import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderInput, OrderStatus } from '@/lib/schema';
import {
  createOrder,
  getOrder,
  listOrderStatusLogs,
  listOrders,
  updateOrderStatus,
  type OrderListParams,
} from './api';

export const orderKeys = {
  all: ['orders'] as const,
  list: (p: OrderListParams) => ['orders', 'list', p] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  logs: (id: string) => ['orders', 'logs', id] as const,
};

export function useOrderList(params: OrderListParams) {
  return useQuery({ queryKey: orderKeys.list(params), queryFn: () => listOrders(params) });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ''),
    queryFn: () => getOrder(id!),
    enabled: Boolean(id),
  });
}

export function useOrderStatusLogs(id: string | undefined) {
  return useQuery({
    queryKey: orderKeys.logs(id ?? ''),
    queryFn: () => listOrderStatusLogs(id!),
    enabled: Boolean(id),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderInput) => createOrder(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export function useUpdateOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: OrderStatus) => updateOrderStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all }),
  });
}
