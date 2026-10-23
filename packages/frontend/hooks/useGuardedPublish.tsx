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
 * Ready items (2026-10-23): before publishing, publish() asks GET /sales/:id/publish-readiness. When the sale
 * has unpublished items it opens PublishSaleItemsDialog ("Also publish N ready items", ticked by default, plus
 * the items that are not ready and why); the organizer's choice is sent as publishReadyItems. opts.confirm
 * makes that dialog the confirm step even when there are no unpublished items, so callers no longer need a
 * separate "Publish this sale?" confirm. A sale with no items at all skips it (the empty-sale dialog asks).
 * opts.publishReadyItems set by the caller skips the dialog entirely.
 *
 * Render {dialog} once in the page.
 */
import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import PublishWithoutItemsDialog from '../components/PublishWithoutItemsDialog';
import PublishSaleItemsDialog from '../components/PublishSaleItemsDialog';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../components/AuthContext';
import {
  isEmptySalePublishError,
  isEmailNotVerifiedError,
  publishSaleStatus,
  fetchSalePublishReadiness,
  SalePublishReadiness,
} from '../lib/publishSale';

export type GuardedPublishResult = 'published' | 'needs-confirm' | 'failed';

export interface PublishedInfo {
  /** Unpublished items that went live with the sale. */
  itemsPublished: number;
  /** Unpublished items left as drafts because they are not ready. */
  itemsNotReady: number;
}

export interface GuardedPublishOptions {
  /** Send allowEmpty: true straight away. Only after the organizer confirmed in the dialog. */
  allowEmpty?: boolean;
  /** The organizer's ready-items choice, when the caller already has it. Skips PublishSaleItemsDialog. */
  publishReadyItems?: boolean;
  /** Ask before publishing even when there are no unpublished items (replaces a separate confirm). */
  confirm?: { title: string; message: string; confirmLabel?: string };
  onPublished?: (saleId: string, info?: PublishedInfo) => void | Promise<void>;
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
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<'publish' | null>(null);
  const handlersRef = useRef<DialogHandlers | null>(null);
  // PublishSaleItemsDialog (ready items / confirm) state.
  const [itemsDialog, setItemsDialog] = useState<{
    saleId: string;
    title: string;
    message: string;
    confirmLabel?: string;
    readiness: SalePublishReadiness | null;
    needsVerification?: boolean;
  } | null>(null);
  const [itemsBusy, setItemsBusy] = useState(false);
  const itemsHandlersRef = useRef<{ onConfirm: (publishReadyItems: boolean) => Promise<void>; onCancel: () => void } | null>(null);

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
      // Verify-to-publish (2026-10-23): an unverified organizer gets the explanation and a resend button
      // instead of a publish attempt. The server refuses it anyway (403 EMAIL_NOT_VERIFIED, handled below).
      if (user?.emailVerified === false) {
        itemsHandlersRef.current = { onConfirm: async () => {}, onCancel: () => opts.onDeclined?.(saleId) };
        setItemsBusy(false);
        setItemsDialog({ saleId, title: '', message: '', readiness: null, needsVerification: true });
        return 'needs-confirm';
      }
      // Ready-items step: ask which unpublished items go live with the sale, unless the caller already knows.
      if (opts.publishReadyItems === undefined && opts.allowEmpty !== true) {
        const readiness = await fetchSalePublishReadiness(saleId);
        const unpublished = readiness ? readiness.readyItems.length + readiness.notReadyItems.length : 0;
        const hasNoItemsAtAll = !!readiness && unpublished === 0 && readiness.publishedItemCount === 0;
        if (unpublished > 0 || (opts.confirm && !hasNoItemsAtAll)) {
          itemsHandlersRef.current = {
            onConfirm: async (publishReadyItems: boolean) => {
              await publish(saleId, { ...opts, publishReadyItems });
            },
            onCancel: () => opts.onDeclined?.(saleId),
          };
          setItemsBusy(false);
          setItemsDialog({
            saleId,
            title: opts.confirm?.title ?? 'Publish this sale?',
            message: opts.confirm?.message ?? 'Your sale will be visible to shoppers on the map.',
            confirmLabel: opts.confirm?.confirmLabel,
            readiness,
          });
          return 'needs-confirm';
        }
      }
      try {
        const res = await publishSaleStatus(saleId, {
          allowEmpty: opts.allowEmpty === true,
          publishReadyItems: opts.publishReadyItems,
        });
        const data = (res as { data?: { itemsPublished?: unknown; itemsNotReady?: unknown } } | undefined)?.data;
        const info: PublishedInfo = {
          itemsPublished: typeof data?.itemsPublished === 'number' ? data.itemsPublished : 0,
          itemsNotReady: typeof data?.itemsNotReady === 'number' ? data.itemsNotReady : 0,
        };
        await opts.onPublished?.(saleId, info);
        return 'published';
      } catch (error) {
        if (isEmailNotVerifiedError(error)) {
          itemsHandlersRef.current = { onConfirm: async () => {}, onCancel: () => opts.onDeclined?.(saleId) };
          setItemsBusy(false);
          setItemsDialog({ saleId, title: '', message: '', readiness: null, needsVerification: true });
          return 'needs-confirm';
        }
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
    [openDialog, router, showToast, user?.emailVerified]
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

  const handleItemsConfirm = useCallback(async (publishReadyItems: boolean) => {
    const h = itemsHandlersRef.current;
    if (!h) return;
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'publish_ready_items_choice', { choice: publishReadyItems ? 'with_items' : 'sale_only' });
    }
    setItemsBusy(true);
    try {
      await h.onConfirm(publishReadyItems);
    } finally {
      setItemsBusy(false);
      setItemsDialog(null);
      itemsHandlersRef.current = null;
    }
  }, []);

  const handleItemsCancel = useCallback(() => {
    const h = itemsHandlersRef.current;
    setItemsDialog(null);
    itemsHandlersRef.current = null;
    h?.onCancel();
  }, []);

  const dialog = (
    <>
      <PublishWithoutItemsDialog
        isOpen={isOpen}
        onPublish={handleConfirm}
        onAddItemsFirst={handleAddItemsFirst}
        onCancel={handleCancel}
        busy={busy}
      />
      <PublishSaleItemsDialog
        isOpen={!!itemsDialog}
        saleId={itemsDialog?.saleId ?? ''}
        title={itemsDialog?.title ?? ''}
        message={itemsDialog?.message ?? ''}
        confirmLabel={itemsDialog?.confirmLabel}
        readiness={itemsDialog?.readiness ?? null}
        needsVerification={!!itemsDialog?.needsVerification}
        email={user?.email ?? null}
        busy={itemsBusy}
        onConfirm={handleItemsConfirm}
        onCancel={handleItemsCancel}
      />
    </>
  );

  return { publish, askToPublishEmpty, dialog, isDialogOpen: isOpen || !!itemsDialog };
}

export default useGuardedPublish;
