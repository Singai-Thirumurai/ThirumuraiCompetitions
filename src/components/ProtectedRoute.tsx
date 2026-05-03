import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { Navigate, useLocation } from 'react-router-dom';

interface Props {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      // 1. Get the session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);

      if (currentSession) {
        // 2. Fetch the profile
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentSession.user.id)
          .single();
        
        if (error || !profile) {
          console.error("Role fetch error:", error);
          // CRITICAL: Do not default to 'judge' here. 
          // Set to null or a 'pending' state so they don't get accidental access.
          setUserRole(null); 
        } else {
          console.log("Verified Role:", profile.role);
          setUserRole(profile.role);
        }
      }
      setLoading(false);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // When auth state changes (login/logout), re-verify everything
      if (session) {
        checkAuth();
      } else {
        setSession(null);
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Show loading while we are checking BOTH session and role
  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-900 mb-4"></div>
        <p className="font-bold text-indigo-900 tracking-tight">Verifying Permissions...</p>
      </div>
    );
  }

  // 3. Not logged in? Send to login
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 4. Logged in but profile hasn't been created yet?
  // This prevents the "default to judge" bug.
  if (session && !userRole) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-slate-800">Account Setup Pending</h2>
        <p className="text-slate-500 max-w-xs mt-2">
          Your profile is being initialized. If this takes too long, please contact the Admin.
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-6 text-indigo-600 font-bold underline"
        >
          Refresh Page
        </button>
      </div>
    );
  }

  // 5. Role check logic
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    const homeMap: Record<string, string> = {
      'admin': '/leaderboard',
      'judge': '/judge',
      'clerk': '/attendance'
    };
    // If they are on the wrong page, send them to THEIR home page
    return <Navigate to={homeMap[userRole] || '/login'} replace />;
  }

  return <>{children}</>;
}