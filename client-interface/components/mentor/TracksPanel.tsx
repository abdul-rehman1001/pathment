'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Archive, Plus, Layers, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTracks } from '@/lib/hooks/mentor';
import type { Track } from '@/lib/services/tracks-api';

const STATUS_TONE: Record<string, string> = {
  assigned: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-brand-50 text-brand-700',
  submitted: 'bg-amber-50 text-amber-700',
  changes_requested: 'bg-orange-50 text-orange-700',
  completed: 'bg-green-50 text-green-700',
};
const statusLabel = (s: string) => s.replace(/_/g, ' ');

/**
 * TracksPanel - mentor-curated personal lanes for one mentee. Inline create +
 * rename, archive, per-track quick "+ task". Re-skinned to the current
 * indigo/slate design from the prototype's calm styling.
 */
export function TracksPanel({ menteeId }: { menteeId: string }) {
  const { tracks, loading, create, rename, archive, remove, addTask } = useTracks(menteeId);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const commitCreate = async () => {
    const name = draft.trim();
    setCreating(false);
    setDraft('');
    if (!name) return;
    try { setBusy(true); await create(name); } catch { toast.error('Could not create track'); } finally { setBusy(false); }
  };

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-brand-600" />
          <h3 className="text-slate-900 font-semibold">Tracks</h3>
        </div>
        <span className="text-xs text-slate-400 tabular-nums">{tracks.length}</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading tracks…</div>
      ) : (
        <div className="space-y-2">
          {tracks.length === 0 && !creating && (
            <p className="text-sm text-slate-500">No tracks yet. Add a lane below to organize this mentee&apos;s work.</p>
          )}
          {tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              onRename={(name) => rename(track.id, name)}
              onArchive={() => archive(track.id)}
              onRemove={() => remove(track.id)}
              onAddTask={(title) => addTask(track.id, title)}
            />
          ))}
        </div>
      )}

      <div className="mt-3">
        {creating ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => { if (e.key === 'Enter') commitCreate(); if (e.key === 'Escape') { setDraft(''); setCreating(false); } }}
            placeholder="Track name…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Add track
          </button>
        )}
      </div>
    </div>
  );
}

function TrackRow({
  track, onRename, onArchive, onRemove, onAddTask,
}: {
  track: Track;
  onRename: (name: string) => Promise<void>;
  onArchive: () => Promise<void>;
  onRemove: () => Promise<void>;
  onAddTask: (title: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);
  const [addingTask, setAddingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const commitRename = async () => {
    const next = name.trim();
    setEditing(false);
    if (!next || next === track.name) { setName(track.name); return; }
    try { await onRename(next); } catch { toast.error('Could not rename'); setName(track.name); }
  };

  const commitTask = async () => {
    const title = taskTitle.trim();
    setAddingTask(false);
    setTaskTitle('');
    if (!title) return;
    try { setBusy(true); await onAddTask(title); toast.success('Task added'); } catch { toast.error('Could not add task'); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={() => setOpen((v) => !v)} className="text-slate-400 hover:text-slate-700" aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(track.name); setEditing(false); } }}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        ) : (
          <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-800">
            {track.name}
          </button>
        )}
        <span className="text-xs text-slate-400 tabular-nums">{track.tasks.length}</span>
        {!editing && (
          <>
            <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-brand-600" aria-label="Rename"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={onArchive} className="text-slate-400 hover:text-amber-600" aria-label="Archive"><Archive className="w-3.5 h-3.5" /></button>
            <button onClick={onRemove} className="text-slate-400 hover:text-red-600" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>

      {open && (
        <div className="space-y-1.5 border-t border-slate-100 px-3 py-2.5">
          {track.tasks.length === 0 && !addingTask && (
            <p className="text-xs text-slate-400">No tasks in this track yet.</p>
          )}
          {track.tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{t.title}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_TONE[t.status] || 'bg-slate-100 text-slate-600'}`}>
                {statusLabel(t.status)}
              </span>
            </div>
          ))}
          {addingTask ? (
            <input
              autoFocus
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onBlur={commitTask}
              onKeyDown={(e) => { if (e.key === 'Enter') commitTask(); if (e.key === 'Escape') { setTaskTitle(''); setAddingTask(false); } }}
              placeholder="Task title…"
              className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              disabled={busy}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-brand-600 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" /> task
            </button>
          )}
        </div>
      )}
    </div>
  );
}
