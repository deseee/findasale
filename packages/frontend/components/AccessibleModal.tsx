import React, { ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  modalId?: string;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  className?: string;
  overlayClassName?: string;
  contentClassName?: string;
}

/**
 * AccessibleModal — Base wrapper for all modals ensuring WCAG 2.1 AA compliance
 * Implements focus trap to prevent keyboard users from tabbing outside the modal
 * Provides consistent aria attributes and keyboard handling
 */
const AccessibleModal: React.FC<AccessibleModalProps> = ({
  isOpen,
  onClose,
  children,
  modalId,
  ariaLabelledBy,
  ariaLabel,
  className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4',
  overlayClassName,
  contentClassName = 'bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6',
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const finalClassName = overlayClassName || className;
  const ariaAttrs = ariaLabelledBy
    ? { 'aria-labelledby': ariaLabelledBy }
    : ariaLabel
      ? { 'aria-label': ariaLabel }
      : {};

  return (
    <FocusTrap
      active={isOpen}
      focusTrapOptions={{
        escapeDeactivates: true,
        onDeactivate: onClose,
      }}
    >
      <div
        className={finalClassName}
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        role="presentation"
      >
        <div
          className={contentClassName}
          role="dialog"
          aria-modal="true"
          id={modalId}
          {...ariaAttrs}
        >
          {children}
        </div>
      </div>
    </FocusTrap>
  );
};

export default AccessibleModal;
