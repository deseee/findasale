import React from 'react';
import Link from 'next/link';

interface QuickAction {
  label: string;
  href: string;
  icon: string;
  description: string;
  color: 'amber' | 'green' | 'blue' | 'purple';
}

const QuickActionsBar: React.FC = () => {
  const actions: QuickAction[] = [
    {
      label: 'Add Items',
      href: '/organizer/dashboard',
      icon: '📷',
      description: 'Upload photos and create inventory',
      color: 'amber',
    },
    {
      label: 'Send Updates',
      href: '/organizer/dashboard',
      icon: '📢',
      description: 'Notify followers about sales',
      color: 'blue',
    },
    {
      label: 'View Analytics',
      href: '/organizer/dashboard',
      icon: '📊',
      description: 'Performance & engagement metrics',
      color: 'green',
    },
    {
      label: 'Download Report',
      href: '/organizer/dashboard',
      icon: '📄',
      description: 'Export sale data & records',
      color: 'purple',
    },
  ];

  const colorClasses: Record<QuickAction['color'], { bg: string; hover: string; icon: string }> = {
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      hover: 'hover:bg-amber-100 dark:hover:bg-amber-900/40',
      icon: 'text-amber-600 dark:text-amber-400',
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      hover: 'hover:bg-green-100 dark:hover:bg-green-900/40',
      icon: 'text-green-600 dark:text-green-400',
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/40',
      icon: 'text-blue-600 dark:text-blue-400',
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/40',
      icon: 'text-purple-600 dark:text-purple-400',
    },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {actions.map((action) => {
        const colors = colorClasses[action.color];
        return (
          <Link
            key={action.label}
            href={action.href}
            className={`${colors.bg} ${colors.hover} rounded-lg p-4 transition-colors border border-transparent hover:border-current/20`}
          >
            <div className={`text-3xl mb-2 ${colors.icon}`}>{action.icon}</div>
            <h4 className="text-sm font-semibold text-warm-900 dark:text-gray-100 mb-1">{action.label}</h4>
            <p className="text-xs text-warm-600 dark:text-gray-400">{action.description}</p>
          </Link>
        );
      })}
    </div>
  );
};

export default QuickActionsBar;
