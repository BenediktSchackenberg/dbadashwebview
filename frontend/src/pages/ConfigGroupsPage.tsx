import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Tag } from 'lucide-react';

interface Group { id: number; name: string; description: string; members: string[] }
interface TagItem { id: number; name: string; appliedTo: number }

function loadGroups(): Group[] {
  try { return JSON.parse(localStorage.getItem('config_groups') || '[]'); } catch { return []; }
}
function saveGroups(g: Group[]) { localStorage.setItem('config_groups', JSON.stringify(g)); }
function loadTags(): TagItem[] {
  try { return JSON.parse(localStorage.getItem('config_tags') || '[]'); } catch { return []; }
}
function saveTags(t: TagItem[]) { localStorage.setItem('config_tags', JSON.stringify(t)); }

export default function ConfigGroupsPage() {
  const [groups, setGroups] = useState<Group[]>(loadGroups);
  const [tags, setTags] = useState<TagItem[]>(loadTags);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [newTag, setNewTag] = useState('');

  useEffect(() => { saveGroups(groups); }, [groups]);
  useEffect(() => { saveTags(tags); }, [tags]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Groups & Tags</h1>

      <div className="glass rounded-xl p-6 gradient-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Groups</h3>
          <button onClick={() => setShowAddGroup(true)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 transition-colors">
            <Plus className="w-4 h-4" /> Create Group
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-300 font-semibold">Name</th>
              <th className="pb-3 text-gray-300 font-semibold">Description</th>
              <th className="pb-3 text-gray-300 font-semibold text-right">Members</th>
              <th className="pb-3 text-gray-300 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.id} className="border-b border-white/5">
                <td className="py-3 text-white font-medium">{g.name}</td>
                <td className="py-3 text-gray-400 text-xs">{g.description}</td>
                <td className="py-3 text-gray-300 text-right">{g.members.length}</td>
                <td className="py-3 text-center">
                  <button onClick={() => setGroups(prev => prev.filter(x => x.id !== g.id))} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <p className="text-gray-500 text-sm py-3 text-center">No groups defined.</p>}
      </div>

      {showAddGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddGroup(false)}>
          <div className="glass rounded-xl p-6 w-96 gradient-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Create Group</h3>
              <button onClick={() => setShowAddGroup(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Group Name" value={newGroup.name} onChange={e => setNewGroup(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
              <input placeholder="Description" value={newGroup.description} onChange={e => setNewGroup(p => ({ ...p, description: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
              <button onClick={() => {
                if (newGroup.name) {
                  setGroups(prev => [...prev, { id: Date.now(), ...newGroup, members: [] }]);
                  setNewGroup({ name: '', description: '' });
                  setShowAddGroup(false);
                }
              }} className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-6 gradient-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Tag className="w-5 h-5 text-purple-400" /> Tags</h3>
        </div>
        <div className="flex gap-2 mb-4">
          <input placeholder="New tag name" value={newTag} onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newTag) { setTags(prev => [...prev, { id: Date.now(), name: newTag, appliedTo: 0 }]); setNewTag(''); }}}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm flex-1" />
          <button onClick={() => { if (newTag) { setTags(prev => [...prev, { id: Date.now(), name: newTag, appliedTo: 0 }]); setNewTag(''); }}}
            className="px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 transition-colors">
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map(t => (
            <span key={t.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 text-purple-400 rounded-full text-sm">
              {t.name}
              <button onClick={() => setTags(prev => prev.filter(x => x.id !== t.id))} className="hover:text-red-400"><X className="w-3 h-3" /></button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-gray-500 text-sm">No tags defined.</span>}
        </div>
      </div>
    </div>
  );
}
