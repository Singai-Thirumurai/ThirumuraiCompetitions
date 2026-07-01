import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';

const RESTRICTED_ROLES = ['judge', 'clerk'];
const CHECK_INTERVAL_MS = 30_000;
const SESSION_KEY = 'tm_session_token';

export function useSessionGuard() {
  const navigate = useNavigate();

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!RESTRICTED_ROLES.includes(profile?.role)) return;

      // Start polling to detect displacement
      intervalId = setInterval(async () => {
        const localToken = sessionStorage.getItem(SESSION_KEY);
        if (!localToken) return;

        const { data } = await supabase
          .from('sessions')
          .select('token')
          .eq('user_id', user.id)
          .single();

        if (data && data.token !== localToken) {
          sessionStorage.removeItem(SESSION_KEY);
          await supabase.auth.signOut();
          alert('You have been logged out because this account was signed in from another device.');
          navigate('/login', { replace: true });
        }
      }, CHECK_INTERVAL_MS);
    }

    init();
    return () => clearInterval(intervalId);
  }, [navigate]);
}
