import { motion } from 'framer-motion';
import { ExternalLink, Github, Heart } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold text-white">
        About DBA Dash WebView
      </motion.h1>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass rounded-xl p-6 gradient-border space-y-4">
        <p className="text-gray-300 leading-relaxed">
          A modern web-based dashboard for SQL Server fleet monitoring, providing a browser-accessible read-only view
          of the data collected by <strong className="text-white">DBA Dash</strong>.
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass rounded-xl p-6 gradient-border space-y-4">
        <div className="flex items-center gap-3">
          <Heart className="w-6 h-6 text-red-400" />
          <h2 className="text-xl font-semibold text-white">Powered by DBA Dash</h2>
        </div>
        <p className="text-gray-300 leading-relaxed">
          This dashboard reads data collected by <strong className="text-white">DBA Dash</strong>, an outstanding
          open-source SQL Server monitoring tool created and maintained by the team at{' '}
          <strong className="text-white">Trimble</strong>.
        </p>
        <p className="text-gray-300 leading-relaxed">
          DBA Dash provides comprehensive SQL Server monitoring including performance metrics, daily health checks,
          configuration tracking, and much more. It is one of the best free tools available for SQL Server DBAs.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="https://github.com/trimble-oss/dba-dash" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-gray-300 hover:text-white transition-all">
            <Github className="w-4 h-4" /> GitHub Repository
            <ExternalLink className="w-3 h-3 text-gray-500" />
          </a>
          <a href="https://dbadash.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-gray-300 hover:text-white transition-all">
            <ExternalLink className="w-4 h-4" /> dbadash.com
          </a>
          <a href="https://dbadash.com/docs/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-gray-300 hover:text-white transition-all">
            <ExternalLink className="w-4 h-4" /> Documentation
          </a>
        </div>
        <p className="text-sm text-gray-500">DBA Dash is licensed under the Apache License 2.0.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="glass rounded-xl p-6 gradient-border space-y-4">
        <h2 className="text-xl font-semibold text-white">Credits</h2>
        <ul className="space-y-3 text-gray-300">
          <li className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0" />
            <div>
              <strong className="text-white">DBA Dash</strong> — Created by the DBA Dash team at Trimble
              (<a href="https://github.com/trimble-oss" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">trimble-oss</a>).
              Special thanks to all contributors who make this incredible tool possible.
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-purple-400 mt-2 shrink-0" />
            <div>
              <strong className="text-white">DBA Dash WebView</strong> — Built by Benedikt Schackenberg.
              A web-based companion to DBA Dash, providing browser-accessible monitoring.
            </div>
          </li>
        </ul>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="glass rounded-xl p-6 gradient-border space-y-3">
        <h2 className="text-xl font-semibold text-white">Disclaimer</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          DBA Dash WebView is a separate, independent project that provides a web-based read-only view of the
          DBA Dash repository database. It is <strong className="text-gray-300">not affiliated with, endorsed by,
          or officially associated with DBA Dash or Trimble</strong>. All credit for the data collection,
          monitoring logic, and repository database schema belongs to the DBA Dash project.
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="glass rounded-xl p-6 gradient-border space-y-3">
        <h2 className="text-xl font-semibold text-white">License</h2>
        <p className="text-gray-300">DBA Dash WebView is released under the <strong className="text-white">MIT License</strong>.</p>
        <a href="https://github.com/BenediktSchackenberg/dbadashwebview" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-sm text-blue-400 hover:text-blue-300 transition-all">
          <Github className="w-4 h-4" /> View on GitHub <ExternalLink className="w-3 h-3" />
        </a>
      </motion.div>
    </div>
  );
}
