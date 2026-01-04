import { useNavigate } from 'react-router-dom';
import { Dumbbell, Target, Apple, BookOpen, TrendingUp, Users, Zap } from 'lucide-react';

const Landing = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Dumbbell className="w-8 h-8" />,
      title: 'Move',
      description: 'Track your workouts, stretches, runs, and sports activities with detailed statistics and progress monitoring.'
    },
    {
      icon: <Target className="w-8 h-8" />,
      title: 'Goals',
      description: 'Visualize your dreams with a vision board and track your fitness achievements across all activities.'
    },
    {
      icon: <Apple className="w-8 h-8" />,
      title: 'Food',
      description: 'Plan your meals, track your weight, and organize your shopping list all in one place.'
    },
    {
      icon: <BookOpen className="w-8 h-8" />,
      title: 'Books',
      description: 'Keep track of books you\'ve read, are reading, or want to read. Monitor your yearly reading progress.'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center max-w-4xl mx-auto">
          <img
            src="/Evolve.svg"
            alt="Evolve Logo"
            className="w-20 h-20 mx-auto mb-6"
          />
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Evolve
          </h1>
          <p className="text-2xl md:text-3xl text-primary-600 font-medium mb-6">
            Build the Life You Envision
          </p>
          <p className="text-lg md:text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
            Your all-in-one platform to track fitness, nutrition, personal goals, and reading progress.
            Transform your daily habits into meaningful achievements.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/auth?mode=signup')}
              className="btn-primary text-lg px-8 py-3"
            >
              Get Started
            </button>
            <button
              onClick={() => navigate('/auth?mode=signin')}
              className="btn-secondary text-lg px-8 py-3"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            Everything You Need to Evolve
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="card text-center hover:shadow-lg transition-shadow">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 text-primary-600 rounded-full mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-primary-500 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Start Your Journey?
          </h2>
          <p className="text-xl text-primary-50 mb-8 max-w-2xl mx-auto">
            Join thousands of people who are building the life they envision, one day at a time.
          </p>
          <button
            onClick={() => navigate('/auth?mode=signup')}
            className="bg-white text-primary-600 hover:bg-primary-50 font-bold text-lg px-8 py-3 rounded-lg transition-colors"
          >
            Create Free Account
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-900 py-8">
        <div className="container mx-auto px-4 text-center text-gray-400">
          <p>&copy; 2024 Evolve. Build the Life You Envision.</p>
        </div>
      </div>
    </div>
  );
};

export default Landing;
