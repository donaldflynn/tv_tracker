import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { ShowSearchResult, NotificationRow } from '@showtracker/types';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQ = useDebounce(query, 300);
  const queryClient = useQueryClient();

  const { data: results, isFetching } = useQuery<ShowSearchResult[]>({
    queryKey: ['search', debouncedQ],
    queryFn: () => api.get<ShowSearchResult[]>(`/shows/search?q=${encodeURIComponent(debouncedQ)}`),
    enabled: debouncedQ.length > 2,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (show: ShowSearchResult) =>
      api.post<NotificationRow>('/notifications', {
        trakt_show_id: show.trakt_id,
        show_title: show.title,
        show_slug: show.slug,
        show_poster_url: null,
      }),
    onSuccess: (_, show) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['shows', 'watched'] });
      queryClient.invalidateQueries({ queryKey: ['search', debouncedQ] });
      toast.success(`Added ${show.title} to tracker`);
    },
    onError: () => toast.error('Failed to add show'),
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showDropdown = open && debouncedQ.length > 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        {isFetching && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin"
          />
        )}
        <input
          type="search"
          value={query}
          placeholder="Search shows to add…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-full bg-surface border border-border rounded-lg pl-9 pr-9 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {showDropdown && results && results.length > 0 && (
        <ul className="absolute z-30 top-full mt-1 w-full bg-surface-high border border-border rounded-xl shadow-2xl overflow-hidden">
          {results.map((show) => (
            <li
              key={show.trakt_id}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{show.title}</p>
                <p className="text-xs text-muted truncate">
                  {show.year}
                  {show.network && ` · ${show.network}`}
                  {show.status && ` · ${show.status}`}
                </p>
              </div>

              <button
                onClick={() => !show.in_tracker && addMutation.mutate(show)}
                disabled={show.in_tracker || addMutation.isPending}
                className={[
                  'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  show.in_tracker
                    ? 'bg-accent/15 text-accent cursor-default'
                    : 'bg-accent text-black hover:bg-accent/90 disabled:opacity-50',
                ].join(' ')}
              >
                {show.in_tracker ? (
                  <>
                    <Check size={12} /> Added
                  </>
                ) : (
                  <>
                    <Plus size={12} /> Add
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showDropdown && results && results.length === 0 && !isFetching && (
        <div className="absolute z-30 top-full mt-1 w-full bg-surface-high border border-border rounded-xl shadow-2xl px-4 py-3">
          <p className="text-sm text-muted">No shows found for "{debouncedQ}"</p>
        </div>
      )}
    </div>
  );
}
