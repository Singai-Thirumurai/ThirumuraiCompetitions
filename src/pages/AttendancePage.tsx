import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { Search, UserPlus, X, Building2, Mail } from 'lucide-react';

export default function AttendancePage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastSync, setLastSync] = useState(new Date());

  // Tabs Filter State (Defaults to 'ALL')
  const [activeTab, setActiveTab] = useState('ALL');

  // Walk-in Form State (Expanded)
  const [newName, setNewName] = useState('');
  const [newTemple, setNewTemple] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [selectedCat, setSelectedCat] = useState('');


  useEffect(() => {
    fetchData();

    const interval = setInterval(() => {
      fetchData();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  async function fetchData() {
    // Get active session user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setUserRole(profile?.role || null);
    }

    const { data: pData } = await supabase
      .from('participants')
      .select('*, categories(competition_name, class_name)')
      .order('name', { ascending: true });

    const { data: cData } = await supabase
      .from('categories')
      .select('*')
      .order('competition_name', { ascending: true });

    setParticipants(pData || []);
    setCategories(cData || []);
    setLastSync(new Date());
  }

  const toggleAttendance = async (id: string, currentStatus: boolean) => {
    if (currentStatus === true) {
      const confirmUnmark = window.confirm("This participant is already marked PRESENT. Are you sure you want to unmark them?");
      if (!confirmUnmark) return;
    }

    const { error } = await supabase
      .from('participants')
      .update({ attended: !currentStatus })
      .eq('id', id);

    if (!error) {
      fetchData();
    }
  };

  const handleAddWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !selectedCat) return;

    const { error } = await supabase
      .from('participants')
      .insert([{
        name: newName,
        category_id: selectedCat,
        temple: newTemple,
        email: newEmail,
        attended: true
      }]);

    if (!error) {
      await fetchData();
      setIsModalOpen(false);
      setNewName('');
      setNewTemple('');
      setNewEmail('');
      setSelectedCat('');
    } else {
      alert("Error adding walk-in: " + error.message);
    }
  };

  // 1. Get unique list of SPECIFIC competition sheets for the Tab Row items
  const uniqueCompetitions = [
    'ALL',
    ...new Set(participants.map(p =>
      p.categories ? `${p.categories.competition_name} — ${p.categories.class_name}` : ''
    ).filter(Boolean))
  ];

  // 2. Filtering Logic: Combines Search text input AND specific Tab selection criteria
  const filtered = participants.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.temple?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase());

    const currentCompString = p.categories ? `${p.categories.competition_name} — ${p.categories.class_name}` : '';
    const matchesTab = activeTab === 'ALL' || currentCompString === activeTab;

    return matchesSearch && matchesTab;
  });
  const stats = {
    total: filtered.length,
    present: filtered.filter(p => p.attended).length
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header Section */}
      <div className="bg-indigo-900 text-white p-6 shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Thirumurai 2026</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <p className="text-indigo-200 text-xs font-mono uppercase tracking-widest">
                Last Synced: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>
          </div>
          {/* Only show the Walk-In registration button if the user is NOT an emcee */}
          {userRole !== 'emcee' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-white text-indigo-900 px-4 py-2 rounded-lg font-bold hover:bg-indigo-50 transition"
            >
              <UserPlus size={18} /> Walk-in
            </button>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 -mt-6">
        {/* Dynamic Competition Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-3 scrollbar-none">
          {uniqueCompetitions.map((comp) => (
            <button
              key={comp}
              onClick={() => setActiveTab(comp)}
              className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition whitespace-nowrap shadow-sm ${activeTab === comp
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
                }`}
            >
              {comp}
            </button>
          ))}
        </div>

        {/* Stats and Search Bar */}
        <div className="bg-white p-4 rounded-2xl shadow-sm mb-4 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder={activeTab === 'ALL' ? "Search across all categories..." : `Search inside ${activeTab}...`}
              value={search}
              className="w-full p-3 pl-12 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 transition-all"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-4 text-xs font-black text-slate-500 px-2 uppercase tracking-wider shrink-0">
            <span>Total: {stats.total}</span>
            <span className="text-green-600">Present: {stats.present}</span>
          </div>
        </div>

        {/* Main Attendance List */}
        <div className="grid gap-3">
          {filtered.map((p) => (
            <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${p.attended ? "bg-green-50 border-green-200" : "bg-white border-slate-100"}`}>
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className={`font-black text-lg ${p.attended ? "text-green-900" : "text-slate-800"}`}>{p.name}</h3>
                  {p.temple && (
                    <span className="bg-slate-100 text-slate-600 font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded-md border border-slate-200">
                      🏛️ {p.temple}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 mt-1">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{p.categories?.competition_name} — {p.categories?.class_name}</p>
                  {p.email && <p className="text-[11px] text-indigo-500 font-medium font-mono lowercase truncate">{p.email}</p>}
                </div>
              </div>
              <button
                // Block backend table updates if an emcee clicks it
                onClick={() => userRole !== 'emcee' && toggleAttendance(p.id, p.attended)}
                // Clean, unclickable style modifications for the emcee view
                disabled={userRole === 'emcee'}
                className={`px-6 py-2 rounded-xl font-bold tracking-wide text-sm shrink-0 transition-all ${p.attended
                    ? "bg-green-600 text-white"
                    : userRole === 'emcee'
                      ? "bg-slate-100 text-slate-300 cursor-not-allowed" // Dims the "MARK" badge for Emcees
                      : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                  }`}
              >
                {p.attended ? "PRESENT" : "ABSENT"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Expanded Walk-in Registration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">New Registration</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            <form onSubmit={handleAddWalkIn} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Full Name *</label>
                <input required value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl border-none font-bold text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Enter full name" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Temple Branch</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input value={newTemple} onChange={e => setNewTemple(e.target.value)} className="w-full p-3 pl-9 bg-slate-50 rounded-xl border-none font-bold text-sm focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Sivan" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full p-3 pl-9 bg-slate-50 rounded-xl border-none font-bold text-sm focus:ring-2 focus:ring-indigo-500" placeholder="name@email.com" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Class/Category Assignment *</label>
                <select required value={selectedCat} onChange={e => setSelectedCat(e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl border-none font-bold text-sm focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select a class</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.competition_name} - {c.class_name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full mt-2 bg-indigo-900 text-white p-4 rounded-xl font-black uppercase tracking-wider hover:bg-indigo-800 transition shadow-lg">Register & Check-in</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}