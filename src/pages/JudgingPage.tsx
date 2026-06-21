import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { ClipboardList, Save, CheckCircle2, X, PenTool, AlertCircle, Users } from 'lucide-react';

export default function JudgingPage() {
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, any>>({});
  const [userRole, setUserRole] = useState<string | null>(null);

  // For admin: store all judges' scores separately
  const [allJudgeScores, setAllJudgeScores] = useState<Record<string, any[]>>({});

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

  // 1. RESTORE FROM BACKUP ON MOUNT
  useEffect(() => {
    const backup = localStorage.getItem(`judging_backup_${currentAssignment?.category_id}`);
    if (backup) {
      try {
        const parsedBackup = JSON.parse(backup);
        // Merge backup into current scores state safely
        setScores(prev => ({ ...prev, ...parsedBackup }));
      } catch (e) {
        console.error("Failed to restore score backups", e);
      }
    }
  }, [currentAssignment, participants]); // Triggers when changing categories

  // 2. BACK UP TO LOCALSTORAGE AUTOMATICALLY ON EVERY CHANGE
  useEffect(() => {
    if (Object.keys(scores).length > 0 && currentAssignment?.category_id) {
      localStorage.setItem(
        `judging_backup_${currentAssignment.category_id}`,
        JSON.stringify(scores)
      );
    }
  }, [scores, currentAssignment]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Show warning only if there is data being held in scores state
      if (Object.keys(scores).length > 0) {
        e.preventDefault();
        e.returnValue = "You have unsaved scores. Are you sure you want to leave?";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [scores]);

  async function fetchAssignments() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setUserRole(profile?.role || null);

    let catData;

    if (profile?.role === 'admin') {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('competition_name', { ascending: true })
        .order('class_name', { ascending: true });

      if (error) console.error("Admin fetch error:", error);

      catData = data?.map(cat => ({
        id: cat.id,
        category_id: cat.id,
        categories: cat
      }));
    } else {
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
    const { data: pData } = await supabase
      .from('participants')
      .select('*')
      .eq('category_id', catId)
      .eq('attended', true);

    const participantList = pData || [];
    setParticipants(participantList);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).single();

    let scoreQuery = supabase.from('scores').select('*');

    if (profile?.role === 'admin') {
      const pIds = participantList.map(p => p.id);

      if (pIds.length === 0) {
        setScores({});
        setAllJudgeScores({});
        return;
      }

      // ADMIN: Fetch ALL scores (finalized AND draft) for these participants
      scoreQuery = scoreQuery.in('participant_id', pIds);
    } else {
      // JUDGE: Only see your own scores
      scoreQuery = scoreQuery.eq('judge_id', user?.id);
    }

    const { data: existingScores } = await scoreQuery;

    if (profile?.role === 'admin') {
      // ADMIN VIEW: Aggregate scores from all judges per participant
      const judgeScoresMap: Record<string, any[]> = {};
      const scoreMap: Record<string, any> = {};

      existingScores?.forEach(s => {
        if (!judgeScoresMap[s.participant_id]) {
          judgeScoresMap[s.participant_id] = [];
        }
        judgeScoresMap[s.participant_id].push({
          judge_id: s.judge_id,
          marks: s.marks,
          total_score: s.total_score,
          is_finalized: s.is_finalized,
          signed_name: s.signed_name,
          song_titles: s.song_titles,
          topic: s.topic
        });
      });

      // Compute averages across all FINALIZED judges
      Object.keys(judgeScoresMap).forEach(pId => {
        const allScores = judgeScoresMap[pId];
        const finalizedScores = allScores.filter(s => s.is_finalized);

        if (finalizedScores.length > 0) {
          const marksLength = finalizedScores[0].marks?.length || 0;
          const avgMarks = new Array(marksLength).fill(0);

          finalizedScores.forEach(s => {
            (s.marks || []).forEach((m: number, idx: number) => {
              avgMarks[idx] = (avgMarks[idx] || 0) + m;
            });
          });

          for (let i = 0; i < avgMarks.length; i++) {
            avgMarks[i] = Math.round(avgMarks[i] / finalizedScores.length);
          }

          scoreMap[pId] = {
            marks: avgMarks,
            is_finalized: true,
            all_finalized: allScores.every(s => s.is_finalized),
            signed_name: finalizedScores.map(s => s.signed_name).join(', '),
            song_titles: finalizedScores[0].song_titles,
            topic: finalizedScores[0].topic,
            judge_count: finalizedScores.length,
            total_judges: allScores.length
          };
        } else {
          const firstScore = allScores[0];
          scoreMap[pId] = {
            marks: firstScore?.marks || [],
            is_finalized: false,
            all_finalized: false,
            signed_name: null,
            song_titles: firstScore?.song_titles,
            topic: firstScore?.topic,
            judge_count: 0,
            total_judges: allScores.length
          };
        }
      });

      setAllJudgeScores(judgeScoresMap);
      setScores(scoreMap);
    } else {
      const scoreMap: Record<string, any> = {};
      existingScores?.forEach(s => {
        scoreMap[s.participant_id] = {
          marks: s.marks,
          is_finalized: s.is_finalized,
          signed_name: s.signed_name,
          song_titles: s.song_titles,
          topic: s.topic,
          comment: s.comment // ADD THIS LINE
        };
      });

      // Look for an existing unsaved local draft in the browser storage
      const localBackupRaw = localStorage.getItem(`judging_backup_${catId}`);

      if (localBackupRaw) {
        try {
          const parsedBackup = JSON.parse(localBackupRaw);
          // Combine both: Local changes take absolute priority over server drafts!
          const mergedScores = { ...scoreMap, ...parsedBackup };
          setScores(mergedScores);
        } catch (e) {
          console.error("Failed to merge local backup", e);
          setScores(scoreMap);
        }
      } else {
        // Safe deployment: No backup exists, use clean database state
        setScores(scoreMap);
      }
    }
  }

  const handleScoreChange = (pId: string, index: number, value: string) => {
    // Look up the exact string label using the index
    const labelName = currentAssignment?.categories?.rubric_labels?.[index];
    const maxMarksDict = currentAssignment?.categories?.max_marks || {};

    // Get the dynamic limit from the dictionary, fallback to 25 if not defined
    const maxAllowed = maxMarksDict[labelName] !== undefined ? Number(maxMarksDict[labelName]) : 25;
    const val = Math.min(Math.max(parseInt(value) || 0, 0), maxAllowed);

    setScores(prev => {
      const current = prev[pId] || {};
      const totalLabelsCount = currentAssignment?.categories?.rubric_labels?.length || 4;
      const existingMarks = Array.isArray(current.marks) && current.marks.length > 0
        ? current.marks
        : new Array(totalLabelsCount).fill(0);

      const newMarks = [...existingMarks];
      newMarks[index] = val;

      return {
        ...prev,
        [pId]: { ...current, marks: newMarks }
      };
    });
  };


  const saveAllDrafts = async () => {
    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const upsertData = participants.map(p => ({
      participant_id: p.id,
      judge_id: user?.id,
      marks: scores[p.id]?.marks || [],
      song_titles: scores[p.id]?.song_titles || ['', ''],
      topic: scores[p.id]?.topic || '',
      comment: scores[p.id]?.comment || '',
      total_score: parseFloat(calculateAverage(p.id)),
      is_finalized: false
    }));

    const { error } = await supabase.from('scores').upsert(upsertData, {
      onConflict: 'participant_id, judge_id'
    });

    if (error) alert(error.message);
    else {
      localStorage.removeItem(`judging_backup_${currentAssignment?.category_id}`);
      alert("Progress saved!");
    }
    setIsSaving(false);
  };

  const finalizeAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signature.trim()) return;
    setIsSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const finalizeData = participants.map(p => ({
      participant_id: p.id,
      judge_id: user?.id,
      marks: scores[p.id]?.marks || [],
      song_titles: scores[p.id]?.song_titles || [],
      topic: scores[p.id]?.topic || '',
      comment: scores[p.id]?.comment || '',
      total_score: parseFloat(calculateAverage(p.id)),
      is_finalized: true,
      signed_name: signature
    }));

    const { error } = await supabase.from('scores').upsert(finalizeData, { onConflict: 'participant_id, judge_id' });

    if (error) {
      alert(error.message);
    } else {
      localStorage.removeItem(`judging_backup_${currentAssignment?.category_id}`);
      setIsSignModalOpen(false);
      fetchParticipants(currentAssignment.category_id);
      alert(`Successfully signed off for ${participants.length} participants!`);
    }
    setIsSaving(false);
  };

  const calculateAverage = (pId: string) => {
    const data = scores[pId]?.marks || [];
    if (data.length === 0) return 0;

    const sum = data.reduce((a: number, b: number) => a + b, 0);
    const isRecital = currentAssignment.categories.competition_name.toLowerCase().includes('recital');

    return isRecital ? (sum / 2).toFixed(1) : sum;
  };

  const handleSongTitleChange = (pId: string, songIdx: number, title: string) => {
    setScores(prev => {
      const current = prev[pId] || {};
      const currentTitles = Array.isArray(current.song_titles) ? current.song_titles : ['', ''];
      const newTitles = [...currentTitles];
      newTitles[songIdx] = title;
      return { ...prev, [pId]: { ...current, song_titles: newTitles } };
    });
  };

  const handleRecitalScoreChange = (pId: string, songIdx: number, labelIdx: number, value: string) => {
    // Look up the exact string label using the labelIdx
    const labelName = currentAssignment?.categories?.rubric_labels?.[labelIdx];
    const maxMarksDict = currentAssignment?.categories?.max_marks || {};

    // Get the dynamic limit from the dictionary
    const maxAllowed = maxMarksDict[labelName] !== undefined ? Number(maxMarksDict[labelName]) : 25;
    const val = Math.min(Math.max(parseInt(value) || 0, 0), maxAllowed);

    setScores(prev => {
      const current = prev[pId] || {};
      const existingMarks = Array.isArray(current.marks) && current.marks.length > 0
        ? current.marks
        : new Array(8).fill(0);

      const newMarks = [...existingMarks];
      const actualIdx = (songIdx * 4) + labelIdx;
      newMarks[actualIdx] = val;

      return { ...prev, [pId]: { ...current, marks: newMarks } };
    });
  };

  const handleTopicChange = (pId: string, value: string) => {
    setScores(prev => {
      const current = prev[pId] || {};
      return { ...prev, [pId]: { ...current, topic: value } };
    });
  };

  const handleCommentChange = (pId: string, value: string) => {
    setScores(prev => {
      const current = prev[pId] || {};
      return {
        ...prev,
        [pId]: { ...current, comment: value }
      };
    });
  };

  const getRecitalMark = (pId: string, songIdx: number, labelIdx: number) => {
    const marks = scores[pId]?.marks || [];
    return marks[(songIdx * 4) + labelIdx] || 0;
  };

  // For judges: locked if THEIR scores are finalized for all participants
  // For admin: locked if ALL judges have finalized for all participants
  const isClassLocked = userRole === 'admin'
    ? participants.every(p => scores[p.id]?.all_finalized === true) && participants.length > 0
    : participants.every(p => scores[p.id]?.is_finalized === true) && participants.length > 0;

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
                  {userRole !== 'admin' && (
                    <button onClick={saveAllDrafts} className="hidden md:flex items-center gap-2 px-4 py-2 bg-indigo-800 rounded-xl text-sm font-bold hover:bg-indigo-700 transition">
                      <Save size={16} /> Save All Drafts
                    </button>
                  )}
                  {userRole !== 'admin' && (
                    <button
                      onClick={() => setIsSignModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 rounded-xl text-sm font-bold hover:bg-green-500 transition shadow-lg shadow-green-900/20"
                    >
                      <PenTool size={16} /> Finalize All & Sign
                    </button>
                  )}
                  {userRole === 'admin' && (
                    <div className="flex items-center gap-2 bg-yellow-500/20 px-4 py-2 rounded-xl text-yellow-200 text-sm font-bold border border-yellow-500/30">
                      <Users size={16} /> Admin View (Read-Only)
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 bg-green-500/20 px-4 py-2 rounded-xl text-green-300 text-sm font-bold border border-green-500/30">
                  <CheckCircle2 size={16} /> ALL JUDGES SIGNED OFF
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
                {assign.categories.competition_name} - {assign.categories.class_name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 mt-6 space-y-4">
        {participants.map((p) => {
          const isRecital = currentAssignment.categories.competition_name.toLowerCase().includes('recital');

          const existingData = scores[p.id];
          const scoreData = existingData || {
            marks: new Array(isRecital ? 8 : 4).fill(0),
            is_finalized: false,
            topic: '',
            song_titles: ['', '']
          };

          const safeMarks = Array.isArray(scoreData.marks) && scoreData.marks.length > 0
            ? scoreData.marks
            : new Array(isRecital ? 8 : 4).fill(0);

          const isDisabled = userRole === 'admin' || scoreData.is_finalized;

          return (
            <div key={p.id} className={`bg-white rounded-2xl shadow-sm border-2 mb-4 transition-all ${scoreData.is_finalized ? 'border-green-100' : 'border-transparent'}`}>
              {/* HEADER SECTION */}
              <div className="p-4 flex justify-between items-center border-b border-slate-50">
                <div>
                  <h2 className="font-black text-slate-800 uppercase tracking-tight">{p.name}</h2>
                  {userRole === 'admin' && scoreData.judge_count !== undefined && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Users size={12} />
                      {scoreData.judge_count}/{scoreData.total_judges} judges finalized
                      {scoreData.signed_name && (
                        <span className="text-green-600 ml-2">— Signed by: {scoreData.signed_name}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    {userRole === 'admin' ? 'Avg Score' : isRecital ? 'Total Avg' : 'Total Score'}
                  </p>
                  <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-mono font-black text-lg">
                    {calculateAverage(p.id)}
                  </div>
                </div>
              </div>

              {/* Admin: Show individual judge scores breakdown */}
              {userRole === 'admin' && allJudgeScores[p.id] && allJudgeScores[p.id].length > 1 && (
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Individual Judge Scores</p>
                  <div className="flex flex-wrap gap-2">
                    {allJudgeScores[p.id].map((js: any, idx: number) => (
                      <div key={idx} className={`px-3 py-1 rounded-lg text-xs font-bold ${js.is_finalized ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {js.signed_name || `Judge ${idx + 1}`}: {js.total_score}
                        {js.is_finalized ? ' ✓' : ' (draft)'}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INPUTS SECTION */}
              <div className="p-4">
                {isRecital ? (
                  <div className="space-y-6">
                    {[0, 1].map((songIdx) => (
                      <div key={songIdx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-4 mb-4">
                          <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase">Song {songIdx + 1}</span>
                          <input
                            type="text"
                            placeholder="Song Title..."
                            disabled={isDisabled}
                            value={scores[p.id]?.song_titles?.[songIdx] || ''}
                            onChange={(e) => handleSongTitleChange(p.id, songIdx, e.target.value)}
                            className="flex-1 bg-white border-none rounded-xl p-2 text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {currentAssignment.categories.rubric_labels.map((label: string, labelIdx: number) => {
                            const criteriaMax = currentAssignment?.categories?.max_marks?.[label] ?? 25;
                            return (
                              <div key={label}>
                                <p className="text-[9px] uppercase font-bold text-slate-400 mb-1 truncate">
                                  {label} <span className="text-indigo-500 font-mono text-[8px]">({criteriaMax})</span>
                                </p>
                                <input
                                  type="number"
                                  placeholder={`0-${criteriaMax}`}
                                  disabled={isDisabled}
                                  value={getRecitalMark(p.id, songIdx, labelIdx)}
                                  onChange={(e) => handleRecitalScoreChange(p.id, songIdx, labelIdx, e.target.value)}
                                  className="w-full p-2 text-center text-lg font-black rounded-xl bg-white border-none shadow-sm focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                      <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase shrink-0">Topic</span>
                      <input
                        type="text"
                        placeholder="Enter Oratorical Topic..."
                        disabled={isDisabled}
                        value={scores[p.id]?.topic || ''}
                        onChange={(e) => handleTopicChange(p.id, e.target.value)}
                        className="flex-1 bg-white border-none rounded-xl p-2 text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      {currentAssignment.categories.rubric_labels.map((label: string, index: number) => {
                        const criteriaMax = currentAssignment?.categories?.max_marks?.[label] ?? 25;
                        return (
                          <div key={label}>
                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 truncate">
                              {label} <span className="text-indigo-500 font-mono text-[9px]">({criteriaMax})</span>
                            </p>
                            <input
                              type="number"
                              placeholder={`0-${criteriaMax}`}
                              disabled={isDisabled}
                              value={safeMarks[index] !== undefined ? safeMarks[index] : 0}
                              onChange={(e) => handleScoreChange(p.id, index, e.target.value)}
                              className="w-full p-4 text-center text-xl font-black rounded-2xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                    Judge's Feedback & Comments
                  </label>
                  <textarea
                    rows={2}
                    placeholder={scoreData.is_finalized ? "No comments provided." : "Type constructive feedback or notes here..."}
                    disabled={isDisabled}
                    value={scores[p.id]?.comment || ''}
                    onChange={(e) => handleCommentChange(p.id, e.target.value)}
                    className="w-full p-3 bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border-none outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 resize-none transition-all shadow-inner"
                  />
                </div>
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
              <p className="text-slate-500 text-sm mt-2">This will lock YOUR scores for <b>all {participants.length} participants</b> in {currentAssignment.categories.class_name}.</p>
            </div>
            <form onSubmit={finalizeAll} className="space-y-4">
              <input required value={signature} onChange={e => setSignature(e.target.value)} placeholder="Type Your Judge Name" className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-green-500 outline-none text-lg" />
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
