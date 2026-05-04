import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { ClipboardList, Save, CheckCircle2, Lock, X, PenTool, AlertCircle } from 'lucide-react';

export default function JudgingPage() {
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, any>>({});

  // Bulk Sign Modal
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [signature, setSignature] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchAssignments();
  }, []);

  useEffect(() => {
    if (currentAssignment) fetchParticipants(currentAssignment.category_id);
  }, [currentAssignment]);

  async function fetchAssignments() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

    let catData;

    if (profile?.role === 'admin') {
      // ADMIN: Fetch directly from categories
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('competition_name', { ascending: true })
        .order('class_name', { ascending: true });

      if (error) console.error("Admin fetch error:", error);

      // CRITICAL: We wrap the category in a 'categories' key to match the Judge data structure
      catData = data?.map(cat => ({
        id: cat.id,
        category_id: cat.id,
        categories: cat // This ensures currentAssignment.categories.class_name works!
      }));
    } else {
      // JUDGE: Fetch from assignments
      const { data } = await supabase
        .from('assignments')
        .select('*, categories(*)')
        .eq('judge_id', user.id);

      catData = data;
    }

    if (catData && catData.length > 0) {
      setAllAssignments(catData);
      setCurrentAssignment(catData[0]);
    }
    setLoading(false);
  }

  async function fetchParticipants(catId: string) {
    // 1. Fetch participants who attended this category
    const { data: pData } = await supabase
      .from('participants')
      .select('*')
      .eq('category_id', catId)
      .eq('attended', true);

    const participantList = pData || [];
    setParticipants(participantList);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).single();

    // 2. Prepare the Score Query
    let scoreQuery = supabase.from('scores').select('*');

    if (profile?.role === 'admin') {
      // Extract all participant IDs for this category
      const pIds = participantList.map(p => p.id);

      // ADMIN: Fetch finalized scores for ALL participants in this list
      scoreQuery = scoreQuery
        .in('participant_id', pIds)
        .eq('is_finalized', true);
    } else {
      // JUDGE: Only see your own scores
      scoreQuery = scoreQuery.eq('judge_id', user?.id);
    }

    const { data: existingScores } = await scoreQuery;

    const scoreMap: Record<string, any> = {};
    existingScores?.forEach(s => {
      // Map scores to participant IDs
      // If multiple judges have finalized, this takes the latest one found
      scoreMap[s.participant_id] = {
        marks: s.marks,
        is_finalized: s.is_finalized,
        signed_name: s.signed_name
      };
    });

    setScores(scoreMap);
  }

  const handleScoreChange = (pId: string, index: number, value: string) => {
    let numValue = parseInt(value) || 0;
    if (numValue > 25) numValue = 25;
    if (numValue < 0) numValue = 0;

    setScores(prev => {
      const currentData = prev[pId] || { marks: [0, 0, 0, 0], is_finalized: false };
      const newMarks = [...currentData.marks];
      newMarks[index] = numValue;
      return { ...prev, [pId]: { ...currentData, marks: newMarks } };
    });
  };

  // NEW: Save all current drafts at once
  const saveAllDrafts = async () => {
    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const upsertData = participants.map(p => ({
      participant_id: p.id,
      judge_id: user?.id,
      marks: scores[p.id]?.marks || [0, 0, 0, 0],
      is_finalized: scores[p.id]?.is_finalized || false
    }));

    const { error } = await supabase.from('scores').upsert(upsertData, { onConflict: 'participant_id, judge_id' });

    if (error) alert(error.message);
    else alert("All progress saved as draft!");
    setIsSaving(false);
  };

  // NEW: Finalize every participant in this class
  const finalizeAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signature.trim()) return;
    setIsSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const finalizeData = participants.map(p => ({
      participant_id: p.id,
      judge_id: user?.id,
      marks: scores[p.id]?.marks || [0, 0, 0, 0],
      is_finalized: true,
      signed_name: signature
    }));

    const { error } = await supabase.from('scores').upsert(finalizeData, { onConflict: 'participant_id, judge_id' });

    if (error) {
      alert(error.message);
    } else {
      setIsSignModalOpen(false);
      fetchParticipants(currentAssignment.category_id);
      alert(`Successfully signed off for ${participants.length} participants!`);
    }
    setIsSaving(false);
  };

  const isClassLocked = participants.every(p => scores[p.id]?.is_finalized === true) && participants.length > 0;

  if (loading) return <div className="p-10 text-center font-bold">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <div className="bg-indigo-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-5xl mx-auto p-4 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardList /> Judging</h1>

            {/* Global Actions */}
            <div className="flex gap-2">
              {!isClassLocked ? (
                <>
                  <button onClick={saveAllDrafts} className="hidden md:flex items-center gap-2 px-4 py-2 bg-indigo-800 rounded-xl text-sm font-bold hover:bg-indigo-700 transition">
                    <Save size={16} /> Save All Drafts
                  </button>
                  <button
                    onClick={() => setIsSignModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 rounded-xl text-sm font-bold hover:bg-green-500 transition shadow-lg shadow-green-900/20"
                  >
                    <PenTool size={16} /> Finalize All & Sign
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 bg-green-500/20 px-4 py-2 rounded-xl text-green-300 text-sm font-bold border border-green-500/30">
                  <CheckCircle2 size={16} /> CATEGORY SIGNED OFF
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {allAssignments.map((assign) => (
              <button
                key={assign.id}
                onClick={() => setCurrentAssignment(assign)}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition shadow-sm ${currentAssignment?.id === assign.id
                  ? "bg-white text-indigo-900"
                  : "bg-indigo-800 text-indigo-200 hover:bg-indigo-700"
                  }`}
              >
                {/* Combine Competition and Class names here */}
                {assign.categories.competition_name} - {assign.categories.class_name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 mt-6 space-y-4">
        {participants.map((p) => {
          const scoreData = scores[p.id] || { marks: [0, 0, 0, 0], is_finalized: false };
          return (
            <div key={p.id} className={`bg-white rounded-2xl shadow-sm border-2 transition-all ${scoreData.is_finalized ? 'border-green-100 opacity-75' : 'border-transparent'}`}>
              <div className="p-4 flex justify-between items-center border-b border-slate-50">
                <h2 className="font-black text-slate-800 uppercase">{p.name}</h2>
                <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-mono font-black">
                  {scoreData.marks.reduce((a: any, b: any) => a + b, 0)}
                </div>
              </div>
              <div className="p-4 grid grid-cols-4 gap-3">
                {currentAssignment.categories.rubric_labels.map((label: string, index: number) => (
                  <div key={label} className="space-y-1">
                    <p className="text-[9px] uppercase font-bold text-slate-400 truncate">{label}</p>
                    <input
                      type="number" disabled={scoreData.is_finalized}
                      value={scoreData.marks[index]}
                      onChange={(e) => handleScoreChange(p.id, index, e.target.value)}
                      className="w-full p-2 text-center text-xl font-black rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-indigo-500 disabled:text-slate-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk Sign Modal */}
      {isSignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 relative">
            <button onClick={() => setIsSignModalOpen(false)} className="absolute top-4 right-4 text-slate-400"><X /></button>
            <div className="text-center mb-6">
              <div className="bg-yellow-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600"><AlertCircle size={32} /></div>
              <h2 className="text-2xl font-bold">Sign-off Class</h2>
              <p className="text-slate-500 text-sm mt-2">This will lock the scores for <b>all {participants.length} participants</b> in {currentAssignment.categories.class_name}.</p>
            </div>
            <form onSubmit={finalizeAll} className="space-y-4">
              <input required value={signature} onChange={e => setSignature(e.target.value)} placeholder="Type Lead Judge Name" className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-green-500 outline-none text-lg" />
              <button disabled={isSaving} className="w-full bg-green-600 text-white p-4 rounded-2xl font-bold text-lg hover:bg-green-700 disabled:opacity-50">
                {isSaving ? "Locking Scores..." : "Confirm & Sign All"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}