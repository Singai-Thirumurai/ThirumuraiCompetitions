import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { ClipboardList, Save, CheckCircle2, X, PenTool, AlertCircle, Users, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

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

  const [selectedJudgeTab, setSelectedJudgeTab] = useState<string>('MASTER_AVG');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('judging_backup_'))
      .forEach(k => localStorage.removeItem(k));
    fetchAssignments();
  }, []);

  // Warn judges on refresh/close when they have unsaved changes
  useEffect(() => {
    if (userRole === 'admin') return;
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, userRole]);

  // useEffect(() => {
  //   if (currentAssignment) fetchParticipants(currentAssignment.category_id);
  // }, [currentAssignment]);

  useEffect(() => {
  if (currentAssignment) {
    setSelectedJudgeTab('MASTER_AVG'); // Reset tab back to summary view
    fetchParticipants(currentAssignment.category_id);
  }
}, [currentAssignment]);


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
      .eq('attended', true)
      .order('name', { ascending: true });

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
          topic: s.topic,
          comment: s.comment
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
          comment: s.comment
        };
      });
      setScores(scoreMap);
    }
  }

  const handleScoreChange = (pId: string, index: number, value: string) => {
    setIsDirty(true);
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
      setIsDirty(false);
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
      setIsDirty(false);
      setIsSignModalOpen(false);
      fetchParticipants(currentAssignment.category_id);
      alert(`Successfully signed off for ${participants.length} participants!`);
    }
    setIsSaving(false);
  };

  const exportToExcel = async () => {
    // 2 queries total for the entire export
    const [{ data: allParticipants }, { data: allScores }] = await Promise.all([
      supabase.from('participants').select('id, name, temple, category_id').eq('attended', true),
      supabase.from('scores').select('participant_id, judge_id, marks, total_score, is_finalized, signed_name, song_titles, topic, comment')
    ]);

    const participantsByCategory: Record<string, any[]> = {};
    allParticipants?.forEach(p => {
      if (!participantsByCategory[p.category_id]) participantsByCategory[p.category_id] = [];
      participantsByCategory[p.category_id].push(p);
    });

    const scoresByParticipant: Record<string, any[]> = {};
    allScores?.forEach(s => {
      if (!scoresByParticipant[s.participant_id]) scoresByParticipant[s.participant_id] = [];
      scoresByParticipant[s.participant_id].push(s);
    });

    const wb = XLSX.utils.book_new();

    for (const assignment of allAssignments) {
      const cat = assignment.categories;
      const catId = assignment.category_id;
      const catParticipants = [...(participantsByCategory[catId] || [])].sort((a, b) => a.name.localeCompare(b.name));
      const rubricLabels: string[] = cat.rubric_labels || [];
      const isRecital = cat.competition_name.toLowerCase().includes('recital');

      // Build ordered judge list for this category
      const judgeMap = new Map<string, string>();
      catParticipants.forEach(p => {
        (scoresByParticipant[p.id] || []).forEach((s: any) => {
          if (!judgeMap.has(s.judge_id)) {
            judgeMap.set(s.judge_id, s.signed_name || `Judge ${judgeMap.size + 1}`);
          }
        });
      });
      const judges = Array.from(judgeMap.entries());

      // Build header row
      const headers: string[] = ['Name', 'Temple'];
      judges.forEach(([, jName]) => {
        if (isRecital) {
          [1, 2].forEach(songNum => {
            rubricLabels.forEach(label => headers.push(`${jName} - Song ${songNum}: ${label}`));
          });
        } else {
          rubricLabels.forEach(label => headers.push(`${jName} - ${label}`));
        }
        headers.push(`${jName} Total`);
        headers.push(`${jName} Status`);
      });
      headers.push('Master Average');
      judges.forEach(([, jName]) => headers.push(`${jName} Comments`));

      // Build data rows
      const rows: any[][] = [headers];
      catParticipants.forEach(p => {
        const pScores = scoresByParticipant[p.id] || [];
        const row: any[] = [p.name, p.temple || ''];
        const finalizedScores: any[] = [];

        judges.forEach(([judgeId]) => {
          const js = pScores.find((s: any) => s.judge_id === judgeId);
          const marks: number[] = js?.marks || [];
          if (isRecital) {
            [0, 1].forEach(songIdx => {
              rubricLabels.forEach((_: string, li: number) => row.push(marks[(songIdx * 4) + li] ?? 0));
            });
          } else {
            rubricLabels.forEach((_: string, li: number) => row.push(marks[li] ?? 0));
          }
          row.push(js?.total_score ?? '');
          row.push(js?.is_finalized ? 'Finalized' : js ? 'Draft' : 'Not Started');
          if (js?.is_finalized) finalizedScores.push(js);
        });

        if (finalizedScores.length > 0) {
          const avg = finalizedScores.reduce((sum: number, s: any) => sum + (s.total_score || 0), 0) / finalizedScores.length;
          row.push(Math.round(avg * 10) / 10);
        } else {
          row.push('');
        }

        judges.forEach(([judgeId]) => {
          const js = pScores.find((s: any) => s.judge_id === judgeId);
          row.push(js?.comment || '');
        });

        rows.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Basic column widths
      ws['!cols'] = headers.map((h: string) => ({ wch: Math.max(h.length + 2, 14) }));

      const sheetName = `${cat.competition_name} - ${cat.class_name}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `TM2026_Judging_${date}.xlsx`);
  };

  const calculateAverage = (pId: string) => {
    const data = scores[pId]?.marks || [];
    if (data.length === 0) return 0;

    const sum = data.reduce((a: number, b: number) => a + b, 0);
    const isRecital = currentAssignment.categories.competition_name.toLowerCase().includes('recital');

    return isRecital ? (sum / 2).toFixed(1) : sum;
  };

  const handleSongTitleChange = (pId: string, songIdx: number, title: string) => {
    setIsDirty(true);
    setScores(prev => {
      const current = prev[pId] || {};
      const currentTitles = Array.isArray(current.song_titles) ? current.song_titles : ['', ''];
      const newTitles = [...currentTitles];
      newTitles[songIdx] = title;
      return { ...prev, [pId]: { ...current, song_titles: newTitles } };
    });
  };

  const handleRecitalScoreChange = (pId: string, songIdx: number, labelIdx: number, value: string) => {
    setIsDirty(true);
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
    setIsDirty(true);
    setScores(prev => {
      const current = prev[pId] || {};
      return { ...prev, [pId]: { ...current, topic: value } };
    });
  };

  const handleCommentChange = (pId: string, value: string) => {
    setIsDirty(true);
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

  // Build a deduplicated list of judges from allJudgeScores
  const uniqueJudges: Array<{ id: string; name: string }> = [];
  const seenJudgeIds = new Set<string>();
  let judgeCounter = 0;
  Object.values(allJudgeScores).flat().forEach((s: any) => {
    if (!seenJudgeIds.has(s.judge_id)) {
      seenJudgeIds.add(s.judge_id);
      judgeCounter++;
      uniqueJudges.push({ id: s.judge_id, name: s.signed_name || `Judge ${judgeCounter}` });
    }
  });

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
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 bg-yellow-500/20 px-4 py-2 rounded-xl text-yellow-200 text-sm font-bold border border-yellow-500/30">
                        <Users size={16} /> Admin View (Read-Only)
                      </div>
                      <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 rounded-xl text-sm font-bold hover:bg-emerald-500 transition text-white"
                      >
                        <Download size={16} /> Export Excel
                      </button>
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

      {isDirty && userRole !== 'admin' && (
        <div className="bg-red-600 text-white px-4 py-4 flex items-center justify-center gap-3 shadow-lg">
          <AlertCircle size={24} className="shrink-0" />
          <p className="text-base font-black uppercase tracking-wide text-center">
            ⚠️ You have unsaved changes! Click <span className="underline underline-offset-2">"Save All Drafts"</span> before refreshing or switching tabs — your scores will be lost otherwise.
          </p>
        </div>
      )}

      <div className="max-w-5xl mx-auto p-4 mt-6 space-y-4">
        {userRole === 'admin' && participants.length > 0 && (
          <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2 shrink-0">View Filter:</span>
            
            <button
              onClick={() => setSelectedJudgeTab('MASTER_AVG')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                selectedJudgeTab === 'MASTER_AVG'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              📊 Master Averages
            </button>

            {uniqueJudges.map((judge) => (
              <button
                key={judge.id}
                onClick={() => setSelectedJudgeTab(judge.id)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedJudgeTab === judge.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                👨‍⚖️ {judge.name}
              </button>
            ))}
          </div>
        )}
        
        {participants.map((p) => {
          const isRecital = currentAssignment.categories.competition_name.toLowerCase().includes('recital');

          // const existingData = scores[p.id];
          // const scoreData = existingData || {
          //   marks: new Array(isRecital ? 8 : 4).fill(0),
          //   is_finalized: false,
          //   topic: '',
          //   song_titles: ['', '']
          // };

          // const safeMarks = Array.isArray(scoreData.marks) && scoreData.marks.length > 0
          //   ? scoreData.marks
          //   : new Array(isRecital ? 8 : 4).fill(0);

          // const isDisabled = userRole === 'admin' || scoreData.is_finalized;

          let scoreData = scores[p.id] || {
            marks: new Array(isRecital ? 8 : 4).fill(0),
            is_finalized: false,
            topic: '',
            song_titles: ['', ''],
            comment: ''
          };

          if (userRole === 'admin' && selectedJudgeTab !== 'MASTER_AVG') {
            const specificJudgeRow = allJudgeScores[p.id]?.find((s: any) => s.judge_id === selectedJudgeTab);
            if (specificJudgeRow) {
              scoreData = {
                marks: specificJudgeRow.marks || new Array(isRecital ? 8 : 4).fill(0),
                is_finalized: specificJudgeRow.is_finalized,
                topic: specificJudgeRow.topic || '',
                song_titles: specificJudgeRow.song_titles || ['', ''],
                comment: specificJudgeRow.comment || '',
                judge_count: scores[p.id]?.judge_count,
                total_judges: scores[p.id]?.total_judges,
                signed_name: specificJudgeRow.signed_name
              };
            } else {
              scoreData = {
                marks: new Array(isRecital ? 8 : 4).fill(0),
                is_finalized: false,
                topic: '',
                song_titles: ['', ''],
                comment: 'No draft submitted by this judge.'
              };
            }
          }

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
                    {userRole === 'admin' && selectedJudgeTab !== 'MASTER_AVG'
                      ? (isRecital 
                          ? (safeMarks.reduce((a: number, b: number) => a + b, 0) / 2).toFixed(1) 
                          : safeMarks.reduce((a: number, b: number) => a + b, 0))
                      : calculateAverage(p.id)
                    }
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
                            value={scoreData.song_titles?.[songIdx] || ''}
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
                                  value={safeMarks[(songIdx * 4) + labelIdx] ?? 0}
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
                        value={scoreData.topic || ''}
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
                  {userRole === 'admin' && selectedJudgeTab === 'MASTER_AVG' ? (
                    <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl">
                      Select a specific judge tab above to view their comments.
                    </p>
                  ) : (
                    <textarea
                      rows={2}
                      placeholder={scoreData.is_finalized ? "No comments provided." : "Type constructive feedback or notes here..."}
                      disabled={isDisabled}
                      value={scoreData.comment || ''}
                      onChange={(e) => handleCommentChange(p.id, e.target.value)}
                      className="w-full p-3 bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border-none outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 resize-none transition-all shadow-inner"
                    />
                  )}
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
