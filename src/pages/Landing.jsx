import { useNavigate } from 'react-router-dom';

const YEAR = new Date().getFullYear();

const FEATURES = [
  { icon: '🎯', title: 'Goals', description: 'Visualize your dreams and track every milestone.' },
  { icon: '⚡', title: 'Exercise', description: 'Log workouts and monitor your progress over time.' },
  { icon: '🥗', title: 'Nutrition', description: 'Plan meals, track weight, and manage your shopping list.' },
  { icon: '📚', title: 'Books', description: 'Track your reading journey and discover new books.' },
];

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen app-bg flex flex-col">

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-12 text-center">
        <img
          src="/Evolve.png"
          alt="Evolve"
          className="w-24 h-24 rounded-3xl shadow-xl object-contain mb-6"
        />
        <h1 className="text-5xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-3">
          Evolve
        </h1>
        <p className="text-xl text-gray-500 dark:text-gray-400 mb-2 max-w-xs">
          Build the life you envision
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-10">
          {YEAR} · Goals · Exercise · Nutrition · Books
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <button
            onClick={() => navigate('/auth?mode=signup')}
            className="btn-primary flex-1 py-3 text-base"
          >
            Get started
          </button>
          <button
            onClick={() => navigate('/auth?mode=signin')}
            className="btn-secondary flex-1 py-3 text-base"
          >
            Sign in
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="px-6 pb-16 max-w-2xl mx-auto w-full">
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map(({ icon, title, description }) => (
            <div key={title} className="liquid-glass-panel rounded-2xl p-4">
              <div className="relative z-10">
                <span className="text-2xl mb-2 block">{icon}</span>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1">{title}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8">
        <p className="text-[11px] text-gray-400 dark:text-gray-600">
          © {YEAR} Evolve. All rights reserved.
        </p>
      </div>

    </div>
  );
};

export default Landing;
