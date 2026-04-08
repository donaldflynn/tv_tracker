import { Link } from 'react-router';
import { ArrowLeft, Tv2 } from 'lucide-react';
import { SearchBar } from '../components/SearchBar';
import { EmptyState } from '../components/EmptyState';

export function SearchPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-muted hover:text-text transition-colors text-sm"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <Tv2 size={18} className="text-accent" />
            <span className="font-bold text-text tracking-tight text-sm">FlynnFlix</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-text mb-1">Add a show</h1>
          <p className="text-sm text-muted">
            Search Trakt's library and add shows to your tracker.
          </p>
        </div>

        <SearchBar />

        <EmptyState variant="search" />
      </main>
    </div>
  );
}
