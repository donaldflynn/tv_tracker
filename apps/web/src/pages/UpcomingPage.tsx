import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowLeft, Tv2, Calendar, Clock } from 'lucide-react';
import { api } from '../lib/api';
import type { UpcomingShow } from '@showtracker/types';

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatAirDate(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function DaysChip({ iso }: { iso: string }) {
  const d = daysUntil(iso);
  const label = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`;
  const cls =
    d === 0
      ? 'bg-accent/20 text-accent'
      : d <= 7
        ? 'bg-yellow-500/15 text-yellow-400'
        : 'bg-surface-high text-muted';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <Clock size={10} />
      {label}
    </span>
  );
}

export function UpcomingPage() {
  const { data: shows, isLoading, isError } = useQuery<UpcomingShow[]>({
    queryKey: ['shows', 'upcoming'],
    queryFn: () => api.get<UpcomingShow[]>('/shows/upcoming'),
    staleTime: 60 * 60 * 1000, // 1 hour — air dates rarely change
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-8">
          <Calendar size={18} className="text-accent" />
          <h1 className="text-xl font-bold text-text">Upcoming episodes</h1>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {isError && (
          <p className="text-muted text-sm">Failed to load upcoming episodes.</p>
        )}

        {!isLoading && !isError && shows?.length === 0 && (
          <div className="flex flex-col items-center py-24 gap-3 text-center">
            <Calendar size={40} className="text-muted/30" />
            <p className="text-muted">No upcoming episodes found for your tracked shows.</p>
            <p className="text-xs text-muted/60">Shows that have ended or are on hiatus won't appear here.</p>
          </div>
        )}

        {shows && shows.length > 0 && (
          <div className="flex flex-col gap-3">
            {shows.map((show) => (
              <Link
                key={show.trakt_id}
                to={`/show/${show.slug}`}
                className="flex items-center gap-4 p-4 bg-surface rounded-xl border border-border hover:border-accent/40 transition-colors"
              >
                {/* Poster */}
                <div className="shrink-0 w-12 aspect-[2/3] rounded-lg overflow-hidden bg-surface-high">
                  {show.show_poster_url ? (
                    <img
                      src={show.show_poster_url}
                      alt={show.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Tv2 size={14} className="text-muted/40" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-text truncate">{show.title}</p>
                  <p className="text-xs text-muted mt-0.5">
                    S{String(show.next_episode.season).padStart(2, '0')}E
                    {String(show.next_episode.number).padStart(2, '0')}
                    {show.next_episode.title && ` — ${show.next_episode.title}`}
                  </p>
                  {show.next_episode.overview && (
                    <p className="text-xs text-muted/70 mt-1 line-clamp-1 hidden sm:block">
                      {show.next_episode.overview}
                    </p>
                  )}
                </div>

                {/* Air date */}
                <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                  <DaysChip iso={show.next_episode.first_aired} />
                  <p className="text-xs text-muted">{formatAirDate(show.next_episode.first_aired)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
