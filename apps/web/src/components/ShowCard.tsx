import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, MoreVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { NotificationToggle } from './NotificationToggle';
import type { WatchedShow } from '@showtracker/types';

interface Props {
  show: WatchedShow;
}

function PosterPlaceholder({ title }: { title: string }) {
  const hue = [...title].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="w-full h-full flex items-end p-3"
      style={{
        background: `linear-gradient(135deg, hsl(${hue},40%,18%) 0%, hsl(${(hue + 40) % 360},35%,12%) 100%)`,
      }}
    >
      <span className="text-xs font-medium text-white/60 line-clamp-3 leading-snug">
        {title}
      </span>
    </div>
  );
}

export function ShowCard({ show }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: () => api.delete(`/notifications/${show.trakt_id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['shows', 'watched'] });
      toast.success(`Removed ${show.title} from tracker`);
    },
    onError: () => toast.error('Failed to remove show'),
  });

  const lastWatched = show.last_watched_at
    ? new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(
        new Date(show.last_watched_at),
      )
    : null;

  return (
    <article className="group relative flex flex-col bg-surface rounded-xl overflow-hidden border border-border hover:border-accent/40 transition-colors">
      {/* Poster */}
      <Link to={`/show/${show.slug}`} className="block aspect-[2/3] overflow-hidden bg-surface-high">
        {show.show_poster_url ? (
          <img
            src={show.show_poster_url}
            alt={show.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <PosterPlaceholder title={show.title} />
        )}
      </Link>

      {/* Body */}
      <div className="flex flex-col gap-1 p-3 flex-1">
        <Link
          to={`/show/${show.slug}`}
          className="font-semibold text-sm text-text leading-tight line-clamp-2 hover:text-accent transition-colors"
        >
          {show.title}
        </Link>

        <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
          <span>{show.year}</span>
          {lastWatched && (
            <>
              <span className="text-border">·</span>
              <span>Watched {lastWatched}</span>
            </>
          )}
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between mt-auto pt-2">
          {show.in_tracker ? (
            <div className="flex items-center gap-2">
              {show.notifications_enabled ? (
                <Bell size={14} className="text-accent" />
              ) : (
                <BellOff size={14} className="text-muted" />
              )}
              <NotificationToggle
                traktShowId={show.trakt_id}
                enabled={show.notifications_enabled}
              />
            </div>
          ) : (
            <span className="text-xs text-muted italic">Not tracked</span>
          )}

          {show.in_tracker && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1 rounded text-muted hover:text-text hover:bg-surface-high transition-colors"
                aria-label="Show options"
              >
                <MoreVertical size={14} />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 bottom-7 z-20 bg-surface-high border border-border rounded-lg shadow-xl py-1 min-w-36">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        removeMutation.mutate();
                      }}
                      disabled={removeMutation.isPending}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-surface transition-colors"
                    >
                      <Trash2 size={13} />
                      Remove from tracker
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
