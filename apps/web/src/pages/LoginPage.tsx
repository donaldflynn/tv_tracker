import { Navigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';

function TraktLogo() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="w-8 h-8" aria-hidden>
      <circle cx="40" cy="40" r="40" fill="#ED1C24" />
      <path
        d="M24 24l32 32M24 56l32-32"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoginPage() {
  const { data, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (data) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(45,212,191,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-sm w-full">
        {/* Logo mark */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center shadow-xl">
            <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
              <rect width="32" height="32" rx="8" fill="none" />
              <path
                d="M6 26V6h4v8h12V6h4v20h-4V18H10v8H6z"
                fill="currentColor"
                className="text-accent"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-text tracking-tight">ShowTracker</h1>
          <p className="text-sm text-muted text-center leading-relaxed">
            Get notified when new seasons drop.
          </p>
        </div>

        {/* Card */}
        <div className="w-full bg-surface border border-border rounded-2xl p-8 shadow-2xl flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-text">Sign in to continue</h2>
            <p className="text-xs text-muted">
              Connect your Trakt account to sync your watch history and enable notifications.
            </p>
          </div>

          <a
            href="/api/auth/login"
            className="flex items-center justify-center gap-3 bg-[#ED1C24] hover:bg-[#c91820] text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-lg"
          >
            <TraktLogo />
            Sign in with Trakt
          </a>

          <p className="text-xs text-muted text-center">
            You'll be redirected to Trakt to authorize. We never store your password.
          </p>
        </div>
      </div>
    </div>
  );
}
