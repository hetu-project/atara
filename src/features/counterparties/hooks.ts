import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CounterpartyInput } from '@/lib/schema';
import { createCounterparty, getCounterparty, updateCounterparty } from './api';

export const counterpartyKeys = {
  all: ['counterparties'] as const,
  detail: (id: string) => ['counterparties', 'detail', id] as const,
};

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
