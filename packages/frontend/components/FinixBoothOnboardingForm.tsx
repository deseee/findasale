/**
 * FinixBoothOnboardingForm -- ADR-127 SS5.3/SS5.4 step 4 (2026-09-19, Maple Lake Mall hub
 * chargeback-liability wiring prerequisite). Lets a vendor booth owner submit the
 * business/personal/bank info Finix's Identity -> Payment Instrument -> Merchant
 * onboarding sequence requires, via finixConnectController.ts's
 * startVendorBoothFinixOnboarding endpoint.
 *
 * ADDITIVE, SANDBOX ONLY -- Square remains the sole PRODUCTION payout processor for
 * vendor booths (see vendor-booth/[boothToken].tsx's own header comment). This is for
 * the Maple Lake Mall hub/register design specifically, built ahead of Finix production
 * approval so the flow is ready once it lands (Patrick's decision, 2026-09-19: "go ahead
 * and do the ui and backend while we wait"). Nothing here is wired to a live payment path
 * yet -- see ADR-127 SS5.4 for what's still deferred.
 *
 * Not an OAuth redirect like the Square/Stripe setup above it on the booth page -- this is
 * a direct, single-POST form (Finix's onboarding model is server-to-server, not a redirect
 * URL), so the form collects everything up front rather than sending the vendor to another
 * site.
 */

import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface FinixBoothOnboardingFormProps {
  vendorBoothId: string;
}

interface FinixStatus {
  finixIdentityId: string | null;
  finixMerchantId: string | null;
  finixOnboarded: boolean;
}

const BUSINESS_TYPES = [
  'INDIVIDUAL_SOLE_PROPRIETORSHIP',
  'CORPORATION',
  'LIMITED_LIABILITY_COMPANY',
  'PARTNERSHIP',
  'LIMITED_PARTNERSHIP',
  'GENERAL_PARTNERSHIP',
  'ASSOCIATION_ESTATE_TRUST',
  'TAX_EXEMPT_ORGANIZATION',
];

const inputClass =
  'w-full px-3 py-2 border border-warm-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 placeholder-warm-400 dark:placeholder-gray-500 text-sm';
const labelClass = 'block text-xs font-bold text-warm-700 dark:text-warm-300 mb-1';

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  taxId: '',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  personalLine1: '',
  personalLine2: '',
  personalCity: '',
  personalRegion: '',
  personalPostalCode: '',
  personalCountry: 'USA',
  businessName: '',
  businessType: 'LIMITED_LIABILITY_COMPANY',
  doingBusinessAs: '',
  url: '',
  businessPhone: '',
  businessTaxId: '',
  incorporationDay: '',
  incorporationMonth: '',
  incorporationYear: '',
  mcc: '5931',
  annualCardVolume: '',
  principalPercentageOwnership: '100',
  maxTransactionAmount: '10000',
  defaultStatementDescriptor: '',
  businessLine1: '',
  businessLine2: '',
  businessCity: '',
  businessRegion: '',
  businessPostalCode: '',
  businessCountry: 'USA',
  bankAccountHolderName: '',
  bankAccountType: 'CHECKING',
  bankAccountNumber: '',
  bankRoutingNumber: '',
  bankAccountCountry: 'USA',
};

type FormState = typeof emptyForm;

export default function FinixBoothOnboardingForm({ vendorBoothId }: FinixBoothOnboardingFormProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<FinixStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const refreshStatus = async () => {
    try {
      const response = await api.get(`/vendor-booth/${vendorBoothId}/finix/status`);
      setStatus(response.data);
    } catch (error) {
      console.error('Error checking Finix status:', error);
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (vendorBoothId) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorBoothId]);

  const update = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        taxId: form.taxId,
        dob: { day: Number(form.dobDay), month: Number(form.dobMonth), year: Number(form.dobYear) },
        personalAddress: {
          line1: form.personalLine1,
          line2: form.personalLine2 || undefined,
          city: form.personalCity,
          region: form.personalRegion,
          postalCode: form.personalPostalCode,
          country: form.personalCountry,
        },
        businessName: form.businessName,
        businessType: form.businessType,
        businessAddress: {
          line1: form.businessLine1,
          line2: form.businessLine2 || undefined,
          city: form.businessCity,
          region: form.businessRegion,
          postalCode: form.businessPostalCode,
          country: form.businessCountry,
        },
        businessPhone: form.businessPhone,
        businessTaxId: form.businessTaxId,
        doingBusinessAs: form.doingBusinessAs,
        url: form.url,
        defaultStatementDescriptor: form.defaultStatementDescriptor,
        mcc: form.mcc,
        annualCardVolume: Number(form.annualCardVolume),
        principalPercentageOwnership: Number(form.principalPercentageOwnership),
        maxTransactionAmount: Number(form.maxTransactionAmount),
        incorporationDate: {
          day: Number(form.incorporationDay),
          month: Number(form.incorporationMonth),
          year: Number(form.incorporationYear),
        },
        bankAccountType: form.bankAccountType,
        bankAccountNumber: form.bankAccountNumber,
        bankRoutingNumber: form.bankRoutingNumber,
        bankAccountCountry: form.bankAccountCountry,
        bankAccountHolderName: form.bankAccountHolderName,
      };

      const response = await api.post(`/vendor-booth/${vendorBoothId}/finix/onboard`, body);

      if (response.data.alreadyOnboarded || response.data.onboarded) {
        showToast('Finix account set up.', 'success');
        setShowForm(false);
        refreshStatus();
      }
    } catch (error: any) {
      console.error('Error submitting Finix onboarding:', error);
      showToast(error.response?.data?.error || "We couldn't submit your Finix setup. Please try again.", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (statusLoading) {
    return (
      <p className="text-sm text-warm-500 dark:text-warm-400 mt-4">Checking your Finix hub-payments setup...</p>
    );
  }

  if (status?.finixOnboarded) {
    return (
      <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <p className="text-sm font-bold text-green-800 dark:text-green-300">Finix hub payments are set up</p>
        <p className="text-sm text-green-700 dark:text-green-400 mt-1">
          Your booth is ready for Maple Lake Mall hub register sales once that feature goes live. There is nothing
          else for you to do.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 bg-warm-50 dark:bg-gray-900/40 border border-warm-200 dark:border-gray-700 rounded-lg">
      <p className="text-sm font-bold text-warm-900 dark:text-warm-100">Finix hub payments (Maple Lake Mall) -- optional</p>
      <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
        This is a separate, optional setup for selling through Maple Lake Mall's shared hub register. It does not
        affect your regular Square payouts. This feature is still in testing and not live yet -- you can set it up
        now so you're ready when it launches.
      </p>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-3 bg-white dark:bg-gray-800 hover:bg-warm-100 dark:hover:bg-gray-700 border border-warm-300 dark:border-gray-600 text-warm-800 dark:text-warm-200 font-bold py-2 px-4 rounded-lg transition-colors text-sm"
        >
          Set up Finix hub payments
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold uppercase tracking-wide text-warm-500 dark:text-warm-400 mb-1">
              Your personal information
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>First name</label>
                <input required className={inputClass} value={form.firstName} onChange={update('firstName')} />
              </div>
              <div>
                <label className={labelClass}>Last name</label>
                <input required className={inputClass} value={form.lastName} onChange={update('lastName')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Email</label>
                <input required type="email" className={inputClass} value={form.email} onChange={update('email')} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input required className={inputClass} value={form.phone} onChange={update('phone')} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Social Security Number</label>
              <input required className={inputClass} value={form.taxId} onChange={update('taxId')} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Birth day</label>
                <input required type="number" min={1} max={31} className={inputClass} value={form.dobDay} onChange={update('dobDay')} />
              </div>
              <div>
                <label className={labelClass}>Birth month</label>
                <input required type="number" min={1} max={12} className={inputClass} value={form.dobMonth} onChange={update('dobMonth')} />
              </div>
              <div>
                <label className={labelClass}>Birth year</label>
                <input required type="number" min={1900} max={2100} className={inputClass} value={form.dobYear} onChange={update('dobYear')} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Home address</label>
              <input required placeholder="Street address" className={`${inputClass} mb-2`} value={form.personalLine1} onChange={update('personalLine1')} />
              <input placeholder="Apt / suite (optional)" className={`${inputClass} mb-2`} value={form.personalLine2} onChange={update('personalLine2')} />
              <div className="grid grid-cols-3 gap-2">
                <input required placeholder="City" className={inputClass} value={form.personalCity} onChange={update('personalCity')} />
                <input required placeholder="State" className={inputClass} value={form.personalRegion} onChange={update('personalRegion')} />
                <input required placeholder="ZIP" className={inputClass} value={form.personalPostalCode} onChange={update('personalPostalCode')} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold uppercase tracking-wide text-warm-500 dark:text-warm-400 mb-1">
              Your business
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Legal business name</label>
                <input required className={inputClass} value={form.businessName} onChange={update('businessName')} />
              </div>
              <div>
                <label className={labelClass}>Doing business as</label>
                <input required className={inputClass} value={form.doingBusinessAs} onChange={update('doingBusinessAs')} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Business type</label>
              <select required className={inputClass} value={form.businessType} onChange={update('businessType')}>
                {BUSINESS_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Business phone</label>
                <input required className={inputClass} value={form.businessPhone} onChange={update('businessPhone')} />
              </div>
              <div>
                <label className={labelClass}>Business EIN</label>
                <input required className={inputClass} value={form.businessTaxId} onChange={update('businessTaxId')} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Business website</label>
              <input required className={inputClass} placeholder="https://" value={form.url} onChange={update('url')} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Formed day</label>
                <input required type="number" min={1} max={31} className={inputClass} value={form.incorporationDay} onChange={update('incorporationDay')} />
              </div>
              <div>
                <label className={labelClass}>Formed month</label>
                <input required type="number" min={1} max={12} className={inputClass} value={form.incorporationMonth} onChange={update('incorporationMonth')} />
              </div>
              <div>
                <label className={labelClass}>Formed year</label>
                <input required type="number" min={1900} max={2100} className={inputClass} value={form.incorporationYear} onChange={update('incorporationYear')} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Business address</label>
              <input required placeholder="Street address" className={`${inputClass} mb-2`} value={form.businessLine1} onChange={update('businessLine1')} />
              <input placeholder="Suite (optional)" className={`${inputClass} mb-2`} value={form.businessLine2} onChange={update('businessLine2')} />
              <div className="grid grid-cols-3 gap-2">
                <input required placeholder="City" className={inputClass} value={form.businessCity} onChange={update('businessCity')} />
                <input required placeholder="State" className={inputClass} value={form.businessRegion} onChange={update('businessRegion')} />
                <input required placeholder="ZIP" className={inputClass} value={form.businessPostalCode} onChange={update('businessPostalCode')} />
              </div>
            </div>
            <div>
              <label className={labelClass}>What should show up on a customer's card statement?</label>
              <input required maxLength={22} className={inputClass} value={form.defaultStatementDescriptor} onChange={update('defaultStatementDescriptor')} />
            </div>
            <div>
              <label className={labelClass}>Expected annual card sales ($)</label>
              <input required type="number" min={0} className={inputClass} value={form.annualCardVolume} onChange={update('annualCardVolume')} />
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold uppercase tracking-wide text-warm-500 dark:text-warm-400 mb-1">
              Where your money goes
            </legend>
            <div>
              <label className={labelClass}>Name on the bank account</label>
              <input required className={inputClass} value={form.bankAccountHolderName} onChange={update('bankAccountHolderName')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Account type</label>
                <select required className={inputClass} value={form.bankAccountType} onChange={update('bankAccountType')}>
                  <option value="CHECKING">Checking</option>
                  <option value="SAVINGS">Savings</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Routing number</label>
                <input required className={inputClass} value={form.bankRoutingNumber} onChange={update('bankRoutingNumber')} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Account number</label>
              <input required className={inputClass} value={form.bankAccountNumber} onChange={update('bankAccountNumber')} />
            </div>
          </fieldset>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowForm(false)}
              className="py-3 px-4 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 text-sm font-bold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
