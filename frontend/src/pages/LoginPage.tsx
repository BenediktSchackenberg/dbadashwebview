import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/api';
import { Database, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      navigate('/');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#060a12]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="ambient-orb ambient-orb-1 absolute -left-[25%] -top-[35%] h-[75vmin] w-[75vmin] rounded-full bg-cyan-500/20 blur-[100px]" />
        <div className="ambient-orb ambient-orb-2 absolute -right-[30%] top-[5%] h-[70vmin] w-[70vmin] rounded-full bg-fuchsia-600/18 blur-[110px]" />
        <div className="ambient-orb ambient-orb-3 absolute bottom-[-25%] left-[15%] h-[60vmin] w-[60vmin] rounded-full bg-violet-600/18 blur-[95px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 36, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.9 }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className="glass-strong rounded-2xl border border-white/10 p-8 shadow-2xl shadow-black/40">
          {/* Logo */}
          <div className="mb-8 text-center">
            <motion.div
              className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-violet-600 shadow-lg shadow-blue-500/30"
              initial={{ rotate: -8, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.12 }}
              whileHover={{ scale: 1.06, rotate: 2 }}
            >
              <Database className="h-8 w-8 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white">DBA Dash</h1>
            <p className="text-gray-400 text-sm mt-1">SQL Server Monitoring Dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-all"
                  placeholder="Enter username"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-all"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 py-2.5 font-medium text-white shadow-lg shadow-blue-500/30 transition-shadow hover:shadow-blue-500/45 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
