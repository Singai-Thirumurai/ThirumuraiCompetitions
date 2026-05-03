import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { Search, UserCheck, UserPlus, Users, X } from 'lucide-react';

export default function AttendancePage() {
  const [participants, setParticipants] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Walk-in Form State
  const [newName, setNewName] = useState('');
  const [selectedCat, setSelectedCat] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    // Fetch Participants
    const { data: pData } = await supabase
      .from('participants')
      .select('*, categories(competition_name, class_name)')
      .order('name', { ascending: true });
    
    // Fetch Categories (for the Walk-in Modal)
    const { data: cData } = await supabase
      .from('categories')
      .select('*')
      .order('competition_name', { ascending: true });

    setParticipants(pData || []);
    setCategories(cData || []);
  }

  const toggleAttendance = async (id: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, attended: newStatus } : p));
    await supabase.from('participants').update({ attended: newStatus }).eq('id', id);
  };

  const handleAddWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !selectedCat) return;

    const { data, error } = await supabase
      .from('participants')
      .insert([{ name: newName, category_id: selectedCat, attended: true }])
      .select('*, categories(competition_name, class_name)')
      .single();

    if (!error && data) {
      setParticipants(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setIsModalOpen(false);
      setNewName('');
      setSelectedCat('');
    }
  };

  const filtered = participants.filter(p => 
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: participants.length,
    present: participants.filter(p => p.attended).length
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header Section */}
      <div className="bg-indigo-900 text-white p-6 shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Thirumurai 2026</h1>
            <p className="text-indigo-200 text-sm">Attendance Portal</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-white text-indigo-900 px-4 py-2 rounded-lg font-bold hover:bg-indigo-50 transition"
          >
            <UserPlus size={18} /> Walk-in
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 -mt-6">
        {/* Stats and Search */}
        <div className="bg-white p-4 rounded-2xl shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Search by name..."
              value={search}
              className="w-full p-3 pl-12 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 transition-all"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-4 text-sm font-bold text-slate-600 px-2">
            <span>TOTAL: {stats.total}</span>
            <span className="text-green-600">PRESENT: {stats.present}</span>
          </div>
        </div>

        {/* List Section */}
        <div className="grid gap-3">
          {filtered.map((p) => (
            <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${p.attended ? "bg-green-50 border-green-200" : "bg-white border-slate-100"}`}>
              <div className="flex-1">
                <h3 className={`font-bold text-lg ${p.attended ? "text-green-900" : "text-slate-800"}`}>{p.name}</h3>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{p.categories?.competition_name} — {p.categories?.class_name}</p>
              </div>
              <button 
                onClick={() => toggleAttendance(p.id, p.attended)}
                className={`px-6 py-2 rounded-xl font-bold transition-all ${p.attended ? "bg-green-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
              >
                {p.attended ? "PRESENT" : "MARK"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Walk-in Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">New Registration</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            <form onSubmit={handleAddWalkIn} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
                <input required value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500" placeholder="Enter student name" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Class/Category</label>
                <select required value={selectedCat} onChange={e => setSelectedCat(e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select a class</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.competition_name} - {c.class_name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full bg-indigo-900 text-white p-4 rounded-xl font-bold text-lg hover:bg-indigo-800 transition shadow-lg">Register & Check-in</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}