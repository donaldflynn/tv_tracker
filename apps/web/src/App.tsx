import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthGuard } from './components/AuthGuard';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';
import { DashboardPage } from './pages/DashboardPage';
import { SearchPage } from './pages/SearchPage';
import { ShowDetailPage } from './pages/ShowDetailPage';
import { UpcomingPage } from './pages/UpcomingPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />

          <Route
            path="/"
            element={
              <AuthGuard>
                <DashboardPage />
              </AuthGuard>
            }
          />
          <Route
            path="/search"
            element={
              <AuthGuard>
                <SearchPage />
              </AuthGuard>
            }
          />
          <Route
            path="/show/:slug"
            element={
              <AuthGuard>
                <ShowDetailPage />
              </AuthGuard>
            }
          />
          <Route
            path="/upcoming"
            element={
              <AuthGuard>
                <UpcomingPage />
              </AuthGuard>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-surface-high)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-sans)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
