import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Brain, Moon, Users, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getLast14Days = () =>
  Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return toLocalDateStr(d);
  });

const NUTRITION_LABEL = { followed: '✅ Siguió su plan', partial: '🟡 Más o menos', skip: '❌ No siguió' };

const Wellbeing = () => {
  const { user } = useAuth();
  const [checkIns, setCheckIns] = useState({});
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    try {
      const snap = await getDoc(doc(db, `users/${user.uid}/wellbeing`, 'data'));
      if (snap.exists()) setCheckIns(snap.data().checkIns || {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const days = getLast14Days();
  const todayStr = days[0];
  const daysWithData = days.filter(d => checkIns[d]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Historial de bienestar</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Tus check-ins de los últimos 14 días</p>
      </div>

      {daysWithData.length === 0 ? (
        <div className="text-center py-16">
          <Brain className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Aún no hay registros. Completa tu check-in desde el home.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {days.map(d => {
            const ci = checkIns[d];
            const label = new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
            const isToday = d === todayStr;

            if (!ci) return (
              <div key={d} className="flex items-center gap-3 p-3 rounded-xl bg-white/20 dark:bg-gray-800/20 opacity-40">
                <span className="text-base">⭕</span>
                <span className="text-sm text-gray-400 capitalize">{label}</span>
                <span className="text-sm text-gray-300 dark:text-gray-600 ml-auto">Sin registro</span>
              </div>
            );

            const sleepScore = ci.sleepHabits ? Object.values(ci.sleepHabits).filter(Boolean).length : 0;
            const isOpen = expanded === d;

            return (
              <div key={d} className="rounded-xl liquid-glass-panel overflow-hidden">
                <button className="w-full flex items-center gap-3 p-3 text-left" onClick={() => setExpanded(isOpen ? null : d)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">{label}</span>
                      {isToday && <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded-full">Hoy</span>}
                    </div>
                    <div className="flex gap-3 mt-0.5 flex-wrap">
                      <span className="text-sm text-purple-500"><Moon className="w-3 h-3 inline mr-0.5" />{sleepScore}/3</span>
                      {ci.meditated === true && <span className="text-sm text-indigo-500">🧘 Meditó</span>}
                      {ci.community > 0 && <span className="text-sm text-blue-500"><Users className="w-3 h-3 inline mr-0.5" />{ci.community}</span>}
                      {ci.nutritionAdherence && <span className="text-sm text-green-600 dark:text-green-400">{NUTRITION_LABEL[ci.nutritionAdherence]}</span>}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/40 dark:border-gray-700/40 pt-3">
                    {ci.journal && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Diario</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{ci.journal}</p>
                      </div>
                    )}
                    {ci.aiResponse && (
                      <div className="bg-primary-50/50 dark:bg-primary-900/10 rounded-xl p-3 border border-primary-200/50 dark:border-primary-700/30">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-primary-500" />
                          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Feedback de Claude</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">{ci.aiResponse}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Wellbeing;
