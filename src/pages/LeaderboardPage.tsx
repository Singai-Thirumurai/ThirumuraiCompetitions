import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { Trophy, Medal, Award, BarChart3, Users, RefreshCw } from 'lucide-react';

export default function LeaderboardPage() {
  const [results, setResults] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Fetch Categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // 2. Fetch Rankings whenever selection changes
  useEffect(() => {
    if (selectedCat) {
      fetchRankings(selectedCat);
    } else {
      setResults([]);
    }
  }, [selectedCat]);

  async function fetchCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('competition_name', { ascending: true });
    
    if (error) console.error("Error fetching categories:", error.message);
    else setCategories(data || []);
  }

  async function fetchRankings(catId: string) {
    setLoading(true);
    // Fetch participants and their scores for the chosen category
    const { data, error } = await supabase
      .from('participants')
      .select(`
        name,
        scores (
          total_score,
          is_finalized
        )
      `)
      .eq('category_id', catId);

    if (error) {
      console.error("Error fetching rankings:", error.message);
    } else if (data) {
      // Process scores: Filter for finalized consensus marks and average them
      const processed = data.map(p => {
        const finalizedScores = p.scores?.filter((s: any) => s.is_finalized) || [];
        
        // Calculate average score
        const total = finalizedScores.reduce((acc: number, curr: any) => acc + curr.total_score, 0);
        const avg = finalizedScores.length > 0 ? total / finalizedScores.length : 0;
        
        return {
          name: p.name,
          score: avg,
          judgeCount: finalizedScores.length
        };
      })
      .filter(p => p.judgeCount > 0) // Only show people who actually have finalized marks
      .sort((a, b) => b.score - a.score); // Highest score first

      setResults(processed);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-indigo-950 text-white p-8 shadow-xl">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                <Trophy className="text-yellow-400" size={32} />
                Winner's Circle
              </h1>
              <p className="text-indigo-300 mt-1 font-medium">Final Consensus Standings</p>
            </div>

            <div className="relative group">
              <select 
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                className="w-full md:w-64 p-4 bg-indigo-900/50 border border-indigo-700 rounded-2xl text-white font-bold appearance-none focus:ring-2 focus:ring-yellow-400 outline-none transition-all cursor-pointer"
              >
                <option value="" className="bg-indigo-950">Select Competition</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id} className="bg-indigo-950">
                    {c.competition_name} - {c.class_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 -mt-6">
        {loading ? (
          <div className="bg-white rounded-3xl p-20 shadow-sm flex flex-col items-center justify-center text-slate-400">
            <RefreshCw className="animate-spin mb-4" size={40} />
            <p className="font-bold">Calculating results...</p>
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-4">
            {results.map((r, index) => {
              const isTop3 = index < 3;
              return (
                <div 
                  key={r.name} 
                  className={`flex items-center p-6 rounded-3xl transition-all border-2 ${
                    index === 0 ? "bg-yellow-50 border-yellow-200 shadow-yellow-100 shadow-lg" : 
                    index === 1 ? "bg-slate-50 border-slate-200" :
                    index === 2 ? "bg-orange-50 border-orange-100" :
                    "bg-white border-transparent shadow-sm"
                  }`}
                >
                  {/* Rank Badge */}
                  <div className="w-14 h-14 flex items-center justify-center rounded-2xl mr-6 shrink-0 bg-white shadow-sm">
                    {index === 0 && <Trophy className="text-yellow-500" size={28} />}
                    {index === 1 && <Medal className="text-slate-400" size={28} />}
                    {index === 2 && <Award className="text-orange-400" size={28} />}
                    {index > 2 && <span className="font-black text-slate-300 text-xl">{index + 1}</span>}
                  </div>

                  {/* Participant Info */}
                  <div className="flex-1">
                    <h2 className={`text-xl font-black uppercase tracking-tight ${isTop3 ? 'text-slate-900' : 'text-slate-700'}`}>
                      {r.name}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <Users size={12} /> {r.judgeCount} Consensus Sign-offs
                      </span>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <div className={`text-3xl font-black ${index === 0 ? 'text-yellow-600' : 'text-indigo-950'}`}>
                      {r.score.toFixed(1)}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Avg Points</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : selectedCat ? (
          <div className="bg-white rounded-3xl p-20 shadow-sm text-center">
            <Users className="mx-auto text-slate-200 mb-4" size={60} />
            <h3 className="text-xl font-bold text-slate-800">No Finalized Scores Yet</h3>
            <p className="text-slate-500 mt-2">Judges must sign off on participants before they appear here.</p>
          </div>
        ) : (
          <div className="bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-3xl p-20 text-center">
            <h3 className="text-xl font-bold text-indigo-400">Select a category to view standings</h3>
          </div>
        )}
      </div>
    </div>
  );
}