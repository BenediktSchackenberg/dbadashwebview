import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Instances from './pages/Instances'
import Jobs from './pages/Jobs'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/instances', label: 'Instances', icon: '🖥️' },
  { to: '/jobs', label: 'Jobs', icon: '⚙️' },
]

export default function App() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-60 shrink-0 bg-[#0c1222] border-r border-slate-700/50 flex flex-col">
        <div className="px-5 py-6 border-b border-slate-700/50">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-blue-400">DBA</span>
            <span className="text-slate-300">Dash</span>
            <span className="text-slate-500 text-sm ml-1 font-normal">Web</span>
          </h1>
        </div>
        <div className="flex-1 py-4 space-y-1 px-3">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-slate-700/50 text-xs text-slate-600">
          DBA Dash Web Monitor
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/instances" element={<Instances />} />
          <Route path="/jobs" element={<Jobs />} />
        </Routes>
      </main>
    </div>
  )
}
