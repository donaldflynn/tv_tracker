import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, CheckCircle2, Circle, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { ShowDetail, ShowSeasonSummary, EpisodeDetail } from '@showtracker/types';

interface Props {
  show: ShowDetail;
  season: ShowSeasonSummary;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  );
}

export function SeasonPanel({ show, season }: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const episodeKey = ['show', show.slug, 'season', season.number, 'episodes'];

  const { data: episodes, isLoading } = useQuery<EpisodeDetail[]>({
    queryKey: episodeKey,
    queryFn: () => {
      const params = show.tmdb_id ? `?tmdb_id=${show.tmdb_id}` : '';
      return api.get<EpisodeDetail[]>(`/shows/${show.slug}/seasons/${season.number}/episodes${params}`);
    },
    enabled: open,
    staleTime: 2 * 60 * 1000,
  });

  const watchedCount = episodes ? episodes.filter((e) => e.watched).length : season.watched_count;
  const totalCount = season.episode_count ?? 0;
  const allWatched = totalCount > 0 && watchedCount >= totalCount;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: episodeKey });
    queryClient.invalidateQueries({ queryKey: ['show', show.slug] });
    queryClient.invalidateQueries({ queryKey: ['shows', 'watched'] });
  }

  const episodeMutation = useMutation({
    mutationFn: (ep: EpisodeDetail) =>
      api.post(`/shows/${show.slug}/watch`, {
        trakt_show_id: show.trakt_id,
        season: season.number,
        episode: { number: ep.number, trakt_id: ep.trakt_id, first_aired: ep.first_aired },
        watched: !ep.watched,
      }),
    onSuccess: (_, ep) => {
      // Optimistic update in cache
      queryClient.setQueryData<EpisodeDetail[]>(episodeKey, (prev) =>
        prev?.map((e) => (e.number === ep.number ? { ...e, watched: !e.watched } : e)),
      );
      invalidate();
    },
    onError: () => toast.error('Failed to update episode'),
  });

  const seasonMutation = useMutation({
    mutationFn: (watched: boolean) =>
      api.post(`/shows/${show.slug}/watch`, {
        trakt_show_id: show.trakt_id,
        season: season.number,
        watched,
      }),
    onSuccess: (_, watched) => {
      queryClient.setQueryData<EpisodeDetail[]>(episodeKey, (prev) =>
        prev?.map((e) => ({ ...e, watched })),
      );
      invalidate();
      toast.success(watched ? `Season ${season.number} marked as watched` : `Season ${season.number} unmarked`);
    },
    onError: () => toast.error('Failed to update season'),
  });

  const isMutating = episodeMutation.isPending || seasonMutation.isPending;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Season header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-surface cursor-pointer hover:bg-surface-high transition-colors select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="w-9 h-9 rounded-lg bg-surface-high flex items-center justify-center text-xs font-bold text-accent shrink-0">
          {season.number}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text truncate">
            {season.title ?? `Season ${season.number}`}
          </p>
          <p className="text-xs text-muted">
            {watchedCount}/{totalCount} watched
            {season.first_aired && (
              <> · {new Intl.DateTimeFormat('en', { year: 'numeric' }).format(new Date(season.first_aired))}</>
            )}
          </p>
        </div>

        {/* Mark all watched / unwatch all */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            seasonMutation.mutate(!allWatched);
          }}
          disabled={isMutating || totalCount === 0}
          className={[
            'shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40',
            allWatched
              ? 'bg-accent/15 text-accent hover:bg-accent/25'
              : 'bg-surface-high text-muted hover:text-text hover:bg-surface',
          ].join(' ')}
          title={allWatched ? 'Unwatch season' : 'Mark season as watched'}
        >
          {seasonMutation.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Check size={12} />
          )}
          {allWatched ? 'Watched' : 'Mark watched'}
        </button>

        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Episode list */}
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-muted" />
            </div>
          )}

          {episodes?.map((ep) => (
            <div
              key={ep.number}
              className="flex items-center gap-3 px-4 py-3 bg-background hover:bg-surface/50 transition-colors"
            >
              {/* Still thumbnail */}
              {ep.still_url ? (
                <img
                  src={ep.still_url}
                  alt={ep.title}
                  className="hidden sm:block w-28 aspect-video rounded-lg object-cover shrink-0 bg-surface-high"
                  loading="lazy"
                />
              ) : (
                <div className="hidden sm:flex w-28 aspect-video rounded-lg bg-surface-high shrink-0 items-center justify-center">
                  <span className="text-xs text-muted font-bold">E{ep.number}</span>
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text leading-tight">
                  <span className="text-muted mr-1.5">E{ep.number}</span>
                  {ep.title}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {formatDate(ep.first_aired)}
                  {ep.runtime && <> · {ep.runtime} min</>}
                </p>
                {ep.overview && (
                  <p className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed hidden md:block">
                    {ep.overview}
                  </p>
                )}
              </div>

              {/* Watched toggle */}
              <button
                onClick={() => episodeMutation.mutate(ep)}
                disabled={isMutating}
                className="shrink-0 p-1 rounded-lg transition-colors disabled:opacity-40 hover:bg-surface-high"
                title={ep.watched ? 'Mark as unwatched' : 'Mark as watched'}
              >
                {ep.watched ? (
                  <CheckCircle2 size={20} className="text-accent" />
                ) : (
                  <Circle size={20} className="text-muted" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
