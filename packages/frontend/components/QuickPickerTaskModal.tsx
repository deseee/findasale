import React, { useState } from 'react';
import api from '../lib/api';
import { useTaskTemplates, TaskTemplateCategory, TaskTemplate } from '../hooks/useTaskTemplates';
import Skeleton from './Skeleton';

interface Member {
  id: string;
  organizerId: string;
  role: string;
  acceptedAt: string | null;
  organizer?: {
    id: string;
    businessName: string;
    profilePhoto?: string;
    user?: { email: string };
  } | null;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface Sale {
  id: string;
  title: string;
}

interface QuickPickerTaskModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  sales?: Sale[];
  members?: Member[];
}

const QuickPickerTaskModal: React.FC<QuickPickerTaskModalProps> = ({
  workspaceId,
  isOpen,
  onClose,
  onTaskCreated,
  sales = [],
  members = [],
}: QuickPickerTaskModalProps) => {
  const { data, isLoading, isError } = useTaskTemplates(workspaceId);
  const [selectedCategory, setSelectedCategory] = useState<string>('setup');
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customTaskTitle, setCustomTaskTitle] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');

  const templates = data?.templates || [];
  const currentCategory = templates.find((cat: TaskTemplateCategory) => cat.id === selectedCategory);

  const handleSelectTask = (taskTitle: string): void => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskTitle)) {
      newSelected.delete(taskTitle);
    } else {
      newSelected.add(taskTitle);
    }
    setSelectedTasks(newSelected);
  };

  const handleSelectAll = (): void => {
    if (!currentCategory) return;
    const allTitles = new Set(currentCategory.tasks.map((t: TaskTemplate) => t.title));
    if (selectedTasks.size === allTitles.size) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(allTitles);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!selectedSaleId || (selectedTasks.size === 0 && !useCustom)) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const tasksToCreate = Array.from(selectedTasks);
      if (useCustom && customTaskTitle.trim()) {
        tasksToCreate.push(customTaskTitle.trim());
      }

      for (const taskTitle of tasksToCreate) {
        const payload: any = {
          title: taskTitle,
          saleId: selectedSaleId,
        };
        if (selectedAssigneeId) {
          payload.assignedToId = selectedAssigneeId;
        }
        await api.post(`/workspace/${workspaceId}/tasks`, payload);
      }

      setSelectedTasks(new Set());
      setCustomTaskTitle('');
      setUseCustom(false);
      setSelectedSaleId('');
      setSelectedAssigneeId('');
      onTaskCreated();
      onClose();
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message ?? 'Failed to create tasks. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">
            Quick Add Tasks
          </h2>
          <button
            onClick={onClose}
            className="text-warm-400 hover:text-warm-600 dark:hover:text-warm-300 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-700 dark:text-red-300 text-sm">
              Failed to load task templates. Please try again.
            </p>
          </div>
        ) : (
          <>
            {/* Sale Selector */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">
                Which sale? <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedSaleId}
                onChange={(e) => setSelectedSaleId(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-sage-500"
              >
                <option value="">Select a sale...</option>
                {sales.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee Selector */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">
                Assign to
              </label>
              <select
                value={selectedAssigneeId}
                onChange={(e) => setSelectedAssigneeId(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-sage-500"
              >
                <option value="">Unassigned</option>
                {members.map((member) => {
                  const memberName = member.organizer?.businessName || member.user?.name || member.user?.email || 'Team Member';
                  return (
                    <option key={member.id} value={member.organizerId}>
                      {memberName}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Category Pills */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-warm-600 dark:text-warm-400 mb-3 uppercase">
                Categories
              </p>
              <div className="flex flex-wrap gap-2">
                {templates.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedCategory(category.id);
                      setSelectedTasks(new Set());
                    }}
                    className={`px-4 py-2 rounded-full font-semibold text-sm transition ${
                      selectedCategory === category.id
                        ? 'bg-sage-600 text-white dark:bg-sage-600'
                        : 'bg-warm-100 text-warm-700 hover:bg-warm-200 dark:bg-gray-700 dark:text-warm-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className="mr-2">{category.emoji}</span>
                    {category.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Task List */}
            {currentCategory && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">
                    {currentCategory.label} Tasks
                  </p>
                  <button
                    onClick={handleSelectAll}
                    className="text-xs text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 font-medium"
                  >
                    {selectedTasks.size === currentCategory.tasks.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                </div>
                <div className="space-y-2 bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
                  {currentCategory && currentCategory.tasks.map((task: TaskTemplate, idx: number) => (
                    <label
                      key={idx}
                      className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-warm-100 dark:hover:bg-gray-600 transition"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTasks.has(task.title)}
                        onChange={() => handleSelectTask(task.title)}
                        className="w-4 h-4 mt-1 rounded border-warm-300 dark:border-gray-600 accent-sage-600 cursor-pointer flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-warm-900 dark:text-warm-100">
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-warm-600 dark:text-warm-400 mt-1">
                            {task.description}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Task Section */}
            <div className="mb-6">
              <button
                onClick={() => setUseCustom(!useCustom)}
                className="flex items-center gap-2 text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2"
              >
                <span
                  className={`w-5 h-5 border-2 rounded transition flex items-center justify-center ${
                    useCustom
                      ? 'bg-sage-600 border-sage-600'
                      : 'border-warm-300 dark:border-gray-600'
                  }`}
                >
                  {useCustom && <span className="text-white text-xs">✓</span>}
                </span>
                Add Custom Task
              </button>
              {useCustom && (
                <input
                  type="text"
                  value={customTaskTitle}
                  onChange={(e) => setCustomTaskTitle(e.target.value)}
                  placeholder="Enter custom task title..."
                  maxLength={200}
                  className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-500 dark:placeholder-warm-400 focus:outline-none focus:ring-2 focus:ring-sage-500 text-sm"
                />
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
                {errorMessage}
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 pt-6 border-t border-warm-200 dark:border-gray-700">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  !selectedSaleId ||
                  (selectedTasks.size === 0 && !useCustom) ||
                  (useCustom && !customTaskTitle.trim())
                }
                className="flex-1 py-2 px-4 bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Add Selected Tasks'}
              </button>
            </div>

            {/* Info Text */}
            <p className="mt-4 text-xs text-warm-600 dark:text-warm-400 text-center">
              {selectedTasks.size + (useCustom && customTaskTitle.trim() ? 1 : 0)} task
              {selectedTasks.size + (useCustom && customTaskTitle.trim() ? 1 : 0) !== 1
                ? 's'
                : ''}{' '}
              selected
              {selectedSaleId && (
                <>
                  {' — '}
                  {sales.find((s) => s.id === selectedSaleId)?.title}
                  {selectedAssigneeId && (
                    <>
                      {' — '}
                      {members.find((m) => m.organizerId === selectedAssigneeId)?.organizer?.businessName ||
                        members.find((m) => m.organizerId === selectedAssigneeId)?.user?.name ||
                        'Assigned'}
                    </>
                  )}
                  {!selectedAssigneeId && ' — Unassigned'}
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default QuickPickerTaskModal;
