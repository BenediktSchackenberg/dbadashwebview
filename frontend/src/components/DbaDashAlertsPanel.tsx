import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2, Circle, Loader2, Lock, MessageSquare, ShieldOff, X, XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../api/api';
import type { ActiveAlertRow, ClosedAlertRow } from '../api/types';
import { getAuthSession, hasRole } from '../auth/session';
import TabNav from './TabNav';

type AlertRow = ActiveAlertRow | ClosedAlertRow;
type Tab = 'active' | 'closed';

function priorityBadge(priority: number): { label: string; className: string } {
  if (priority === 0) return { label: 'Critical', className: 'bg-red-500/15 text-red-300 border-red-500/30' };
  if (priority <= 10) return { label: 'High', className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' };
  if (priority <= 20) return { label: 'Medium', className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' };
  if (priority <= 30) return { label: 'Low', className: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
  return { label: 'Info', className: 'bg-white/10 text-gray-300 border-white/20' };
}

function isActiveAlert(alert: AlertRow): alert is ActiveAlertRow {
  return 'isBlackout' in alert;
}

export default function DbaDashAlertsPanel({ instanceId }: { instanceId?: number }) {
  const canAct = hasRole(['Admin', 'Operator']);
  const [tab, setTab] = useState<Tab>('active');
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notesTarget, setNotesTarget] = useState<AlertRow | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => {
    setSelected(new Set());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, instanceId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = tab === 'active' ? await api.alertsActive(instanceId) : await api.alertsClosed(instanceId);
      setSupported(response.supported);
      setRows(Array.isArray(response.data) ? response.data : []);
      if (response.error) setError(response.error);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Unable to load alerts.');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(alertId: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(alertId)) next.delete(alertId); else next.add(alertId);
      return next;
    });
  }

  async function handleAcknowledge(alertIds: number[], isAcknowledged: boolean) {
    setBusy(true);
    try {
      await api.acknowledgeAlerts({ alertIds, isAcknowledged });
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to acknowledge alert(s).');
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(alertIds: number[]) {
    setBusy(true);
    try {
      await api.closeAlerts({ alertIds });
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to close alert(s).');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNotes() {
    if (!notesTarget) return;
    setBusy(true);
    try {
      await api.updateAlertNotes(notesTarget.alertID, { notes: notesDraft || undefined });
      setNotesTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save notes.');
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = selected.size;

  const tabs = useMemo(() => [
    { key: 'active', label: 'Active' },
    { key: 'closed', label: 'History' },
  ], []);

  if (!getAuthSession()) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <TabNav tabs={tabs} active={tab} onChange={key => setTab(key as Tab)} />
        {canAct && selectedCount > 0 && tab === 'active' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">{selectedCount} selected</span>
            <button
              disabled={busy}
              onClick={() => handleAcknowledge(Array.from(selected), true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg text-xs hover:bg-blue-500/30 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledge
            </button>
            <button
              disabled={busy}
              onClick={() => handleClose(Array.from(selected))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg text-xs hover:bg-emerald-500/30 disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" /> Close
            </button>
          </div>
        )}
      </div>

      {!supported && (
        <div className="glass rounded-xl p-6 flex items-start gap-3 border border-yellow-500/20">
          <Lock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-yellow-200 font-medium">DBA Dash alert lifecycle unavailable</p>
            <p className="text-xs text-gray-400 mt-1">{error || 'This DBADashDB does not have the Alert schema. Upgrade to DBA Dash 3.17.0+ to enable acknowledge/close/notes.'}</p>
          </div>
        </div>
      )}

      {supported && error && (
        <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {supported && loading && (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading alerts...
        </div>
      )}

      {supported && !loading && (
        <div className="space-y-2">
          {rows.map(alert => {
            const badge = priorityBadge(alert.priority);
            const active = isActiveAlert(alert);
            return (
              <motion.div
                key={alert.alertID}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-xl p-4 border border-white/5"
              >
                <div className="flex items-start gap-3">
                  {canAct && tab === 'active' && (
                    <button onClick={() => toggleSelected(alert.alertID)} className="mt-0.5 flex-shrink-0">
                      {selected.has(alert.alertID)
                        ? <CheckCircle2 className="w-4 h-4 text-blue-400" />
                        : <Circle className="w-4 h-4 text-gray-600" />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase border', badge.className)}>
                        {badge.label}
                      </span>
                      <span className="text-xs font-medium text-gray-300">{alert.instanceDisplayName}</span>
                      <span className="text-[10px] text-gray-500">{alert.alertType} · {alert.alertKey}</span>
                      {active && alert.isAcknowledged && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">Acknowledged</span>
                      )}
                      {active && alert.isBlackout && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 flex items-center gap-1">
                          <ShieldOff className="w-3 h-3" /> Blackout
                        </span>
                      )}
                      {alert.isResolved && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">Resolved</span>
                      )}
                      <span className="text-[10px] text-gray-500 ml-auto">
                        {alert.triggerDate ? formatDistanceToNow(new Date(alert.triggerDate), { addSuffix: true }) : ''}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-snug">{alert.lastMessage || alert.firstMessage}</p>
                    {alert.notes && (
                      <p className="text-xs text-gray-500 mt-1.5 bg-white/5 rounded-lg px-2.5 py-1.5">{alert.notes}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => { setNotesTarget(alert); setNotesDraft(alert.notes || ''); }}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
                      >
                        <MessageSquare className="w-3 h-3" /> {alert.notes ? 'Edit notes' : 'Add notes'}
                      </button>
                      {canAct && tab === 'active' && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => handleAcknowledge([alert.alertID], !active || !alert.isAcknowledged)}
                            className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                          >
                            {active && alert.isAcknowledged ? 'Un-acknowledge' : 'Acknowledge'}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => handleClose([alert.alertID])}
                            className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
                          >
                            Close
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {rows.length === 0 && (
            <div className="glass rounded-xl p-10 text-center text-sm text-gray-500">
              {tab === 'active' ? 'No active alerts.' : 'No closed alerts yet.'}
            </div>
          )}
        </div>
      )}

      {notesTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setNotesTarget(null)}>
          <div className="glass rounded-xl p-6 w-[28rem] gradient-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Alert Notes</h3>
              <button onClick={() => setNotesTarget(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              rows={6}
              placeholder="Root cause, follow-up, links..."
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
              readOnly={!canAct}
            />
            {canAct ? (
              <button
                onClick={handleSaveNotes}
                disabled={busy}
                className="w-full mt-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {busy ? 'Saving...' : 'Save Notes'}
              </button>
            ) : (
              <p className="text-xs text-gray-500 mt-2">Viewer role can't edit notes.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
