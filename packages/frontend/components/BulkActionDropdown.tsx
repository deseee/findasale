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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
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
      const menuWidth = 192; // w-48
      const spaceOnRight = window.innerWidth - rect.left;
      const style: React.CSSProperties = { top: rect.bottom + 4 };
      if (spaceOnRight >= menuWidth) {
        style.left = rect.left;
      } else {
        style.right = window.innerWidth - rect.right;
      }
      setDropdownStyle(style);
    }
    setIsOpen(!isOpen);
  };

  const handleAction = (callback: () => void) => {
    callback();
    setIsOpen(false);
  };

  const itemClass = "block w-full text-left px-4 py-3 text-sm text-gray-800 dark:text-gray-100 hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700";

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={disabled}
        className="text-sm font-semibold text-white bg-amber-700 dark:bg-amber-900 hover:bg-amber-800 disabled:opacity-50 px-3 py-1 rounded transition-colors"
        title="More bulk actions"
      >
        More
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="fixed w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 z-[9999]"
        >
          <button onClick={() => handleAction(onSetCategory)} className={`${itemClass} first:rounded-t-lg`}>
            Set Category
          </button>
          <button onClick={() => handleAction(onSetStatus)} className={itemClass}>
            Set Status
          </button>
          <button onClick={() => handleAction(onManageTags)} className={itemClass}>
            Manage Tags
          </button>
          <button onClick={() => handleAction(onManagePhotos)} className={itemClass}>
            Manage Photos
          </button>
          {onSetPrice && (
            <button onClick={() => handleAction(onSetPrice)} className={itemClass}>
              Set Bulk Price
            </button>
          )}
          {onPrintLabels && (
            <button onClick={() => handleAction(onPrintLabels)} className={`${itemClass} last:rounded-b-lg border-b-0`}>
              🖨️ Print Labels
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BulkActionDropdown;
