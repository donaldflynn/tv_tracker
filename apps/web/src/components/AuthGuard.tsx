import { Navigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

export function AuthGuard({ children }: Props) {
  const { data, isLoading, isError } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
