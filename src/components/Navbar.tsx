import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { LogOut, User, ClipboardCheck, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { useNavigate, Link, useLocation } from 'react-router-dom';

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Inside ProtectedRoute.tsx and Navbar.tsx
    useEffect(() => {
        const getRole = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setRole(null);
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .single();

            if (error || !data) {
                console.warn("Profile not found, defaulting to guest/loading");
                setRole('pending'); // Don't default to 'judge'!
            } else {
                setRole(data.role);
            }
            setLoading(false);
        };

        getRole();
    }, []);
    // Don't show the navbar on the login page or if not logged in
    if (location.pathname === '/login' || !role) return null;

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    return (
        <nav className="bg-indigo-950 text-white shadow-xl sticky top-0 z-[100]">
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="bg-yellow-500 p-1.5 rounded-lg">
                            <ShieldCheck size={20} className="text-indigo-950" />
                        </div>
                        <span className="font-black tracking-tighter text-xl">TM 2026</span>
                    </Link>

                    <div className="hidden md:flex gap-1">
                        {(role === 'admin' || role === 'clerk') && (
                            <Link to="/attendance" className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${location.pathname === '/attendance' ? 'bg-indigo-900 text-white' : 'text-indigo-200 hover:bg-indigo-900/50'}`}>
                                <User size={16} /> Attendance
                            </Link>
                        )}

                        {(role === 'admin' || role === 'judge') && (
                            <Link to="/judge" className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${location.pathname === '/judge' ? 'bg-indigo-900 text-white' : 'text-indigo-200 hover:bg-indigo-900/50'}`}>
                                <ClipboardCheck size={16} /> Judging
                            </Link>
                        )}

                        {role === 'admin' && (
                            <Link to="/leaderboard" className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${location.pathname === '/leaderboard' ? 'bg-indigo-900 text-white' : 'text-indigo-200 hover:bg-indigo-900/50'}`}>
                                <LayoutDashboard size={16} /> Leaderboard
                            </Link>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden lg:block text-right mr-2">
                        <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Logged in as</p>
                        <p className="text-xs font-bold text-white uppercase">{role}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-4 py-2 rounded-xl transition-all border border-red-500/20 font-bold text-sm"
                    >
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </div>
        </nav>
    );
}