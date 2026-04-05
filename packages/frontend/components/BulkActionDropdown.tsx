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
  onSetPrice?: () => void;
  onPrintLabels?: () => void;
  disabled?: boolean;
}

const BulkActionDropdown: React.FC<BulkActionDropdownProps> = ({
  onSetCategory,
  onSetStatus,
  onManageTags,
  onManagePhotos,
  onSetPrice,
  onPrintLabels,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openLeft, setOpenLeft] = useState(false);
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

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setOpenLeft(rect.left < window.innerWidth / 2);
    }
    setIsOpen(!isOpen);
  };

  const handleAction = (callback: () => void) => {
    callback();
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={disabled}
        className="text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 px-3 py-1 rounded transition-colors"
        title="More bulk actions"
      >
        ⋮ More Actions
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-warm-200 dark:border-gray-700 z-[99] ${openLeft ? 'left-0' : 'right-0'}`}
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
            className="block w-full text-left px-4 py-2 text-sm text-warm-700 hover:bg-warm-50 transition-colors border-b border-warm-100"
          >
            Manage Photos
          </button>
          {onSetPrice && (
            <button
              onClick={() => handleAction(onSetPrice)}
              className="block w-full text-left px-4 py-2 text-sm text-warm-700 hover:bg-warm-50 transition-colors border-b border-warm-100"
            >
              Set Bulk Price
            </button>
          )}
          {onPrintLabels && (
            <button
              onClick={() => handleAction(onPrintLabels)}
              className="block w-full text-left px-4 py-2 text-sm text-warm-700 hover:bg-warm-50 last:rounded-b-lg transition-colors"
            >
              🖨️ Print Labels
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BulkActionDropdown;
