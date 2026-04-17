import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';
import toast from '../utils/toast';

const YEAR = new Date().getFullYear();

const FEATURES = [
  { icon: '🎯', label: 'Goals' },
  { icon: '⚡', label: 'Exercise' },
  { icon: '🥗', label: 'Nutrition' },
  { icon: '📚', label: 'Reading' },
];

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup');
  const [loading, setLoading] = useState(false);
  const { signup, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors }, reset } = useForm();

  useEffect(() => {
    setIsSignUp(searchParams.get('mode') === 'signup');
    reset();
  }, [searchParams, reset]);

  const onSubmit = async (data) => {
    try {
      setLoading(true);
      if (isSignUp) {
        await signup(data.email, data.password);
        toast.success('Account created successfully!');
      } else {
        await login(data.email, data.password);
        toast.success('Welcome back!');
      }
      navigate('/goals');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await loginWithGoogle();
      toast.success('Welcome!');
      navigate('/goals');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen app-bg flex flex-col items-center justify-center px-4 py-12">

      {/* Hero section */}
      <div className="text-center mb-10 w-full max-w-sm">
        <img
          src="/Evolve.png"
          alt="Evolve"
          className="w-20 h-20 mx-auto mb-5 rounded-2xl shadow-lg object-contain"
        />
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-2">
          Evolve
        </h1>
        <p className="text-base text-gray-500 dark:text-gray-400 mb-6">
          Build the life you envision in {YEAR}
        </p>

        {/* Feature pills */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {FEATURES.map(({ icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/60 dark:bg-white/10 text-gray-600 dark:text-gray-300 backdrop-blur-sm border border-white/80 dark:border-white/10 shadow-sm"
            >
              <span>{icon}</span>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm">
        <div className="liquid-glass-panel rounded-2xl p-6">
          <div className="relative z-10 space-y-5">

            {/* Card heading */}
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {isSignUp ? 'Create your account' : 'Sign in to continue'}
              </h2>
            </div>

            {/* Google — primary CTA */}
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-transparent text-gray-400">or use email</span>
              </div>
            </div>

            {/* Email form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div>
                <input
                  type="email"
                  className="input-field"
                  placeholder="Email"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address'
                    }
                  })}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Password"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'At least 6 characters' }
                  })}
                />
                {errors.password && (
                  <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
              </button>
            </form>

            {/* Toggle */}
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  navigate(`/auth?mode=${isSignUp ? 'signin' : 'signup'}`);
                }}
                className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-semibold"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-gray-400 dark:text-gray-600 mt-6">
          © {YEAR} Evolve. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Auth;
