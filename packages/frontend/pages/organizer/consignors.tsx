/**
 * Consignor Portal & Payouts — Feature #309
 *
 * TEAMS-tier page for managing consignors:
 * - Create/edit/delete consignors
 * - View items and payout history
 * - Run payouts with method tracking
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import TierGate from '../../components/TierGate';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import ConfirmDialog from '../../components/ConfirmDialog';
import ConsignorPayoutModal from '../../components/ConsignorPayoutModal';
import { PAYMENT_METHODS, fmtMoney } from '../../lib/types/consignorSettlement';
import Link from 'next/link';
import { Trash2, Edit2, DollarSign, Copy, Check, Percent, Camera, X, Link2, RefreshCw, Mail, MessageCircle, Inbox, CalendarClock } from 'lucide-react';

interface Consignor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  commissionRate: string | number; // Decimal from Prisma
  unsoldItemDisposition: string | null; // 'RETURN' | 'DONATE' | 'RELIST' | null
  returnPeriodDays: number; // consignmentUnclaimedItemsJob.ts (2026-09-25): days after intake before an unsold item counts as unclaimed for this consignor (default 90)
  unclaimedCount: number; // consignmentUnclaimedItemsJob.ts (2026-09-25): AVAILABLE items past returnPeriodDays, precomputed server-side by listConsignors
  relistCapExceededCount: number; // Relist Cap (2026-09-25): RELIST-disposition AVAILABLE items past returnPeriodDays + workspace maxRelistDays, precomputed server-side by listConsignors
  notes: string | null;
  // Consignor payouts (organizer-settles ledger): how the organizer usually pays this consignor,
  // and what is still unpaid. owedAmount/owedItemCount are precomputed server-side by listConsignors;
  // both are optional so an older API response cannot break the page.
  preferredPayoutMethod?: string | null;
  owedAmount?: string | number | null;
  owedItemCount?: number | null;
  portalToken: string;
  items: Array<{ id: string; title: string; price: string | number; status: string }>;
  payouts: Array<{
    id: string;
    totalSales: string | number;
    commissionAmount: string | number;
    paidAt: string | null;
  }>;
  createdAt: string;
  archivedAt?: string | null; // set when archived (hidden from pickers, kept for the money trail)
  // Consignor invite + Square (2026-10-06). Optional so an older API response cannot break the page.
  inviteEmailSentAt?: string | null; // last successful welcome-invite email
  squareStatus?: 'NOT_CONNECTED' | 'ACTIVE' | 'NEEDS_ACTIVATION';
}

// Result of the welcome invite reported by POST /consignors, intake approve, and send-invite.
interface WelcomeEmailOutcome {
  sent: boolean;
  reason?: string;
}

const INVITE_REASON_TEXT: Record<string, string> = {
  NO_EMAIL: 'no email on file',
  SUPPRESSED: 'this address has bounced or opted out of email',
  BLOCKED_DOMAIN: 'this address cannot receive email from us',
  ERROR: 'the email service did not accept it',
  PENDING: 'it is still sending',
  RATE_LIMITED: 'several invites already went to this address today',
};

// Banner shown after adding or approving a consignor, and after a resend.
interface InviteBanner {
  tone: 'success' | 'info' | 'warning';
  message: string;
  consignorId?: string;
  portalToken?: string;
}

function inviteBannerFor(
  outcome: WelcomeEmailOutcome | undefined,
  email: string | null | undefined,
  consignorId?: string,
  portalToken?: string
): InviteBanner | null {
  if (!outcome) return null;
  if (outcome.sent) {
    return { tone: 'success', message: `Invite emailed to ${email || 'the consignor'}.`, consignorId, portalToken };
  }
  if (outcome.reason === 'NO_EMAIL') {
    return { tone: 'info', message: 'No email on file. Copy the portal link and share it with them instead.', consignorId, portalToken };
  }
  if (outcome.reason === 'PENDING') {
    return { tone: 'info', message: `The invite to ${email || 'the consignor'} is still sending. Check the invite status on their card shortly.`, consignorId, portalToken };
  }
  const why = INVITE_REASON_TEXT[outcome.reason || 'ERROR'] || INVITE_REASON_TEXT.ERROR;
  return { tone: 'warning', message: `The invite email could not be sent (${why}). Use Resend invite, or copy the portal link.`, consignorId, portalToken };
}

const SQUARE_BADGE: Record<string, { label: string; className: string }> = {
  NOT_CONNECTED: { label: 'Square: not connected', className: 'bg-warm-100 dark:bg-gray-700 text-warm-600 dark:text-warm-300' },
  ACTIVE: { label: 'Square: active', className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  NEEDS_ACTIVATION: { label: 'Square: needs activation', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' },
};

// Consignor Self-Serve Intake (2026-09-25)
interface IntakeAppointmentSummary {
  id: string;
  startsAt: string;
  status: string;
}

interface IntakeRequest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  requestedStartsAt: string | null;
  status: string;
  createdAt: string;
  appointment: IntakeAppointmentSummary | null;
  resultingConsignor: { id: string; name: string } | null;
}

interface IntakeLink {
  url: string;
  token: string;
  enabled: boolean;
}

type ModalMode = 'closed' | 'create' | 'edit';
type PageTab = 'consignors' | 'requests';

const ConsignorsPage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { canAccess } = useOrganizerTier();

  const [consignors, setConsignors] = useState<Consignor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [editingConsignor, setEditingConsignor] = useState<Consignor | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });
  // Consignor intake disclosure (Patrick, 2026-09-25): plain-language markdown-policy
  // notice returned by POST /consignors (see consignorController.createConsignor),
  // shown once right after a new consignor is created.
  const [markdownNotice, setMarkdownNotice] = useState<string | null>(null);
  // Consignor invite (2026-10-06): outcome banner + per-consignor resend state.
  const [inviteBanner, setInviteBanner] = useState<InviteBanner | null>(null);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);

  // Rapid capture entry point (consignor-scoped capture follow-up, 2026-09-25): lets the
  // organizer jump straight into the existing per-sale rapidfire camera flow with this
  // consignor's id carried through. The flow is per-sale, so a sale must be picked/confirmed
  // first -- this small picker does that, then hands off to add-items/[saleId].tsx via query
  // params (openCamera/captureMode already existed there; consignorId/consignorName are new).
  const [rapidCaptureTarget, setRapidCaptureTarget] = useState<{ id: string; name: string } | null>(null);
  const [rapidCaptureSaleId, setRapidCaptureSaleId] = useState('');

  // Record a payment: which consignor the payment modal is open for (null = closed).
  const [paymentTarget, setPaymentTarget] = useState<Consignor | null>(null);

  // Permission attestation (2026-10-06): required when ADDING a consignor, never shown on edit.
  const [permissionToEmail, setPermissionToEmail] = useState(false);

  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    commissionRate: '',
    useTieredCommission: false,
    unsoldItemDisposition: '',
    preferredPayoutMethod: '',
    notes: '',
  });

  // Merged single-item intake (consignor-intake follow-up, 2026-09-24): lets Patrick
  // create a Consignor and their first Item in one submit when there's only one item to
  // bring in right now, instead of a separate trip to the add-item form. Create-mode only.
  const [sales, setSales] = useState<Array<{ id: string; title: string }>>([]);
  const [includeItem, setIncludeItem] = useState(false);
  const [itemSaleId, setItemSaleId] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCategory, setItemCategory] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  // Archive (2026-10-06): a consignor with sales or payouts on record cannot be deleted, so the delete flow offers Archive instead.
  const [showArchived, setShowArchived] = useState(false);
  const [archiveOffer, setArchiveOffer] = useState<{ open: boolean; id: string; name: string; message: string }>({ open: false, id: '', name: '', message: '' });
  const [isArchiving, setIsArchiving] = useState<string | null>(null);

  // Consignor Self-Serve Intake (2026-09-25): tab switcher, persistent intake link, and the
  // Requests review queue. Additive to this page -- the existing Consignors tab/content
  // above is unchanged.
  const [activeTab, setActiveTab] = useState<PageTab>('consignors');
  const [intakeLink, setIntakeLink] = useState<IntakeLink | null>(null);
  const [intakeLinkBusy, setIntakeLinkBusy] = useState(false);
  const [copiedIntakeLink, setCopiedIntakeLink] = useState(false);
  const [intakeRequests, setIntakeRequests] = useState<IntakeRequest[]>([]);
  const [intakeRequestsLoading, setIntakeRequestsLoading] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const [approveTarget, setApproveTarget] = useState<IntakeRequest | null>(null);
  const [approveForm, setApproveForm] = useState({
    commissionRate: '',
    useTieredCommission: false,
    unsoldItemDisposition: '',
    notes: '',
    confirmAppointment: true,
  });
  const [isApproving, setIsApproving] = useState(false);

  const [declineTarget, setDeclineTarget] = useState<IntakeRequest | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [isDeclining, setIsDeclining] = useState(false);

  const fetchConsignors = async (archived: boolean = showArchived) => {
    try {
      setLoading(true);
      const response = await api.get(archived ? '/consignors?archived=only' : '/consignors');
      setConsignors(response.data || []);
    } catch (error: any) {
      console.error('Error fetching consignors:', error);
      showToast('Failed to load consignors', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSales = async () => {
    try {
      const response = await api.get('/sales/mine');
      setSales(response.data?.sales || []);
    } catch (error: any) {
      console.error('Error fetching sales for item-intake picker:', error);
      // Non-fatal: the picker just stays empty and the "bring an item along" toggle
      // has nothing to offer, but consignor create/edit itself is unaffected.
    }
  };

  const fetchIntakeLink = async () => {
    try {
      const response = await api.get('/consignor-intake/link');
      setIntakeLink(response.data);
    } catch (error: any) {
      console.error('Error fetching intake link:', error);
      // Non-fatal: the link card just stays hidden/empty.
    }
  };

  const fetchIntakeRequests = async () => {
    try {
      setIntakeRequestsLoading(true);
      const response = await api.get('/consignor-intake/requests', { params: { status: 'PENDING' } });
      const requests: IntakeRequest[] = response.data || [];
      setIntakeRequests(requests);
      setPendingRequestCount(requests.length);
    } catch (error: any) {
      console.error('Error fetching intake requests:', error);
      showToast('Failed to load consignor requests', 'error');
    } finally {
      setIntakeRequestsLoading(false);
    }
  };

  // Fetch consignors on mount
  useEffect(() => {
    if (user && user.roles?.includes('ORGANIZER') && canAccess('TEAMS')) {
      fetchConsignors();
      fetchSales();
      fetchIntakeLink();
      fetchIntakeRequests();
    }
  }, [user, canAccess]);

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const handleOpenCreateModal = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      commissionRate: '',
      useTieredCommission: false,
      unsoldItemDisposition: '',
      preferredPayoutMethod: '',
      notes: '',
    });
    setIncludeItem(false);
    setItemSaleId('');
    setItemTitle('');
    setItemPrice('');
    setItemCategory('');
    setPermissionToEmail(false);
    setEditingConsignor(null);
    setModalMode('create');
  };

  const handleOpenEditModal = (consignor: Consignor) => {
    setFormData({
      name: consignor.name,
      email: consignor.email || '',
      phone: consignor.phone || '',
      commissionRate: String(consignor.commissionRate),
      useTieredCommission: Boolean((consignor as any).useTieredCommission),
      unsoldItemDisposition: consignor.unsoldItemDisposition || '',
      preferredPayoutMethod: consignor.preferredPayoutMethod || '',
      notes: consignor.notes || '',
    });
    setEditingConsignor(consignor);
    setModalMode('edit');
  };

  const handleCloseModal = () => {
    setModalMode('closed');
    setEditingConsignor(null);
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.commissionRate) {
      showToast('Name and commission rate are required', 'error');
      return;
    }

    const rate = parseFloat(formData.commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      showToast('Commission rate must be between 0-100', 'error');
      return;
    }

    if (modalMode === 'create' && !permissionToEmail) {
      showToast("Please confirm you have this person's permission to email them", 'error');
      return;
    }

    // Merged single-item intake: only meaningful at create time. Mirrors the backend's
    // own item.saleId / item.title required-field validation so the organizer sees the
    // problem immediately instead of round-tripping to the server first.
    if (modalMode === 'create' && includeItem) {
      if (!itemSaleId) {
        showToast('Choose which sale this item belongs to', 'error');
        return;
      }
      if (!itemTitle.trim()) {
        showToast('Enter a title for the item', 'error');
        return;
      }
      if (itemPrice && (isNaN(parseFloat(itemPrice)) || parseFloat(itemPrice) < 0)) {
        showToast('Item price must be a non-negative number', 'error');
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: any = {
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        commissionRate: rate,
        useTieredCommission: formData.useTieredCommission,
        unsoldItemDisposition: formData.unsoldItemDisposition || null,
        // Edit sends null when cleared so the preference can be removed; create just omits it.
        preferredPayoutMethod: formData.preferredPayoutMethod || (modalMode === 'edit' ? null : undefined),
        notes: formData.notes || undefined,
      };
      if (modalMode === 'create') {
        payload.permissionToEmail = true; // server rejects the create without it
      }
      if (modalMode === 'create' && includeItem) {
        payload.item = {
          saleId: itemSaleId,
          title: itemTitle.trim(),
          price: itemPrice ? parseFloat(itemPrice) : undefined,
          category: itemCategory || undefined,
        };
      }

      if (modalMode === 'create') {
        const response = await api.post('/consignors', payload);
        const { markdownPolicyNotice, welcomeEmail, ...createdConsignor } = response.data;
        setConsignors(prev => [createdConsignor, ...prev]);
        showToast(
          includeItem ? 'Consignor and item created' : 'Consignor created',
          'success'
        );
        setInviteBanner(inviteBannerFor(welcomeEmail, createdConsignor.email, createdConsignor.id, createdConsignor.portalToken));
        if (markdownPolicyNotice?.message) {
          setMarkdownNotice(markdownPolicyNotice.message);
        }
      } else if (editingConsignor) {
        const response = await api.put(`/consignors/${editingConsignor.id}`, payload);
        setConsignors(prev =>
          prev.map(c => (c.id === editingConsignor.id ? response.data : c))
        );
        showToast('Consignor updated', 'success');
      }

      handleCloseModal();
    } catch (error: any) {
      console.error('Error saving consignor:', error);
      showToast(error.response?.data?.error || 'Failed to save consignor', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (consignorId: string, consignorName: string) => {
    setDeleteConfirm({ open: true, id: consignorId, name: consignorName });
  };

  const performDelete = async () => {
    setIsDeleting(deleteConfirm.id);
    try {
      await api.delete(`/consignors/${deleteConfirm.id}`);
      setConsignors(prev => prev.filter(c => c.id !== deleteConfirm.id));
      showToast('Consignor deleted', 'success');
    } catch (error: any) {
      console.error('Error deleting consignor:', error);
      const message = error.response?.data?.error || 'Failed to delete consignor';
      if (error.response?.status === 409) {
        // Sales or payouts on record: deleting would orphan the money trail. Offer Archive instead of just failing.
        setArchiveOffer({
          open: true,
          id: deleteConfirm.id,
          name: deleteConfirm.name,
          message: error.response?.data?.error || 'This consignor has sales or payouts on record. Archive them instead so the money trail stays intact.',
        });
      } else {
        showToast(message, 'error');
      }
    } finally {
      setIsDeleting(null);
      setDeleteConfirm({ open: false, id: '', name: '' });
    }
  };

  const performArchive = async (consignorId: string, archive: boolean) => {
    setIsArchiving(consignorId);
    try {
      const archiveResponse = await api.post(`/consignors/${consignorId}/${archive ? 'archive' : 'unarchive'}`);
      setConsignors(prev => prev.filter(c => c.id !== consignorId));
      showToast(
        archive
          ? archiveResponse.data?.squareConnectionRemoved
            ? 'Consignor archived. Square connection removed. Records kept.'
            : 'Consignor archived. Their sales and payouts are unchanged.'
          : 'Consignor restored',
        'success'
      );
    } catch (error: any) {
      console.error('Error archiving consignor:', error);
      showToast(error.response?.data?.error || `Failed to ${archive ? 'archive' : 'restore'} consignor`, 'error');
    } finally {
      setIsArchiving(null);
      setArchiveOffer({ open: false, id: '', name: '', message: '' });
    }
  };

  const handleToggleArchived = (next: boolean) => {
    setShowArchived(next);
    fetchConsignors(next);
  };

  const handleOpenRapidCapture = (consignor: Consignor) => {
    setRapidCaptureTarget({ id: consignor.id, name: consignor.name });
    setRapidCaptureSaleId(sales.length === 1 ? sales[0].id : '');
  };

  const handleConfirmRapidCapture = () => {
    if (!rapidCaptureTarget) return;
    if (!rapidCaptureSaleId) {
      showToast('Choose which sale to capture items into', 'error');
      return;
    }
    const params = new URLSearchParams({
      openCamera: '1',
      captureMode: 'rapidfire',
      consignorId: rapidCaptureTarget.id,
      consignorName: rapidCaptureTarget.name,
    });
    router.push(`/organizer/add-items/${rapidCaptureSaleId}?${params.toString()}`);
    setRapidCaptureTarget(null);
  };

  // Consignor invite (2026-10-06): resend the welcome invite for one consignor.
  const handleResendInvite = async (consignor: Consignor) => {
    setResendingInvite(consignor.id);
    try {
      const response = await api.post(`/consignors/${consignor.id}/send-invite`);
      const sentAt = response.data?.inviteEmailSentAt ?? new Date().toISOString();
      setConsignors(prev => prev.map(c => (c.id === consignor.id ? { ...c, inviteEmailSentAt: sentAt } : c)));
      setInviteBanner(inviteBannerFor({ sent: true }, consignor.email, consignor.id, consignor.portalToken));
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data || {};
      if (status === 422 || status === 502) {
        setInviteBanner(inviteBannerFor({ sent: false, reason: data.reason }, consignor.email, consignor.id, consignor.portalToken));
      } else {
        showToast(data.error || 'Failed to send invite', 'error');
      }
    } finally {
      setResendingInvite(null);
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/consignor/portal/${token}`);
    setCopiedToken(token);
    showToast('Portal link copied', 'success');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Consignor Self-Serve Intake (2026-09-25): link management handlers.
  const handleCopyIntakeLink = () => {
    if (!intakeLink) return;
    navigator.clipboard.writeText(intakeLink.url);
    setCopiedIntakeLink(true);
    showToast('Intake link copied', 'success');
    setTimeout(() => setCopiedIntakeLink(false), 2000);
  };

  const handleTextIntakeLink = () => {
    if (!intakeLink) return;
    window.open(`sms:?&body=${encodeURIComponent(intakeLink.url)}`, '_blank');
  };

  const handleEmailIntakeLink = () => {
    if (!intakeLink) return;
    const subject = encodeURIComponent('Bring items in for consignment');
    const body = encodeURIComponent(`You can request to bring items in here: ${intakeLink.url}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  const handleToggleIntakeLink = async () => {
    if (!intakeLink) return;
    setIntakeLinkBusy(true);
    try {
      const response = await api.patch('/consignor-intake/link', { enabled: !intakeLink.enabled });
      setIntakeLink(response.data);
      showToast(response.data.enabled ? 'Now accepting requests' : 'No longer accepting requests', 'success');
    } catch (error: any) {
      console.error('Error toggling intake link:', error);
      showToast(error.response?.data?.error || 'Failed to update intake link', 'error');
    } finally {
      setIntakeLinkBusy(false);
    }
  };

  const handleRotateIntakeLink = async () => {
    setIntakeLinkBusy(true);
    try {
      const response = await api.post('/consignor-intake/link/rotate');
      setIntakeLink(response.data);
      showToast('New intake link generated -- the old link no longer works', 'success');
    } catch (error: any) {
      console.error('Error rotating intake link:', error);
      showToast(error.response?.data?.error || 'Failed to generate a new link', 'error');
    } finally {
      setIntakeLinkBusy(false);
    }
  };

  // Consignor Self-Serve Intake (2026-09-25): review queue handlers.
  const handleOpenApprove = (request: IntakeRequest) => {
    setApproveTarget(request);
    setApproveForm({
      commissionRate: '',
      useTieredCommission: false,
      unsoldItemDisposition: '',
      notes: '',
      confirmAppointment: Boolean(request.appointment),
    });
  };

  const handleCloseApprove = () => setApproveTarget(null);

  const handleApproveFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setApproveForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmitApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveTarget) return;
    if (!approveForm.commissionRate) {
      showToast('Commission rate is required', 'error');
      return;
    }
    const rate = parseFloat(approveForm.commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      showToast('Commission rate must be between 0-100', 'error');
      return;
    }

    setIsApproving(true);
    try {
      const response = await api.post(`/consignor-intake/requests/${approveTarget.id}/approve`, {
        commissionRate: rate,
        useTieredCommission: approveForm.useTieredCommission,
        unsoldItemDisposition: approveForm.unsoldItemDisposition || null,
        notes: approveForm.notes || undefined,
        confirmAppointment: approveForm.confirmAppointment,
      });
      setConsignors(prev => [response.data.consignor, ...prev]);
      setIntakeRequests(prev => prev.filter(r => r.id !== approveTarget.id));
      setPendingRequestCount(prev => Math.max(0, prev - 1));
      showToast(`${approveTarget.name} approved as a consignor`, 'success');
      setInviteBanner(
        inviteBannerFor(
          response.data.welcomeEmail,
          response.data.consignor?.email,
          response.data.consignor?.id,
          response.data.consignor?.portalToken
        )
      );
      setApproveTarget(null);
    } catch (error: any) {
      console.error('Error approving request:', error);
      showToast(error.response?.data?.error || 'Failed to approve request', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const handleOpenDecline = (request: IntakeRequest) => {
    setDeclineTarget(request);
    setDeclineReason('');
  };

  const handleCloseDecline = () => setDeclineTarget(null);

  const handleSubmitDecline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declineTarget) return;

    setIsDeclining(true);
    try {
      await api.post(`/consignor-intake/requests/${declineTarget.id}/decline`, {
        reason: declineReason || undefined,
      });
      setIntakeRequests(prev => prev.filter(r => r.id !== declineTarget.id));
      setPendingRequestCount(prev => Math.max(0, prev - 1));
      showToast('Request declined', 'success');
      setDeclineTarget(null);
    } catch (error: any) {
      console.error('Error declining request:', error);
      showToast(error.response?.data?.error || 'Failed to decline request', 'error');
    } finally {
      setIsDeclining(false);
    }
  };

  if (authLoading) {
    return <div>Loading...</div>;
  }

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Consignor Management"
      description="Manage consignors, track items, and record payments. Available on TEAMS and above."
    >
      <Head>
        <title>Consignors | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-white">Consignors</h1>
              <p className="text-warm-600 dark:text-warm-400 mt-1">
                Manage third-party consignors and track payouts
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {canAccess('TEAMS') && (
                <Link
                  href="/organizer/consignor-settlement"
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-lg font-bold text-sm bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 transition-colors"
                >
                  <DollarSign className="w-4 h-4" />
                  Payouts
                </Link>
              )}
              <Link
                href="/organizer/intake-appointments"
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 transition-colors"
              >
                <CalendarClock className="w-4 h-4" />
                Intake Appointments
              </Link>
              <Link
                href="/organizer/commission-tiers"
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 transition-colors"
              >
                <Percent className="w-4 h-4" />
                Commission Rates
              </Link>
              <button
                onClick={handleOpenCreateModal}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                + Add Consignor
              </button>
            </div>
          </div>

          {/* Consignor Self-Serve Intake (2026-09-25): persistent, rotatable per-workspace
              link a prospective consignor uses to request to bring items in. */}
          {intakeLink && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-4 md:p-6 mb-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link2 className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <h2 className="text-sm font-bold text-warm-900 dark:text-white uppercase">
                      Invite a Consignor
                    </h2>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        intakeLink.enabled
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-warm-200 dark:bg-gray-700 text-warm-600 dark:text-warm-400'
                      }`}
                    >
                      {intakeLink.enabled ? 'Accepting requests' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-warm-500 dark:text-warm-400 mb-2">
                    Share this link so a prospective consignor can request to bring items in --
                    they never touch your inventory directly. You review and approve each request.
                  </p>
                  <p className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all">
                    {intakeLink.url}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <button
                    onClick={handleCopyIntakeLink}
                    className="flex items-center gap-1 px-3 py-2 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded-lg font-medium text-xs transition-colors"
                  >
                    {copiedIntakeLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedIntakeLink ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={handleTextIntakeLink}
                    className="flex items-center gap-1 px-3 py-2 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded-lg font-medium text-xs transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Text
                  </button>
                  <button
                    onClick={handleEmailIntakeLink}
                    className="flex items-center gap-1 px-3 py-2 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded-lg font-medium text-xs transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Email
                  </button>
                  <button
                    onClick={handleRotateIntakeLink}
                    disabled={intakeLinkBusy}
                    className="flex items-center gap-1 px-3 py-2 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                    title="Generate a new link (the old one stops working)"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    New Link
                  </button>
                  <button
                    onClick={handleToggleIntakeLink}
                    disabled={intakeLinkBusy}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg font-medium text-xs transition-colors disabled:opacity-50 ${
                      intakeLink.enabled
                        ? 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400'
                        : 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400'
                    }`}
                  >
                    {intakeLink.enabled ? 'Pause' : 'Resume'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Consignor invite outcome (2026-10-06) */}
          {inviteBanner && (
            <div
              role="status"
              className={`mb-6 rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                inviteBanner.tone === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
                  : inviteBanner.tone === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
              }`}
            >
              <p className="text-sm flex items-start gap-2">
                <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{inviteBanner.message}</span>
              </p>
              <div className="flex flex-wrap gap-2 flex-shrink-0">
                {inviteBanner.portalToken && inviteBanner.tone !== 'success' && (
                  <button
                    onClick={() => handleCopyToken(inviteBanner.portalToken as string)}
                    className="flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold bg-white dark:bg-gray-800 border border-current"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy portal link
                  </button>
                )}
                <button
                  onClick={() => setInviteBanner(null)}
                  className="px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold bg-white dark:bg-gray-800 border border-current"
                  aria-label="Dismiss"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Tab switcher: Consignors / Requests (2026-09-25) */}
          <div className="flex gap-2 mb-6 border-b border-warm-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('consignors')}
              className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${
                activeTab === 'consignors'
                  ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-warm-500 dark:text-warm-400 hover:text-warm-700 dark:hover:text-warm-200'
              }`}
            >
              Consignors
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex items-center gap-2 px-4 py-2 font-bold text-sm border-b-2 transition-colors ${
                activeTab === 'requests'
                  ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-warm-500 dark:text-warm-400 hover:text-warm-700 dark:hover:text-warm-200'
              }`}
            >
              <Inbox className="w-4 h-4" />
              Requests
              {pendingRequestCount > 0 && (
                <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {pendingRequestCount}
                </span>
              )}
            </button>
          </div>

          {/* Active / Archived filter (2026-10-06) */}
          {activeTab === 'consignors' && (
            <div className="flex gap-2 mb-4" role="group" aria-label="Consignor filter">
              <button
                type="button"
                onClick={() => handleToggleArchived(false)}
                aria-pressed={!showArchived}
                className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  !showArchived
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white dark:bg-gray-800 text-warm-700 dark:text-warm-200 border-warm-300 dark:border-gray-600'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => handleToggleArchived(true)}
                aria-pressed={showArchived}
                className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  showArchived
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white dark:bg-gray-800 text-warm-700 dark:text-warm-200 border-warm-300 dark:border-gray-600'
                }`}
              >
                Archived
              </button>
            </div>
          )}

          {/* Consignors List */}
          {activeTab === 'consignors' && (
          loading ? (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400">Loading consignors...</p>
            </div>
          ) : consignors.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
              <p className="text-warm-600 dark:text-warm-400 mb-4">{showArchived ? 'No archived consignors' : 'No consignors yet'}</p>
              {!showArchived && (
                <button
                  onClick={handleOpenCreateModal}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors inline-block"
                >
                  Create Your First Consignor
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-6">
              {consignors.map(consignor => (
                <div
                  key={consignor.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6"
                >
                  {/* Card Header */}
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-warm-900 dark:text-white mb-1">
                        {consignor.name}
                      </h2>
                      {consignor.email && (
                        <p className="text-sm text-warm-600 dark:text-warm-400">{consignor.email}</p>
                      )}
                      {consignor.phone && (
                        <p className="text-sm text-warm-600 dark:text-warm-400">{consignor.phone}</p>
                      )}
                      {/* Consignor invite + Square (2026-10-06) */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {consignor.squareStatus && SQUARE_BADGE[consignor.squareStatus] && (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${SQUARE_BADGE[consignor.squareStatus].className}`}>
                            {SQUARE_BADGE[consignor.squareStatus].label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-amber-600 dark:text-amber-400 font-bold mt-2">
                        Commission: {Number(consignor.commissionRate).toFixed(1)}%
                      </p>
                      {/* Consignor payouts: what is still unpaid to this consignor. */}
                      {Number(consignor.owedAmount || 0) > 0 && (
                        <p className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                          Owed {fmtMoney(consignor.owedAmount)}
                          {Number(consignor.owedItemCount || 0) > 0 &&
                            `, ${consignor.owedItemCount} ${consignor.owedItemCount === 1 ? 'item' : 'items'}`}
                        </p>
                      )}
                      {/* consignmentUnclaimedItemsJob.ts (2026-09-25): informational badge only --
                          mirrors the same daily nudge the organizer gets by email/in-app, surfaced
                          here so it's visible without waiting for that notification. Never implies
                          anything was changed automatically. */}
                      {consignor.unclaimedCount > 0 && (
                        <p className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          {consignor.unclaimedCount} {consignor.unclaimedCount === 1 ? 'item' : 'items'} past their {consignor.returnPeriodDays}-day return window
                        </p>
                      )}
                      {/* Relist Cap (2026-09-25, Patrick): "needs a decision" badge --
                          visibility only, nothing has been donated/returned/relisted
                          automatically. See consignmentUnclaimedItemsJob.ts. */}
                      {consignor.relistCapExceededCount > 0 && (
                        <p className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          {consignor.relistCapExceededCount} relisted {consignor.relistCapExceededCount === 1 ? 'item needs' : 'items need'} a decision
                        </p>
                      )}
                    </div>

                    {/* Portal Link */}
                    <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-700 rounded-lg p-3 w-full md:w-auto">
                      <p className="text-xs font-bold text-warm-600 dark:text-warm-400 mb-1 uppercase">
                        Portal Link
                      </p>
                      <button
                        onClick={() => handleCopyToken(consignor.portalToken)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-mono break-all flex items-center gap-1"
                        title="Copy to clipboard"
                      >
                        {copiedToken === consignor.portalToken ? (
                          <>
                            <Check className="w-3 h-3" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy Link
                          </>
                        )}
                      </button>
                      {/* Consignor invite (2026-10-06): status + resend */}
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                        {consignor.inviteEmailSentAt
                          ? `Invite sent ${new Date(consignor.inviteEmailSentAt).toLocaleDateString()}`
                          : consignor.email
                          ? 'Invite not sent yet'
                          : 'No email on file'}
                      </p>
                      {consignor.email && (
                        <button
                          onClick={() => handleResendInvite(consignor)}
                          disabled={resendingInvite === consignor.id}
                          className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline disabled:opacity-50 min-h-[32px]"
                        >
                          <Mail className="w-3 h-3" />
                          {resendingInvite === consignor.id ? 'Sending...' : consignor.inviteEmailSentAt ? 'Resend invite' : 'Send invite'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-4 py-3 border-y border-warm-200 dark:border-gray-700">
                    <div>
                      <p className="text-xs text-warm-500 dark:text-warm-400 uppercase font-bold">
                        Items
                      </p>
                      <p className="text-lg font-bold text-warm-900 dark:text-white">
                        {consignor.items.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-warm-500 dark:text-warm-400 uppercase font-bold">
                        Sold
                      </p>
                      <p className="text-lg font-bold text-warm-900 dark:text-white">
                        {consignor.items.filter(i => i.status === 'SOLD').length}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-warm-500 dark:text-warm-400 uppercase font-bold">
                        Payouts
                      </p>
                      <p className="text-lg font-bold text-warm-900 dark:text-white">
                        {consignor.payouts.length}
                      </p>
                    </div>
                  </div>

                  {/* Notes */}
                  {consignor.notes && (
                    <div className="mb-4 p-2 bg-warm-50 dark:bg-gray-700 rounded text-sm text-warm-700 dark:text-warm-300">
                      {consignor.notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3 justify-end">
                    <button
                      onClick={() => handleOpenEditModal(consignor)}
                      className="flex items-center gap-2 px-3 py-2 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded-lg font-medium text-sm transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleOpenRapidCapture(consignor)}
                      className="flex items-center gap-2 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded-lg font-medium text-sm transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      Rapid Capture
                    </button>
                    {canAccess('TEAMS') && (
                      <button
                        onClick={() => setPaymentTarget(consignor)}
                        className="flex items-center gap-2 min-h-[44px] px-3 py-2 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 rounded-lg font-medium text-sm transition-colors"
                      >
                        <DollarSign className="w-4 h-4" />
                        Record a payment
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/organizer/consignors/${consignor.id}`)}
                      className="flex items-center gap-2 min-h-[44px] px-3 py-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg font-medium text-sm transition-colors"
                    >
                      Details
                    </button>
                    {showArchived ? (
                      <button
                        onClick={() => performArchive(consignor.id, false)}
                        disabled={isArchiving === consignor.id}
                        className="flex items-center gap-2 min-h-[44px] px-3 py-2 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                      >
                        {isArchiving === consignor.id ? 'Restoring...' : 'Unarchive'}
                      </button>
                    ) : (
                    <button
                      onClick={() => handleDelete(consignor.id, consignor.name)}
                      disabled={isDeleting === consignor.id}
                      className="flex items-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      {isDeleting === consignor.id ? 'Deleting...' : 'Delete'}
                    </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
          )}

          {/* Requests tab (2026-09-25): review queue for public intake-form submissions */}
          {activeTab === 'requests' && (
            intakeRequestsLoading ? (
              <div className="text-center py-12">
                <p className="text-warm-600 dark:text-warm-400">Loading requests...</p>
              </div>
            ) : intakeRequests.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
                <p className="text-warm-600 dark:text-warm-400">No pending requests</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {intakeRequests.map(reqItem => (
                  <div
                    key={reqItem.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6"
                  >
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold text-warm-900 dark:text-white mb-1">
                          {reqItem.name}
                        </h2>
                        {reqItem.email && (
                          <p className="text-sm text-warm-600 dark:text-warm-400">{reqItem.email}</p>
                        )}
                        {reqItem.phone && (
                          <p className="text-sm text-warm-600 dark:text-warm-400">{reqItem.phone}</p>
                        )}
                        <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                          Submitted {new Date(reqItem.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                        {reqItem.requestedStartsAt && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-1 flex items-center gap-1">
                            <CalendarClock className="w-3.5 h-3.5" />
                            Requested {new Date(reqItem.requestedStartsAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        )}
                        {reqItem.message && (
                          <p className="mt-3 p-2 bg-warm-50 dark:bg-gray-700 rounded text-sm text-warm-700 dark:text-warm-300">
                            {reqItem.message}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-row md:flex-col gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleOpenApprove(reqItem)}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 rounded-lg font-bold text-sm transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleOpenDecline(reqItem)}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg font-bold text-sm transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalMode !== 'closed' && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-warm-900 dark:text-white mb-4">
              {modalMode === 'create' ? 'Add Consignor' : 'Edit Consignor'}
            </h2>

            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  required
                aria-label="Name" />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                aria-label="Email" />
                {modalMode === 'create' && (
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                    We will email them a link to their portal and Square payout setup.
                  </p>
                )}
              </div>

              {modalMode === 'create' && (
                <div className="mb-4">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="permissionToEmail"
                      checked={permissionToEmail}
                      onChange={(e) => setPermissionToEmail(e.target.checked)}
                      className="mt-1"
                      required
                      aria-label="I have this person's permission to email them."
                    />
                    <span className="text-sm text-warm-700 dark:text-warm-300">
                      I have this person's permission to email them. *
                    </span>
                  </label>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                aria-label="Phone" />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Commission Rate (%) *
                </label>
                <input
                  type="number"
                  name="commissionRate"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.commissionRate}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  required
                aria-label="Commissionrate" />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Percentage of sold item price paid to consignor
                </p>
              </div>

              <div className="mb-6">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="useTieredCommission"
                    checked={formData.useTieredCommission}
                    onChange={handleFormChange}
                    className="mt-1"
                    aria-label="Use value-based tiered commission"
                  />
                  <span className="text-sm text-warm-700 dark:text-warm-300">
                    <span className="font-bold">Use value-based tiered commission</span>
                    <br />
                    <span className="text-xs text-warm-500 dark:text-warm-400">
                      Instead of one flat rate, pay this consignor a richer split as an item's
                      price goes up (e.g. ~50% under $100, up to ~75% above $2,000). The
                      Commission Rate above still applies as the fallback rate. Tier breakpoints
                      are shared workspace-wide and start from sensible defaults you can adjust later.
                    </span>
                  </span>
                </label>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Preferred payout method
                </label>
                <select
                  name="preferredPayoutMethod"
                  value={formData.preferredPayoutMethod}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 min-h-[44px] focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  aria-label="Preferred payout method"
                >
                  <option value="">No preference</option>
                  {PAYMENT_METHODS.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  How you usually pay this consignor. It pre-fills "Paid by" when you record a payment.
                  You pay them yourself. FindA.Sale does not send or hold any money.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  If items don't sell
                </label>
                <select
                  name="unsoldItemDisposition"
                  value={formData.unsoldItemDisposition}
                  onChange={handleFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  aria-label="If items don't sell"
                >
                  <option value="">Not sure yet</option>
                  <option value="RETURN">Return to consignor</option>
                  <option value="DONATE">Donate to charity</option>
                  <option value="RELIST">Relist next sale</option>
                </select>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Sets expectations with this consignor up front. This is a reminder for you:
                  it doesn't move or change anything automatically.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  rows={3}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              {modalMode === 'create' && (
                <div className="mb-6 border border-warm-200 dark:border-gray-600 rounded-lg p-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeItem}
                      onChange={(e) => setIncludeItem(e.target.checked)}
                      className="mt-1"
                      aria-label="I have one item to bring in right now"
                    />
                    <span className="text-sm text-warm-700 dark:text-warm-300">
                      <span className="font-bold">I have one item to bring in right now</span>
                      <br />
                      <span className="text-xs text-warm-500 dark:text-warm-400">
                        Skip the separate add-item trip and create it along with this consignor.
                        For more than one item, leave this off and use the add-item page instead.
                      </span>
                    </span>
                  </label>

                  {includeItem && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                          Sale *
                        </label>
                        <select
                          value={itemSaleId}
                          onChange={(e) => setItemSaleId(e.target.value)}
                          className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                          aria-label="Sale"
                        >
                          <option value="">Select a sale...</option>
                          {sales.map((s) => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                          Item Title *
                        </label>
                        <input
                          type="text"
                          value={itemTitle}
                          onChange={(e) => setItemTitle(e.target.value)}
                          className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                          aria-label="Item title"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                            Price
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={itemPrice}
                            onChange={(e) => setItemPrice(e.target.value)}
                            className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder="0.00"
                            aria-label="Item price"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                            Category
                          </label>
                          <input
                            type="text"
                            value={itemCategory}
                            onChange={(e) => setItemCategory(e.target.value)}
                            className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder="Optional"
                            aria-label="Item category"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                >
                  {isSaving ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rapid Capture sale picker (consignor-scoped capture follow-up, 2026-09-25) */}
      {rapidCaptureTarget && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setRapidCaptureTarget(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-warm-900 dark:text-white">
                Rapid Capture for {rapidCaptureTarget.name}
              </h2>
              <button
                onClick={() => setRapidCaptureTarget(null)}
                className="text-warm-400 hover:text-warm-600 dark:hover:text-warm-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              Every item you capture in this session will be attributed to {rapidCaptureTarget.name} automatically.
            </p>
            <div className="mb-6">
              <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                Sale *
              </label>
              <select
                value={rapidCaptureSaleId}
                onChange={(e) => setRapidCaptureSaleId(e.target.value)}
                className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                aria-label="Sale"
              >
                <option value="">Select a sale...</option>
                {sales.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRapidCaptureTarget(null)}
                className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRapidCapture}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-colors"
              >
                Start Capture
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve request modal (2026-09-25): reuses the same commissionRate/disposition
          fields as "Add Consignor" -- the actual creation goes through the shared
          createConsignorCore path on the backend. */}
      {approveTarget && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseApprove}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-warm-900 dark:text-white mb-1">
              Approve Request
            </h2>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              {approveTarget.name}
              {approveTarget.email ? ` · ${approveTarget.email}` : ''}
              {approveTarget.phone ? ` · ${approveTarget.phone}` : ''}
            </p>
            {approveTarget.message && (
              <div className="mb-4 p-2 bg-warm-50 dark:bg-gray-700 rounded text-sm text-warm-700 dark:text-warm-300">
                {approveTarget.message}
              </div>
            )}

            <form onSubmit={handleSubmitApprove}>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Commission Rate (%) *
                </label>
                <input
                  type="number"
                  name="commissionRate"
                  min="0"
                  max="100"
                  step="0.1"
                  value={approveForm.commissionRate}
                  onChange={handleApproveFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  required
                  aria-label="Commission rate"
                />
              </div>

              <div className="mb-4">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="useTieredCommission"
                    checked={approveForm.useTieredCommission}
                    onChange={handleApproveFormChange}
                    className="mt-1"
                    aria-label="Use value-based tiered commission"
                  />
                  <span className="text-sm text-warm-700 dark:text-warm-300">
                    Use value-based tiered commission instead of a flat rate
                  </span>
                </label>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  If items don't sell
                </label>
                <select
                  name="unsoldItemDisposition"
                  value={approveForm.unsoldItemDisposition}
                  onChange={handleApproveFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  aria-label="If items don't sell"
                >
                  <option value="">Not sure yet</option>
                  <option value="RETURN">Return to consignor</option>
                  <option value="DONATE">Donate to charity</option>
                  <option value="RELIST">Relist next sale</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={approveForm.notes}
                  onChange={handleApproveFormChange}
                  rows={2}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              {approveTarget.appointment && (
                <div className="mb-6">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="confirmAppointment"
                      checked={approveForm.confirmAppointment}
                      onChange={handleApproveFormChange}
                      className="mt-1"
                      aria-label="Confirm the requested intake time"
                    />
                    <span className="text-sm text-warm-700 dark:text-warm-300">
                      Confirm the requested intake time
                      {approveTarget.requestedStartsAt && (
                        <>
                          {' '}
                          ({new Date(approveTarget.requestedStartsAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })})
                        </>
                      )}
                    </span>
                  </label>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseApprove}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isApproving}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                >
                  {isApproving ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Decline request modal (2026-09-25): no notification is sent to the requester --
          the organizer handles that off-platform if they choose. */}
      {declineTarget && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseDecline}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-warm-900 dark:text-white mb-1">
              Decline Request
            </h2>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              {declineTarget.name} won't be notified automatically -- reach out yourself if you'd like to.
            </p>
            <form onSubmit={handleSubmitDecline}>
              <div className="mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Reason (internal note, optional)
                </label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={2}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseDecline}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeclining}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                >
                  {isDeclining ? 'Declining...' : 'Decline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={archiveOffer.open}
        title="Archive instead?"
        message={`${archiveOffer.message}\n\nArchiving "${archiveOffer.name}" hides them from the pickers and takes no new price tags. Their sales, payouts and ledger stay exactly as they are, and you can unarchive them any time.`}
        confirmLabel="Archive"
        onConfirm={() => performArchive(archiveOffer.id, true)}
        onCancel={() => setArchiveOffer({ open: false, id: '', name: '', message: '' })}
        variant="default"
      />

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete Consignor"
        message={`Delete consignor "${deleteConfirm.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={performDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '', name: '' })}
        variant="danger"
      />

      {/* Consignor intake disclosure (Patrick, 2026-09-25): markdown-policy notice shown
          once right after a new consignor is created -- see the markdownNotice state above. */}
      {markdownNotice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-3">
              Markdown Policy
            </h2>
            <p className="text-sm text-warm-600 dark:text-warm-300 mb-6 whitespace-pre-wrap">
              {markdownNotice}
            </p>
            <button
              onClick={() => setMarkdownNotice(null)}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Record a payment (repointed to the consignor payouts mark-paid flow) */}
      {paymentTarget && canAccess('TEAMS') && (
        <ConsignorPayoutModal
          consignorId={paymentTarget.id}
          consignorName={paymentTarget.name}
          commissionRate={Number(paymentTarget.commissionRate)}
          preferredPayoutMethod={paymentTarget.preferredPayoutMethod}
          email={paymentTarget.email}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            fetchConsignors();
          }}
        />
      )}
    </TierGate>
  );
};

export default ConsignorsPage;
