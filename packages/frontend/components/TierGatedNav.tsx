import React from 'react';
import Link from 'next/link';
import { useOrganizerTier } from '../hooks/useOrganizerTier';

/**
 * TierGatedNavLink — Navigation link with tier-based access control
 * Locked features show dimmed with lock icon and tooltip
 */
interface TierGatedNavLinkProps {
  href: string;
  label: string;
  requiredTier: 'SIMPLE' | 'PRO' | 'TEAMS';
  icon?: React.ReactNode;
}

export function TierGatedNavLink({
  href,
  label,
  requiredTier,
  icon,
}: TierGatedNavLinkProps) {
  const { canAccess } = useOrganizerTier();
  const isLocked = !canAccess(requiredTier);

  if (isLocked) {
    return (
      <Link
        href={href}
        className="flex items-center justify-between px-3 py-2 text-sm text-warm-500 dark:text-warm-400 hover:text-warm-600 dark:hover:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-800 rounded-md"
        title={`Upgrade to ${requiredTier} to unlock ${label}`}
      >
        <span className="flex items-center gap-1">
          {icon} {label}
        </span>
        <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
          🔒 {requiredTier}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md"
    >
      <span className="flex items-center gap-1 text-sm">
        {icon} {label}
      </span>
    </Link>
  );
}

/**
 * TierGatedButton — Dashboard button with tier-based access control
 * Locked features show dimmed with lock icon and disabled state
 */
interface TierGatedButtonProps {
  href?: string;
  label: string;
  icon: React.ReactNode;
  requiredTier: 'SIMPLE' | 'PRO' | 'TEAMS';
  onClick?: () => void;
  className?: string;
}

export function TierGatedButton({
  href,
  label,
  icon,
  requiredTier,
  onClick,
  className = '',
}: TierGatedButtonProps) {
  const { canAccess } = useOrganizerTier();
  const isLocked = !canAccess(requiredTier);

  const baseClasses = 'inline-flex items-center gap-2 px-4 py-3 rounded-lg transition-all font-bold text-sm';
  const enabledClasses = 'bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 cursor-pointer';
  const disabledClasses = 'bg-gray-100 dark:bg-gray-800 opacity-50 cursor-not-allowed text-gray-600 dark:text-gray-400';

  const buttonClasses = `${baseClasses} ${isLocked ? disabledClasses : enabledClasses} ${className}`;

  if (isLocked) {
    return (
      <button
        disabled
        className={buttonClasses}
        title={`Upgrade to ${requiredTier} to unlock ${label}`}
      >
        <span>🔒 {icon}</span>
        <span>{label}</span>
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className={buttonClasses}>
        <span>{icon}</span>
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={buttonClasses}>
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/**
 * SectionHeader — Consistent styling for nav section headers with optional icon
 */
import type { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  label: string;
  icon?: LucideIcon;
  color?: 'amber' | 'purple' | 'indigo' | 'red';
}

export function SectionHeader({ label, icon: Icon, color = 'amber' }: SectionHeaderProps) {
  const colorClasses = {
    amber: 'text-amber-600 dark:text-amber-400',
    purple: 'text-purple-600 dark:text-purple-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    red: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${colorClasses[color]} mt-2`}>
      {Icon && <Icon size={16} />}
      <span>{label}</span>
    </div>
  );
}
