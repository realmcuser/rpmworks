import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Server, UserPlus, LogIn, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { checkRegistrationAllowed } from '../services/api';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationInfo, setRegistrationInfo] = useState({ allowed: true, first_user: false });
  const navigate = useNavigate();
  const { login, register } = useAuth();

  useEffect(() => {
    checkRegistration();
  }, []);

  const checkRegistration = async () => {
    try {
      const info = await checkRegistrationAllowed();
      setRegistrationInfo(info);
    } catch (err) {
      // If check fails, default to allowing registration
      console.error('Failed to check registration status:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message || (isLogin ? 'Login failed' : 'Registration failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const canRegister = registrationInfo.allowed || registrationInfo.first_user;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />

      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">RPM Works</h1>
          <p className="text-text-muted mt-2 text-center">
            {isLogin ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* First user notice */}
        {!isLogin && registrationInfo.first_user && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-xl text-primary text-sm flex items-center gap-2">
            <Shield className="w-5 h-5 flex-shrink-0" />
            <span>This will be the admin account with full system access.</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted ml-1">Username</label>
            <div className="relative group">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-3 pl-10 pr-4 text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="username"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted ml-1">Password</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted group-focus-within:text-primary transition-colors" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-3 pl-10 pr-4 text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary-hover text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {isLogin ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                {isLogin ? 'Sign In' : (registrationInfo.first_user ? 'Create Admin Account' : 'Create Account')}
              </>
            )}
          </button>
        </form>

        {canRegister && (
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-sm text-primary hover:text-primary-hover transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        )}

        {!canRegister && isLogin && (
          <div className="mt-6 text-center text-sm text-text-muted">
            Registration is disabled. Contact an admin for access.
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
