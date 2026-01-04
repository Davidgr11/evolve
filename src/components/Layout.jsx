import { Outlet, NavLink } from 'react-router-dom';
import { Target, Zap, Salad, BookOpen, User } from 'lucide-react';

const Layout = () => {
  const navItems = [
    { path: '/goals', icon: Target, label: 'Goals' },
    { path: '/move', icon: Zap, label: 'Exercise' },
    { path: '/food', icon: Salad, label: 'Nutrition' },
    { path: '/books', icon: BookOpen, label: 'Books' },
    { path: '/profile', icon: User, label: 'Profile' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg pb-safe z-50">
        <div className="container mx-auto px-2">
          <div className="flex justify-around items-center h-20 py-2 pb-4">
            {navItems.map(({ path, icon: Icon, label }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center w-full h-full transition-colors ${
                    isActive
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`
                }
              >
                <Icon className="w-6 h-6 mb-1.5" />
                <span className="text-xs font-medium">{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
