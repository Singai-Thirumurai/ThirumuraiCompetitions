import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { Trophy, Medal, Award, CheckCircle, PenTool } from 'lucide-react';

export default function LeaderboardPage() {
  const [results, setResults] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedCat) fetchRankings(selectedCat);
  }, [selectedCat]);

  async function fetchInitialData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setUserRole(profile?.role);

    let query = supabase.from('categories').select('*');

    if (profile?.role === 'judge') {
      const { data: assignments } = await supabase.from('assignments').select('category_id').eq('judge_id', user.id);
      const catIds = assignments?.map(a => a.category_id) || [];
      query = query.in('id', catIds);
    }

    const { data: catData } = await query
      .order('competition_name', { ascending: true })
      .order('class_name', { ascending: true });

    setCategories(catData || []);
    if (catData?.length === 1) setSelectedCat(catData[0].id);
  }

  // async function fetchRankings(catId: string) {
  //   const { data } = await supabase
  //     .from('participants')
  //     .select('name, scores(total_score, is_finalized, signed_name)')
  //     .eq('category_id', catId);

  //   if (data) {
  //     const rawResults = data.map(p => {
  //       const finalized = p.scores?.filter((s: any) => s.is_finalized) || [];
  //       const avg = finalized.length > 0 ? finalized.reduce((a: any, b: any) => a + b.total_score, 0) / finalized.length : 0;
  //       return { name: p.name, score: avg };
  //     }).sort((a, b) => b.score - a.score);

  //     // LOGIC: Calculate Rank (1224) and Prize Tier (1223)
  //     let currentRank = 0;
  //     let currentPrizeTier = 0;
  //     let lastScore = -1;

  //     const rankedResults = rawResults.map((item, index) => {
  //       if (item.score !== lastScore) {
  //         // Score changed! Move to next prize tier and actual rank
  //         currentPrizeTier++;
  //         currentRank = index + 1;
  //       }
  //       // If score is the same, currentPrizeTier and currentRank stay as they were

  //       lastScore = item.score;

  //       return {
  //         ...item,
  //         displayRank: currentRank,
  //         prizeTier: currentPrizeTier
  //       };
  //     });

  //     setResults(rankedResults);
  //     setIsFinalized(data[0]?.scores?.some((s: any) => s.is_finalized));
  //   }
  // }

  async function fetchRankings(catId: string) {
    // 1. Get the current logged-in user information and profile details
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // 2. Query participants and pull scores records
    let scoreQuery = supabase
      .from('participants')
      .select('name, scores(total_score, is_finalized, signed_name, judge_id)')
      .eq('category_id', catId);

    // If it's a judge, let database filter the scores early if needed, 
    // but filtering in memory handles empty states elegantly.
    const { data } = await scoreQuery;

    if (data) {
      const rawResults = data.map(p => {
        const pScores = p.scores || [];
        let scoreToUse = 0;

        if (profile?.role === 'judge') {
          // JUDGE: Filter down to ONLY this judge's score row (whether it is draft or finalized!)
          const judgeSpecificScore = pScores.find((s: any) => s.judge_id === user.id);
          scoreToUse = judgeSpecificScore ? judgeSpecificScore.total_score : 0;
        } else {
          // ADMIN / CLERK: Keep your master leaderboard logic (average across all FINALIZED scores)
          const finalized = pScores.filter((s: any) => s.is_finalized) || [];
          scoreToUse = finalized.length > 0 
            ? finalized.reduce((a: any, b: any) => a + b.total_score, 0) / finalized.length 
            : 0;
        }

        return { name: p.name, score: scoreToUse };
      }).sort((a, b) => b.score - a.score);

      // 3. Calculate Rank (1224) and Prize Tier (1223)
      let currentRank = 0;
      let currentPrizeTier = 0;
      let lastScore = -1;

      const rankedResults = rawResults.map((item, index) => {
        if (item.score !== lastScore) {
          currentPrizeTier++;
          currentRank = index + 1;
        }
        lastScore = item.score;

        return {
          ...item,
          displayRank: currentRank,
          prizeTier: currentPrizeTier
        };
      });

      setResults(rankedResults);

      // Adjust the footer verification status display card dynamically
      if (profile?.role === 'judge') {
        const currentJudgeFinalized = data.some(p => 
          p.scores?.some((s: any) => s.judge_id === user.id && s.is_finalized)
        );
        setIsFinalized(currentJudgeFinalized);
      } else {
        setIsFinalized(data[0]?.scores?.some((s: any) => s.is_finalized) || false);
      }
    }
  }

  // Change the functions to take prizeTier instead of rank
  const getCardBg = (prizeTier: number) => {
    if (prizeTier === 1) return "bg-[#FFD700] border-[#E6C200] shadow-md shadow-yellow-200/50"; // Gold
    if (prizeTier === 2) return "bg-[#C0C0C0] border-[#A9A9A9] shadow-md shadow-slate-300/50"; // Silver
    if (prizeTier === 3) return "bg-[#A77F60] border-[#B87333] shadow-md shadow-orange-300/50 text-white"; // Bronze
    return "bg-white border-transparent shadow-sm";
  };

  const getTextColor = (prizeTier: number) => {
    if (prizeTier === 1) return "text-yellow-950";
    if (prizeTier === 2) return "text-slate-900";
    if (prizeTier === 3) return "text-white";
    return "text-indigo-950";
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black text-indigo-950">RESULTS</h1>
          <select
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
            className="p-3 bg-white rounded-xl border-none shadow-sm font-bold text-indigo-600 outline-none"
          >
            <option value="">Select Category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.competition_name} - {c.class_name}</option>)}
          </select>
        </div>

        <div className="space-y-4">
          {results.map((r) => (
            <div
              key={r.name}
              className={`flex items-center p-6 rounded-3xl border-2 transition-all ${getCardBg(r.prizeTier)}`}
            >
              <div className="w-12 h-12 flex items-center justify-center rounded-2xl mr-4 bg-white/40 shadow-sm font-black">
                {/* Still show the numeric rank (1, 2, 2, 4) for technical accuracy */}
                {r.displayRank === 1 ? <Trophy className="text-yellow-700" /> : r.displayRank}
              </div>

              <div className="flex-1">
                <h2 className={`text-lg font-bold uppercase ${getTextColor(r.prizeTier)}`}>
                  {r.name}
                </h2>
                <p className={`text-[10px] font-bold uppercase opacity-60 ${getTextColor(r.prizeTier)}`}>
                  Average Score
                </p>
              </div>

              <div className={`text-3xl font-black ${getTextColor(r.prizeTier)}`}>
                {r.score.toFixed(1)}
              </div>
            </div>
          ))}
        </div>

        {results.length > 0 && (
          <div className="mt-10 p-6 bg-indigo-900 rounded-3xl text-white flex justify-between items-center">
            <div>
              <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest">Status</p>
              <h3 className="text-xl font-bold">{isFinalized ? "Final Standings Verified" : "Awaiting Verification"}</h3>
            </div>
            {isFinalized ? (
              <div className="flex items-center gap-2 bg-green-500 px-4 py-2 rounded-xl font-bold">
                <CheckCircle size={20} /> Verified
              </div>
            ) : (
              <button className="flex items-center gap-2 bg-white text-indigo-900 px-6 py-3 rounded-xl font-bold hover:bg-indigo-50 transition">
                <PenTool size={20} /> Sign Standings
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}