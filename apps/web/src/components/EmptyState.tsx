import { Link } from 'react-router';
import { Tv2, Search } from 'lucide-react';

interface Props {
  variant?: 'dashboard' | 'search';
}

export function EmptyState({ variant = 'dashboard' }: Props) {
  if (variant === 'search') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <Search size={40} className="text-muted/40" />
        <p className="text-muted text-sm">Search for a show above to add it to your tracker.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-surface flex items-center justify-center border border-border">
        <Tv2 size={36} className="text-muted/50" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-text">Nothing tracked yet</h2>
        <p className="text-sm text-muted max-w-sm">
          Add shows to your tracker and get email notifications when new seasons drop.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          to="/search"
          className="flex items-center gap-2 bg-accent text-black font-medium px-4 py-2 rounded-lg text-sm hover:bg-accent/90 transition-colors"
        >
          <Search size={15} />
          Search shows
        </Link>
      </div>
    </div>
  );
}
