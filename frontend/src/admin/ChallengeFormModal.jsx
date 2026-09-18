import { useState } from 'react';
import { createChallenge, updateChallenge } from '../api/admin';
import { Modal } from './components/AdminUI';

const EMPTY = {
  title: '', description: '', criteriaType: 'WatchCount', criteriaValue: '',
  targetCount: 5, xpReward: 100, startDate: '', endDate: '',
};

// Oracle DATE has no time zone and <input type="date"> speaks yyyy-MM-dd, so
// values are sliced on the way in and sent as plain date strings on the way out.
function toDateInput(value) {
  return value ? String(value).slice(0, 10) : '';
}

export default function ChallengeFormModal({ challenge, criteriaTypes, onClose, onSaved }) {
  const editing = Boolean(challenge?.challengeId);

  const [form, setForm] = useState(() => (editing
    ? {
      title: challenge.title || '',
      description: challenge.description || '',
      criteriaType: challenge.criteriaType || 'WatchCount',
      criteriaValue: challenge.criteriaValue || '',
      targetCount: challenge.targetCount ?? 5,
      xpReward: challenge.xpReward ?? 100,
      startDate: toDateInput(challenge.startDate),
      endDate: toDateInput(challenge.endDate),
    }
    : { ...EMPTY }));

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const selected = criteriaTypes.find((type) => type.value === form.criteriaType);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function submit() {
    const title = form.title.trim();
    const target = Number(form.targetCount);
    const reward = Number(form.xpReward);

    // Validated here as well as server-side so the admin gets the message
    // without a round trip, not instead of one.
    if (!title) return setFormError('Give the challenge a title.');
    if (!Number.isInteger(target) || target < 1) return setFormError('Target must be at least 1.');
    if (!Number.isInteger(reward) || reward < 0) return setFormError('XP reward cannot be negative.');
    if (selected?.needsValue && !form.criteriaValue.trim()) {
      return setFormError(`This challenge type needs a value — ${selected.valueHint}.`);
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      return setFormError('The end date must come after the start date.');
    }

    setSaving(true);
    setFormError('');

    const payload = {
      title,
      description: form.description.trim() || undefined,
      criteriaType: form.criteriaType,
      criteriaValue: selected?.needsValue ? form.criteriaValue.trim() : undefined,
      targetCount: target,
      xpReward: reward,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    };

    try {
      const result = editing
        ? await updateChallenge(challenge.challengeId, payload)
        : await createChallenge(payload);
      onSaved(result.message);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      title={editing ? `Edit "${challenge.title}"` : 'Create weekly challenge'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="adm-btn adm-btn--primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save as draft'}
          </button>
        </>
      }
    >
      {!editing && (
        <p style={{ fontSize: 12 }}>
          Saving creates a <strong style={{ color: 'var(--text)' }}>draft</strong>. Nobody is notified
          until you publish it from the challenges list.
        </p>
      )}

      <label className="adm-field">
        <span>Challenge title <span className="adm-req">*</span></span>
        <input
          className="adm-input" value={form.title} onChange={update('title')} autoFocus
          placeholder="e.g. Five nights of Bengali cinema"
        />
      </label>

      <label className="adm-field">
        <span>Description</span>
        <textarea
          className="adm-textarea" value={form.description} onChange={update('description')}
          placeholder="What are you asking people to do, and why?"
        />
      </label>

      <div className="adm-field-row">
        <label className="adm-field">
          <span>Challenge type <span className="adm-req">*</span></span>
          {/* Only the types challengeController.evaluateChallengeProgress can
              actually score. Offering a fifth would create a challenge whose
              progress never moves, because nothing increments it. */}
          <select className="adm-select" value={form.criteriaType} onChange={update('criteriaType')}>
            {criteriaTypes.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </label>

        {selected?.needsValue && (
          <label className="adm-field">
            <span>Value <span className="adm-req">*</span></span>
            <input
              className="adm-input" value={form.criteriaValue} onChange={update('criteriaValue')}
              placeholder={selected.valueHint}
            />
          </label>
        )}
      </div>

      <div className="adm-field-row">
        <label className="adm-field">
          <span>Target count <span className="adm-req">*</span></span>
          <input type="number" min="1" className="adm-input" value={form.targetCount} onChange={update('targetCount')} />
        </label>
        <label className="adm-field">
          <span>XP reward <span className="adm-req">*</span></span>
          <input type="number" min="0" className="adm-input" value={form.xpReward} onChange={update('xpReward')} />
        </label>
      </div>

      <div className="adm-field-row">
        <label className="adm-field">
          <span>Start date</span>
          <input type="date" className="adm-input" value={form.startDate} onChange={update('startDate')} />
        </label>
        <label className="adm-field">
          <span>End date</span>
          <input type="date" className="adm-input" value={form.endDate} onChange={update('endDate')} />
        </label>
      </div>

      {formError && <p className="adm-field__error" role="alert">{formError}</p>}
    </Modal>
  );
}
