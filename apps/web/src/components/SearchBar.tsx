import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Check, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import type { ShowSearchResult } from '@showtracker/types';

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

  const { data: results, isFetching } = useQuery<ShowSearchResult[]>({
    queryKey: ['search', debouncedQ],
    queryFn: () => api.get<ShowSearchResult[]>(`/shows/search?q=${encodeURIComponent(debouncedQ)}`),
    enabled: debouncedQ.length > 2,
    staleTime: 30_000,
  });

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
          placeholder="Search shows…"
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
            <li key={show.trakt_id}>
              <Link
                to={`/show/${show.slug}`}
                onClick={() => setOpen(false)}
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
                {show.in_tracker ? (
                  <Check size={14} className="shrink-0 text-accent" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-muted" />
                )}
              </Link>
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
