import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api';

interface Props {
  traktShowId: number;
  enabled: boolean;
}

export function NotificationToggle({ traktShowId, enabled }: Props) {
  const [optimistic, setOptimistic] = useState(enabled);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (value: boolean) =>
      api.patch(`/notifications/${traktShowId}`, { notifications_enabled: value }),
    onMutate: (value) => {
      setOptimistic(value);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['shows', 'watched'] });
    },
    onError: (_err, _value, _ctx) => {
      setOptimistic(!optimistic);
      toast.error('Failed to update notification setting');
    },
  });

  const handleToggle = () => {
    mutation.mutate(!optimistic);
  };

  return (
    <button
      role="switch"
      aria-checked={optimistic}
      aria-label={optimistic ? 'Notifications on' : 'Notifications off'}
      onClick={handleToggle}
      disabled={mutation.isPending}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed',
        optimistic ? 'bg-accent' : 'bg-surface-high',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md',
          'transform transition duration-200 ease-in-out',
          optimistic ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}
