/**
 * BulkActionDropdown
 *
 * "More Actions" dropdown for bulk operations.
 * Exposes: Set Category, Set Status, Manage Tags, Manage Photos
 */

import React, { useRef, useEffect, useState } from 'react';

interface BulkActionDropdownProps {
  onSetCategory: () => void;
  onSetStatus: () => void;
  onManageTags: () => void;
  onManagePhotos: () => void;
  disabled?: boolean;
}

const BulkActionDropdown: React.FC<BulkActionDropdownProps> = ({
  onSetCategory,
  onSetStatus,
  onManageTags,
  onManagePhotos,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (callback: () => void) => {
    callback();
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="text-sm font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50 hover:bg-amber-50 px-3 py-1 rounded transition-colors"
        title="More bulk actions"
      >
        ⋮ More Actions
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-warm-200 z-[99]"
        >
          <button
            onClick={() => handleAction(onSetCategory)}
            className="block w-full text-left px-4 py-2 text-sm text-warm-700 hover:bg-warm-50 first:rounded-t-lg transition-colors border-b border-warm-100"
          >
            Set Category
          </button>
          <button
            onClick={() => handleAction(onSetStatus)}
            className="block w-full text-left px-4 py-2 text-sm text-warm-700 hover:bg-warm-50 transition-colors border-b border-warm-100"
          >
            Set Status
          </button>
          <button
            onClick={() => handleAction(onManageTags)}
            className="block w-full text-left px-4 py-2 text-sm text-warm-700 hover:bg-warm-50 transition-colors border-b border-warm-100"
          >
            Manage Tags
          </button>
          <button
            onClick={() => handleAction(onManagePhotos)}
            className="block w-full text-left px-4 py-2 text-sm text-warm-700 hover:bg-warm-50 last:rounded-b-lg transition-colors"
          >
            Manage Photos
          </button>
        </div>
      )}
    </div>
  );
};

export default BulkActionDropdown;
