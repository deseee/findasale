'use client';

import React from 'react';
import HuntPassAvatarBadge from './HuntPassAvatarBadge';

interface AvatarProps {
  /**
   * User name or email (used to generate initials if no photoUrl)
   */
  identifier: string;

  /**
   * User's full name (used for generating initials)
   */
  name?: string;

  /**
   * User's email (used as fallback for identifier)
   */
  email?: string;

  /**
   * Whether the user has an active Hunt Pass
   */
  huntPassActive?: boolean;

  /**
   * Avatar size in pixels (default: 32)
   */
  size?: number;

  /**
   * Optional background color class (default: 'bg-amber-500 dark:bg-amber-600')
   */
  bgColor?: string;

  /**
   * Optional text color class (default: 'text-white')
   */
  textColor?: string;

  /**
   * Optional CSS class name for the avatar container
   */
  className?: string;

  /**
   * Optional title/tooltip text
   */
  title?: string;

  /**
   * Hunt Pass badge position ('bottom-right' or 'top-right')
   */
  badgePosition?: 'bottom-right' | 'top-right';
}

/**
 * Avatar Component
 *
 * Renders a circular avatar with user initials and optional Hunt Pass badge.
 * Handles dark mode automatically.
 *
 * Usage:
 * <Avatar
 *   identifier="John Doe"
 *   name="John Doe"
 *   email="john@example.com"
 *   huntPassActive={user.huntPassActive}
 *   size={40}
 * />
 */
const Avatar: React.FC<AvatarProps> = ({
  identifier,
  name,
  email,
  huntPassActive = false,
  size = 32,
  bgColor = 'bg-amber-500 dark:bg-amber-600',
  textColor = 'text-white',
  className = '',
  title,
  badgePosition = 'bottom-right',
}) => {
  // Generate initials from name or email
  const getInitials = () => {
    const source = name || identifier || email || '';
    if (!source) return '?';

    return source
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const initials = getInitials();

  // Calculate font size proportional to avatar size
  const fontSize = Math.max(10, Math.round(size * 0.35));

  return (
    <div
      className="relative inline-block"
      title={title}
    >
      {/* Avatar circle with initials */}
      <div
        className={`rounded-full flex items-center justify-center font-bold select-none ${bgColor} ${textColor} ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          fontSize: `${fontSize}px`,
          lineHeight: '1',
        }}
        role="img"
        aria-label={`Avatar for ${name || identifier}`}
      >
        {initials}
      </div>

      {/* Hunt Pass badge (rendered on top via absolute positioning) */}
      <HuntPassAvatarBadge
        isActive={huntPassActive}
        size={size}
        position={badgePosition}
      />
    </div>
  );
};

export default Avatar;
