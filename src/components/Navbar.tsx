import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogOut, User, ClipboardCheck, LayoutDashboard, ShieldCheck } from 'lucide-react';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState<string | null>(null);

  const fetchUserRole = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    setRole(data?.role || 'judge');
  };

  useEffect(() => {
    // Initial fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) fetchUserRole(session.user.id);
    });

    // Listen for sign-in/sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchUserRole(session.user.id);
      } else {
        setRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (location.pathname === '/login' || !role) return null;

  return (
    <nav className="bg-indigo-950 text-white shadow-xl sticky top-0 z-[100]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
             <ShieldCheck className="text-yellow-500" />
             <span className="font-black text-xl tracking-tighter">TM 2026</span>
          </Link>
          
          <div className="hidden md:flex gap-4">
            {(role === 'admin' || role === 'clerk') && (
              <Link to="/attendance" className="text-sm font-bold hover:text-indigo-300">Attendance</Link>
            )}
            {(role === 'admin' || role === 'judge') && (
              <Link to="/judge" className="text-sm font-bold hover:text-indigo-300">Judging</Link>
            )}
            {(role === 'admin' || role === 'judge') && (
              <Link to="/leaderboard" className="text-sm font-bold hover:text-indigo-300">Leaderboard</Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-black uppercase text-indigo-400">Logged in as</p>
            <p className="text-xs font-bold uppercase">{role}</p>
          </div>
          <button 
            onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
            className="bg-red-500/20 text-red-400 px-4 py-2 rounded-xl text-xs font-bold border border-red-500/50 hover:bg-red-500 hover:text-white transition"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}