import React, { useState } from 'react';

/**
 * IntakeReviewPanel (2026-11-05): shows the listing check notes stored on Item.catalogSuggestions.intakeReview by
 * the photo tagging pipeline (verify pass, consistency checks, required facts, missing photos, weight range).
 * Read-only apart from "Use" on title/brand suggestions, which only fills the form field (the normal Save persists it).
 * Renders nothing when there is no review or nothing to say.
 */

interface IntakeReviewNote {
  code: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  field?: string;
  message: string;
  current?: string | number | null;
  suggested?: string | number | null;
}

interface IntakeReview {
  notes: IntakeReviewNote[];
  blockAutoPublish?: boolean;
}

type FillableField = 'title' | 'brand';
const FILLABLE: ReadonlyArray<FillableField> = ['title', 'brand'];

function readReview(catalogSuggestions: unknown): IntakeReview | null {
  if (!catalogSuggestions || typeof catalogSuggestions !== 'object' || Array.isArray(catalogSuggestions)) return null;
  const raw = (catalogSuggestions as Record<string, unknown>).intakeReview;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const notes = (raw as { notes?: unknown }).notes;
  if (!Array.isArray(notes)) return null;
  const clean = notes.filter(
    (n): n is IntakeReviewNote => !!n && typeof n === 'object' && typeof (n as IntakeReviewNote).message === 'string'
  );
  return { notes: clean, blockAutoPublish: (raw as { blockAutoPublish?: unknown }).blockAutoPublish === true };
}

const SEVERITY_STYLE: Record<string, string> = {
  high: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  medium: 'border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 text-warm-800 dark:text-warm-100',
  low: 'border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-warm-700 dark:text-warm-200',
  info: 'border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-warm-600 dark:text-warm-300',
};

interface IntakeReviewPanelProps {
  catalogSuggestions: unknown;
  onFill: (field: FillableField, value: string) => void;
}

const IntakeReviewPanel: React.FC<IntakeReviewPanelProps> = ({ catalogSuggestions, onFill }) => {
  const [showInfo, setShowInfo] = useState(false);
  const [filled, setFilled] = useState<Record<string, boolean>>({});
  const review = readReview(catalogSuggestions);
  if (!review) return null;
  const actionable = review.notes.filter((n) => n.severity !== 'info');
  const info = review.notes.filter((n) => n.severity === 'info');
  if (actionable.length === 0 && info.length === 0) return null;

  const renderNote = (note: IntakeReviewNote, idx: number) => {
    const field = note.field as FillableField | undefined;
    const canFill =
      !!field && FILLABLE.includes(field) && typeof note.suggested === 'string' && note.suggested.trim().length > 0 && note.severity !== 'info';
    const key = `${note.code}-${idx}`;
    return (
      <li key={key} className={`flex items-start justify-between gap-3 rounded border px-3 py-2 text-sm ${SEVERITY_STYLE[note.severity] || SEVERITY_STYLE.low}`}>
        <span className="min-w-0 break-words">{note.message}</span>
        {canFill &&
          (filled[key] ? (
            <span className="shrink-0 text-xs font-semibold text-green-600 dark:text-green-400">Filled</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onFill(field as FillableField, String(note.suggested));
                setFilled((prev) => ({ ...prev, [key]: true }));
              }}
              className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              Use &quot;{String(note.suggested).slice(0, 40)}&quot;
            </button>
          ))}
      </li>
    );
  };

  return (
    <div className="rounded-lg border border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-900/40 p-4">
      <div className="text-sm font-semibold text-warm-800 dark:text-warm-100">Listing check</div>
      <div className="text-xs text-warm-600 dark:text-warm-400 mt-0.5 mb-2">
        {review.blockAutoPublish
          ? 'This item will not be published automatically until the marker below is removed.'
          : 'Things to confirm against the photos before this item goes live.'}
      </div>
      {actionable.length > 0 && <ul className="space-y-2">{actionable.map(renderNote)}</ul>}
      {info.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            className="text-xs font-medium text-warm-600 dark:text-warm-300 underline"
          >
            {showInfo ? 'Hide' : 'Show'} {info.length} automatic {info.length === 1 ? 'update' : 'updates'} and tips
          </button>
          {showInfo && <ul className="space-y-2 mt-2">{info.map((n, i) => renderNote(n, actionable.length + i))}</ul>}
        </div>
      )}
    </div>
  );
};

export default IntakeReviewPanel;
