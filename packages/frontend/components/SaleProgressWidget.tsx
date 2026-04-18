import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';

interface ChecklistItem {
  id: string;
  stage: string;
  label: string;
  completed: boolean;
  isAuto: boolean;
  link?: string;
  tier?: string;
}

interface StageProgress {
  stageId: string;
  label: string;
  total: number;
  completed: number;
  isComplete: boolean;
}

interface ChecklistResponse {
  id: string;
  saleId: string;
  items: ChecklistItem[];
  stageProgress: StageProgress[];
  updatedAt: string;
}

interface SaleProgressWidgetProps {
  saleId: string;
  saleTitle: string;
}

const stageIcons: Record<string, string> = {
  'setup': '📋',
  'cataloging': '⚡',
  'ready_to_publish': '📤',
  'live': '🏆',
  'wrapping_up': '⏱️',
  'complete': '✅',
};

const SaleProgressWidget: React.FC<SaleProgressWidgetProps> = ({ saleId, saleTitle }) => {
  const { data: checklist, isLoading } = useQuery<ChecklistResponse>({
    queryKey: ['checklist-widget', saleId],
    queryFn: async () => {
      const res = await api.get(`/checklist/${saleId}`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-warm-200 dark:border-gray-700 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-4" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
      </div>
    );
  }

  if (!checklist) return null;

  const stageProgress = checklist.stageProgress || [];
  const items = checklist.items || [];

  // Find current (active) stage
  const currentStage =
    stageProgress.find((s) => !s.isComplete) || stageProgress[stageProgress.length - 1];

  // Calculate overall progress
  const totalTasks = items.length;
  const completedTasks = items.filter((i) => i.completed).length;
  const overallPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-800 rounded-lg p-4 border border-amber-200 dark:border-amber-700/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-lg">📊</span>
          Sale Progress
        </h3>
        <Link
          href={`/organizer/plan/${saleId}`}
          className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium flex items-center gap-1"
        >
          Open
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Current Stage */}
      {currentStage && (
        <div className="mb-3">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Current Stage</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {stageIcons[currentStage.stageId]} {currentStage.label}
          </p>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {completedTasks} of {totalTasks} tasks
          </p>
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{overallPercent}%</p>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-amber-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* Stage Dots */}
      <div className="flex gap-1 mb-4">
        {stageProgress.slice(0, 6).map((stage) => (
          <div
            key={stage.stageId}
            className={`
              h-2 flex-1 rounded-full transition-all
              ${stage.isComplete
                ? 'bg-green-500 dark:bg-green-600'
                : stage.label === currentStage?.label
                ? 'bg-amber-500 dark:bg-amber-500'
                : 'bg-gray-300 dark:bg-gray-600'
              }
            `}
            title={stage.label}
          />
        ))}
      </div>

      {/* CTA */}
      <Link
        href={`/organizer/plan/${saleId}`}
        className="block w-full text-center py-2 px-3 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white text-sm font-medium rounded transition-colors"
      >
        Track Progress →
      </Link>
    </div>
  );
};

export default SaleProgressWidget;
