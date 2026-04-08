import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Search, LogOut, Tv2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { ShowCard } from '../components/ShowCard';
import { EmptyState } from '../components/EmptyState';
import type { WatchedShow } from '@showtracker/types';

type SortKey = 'latest_released' | 'first_released' | 'recently_watched';

const SORT_LABELS: Record<SortKey, string> = {
  latest_released: 'Latest released',
  first_released: 'First released',
  recently_watched: 'Recently watched',
};

function sortShows(shows: WatchedShow[], key: SortKey): WatchedShow[] {
  return [...shows].sort((a, b) => {
    switch (key) {
      case 'latest_released':
        return (b.year ?? 0) - (a.year ?? 0);
      case 'first_released':
        return (a.year ?? 0) - (b.year ?? 0);
      case 'recently_watched':
        return new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime();
    }
  });
}

export function DashboardPage() {
  const { data: me } = useAuth();
  const [sort, setSort] = useState<SortKey>('latest_released');

  const { data: shows, isLoading, isError } = useQuery<WatchedShow[]>({
    queryKey: ['shows', 'watched'],
    queryFn: () => api.get<WatchedShow[]>('/shows/watched'),
    staleTime: 5 * 60 * 1000,
  });

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      window.location.href = '/login';
    } catch {
      toast.error('Logout failed');
    }
  };

  const sorted = shows ? sortShows(shows, sort) : [];
  const notificationsOn = sorted.filter((s) => s.notifications_enabled);
  const notificationsOff = sorted.filter((s) => !s.notifications_enabled);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Tv2 size={20} className="text-accent" />
            <span className="font-bold text-text tracking-tight">ShowTracker</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/upcoming"
              className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors px-2 py-1 rounded-lg hover:bg-surface"
            >
              <Calendar size={15} />
              <span className="hidden sm:inline">Upcoming</span>
            </Link>

            <Link
              to="/search"
              className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors px-2 py-1 rounded-lg hover:bg-surface"
            >
              <Search size={15} />
              <span className="hidden sm:inline">Search</span>
            </Link>

            {me && (
              <span className="hidden sm:block text-xs text-muted border-l border-border pl-3">
                {me.trakt_slug}
              </span>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-text transition-colors px-2 py-1 rounded-lg hover:bg-surface"
              title="Sign out"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center py-24 gap-3">
            <p className="text-muted">Failed to load your shows.</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-accent hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {shows?.length === 0 && <EmptyState />}

            {shows && shows.length > 0 && (
              <>
                {/* Sort controls */}
                <div className="flex items-center justify-end gap-2 mb-6">
                  <span className="text-xs text-muted">Sort:</span>
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => setSort(key)}
                      className={[
                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                        sort === key
                          ? 'bg-accent text-black'
                          : 'bg-surface text-muted hover:text-text border border-border',
                      ].join(' ')}
                    >
                      {SORT_LABELS[key]}
                    </button>
                  ))}
                </div>

                {notificationsOn.length > 0 && (
                  <section className="mb-12">
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="text-sm font-semibold text-muted uppercase tracking-widest">
                        Watching
                        <span className="ml-2 text-accent">{notificationsOn.length}</span>
                      </h2>
                      <Link
                        to="/search"
                        className="flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
                      >
                        <Search size={12} /> Add show
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {notificationsOn.map((show) => (
                        <ShowCard key={show.trakt_id} show={show} />
                      ))}
                    </div>
                  </section>
                )}

                {notificationsOff.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-muted uppercase tracking-widest mb-5">
                      Muted
                      <span className="ml-2 text-muted/50">{notificationsOff.length}</span>
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {notificationsOff.map((show) => (
                        <ShowCard key={show.trakt_id} show={show} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
