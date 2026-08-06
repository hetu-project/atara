import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CounterpartyInput, Role } from '@/lib/schema';
import {
  createCounterparty,
  getCounterparty,
  listCounterparties,
  listCounterpartyOptions,
  updateCounterparty,
  type ListParams,
} from './api';

export const counterpartyKeys = {
  all: ['counterparties'] as const,
  list: (p: ListParams) => ['counterparties', 'list', p] as const,
  options: (role: Role) => ['counterparties', 'options', role] as const,
  detail: (id: string) => ['counterparties', 'detail', id] as const,
};

export function useCounterpartyList(params: ListParams) {
  return useQuery({
    queryKey: counterpartyKeys.list(params),
    queryFn: () => listCounterparties(params),
  });
}

export function useCounterpartyOptions(role: Role) {
  return useQuery({
    queryKey: counterpartyKeys.options(role),
    queryFn: () => listCounterpartyOptions(role),
  });
}

export function useCounterparty(id: string | undefined) {
  return useQuery({
    queryKey: counterpartyKeys.detail(id ?? ''),
    queryFn: () => getCounterparty(id!),
    enabled: Boolean(id),
  });
}

export function useCreateCounterparty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CounterpartyInput) => createCounterparty(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: counterpartyKeys.all }),
  });
}

export function useUpdateCounterparty(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CounterpartyInput) => updateCounterparty(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: counterpartyKeys.all }),
  });
}
