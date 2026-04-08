import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, BellOff, Plus, Check, Star, Clock, Tv2, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { NotificationToggle } from '../components/NotificationToggle';
import { SeasonPanel } from '../components/SeasonPanel';
import type { ShowDetail, NotificationRow } from '@showtracker/types';

export function ShowDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();

  const { data: show, isLoading, isError } = useQuery<ShowDetail>({
    queryKey: ['show', slug],
    queryFn: () => api.get<ShowDetail>(`/shows/${slug}`),
    enabled: !!slug,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<NotificationRow>('/notifications', {
        trakt_show_id: show!.trakt_id,
        show_title: show!.title,
        show_slug: show!.slug,
        show_poster_url: show!.show_poster_url,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['shows', 'watched'] });
      queryClient.invalidateQueries({ queryKey: ['show', slug] });
      toast.success(`Added ${show!.title} to tracker`);
    },
    onError: () => toast.error('Failed to add show'),
  });

  const watchAllMutation = useMutation({
    mutationFn: (watched: boolean) =>
      api.post(`/shows/${slug}/watch`, { trakt_show_id: show!.trakt_id, watched }),
    onSuccess: (_, watched) => {
      queryClient.invalidateQueries({ queryKey: ['show', slug] });
      queryClient.invalidateQueries({ queryKey: ['shows', 'watched'] });
      toast.success(watched ? `Marked all of ${show!.title} as watched` : `Unmarked all of ${show!.title}`);
    },
    onError: () => toast.error('Failed to update watch status'),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !show) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted">Failed to load show details.</p>
        <Link to="/" className="text-sm text-accent hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const statusColour =
    show.status === 'returning series'
      ? 'text-green-400'
      : show.status === 'ended'
        ? 'text-muted'
        : 'text-yellow-400';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-muted hover:text-text transition-colors text-sm"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <Tv2 size={18} className="text-accent" />
            <span className="font-bold text-text tracking-tight text-sm">ShowTracker</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex gap-8 flex-col sm:flex-row">
          {/* Poster */}
          <div className="shrink-0">
            <div className="w-40 sm:w-48 aspect-[2/3] rounded-xl overflow-hidden border border-border shadow-2xl bg-surface">
              {show.show_poster_url ? (
                <img
                  src={show.show_poster_url}
                  alt={show.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-end p-3 bg-gradient-to-br from-surface-high to-surface">
                  <span className="text-xs text-muted line-clamp-3">{show.title}</span>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col gap-4 flex-1">
            <div>
              <h1 className="text-2xl font-bold text-text leading-tight">{show.title}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-muted">
                <span>{show.year}</span>
                {show.network && <><span className="text-border">·</span><span>{show.network}</span></>}
                {show.status && (
                  <>
                    <span className="text-border">·</span>
                    <span className={`capitalize ${statusColour}`}>{show.status}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted">
                <Tv2 size={14} className="text-accent/70" />
                <span>{show.season_count} {show.season_count === 1 ? 'season' : 'seasons'}</span>
              </div>
              {show.runtime && (
                <div className="flex items-center gap-1.5 text-muted">
                  <Clock size={14} className="text-accent/70" />
                  <span>{show.runtime} min / ep</span>
                </div>
              )}
              {show.rating && (
                <div className="flex items-center gap-1.5 text-muted">
                  <Star size={14} className="text-yellow-400" />
                  <span>{show.rating.toFixed(1)}</span>
                </div>
              )}
            </div>

            {show.genres && show.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {show.genres.slice(0, 5).map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-1 rounded-full bg-surface border border-border text-xs text-muted capitalize"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {show.overview && (
              <p className="text-sm text-muted leading-relaxed max-w-prose">{show.overview}</p>
            )}

            {/* Notification actions */}
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {show.in_tracker ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg">
                    {show.notifications_enabled ? (
                      <Bell size={14} className="text-accent" />
                    ) : (
                      <BellOff size={14} className="text-muted" />
                    )}
                    <span className="text-xs text-muted">Notifications</span>
                    <NotificationToggle
                      traktShowId={show.trakt_id}
                      enabled={show.notifications_enabled}
                    />
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-accent">
                    <Check size={13} /> In tracker
                  </span>
                </>
              ) : (
                <button
                  onClick={() => addMutation.mutate()}
                  disabled={addMutation.isPending}
                  className="flex items-center gap-2 bg-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  <Plus size={15} />
                  Add to tracker
                </button>
              )}

              {show.season_count > 0 && (
                <button
                  onClick={() => {
                    const totalWatched = show.seasons.reduce((a, s) => a + s.watched_count, 0);
                    const totalEps = show.seasons.reduce((a, s) => a + (s.episode_count ?? 0), 0);
                    watchAllMutation.mutate(totalWatched < totalEps);
                  }}
                  disabled={watchAllMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface border border-border text-muted hover:text-text hover:border-accent/40 transition-colors disabled:opacity-40"
                >
                  <CheckCheck size={13} />
                  {(() => {
                    const totalWatched = show.seasons.reduce((a, s) => a + s.watched_count, 0);
                    const totalEps = show.seasons.reduce((a, s) => a + (s.episode_count ?? 0), 0);
                    return totalWatched >= totalEps && totalEps > 0 ? 'Unwatch all' : 'Mark all watched';
                  })()}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Seasons accordion */}
        {show.seasons.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-widest mb-4">
              Seasons
            </h2>
            <div className="flex flex-col gap-2">
              {show.seasons.map((season) => (
                <SeasonPanel key={season.number} show={show} season={season} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
