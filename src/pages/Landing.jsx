import { useNavigate } from 'react-router-dom';

const YEAR = new Date().getFullYear();

const PILLARS = [
  { emoji: '🥗', label: 'Nutrición',   text: 'text-green-600 dark:text-green-400',   desc: 'Alimentación diaria e hidratación' },
  { emoji: '⚡', label: 'Actividad',   text: 'text-orange-600 dark:text-orange-400', desc: 'Rutinas de ejercicio físico' },
  { emoji: '🌙', label: 'Sueño',       text: 'text-purple-600 dark:text-purple-400', desc: 'Hábitos nocturnos y descanso' },
  { emoji: '🧘', label: 'Emocional',   text: 'text-blue-600 dark:text-blue-400',     desc: 'Meditación y equilibrio mental' },
  { emoji: '📖', label: 'Crecimiento', text: 'text-amber-600 dark:text-amber-400',   desc: 'Aprendizaje diario y lectura' },
  { emoji: '👥', label: 'Comunidad',   text: 'text-pink-600 dark:text-pink-400',     desc: 'Relaciones y vida social' },
];

const EXTRAS = [
  {
    emoji: '🎯',
    label: 'Metas anuales',
    desc: 'Añade imágenes de lo que quieres lograr y rastrea el avance de cada meta a lo largo del año.',
  },
  {
    emoji: '🍽️',
    label: 'Plan de alimentación',
    desc: 'Crea tu plan nutricional, genera tu lista del súper y lleva control de tu peso mes a mes.',
  },
  {
    emoji: '📚',
    label: 'Biblioteca personal',
    desc: 'Registra tus lecturas, fija una meta de libros al año y ve tu progreso en tiempo real.',
  },
  {
    emoji: '💑',
    label: 'Modo pareja',
    desc: 'Conecta con tu pareja, comparte el progreso y construyan hábitos saludables juntos.',
  },
];

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen app-bg flex flex-col">

      {/* ── Hero ── */}
      <div className="flex flex-col items-center justify-center px-6 pt-20 pb-12 text-center">
        <img
          src="/Evolve.png"
          alt="Evolve"
          className="w-20 h-20 rounded-3xl shadow-xl object-contain mb-5"
        />
        <h1 className="text-5xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-3">
          Evolve
        </h1>
        <p className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4 max-w-sm leading-snug">
          Conoce y mejora tu bienestar
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-10 max-w-sm leading-relaxed">
          Evalúa semana a semana los 6 pilares que más impactan tu salud y longevidad — y actúa sobre ellos con información real.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <button
            onClick={() => navigate('/auth?mode=signup')}
            className="btn-primary flex-1 py-3 text-base"
          >
            Empezar gratis
          </button>
          <button
            onClick={() => navigate('/auth?mode=signin')}
            className="btn-secondary flex-1 py-3 text-base"
          >
            Iniciar sesión
          </button>
        </div>
      </div>

      {/* ── Score concept ── */}
      <div className="px-6 pb-12 max-w-lg mx-auto w-full">
        <div className="liquid-glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-center">
              <p className="text-4xl font-extrabold text-blue-500 leading-none">84%</p>
              <p className="text-xs text-gray-400 mt-0.5">Global</p>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-1">Tu bienestar en un número</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Cada semana Evolve calcula un <span className="font-semibold text-gray-700 dark:text-gray-300">score global</span> basado en tus registros de los últimos 7 días — una cifra honesta de cómo estás realmente.
              </p>
            </div>
          </div>
          {/* Mini pillar bars */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Nutrición',   pct: 90, color: 'bg-green-400' },
              { label: 'Actividad',   pct: 72, color: 'bg-orange-400' },
              { label: 'Sueño',       pct: 80, color: 'bg-purple-400' },
              { label: 'Emocional',   pct: 75, color: 'bg-blue-400' },
              { label: 'Crecimiento', pct: 85, color: 'bg-amber-400' },
              { label: 'Comunidad',   pct: 65, color: 'bg-pink-400' },
            ].map(({ label, pct, color }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 6 Pillars ── */}
      <div className="px-6 pb-12 max-w-lg mx-auto w-full">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center mb-4">
          Los 6 pilares de bienestar
        </p>
        <div className="grid grid-cols-2 gap-3">
          {PILLARS.map(p => (
            <div key={p.label} className="liquid-glass-panel rounded-2xl p-4 flex items-start gap-3">
              <span className="text-xl flex-shrink-0">{p.emoji}</span>
              <div>
                <p className={`text-sm font-semibold ${p.text} mb-0.5`}>{p.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4 leading-relaxed px-2">
          Cada pilar se mide diariamente a través de check-ins y registros automáticos. El score semanal te muestra exactamente dónde poner atención.
        </p>
      </div>

      {/* ── Check-in flow ── */}
      <div className="px-6 pb-12 max-w-lg mx-auto w-full">
        <div className="liquid-glass-panel rounded-2xl p-5 flex items-start gap-4">
          <span className="text-3xl flex-shrink-0">✅</span>
          <div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-1">Check-in diario en minutos</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Cada noche, un check-in rápido registra tu nutrición, crecimiento personal y vida social del día. Por la mañana, otro registra cómo dormiste. Eso es todo — Evolve hace el resto.
            </p>
          </div>
        </div>
      </div>

      {/* ── Extra features ── */}
      <div className="px-6 pb-12 max-w-lg mx-auto w-full">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center mb-4">
          Y mucho más
        </p>
        <div className="space-y-3">
          {EXTRAS.map(e => (
            <div key={e.label} className="liquid-glass-panel rounded-2xl p-4 flex items-start gap-3">
              <span className="text-xl flex-shrink-0">{e.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-0.5">{e.label}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{e.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Final CTA ── */}
      <div className="px-6 pb-16 max-w-xs mx-auto w-full text-center">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
          Tu bienestar no es un destino.
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
          Es un hábito que construyes cada día.
        </p>
        <button
          onClick={() => navigate('/auth?mode=signup')}
          className="btn-primary w-full py-3 text-base"
        >
          Empezar ahora
        </button>
      </div>

      {/* ── Footer ── */}
      <div className="text-center pb-8">
        <p className="text-[11px] text-gray-400 dark:text-gray-600">
          © {YEAR} Evolve · Todos los derechos reservados
        </p>
      </div>

    </div>
  );
};

export default Landing;
