import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowLeft, Tv2, Calendar, Clock, History } from 'lucide-react';
import { api } from '../lib/api';
import type { ShowSchedule, ShowEpisodeEntry } from '@showtracker/types';

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function daysAgo(iso: string): number {
  return Math.abs(daysUntil(iso));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function TimeChip({ iso, past }: { iso: string; past?: boolean }) {
  const d = past ? daysAgo(iso) : daysUntil(iso);
  let label: string;
  let cls: string;

  if (past) {
    label = d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
    cls = d <= 1 ? 'bg-accent/20 text-accent' : d <= 7 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-surface-high text-muted';
  } else {
    label = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`;
    cls = d === 0 ? 'bg-accent/20 text-accent' : d <= 7 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-surface-high text-muted';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <Clock size={10} />
      {label}
    </span>
  );
}

function EpisodeRow({ entry, past }: { entry: ShowEpisodeEntry; past?: boolean }) {
  return (
    <Link
      to={`/show/${entry.slug}`}
      className="flex items-center gap-4 p-4 bg-surface rounded-xl border border-border hover:border-accent/40 transition-colors"
    >
      <div className="shrink-0 w-12 aspect-[2/3] rounded-lg overflow-hidden bg-surface-high">
        {entry.show_poster_url ? (
          <img
            src={entry.show_poster_url}
            alt={entry.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Tv2 size={14} className="text-muted/40" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-text truncate">{entry.title}</p>
        <p className="text-xs text-muted mt-0.5">
          S{String(entry.episode.season).padStart(2, '0')}E
          {String(entry.episode.number).padStart(2, '0')}
          {entry.episode.title && ` — ${entry.episode.title}`}
        </p>
        {entry.episode.overview && (
          <p className="text-xs text-muted/70 mt-1 line-clamp-1 hidden sm:block">
            {entry.episode.overview}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
        <TimeChip iso={entry.episode.first_aired} past={past} />
        <p className="text-xs text-muted">{formatDate(entry.episode.first_aired)}</p>
      </div>
    </Link>
  );
}

export function UpcomingPage() {
  const { data, isLoading, isError } = useQuery<ShowSchedule>({
    queryKey: ['shows', 'upcoming'],
    queryFn: () => api.get<ShowSchedule>('/shows/upcoming'),
    staleTime: 60 * 60 * 1000,
  });

  const hasContent = (data?.upcoming.length ?? 0) > 0 || (data?.recent.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-1.5 text-muted hover:text-text transition-colors text-sm">
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <Tv2 size={18} className="text-accent" />
            <span className="font-bold text-text tracking-tight text-sm">FlynnFlix</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-8">
          <Calendar size={18} className="text-accent" />
          <h1 className="text-xl font-bold text-text">Schedule</h1>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {isError && (
          <p className="text-muted text-sm">Failed to load schedule.</p>
        )}

        {!isLoading && !isError && !hasContent && (
          <div className="flex flex-col items-center py-24 gap-3 text-center">
            <Calendar size={40} className="text-muted/30" />
            <p className="text-muted">Nothing to show yet.</p>
            <p className="text-xs text-muted/60">
              Episodes airing in the next few weeks and those released in the last 30 days will appear here.
            </p>
          </div>
        )}

        {!isLoading && !isError && hasContent && (
          <div className="flex flex-col gap-10">
            {(data?.upcoming.length ?? 0) > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-muted uppercase tracking-widest mb-4">
                  <Calendar size={13} />
                  Coming up
                  <span className="text-accent">{data!.upcoming.length}</span>
                </h2>
                <div className="flex flex-col gap-3">
                  {data!.upcoming.map((entry) => (
                    <EpisodeRow key={entry.trakt_id} entry={entry} />
                  ))}
                </div>
              </section>
            )}

            {(data?.recent.length ?? 0) > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-muted uppercase tracking-widest mb-4">
                  <History size={13} />
                  Recently aired
                  <span className="text-muted/50">{data!.recent.length}</span>
                </h2>
                <div className="flex flex-col gap-3">
                  {data!.recent.map((entry) => (
                    <EpisodeRow key={entry.trakt_id} entry={entry} past />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
