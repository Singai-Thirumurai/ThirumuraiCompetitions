import { useState } from 'react';
import { supabase } from '../api/supabase';
import { LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const {data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert(error.message);
      setLoading(false);
    } else if (data.session) {
      // SUCCESS: Manually push the user to attendance
      navigate('/attendance', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="bg-indigo-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
            <LogIn size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Competition Login</h1>
          <p className="text-slate-500">Sign in to access your dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input 
            type="email" placeholder="Email Address" required
            className="w-full p-4 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none"
            onChange={(e) => setEmail(e.target.value)}
          />
          <input 
            type="password" placeholder="Password" required
            className="w-full p-4 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none"
            onChange={(e) => setPassword(e.target.value)}
          />
          <button 
            disabled={loading}
            className="w-full bg-indigo-900 text-white p-4 rounded-xl font-bold text-lg hover:bg-indigo-800 transition disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}