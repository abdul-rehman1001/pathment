'use client';

import { useState } from 'react';
import { Loader2, Plus, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import programManagementApi from '@/lib/services/program-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Drawer } from '@/components/shared/Drawer';
import RichTextEditor from '@/components/shared/RichTextEditor';

const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

/** Loose shape - the detail API returns more than the typed ProgramDetailProgram. */
export interface EditableProgram {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  totalDurationWeeks?: number;
  estimatedHoursPerWeek?: number;
  startDate?: string;
  endDate?: string;
  maxEnrollments?: number | null;
  tags?: string[];
  learningOutcomes?: string[];
  prerequisites?: string[] | string;
  targetAudience?: string;
}

interface EditProgramDrawerProps {
  program: EditableProgram;
  onClose: () => void;
  onSaved: () => void;
}

// Date inputs need YYYY-MM-DD; the program's dates are ISO strings.
const toDateInput = (v?: string) => (v ? v.slice(0, 10) : '');
const toArray = (v?: string[] | string): string[] =>
  Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v.trim()] : [];

/**
 * EditProgramDrawer - right slide-over to edit a program's full details after
 * creation (mirrors CreateProgramDrawer). Status & visibility are intentionally
 * excluded - those keep their dedicated header toggles.
 */
export function EditProgramDrawer({ program, onClose, onSaved }: EditProgramDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(program.name ?? '');
  const [description, setDescription] = useState(program.description ?? '');
  const [type, setType] = useState(program.type ?? '');
  const [totalDurationWeeks, setTotalDurationWeeks] = useState<number>(program.totalDurationWeeks ?? 12);
  const [estimatedHoursPerWeek, setEstimatedHoursPerWeek] = useState<number>(program.estimatedHoursPerWeek ?? 10);
  const [startDate, setStartDate] = useState(toDateInput(program.startDate));
  const [endDate, setEndDate] = useState(toDateInput(program.endDate));
  const [maxEnrollments, setMaxEnrollments] = useState<number | ''>(
    program.maxEnrollments == null ? '' : program.maxEnrollments,
  );
  const [tags, setTags] = useState<string[]>(toArray(program.tags));
  const [learningOutcomes, setLearningOutcomes] = useState<string[]>(toArray(program.learningOutcomes));
  const [prerequisites, setPrerequisites] = useState<string[]>(toArray(program.prerequisites));
  const [targetAudience, setTargetAudience] = useState(program.targetAudience ?? '');

  const [tagInput, setTagInput] = useState('');
  const [outcomeInput, setOutcomeInput] = useState('');
  const [prerequisiteInput, setPrerequisiteInput] = useState('');

  const addItem = (
    value: string,
    list: string[],
    setList: (v: string[]) => void,
    clear: () => void,
  ) => {
    const v = value.trim();
    if (v && !list.includes(v)) {
      setList([...list, v]);
      clear();
    }
  };
  const removeItem = (value: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.filter((x) => x !== value));

  const handleSave = async () => {
    if (!name.trim() || !description.trim() || !type) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        name: name.trim(),
        description,
        type,
        totalDurationWeeks,
        estimatedHoursPerWeek,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        maxEnrollments:
          maxEnrollments === '' || isNaN(Number(maxEnrollments)) ? null : Number(maxEnrollments),
        tags,
        learningOutcomes,
        prerequisites,
        targetAudience,
      };
      await programManagementApi.programs.update(program.id, payload);
      toast.success('Program updated');
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Could not update program'));
    } finally {
      setLoading(false);
    }
  };

  const Chips = ({ items, onRemove }: { items: string[]; onRemove: (v: string) => void }) =>
    items.length > 0 ? (
      <div className="flex flex-wrap gap-2 mt-2">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 text-brand-700 rounded-lg text-xs">
            {it}
            <button type="button" onClick={() => onRemove(it)} className="text-brand-500 hover:text-brand-700" aria-label={`Remove ${it}`}><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
    ) : null;

  return (
    <Drawer
      open
      onClose={onClose}
      title="Edit program"
      subtitle="Update the program's details. Status & visibility stay in the header."
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save changes
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="ep-name" className={labelCls}>Program name <span className="text-red-500">*</span></label>
          <input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full-Stack Web Development" className={field} />
        </div>

        <div>
          <label htmlFor="ep-desc" className={labelCls}>Description <span className="text-red-500">*</span></label>
          <RichTextEditor content={description} onChange={setDescription} placeholder="Objectives, outcomes, key focus areas…" minHeight="120px" />
        </div>

        <div>
          <label htmlFor="ep-type" className={labelCls}>Type <span className="text-red-500">*</span></label>
          <select id="ep-type" value={type} onChange={(e) => setType(e.target.value)} className={field}>
            <option value="">Select type…</option>
            <option value="internship">Internship</option>
            <option value="mentorship">Mentorship</option>
            <option value="training">Training</option>
            <option value="onboarding">Onboarding</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ep-weeks" className={labelCls}>Duration (weeks)</label>
            <input id="ep-weeks" type="number" min={1} max={104} value={totalDurationWeeks} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setTotalDurationWeeks(v); }} className={field} />
          </div>
          <div>
            <label htmlFor="ep-hours" className={labelCls}>Hours / week</label>
            <input id="ep-hours" type="number" min={1} max={40} value={estimatedHoursPerWeek} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setEstimatedHoursPerWeek(v); }} className={field} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ep-start" className={labelCls}>Start date</label>
            <input id="ep-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="ep-end" className={labelCls}>End date</label>
            <input id="ep-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} />
          </div>
        </div>

        <div>
          <label htmlFor="ep-max" className={labelCls}>Max enrollments <span className="text-slate-400 font-normal">(optional)</span></label>
          <input id="ep-max" type="number" min={1} placeholder="Leave empty for unlimited" value={maxEnrollments} onChange={(e) => { const v = parseInt(e.target.value, 10); setMaxEnrollments(e.target.value === '' ? '' : isNaN(v) || v < 1 ? maxEnrollments : v); }} className={field} />
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="ep-tag" className={labelCls}>Tags</label>
          <div className="flex gap-2">
            <input id="ep-tag" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(tagInput, tags, setTags, () => setTagInput('')); } }} placeholder="Add a tag…" className={field} />
            <button type="button" onClick={() => addItem(tagInput, tags, setTags, () => setTagInput(''))} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm shrink-0"><Plus className="w-4 h-4" /></button>
          </div>
          <Chips items={tags} onRemove={(v) => removeItem(v, tags, setTags)} />
        </div>

        {/* Learning outcomes */}
        <div>
          <label htmlFor="ep-out" className={labelCls}>Learning outcomes</label>
          <div className="flex gap-2">
            <input id="ep-out" value={outcomeInput} onChange={(e) => setOutcomeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(outcomeInput, learningOutcomes, setLearningOutcomes, () => setOutcomeInput('')); } }} placeholder="Add an outcome…" className={field} />
            <button type="button" onClick={() => addItem(outcomeInput, learningOutcomes, setLearningOutcomes, () => setOutcomeInput(''))} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm shrink-0"><Plus className="w-4 h-4" /></button>
          </div>
          <Chips items={learningOutcomes} onRemove={(v) => removeItem(v, learningOutcomes, setLearningOutcomes)} />
        </div>

        {/* Prerequisites */}
        <div>
          <label htmlFor="ep-pre" className={labelCls}>Prerequisites</label>
          <div className="flex gap-2">
            <input id="ep-pre" value={prerequisiteInput} onChange={(e) => setPrerequisiteInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(prerequisiteInput, prerequisites, setPrerequisites, () => setPrerequisiteInput('')); } }} placeholder="Add a prerequisite…" className={field} />
            <button type="button" onClick={() => addItem(prerequisiteInput, prerequisites, setPrerequisites, () => setPrerequisiteInput(''))} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm shrink-0"><Plus className="w-4 h-4" /></button>
          </div>
          <Chips items={prerequisites} onRemove={(v) => removeItem(v, prerequisites, setPrerequisites)} />
        </div>

        <div>
          <label htmlFor="ep-aud" className={labelCls}>Target audience</label>
          <input id="ep-aud" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Who is this program for?" className={field} />
        </div>
      </div>
    </Drawer>
  );
}

export default EditProgramDrawer;
