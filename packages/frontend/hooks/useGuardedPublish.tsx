/**
 * useGuardedPublish: shared publish flow for every "make this sale live" button outside the
 * create-sale wizard (edit-sale, dashboard, add-items links land on edit-sale).
 *
 * publish(saleId, opts):
 *   - PATCHes /sales/:id/status { status: 'PUBLISHED' } (plus allowEmpty only when the caller
 *     already got the organizer's yes in PublishWithoutItemsDialog).
 *   - If the server answers 409 EMPTY_SALE_PUBLISH, opens PublishWithoutItemsDialog. Confirm
 *     retries with allowEmpty: true. "Add items first" goes to add-items. "Go back" publishes
 *     nothing and calls opts.onDeclined.
 *   - Any other error goes to opts.onError (or a plain toast when the caller gave none).
 *
 * askToPublishEmpty(handlers): opens the same dialog up front when the caller already knows
 * the sale is empty, with the caller deciding what "Publish, then add items" does next.
 *
 * Render {dialog} once in the page.
 */
import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import PublishWithoutItemsDialog from '../components/PublishWithoutItemsDialog';
import { useToast } from '../components/ToastContext';
import { isEmptySalePublishError, publishSaleStatus } from '../lib/publishSale';

export type GuardedPublishResult = 'published' | 'needs-confirm' | 'failed';

export interface GuardedPublishOptions {
  /** Send allowEmpty: true straight away. Only after the organizer confirmed in the dialog. */
  allowEmpty?: boolean;
  onPublished?: (saleId: string) => void | Promise<void>;
  onError?: (error: unknown, saleId: string) => void;
  /** The organizer picked "Go back" in the dialog. Nothing was published. */
  onDeclined?: (saleId: string) => void;
  /** The organizer picked "Add items first". Defaults to /organizer/add-items/:id. */
  onAddItemsFirst?: (saleId: string) => void;
}

interface DialogHandlers {
  onConfirm: () => void | Promise<void>;
  onAddItemsFirst: () => void;
  onCancel: () => void;
}

function trackChoice(choice: 'publish' | 'items_first' | 'cancel') {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'publish_without_items_choice', { choice });
  }
}

export function useGuardedPublish() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<'publish' | null>(null);
  const handlersRef = useRef<DialogHandlers | null>(null);

  const openDialog = useCallback((handlers: DialogHandlers) => {
    handlersRef.current = handlers;
    setBusy(null);
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setBusy(null);
    handlersRef.current = null;
  }, []);

  const publish = useCallback(
    async (saleId: string, opts: GuardedPublishOptions = {}): Promise<GuardedPublishResult> => {
      try {
        await publishSaleStatus(saleId, { allowEmpty: opts.allowEmpty === true });
        await opts.onPublished?.(saleId);
        return 'published';
      } catch (error) {
        if (isEmptySalePublishError(error) && opts.allowEmpty !== true) {
          openDialog({
            onConfirm: async () => {
              await publish(saleId, { ...opts, allowEmpty: true });
            },
            onAddItemsFirst: () => {
              if (opts.onAddItemsFirst) opts.onAddItemsFirst(saleId);
              else router.push(`/organizer/add-items/${saleId}`);
            },
            onCancel: () => opts.onDeclined?.(saleId),
          });
          return 'needs-confirm';
        }
        if (opts.onError) {
          opts.onError(error, saleId);
        } else {
          const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          showToast(msg || "We couldn't publish your sale. Please try again.", 'error');
        }
        return 'failed';
      }
    },
    [openDialog, router, showToast]
  );

  const askToPublishEmpty = useCallback(
    (handlers: { onConfirm: () => void | Promise<void>; onAddItemsFirst?: () => void; onCancel?: () => void; saleId: string }) => {
      openDialog({
        onConfirm: handlers.onConfirm,
        onAddItemsFirst: () => {
          if (handlers.onAddItemsFirst) handlers.onAddItemsFirst();
          else router.push(`/organizer/add-items/${handlers.saleId}`);
        },
        onCancel: () => handlers.onCancel?.(),
      });
    },
    [openDialog, router]
  );

  const handleConfirm = useCallback(async () => {
    const h = handlersRef.current;
    if (!h) return;
    trackChoice('publish');
    setBusy('publish');
    try {
      await h.onConfirm();
    } finally {
      closeDialog();
    }
  }, [closeDialog]);

  const handleAddItemsFirst = useCallback(() => {
    const h = handlersRef.current;
    trackChoice('items_first');
    closeDialog();
    h?.onAddItemsFirst();
  }, [closeDialog]);

  const handleCancel = useCallback(() => {
    const h = handlersRef.current;
    trackChoice('cancel');
    closeDialog();
    h?.onCancel();
  }, [closeDialog]);

  const dialog = (
    <PublishWithoutItemsDialog
      isOpen={isOpen}
      onPublish={handleConfirm}
      onAddItemsFirst={handleAddItemsFirst}
      onCancel={handleCancel}
      busy={busy}
    />
  );

  return { publish, askToPublishEmpty, dialog, isDialogOpen: isOpen };
}

export default useGuardedPublish;
