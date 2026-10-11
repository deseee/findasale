import React, { ReactNode, useRef } from 'react';
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
 *
 * Closing: only the Escape key (onKeyDown) and a click on the backdrop call onClose.
 * The focus trap is deliberately NOT wired to onClose (no onDeactivate, and
 * escapeDeactivates is false): focus-trap deactivates on every unmount, including the
 * simulated unmount in React StrictMode (next dev), which would close the modal
 * right after it opens. Unmounting therefore never calls onClose.
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
  // Fallback focus target so the trap does not throw when the dialog has no
  // tabbable element at mount (e.g. content that loads later, like a payment iframe).
  const dialogRef = useRef<HTMLDivElement>(null);

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
        escapeDeactivates: false,
        fallbackFocus: () => dialogRef.current as HTMLElement,
      }}
    >
      <div
        className={finalClassName}
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        role="presentation"
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
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
