import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  ETSY_ATTRIBUTION,
  ETSY_BANNER_MESSAGES,
  ETSY_ELIGIBILITY_NOTE,
  ETSY_PANEL_COPY,
  etsyConfirmDisconnectMessage,
} from '../../lib/etsyCopy';
import {
  deriveEtsyPanelState,
  formatEtsyDate,
  isEtsyErrorBanner,
  resolveEtsyBannerKey,
} from '../../lib/etsyUiState';
import type { EtsyConnectionInfo, EtsyPanelState, EtsySetupInfo } from '../../lib/etsyUiState';
import { useEtsyConnection, useEtsyShopSetup } from '../../lib/useEtsyConnection';
import type { EtsyDisconnectResult } from '../../lib/useEtsyConnection';

// ADR-135 batch E-B5 (D7.4, D8). The Etsy tab content for pages/organizer/settings.tsx.
//
// States drawn (all produced by lib/etsyUiState.ts deriveEtsyPanelState, unit tested):
//   loading, error, disabled, not allowed, not connected, connecting, needs reconnect, connected
//   (with setup empty, setup needed, busy, currency and "runs out soon" notices on top).
// Availability comes from the server (GET /api/etsy/connection answers 503 ETSY_DISABLED), never from
// a build-time public env flag. The trademark sentence is the footnote of every state.

const FIELD_CLASS =
  'w-full min-h-[44px] rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500';
const PRIMARY_BTN =
  'w-full sm:w-auto min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const SECONDARY_BTN =
  'w-full sm:w-auto min-h-[44px] bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 font-semibold py-2 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const DANGER_BTN =
  'w-full sm:w-auto min-h-[44px] bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

function Spinner() {
  return <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin flex-shrink-0" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------------------------
// Shipping and processing choices.
// ---------------------------------------------------------------------------------------------

export interface EtsySetupSectionProps {
  setup: EtsySetupInfo | undefined;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  isSaving: boolean;
  saveError: string | null;
  onSave: (values: { shippingProfileId: string; returnPolicyId: string; readinessStateId: string }) => void;
  /** Heading sentence: "Choose your profiles..." until saved, then the plain intro. */
  needed: boolean;
}

function SetupSection(props: EtsySetupSectionProps) {
  const { setup } = props;
  const [shipping, setShipping] = useState(setup?.selected.shipping ?? '');
  const [returns, setReturns] = useState(setup?.selected.returnPolicy ?? '');
  const [processing, setProcessing] = useState(setup?.selected.processing ?? '');

  const has = (list: { id: string }[], id: string) => list.some((o) => o.id === id);

  return (
    <div className="space-y-3 pt-4 border-t border-warm-200 dark:border-gray-700" data-testid="etsy-setup">
      <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100">{ETSY_PANEL_COPY.setupHeading}</h3>
      <p className="text-sm text-warm-600 dark:text-gray-400">{props.needed ? ETSY_PANEL_COPY.setupNeeded : ETSY_PANEL_COPY.setupIntro}</p>

      {props.isLoading && (
        <p role="status" className="flex items-center gap-2 text-sm text-warm-600 dark:text-gray-400">
          <Spinner />
          {ETSY_PANEL_COPY.setupLoading}
        </p>
      )}

      {!props.isLoading && (props.errorMessage || !setup) && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300 break-words">{props.errorMessage ?? ETSY_PANEL_COPY.setupLoadError}</p>
          <button type="button" onClick={props.onRetry} className={SECONDARY_BTN}>
            {ETSY_PANEL_COPY.retry}
          </button>
        </div>
      )}

      {!props.isLoading && setup && setup.needsEtsySideSetup && (
        <div role="status" className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2" data-testid="etsy-setup-empty">
          <p className="text-sm text-amber-900 dark:text-amber-200">{setup.emptyMessage ?? ETSY_PANEL_COPY.setupEmpty}</p>
          <button type="button" onClick={props.onRetry} className={SECONDARY_BTN}>
            {ETSY_PANEL_COPY.setupCheckAgain}
          </button>
        </div>
      )}

      {!props.isLoading && setup && !setup.needsEtsySideSetup && (
        <div className="space-y-3">
          <div>
            <label htmlFor="etsy-setup-shipping" className="block text-sm font-medium text-warm-800 dark:text-gray-200 mb-1">
              {ETSY_PANEL_COPY.shippingLabel}
            </label>
            <select
              id="etsy-setup-shipping"
              value={has(setup.shippingProfiles, shipping) ? shipping : ''}
              onChange={(e) => setShipping(e.target.value)}
              disabled={props.isSaving}
              className={FIELD_CLASS}
            >
              <option value="">{ETSY_PANEL_COPY.choose}</option>
              {setup.shippingProfiles.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="etsy-setup-processing" className="block text-sm font-medium text-warm-800 dark:text-gray-200 mb-1">
              {ETSY_PANEL_COPY.processingLabel}
            </label>
            <select
              id="etsy-setup-processing"
              value={has(setup.processingProfiles, processing) ? processing : ''}
              onChange={(e) => setProcessing(e.target.value)}
              disabled={props.isSaving}
              className={FIELD_CLASS}
            >
              <option value="">{ETSY_PANEL_COPY.choose}</option>
              {setup.processingProfiles.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="etsy-setup-return" className="block text-sm font-medium text-warm-800 dark:text-gray-200 mb-1">
              {ETSY_PANEL_COPY.returnLabel}
            </label>
            {setup.returnPolicies.length === 0 ? (
              <p className="text-sm text-warm-600 dark:text-gray-400">{ETSY_PANEL_COPY.noReturnPolicies}</p>
            ) : (
              <select
                id="etsy-setup-return"
                value={has(setup.returnPolicies, returns) ? returns : ''}
                onChange={(e) => setReturns(e.target.value)}
                disabled={props.isSaving}
                className={FIELD_CLASS}
              >
                <option value="">{ETSY_PANEL_COPY.choose}</option>
                {setup.returnPolicies.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {props.saveError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300 break-words">
              {props.saveError}
            </p>
          )}
          <button
            type="button"
            disabled={props.isSaving || !has(setup.shippingProfiles, shipping) || !has(setup.processingProfiles, processing)}
            onClick={() => props.onSave({ shippingProfileId: shipping, returnPolicyId: has(setup.returnPolicies, returns) ? returns : '', readinessStateId: processing })}
            className={PRIMARY_BTN}
          >
            {props.isSaving ? ETSY_PANEL_COPY.savingSetup : ETSY_PANEL_COPY.saveSetup}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The panel.
// ---------------------------------------------------------------------------------------------

export interface EtsyConnectPanelViewProps {
  state: EtsyPanelState;
  connection: EtsyConnectionInfo | undefined;
  /** Banner from the callback page (whitelisted key) or null. */
  bannerKey: keyof typeof ETSY_BANNER_MESSAGES | null;
  onDismissBanner: () => void;
  onRetryLoad: () => void;
  connectError: string | null;
  onConnect: () => void;
  /** Resolves with the server's answer; "confirm" means live listings need an explicit second click. */
  onDisconnect: (confirm: boolean) => Promise<EtsyDisconnectResult>;
  isDisconnecting: boolean;
  disconnectError: string | null;
  /** Shipping and processing section (only drawn while connected). */
  setup: EtsySetupSectionProps | null;
  /** The setup section is open (always while setup is needed, else behind "Change choices"). */
  showSetup: boolean;
  onShowSetup: () => void;
}

export function EtsyConnectPanelView(props: EtsyConnectPanelViewProps) {
  const { state, connection } = props;
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [showNotice, setShowNotice] = useState(false);

  const runDisconnect = async (confirm: boolean) => {
    try {
      const result = await props.onDisconnect(confirm);
      if (result.kind === 'confirm') {
        setConfirmCount(result.activeListingCount);
      } else {
        setConfirmCount(null);
        setShowNotice(true);
      }
    } catch {
      // The container exposes the failure through disconnectError.
    }
  };

  const connectedOn = formatEtsyDate(connection?.connectedAt);
  const canDisconnect = state.kind === 'connected' || state.kind === 'needs_reconnect';
  const isError = props.bannerKey ? isEtsyErrorBanner(props.bannerKey) : false;

  return (
    <section aria-labelledby="etsy-panel-heading" className="card p-4 sm:p-6 space-y-4" data-testid="etsy-panel" data-kind={state.kind}>
      <h2 id="etsy-panel-heading" className="text-xl font-semibold text-warm-900 dark:text-gray-100">
        {ETSY_PANEL_COPY.heading}
      </h2>

      {props.bannerKey && (
        <div
          role={isError ? 'alert' : 'status'}
          data-testid="etsy-banner"
          className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border p-3 ${
            isError
              ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
              : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
          }`}
        >
          <p className="flex-1 min-w-0 text-sm break-words">{ETSY_BANNER_MESSAGES[props.bannerKey]}</p>
          <button type="button" onClick={props.onDismissBanner} className="min-h-[44px] px-4 rounded-lg text-sm font-semibold underline">
            {ETSY_PANEL_COPY.dismiss}
          </button>
        </div>
      )}

      {showNotice && state.kind !== 'connected' && state.kind !== 'needs_reconnect' && (
        <div role="status" className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3" data-testid="etsy-disconnect-notice">
          <p className="text-sm text-blue-800 dark:text-blue-200 break-words">{ETSY_PANEL_COPY.disconnectNotice}</p>
        </div>
      )}

      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-warm-600 dark:text-gray-400">
          <Spinner />
          {ETSY_PANEL_COPY.loading}
        </p>
      )}

      {state.kind === 'error' && (
        <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300">{ETSY_PANEL_COPY.loadError}</p>
          <button type="button" onClick={props.onRetryLoad} className={SECONDARY_BTN}>
            {ETSY_PANEL_COPY.retry}
          </button>
        </div>
      )}

      {state.kind === 'disabled' && (
        <p className="rounded-lg bg-warm-50 dark:bg-gray-800 border border-warm-200 dark:border-gray-700 p-3 text-sm text-warm-700 dark:text-gray-300">
          {ETSY_PANEL_COPY.disabled}
        </p>
      )}

      {state.kind === 'not_allowed' && (
        <p className="rounded-lg bg-warm-50 dark:bg-gray-800 border border-warm-200 dark:border-gray-700 p-3 text-sm text-warm-700 dark:text-gray-300">
          {ETSY_PANEL_COPY.notAllowed}
        </p>
      )}

      {(state.kind === 'not_connected' || state.kind === 'connecting') && (
        <div className="space-y-3">
          <p className="text-warm-600 dark:text-gray-400">{ETSY_PANEL_COPY.intro}</p>
          <p className="text-sm text-warm-600 dark:text-gray-400">{ETSY_ELIGIBILITY_NOTE}</p>
          {props.connectError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300 break-words">
              {props.connectError}
            </p>
          )}
          <button type="button" onClick={props.onConnect} disabled={state.kind === 'connecting'} className={PRIMARY_BTN}>
            {state.kind === 'connecting' ? (
              <span role="status" className="inline-flex items-center justify-center gap-2">
                <Spinner />
                {ETSY_PANEL_COPY.connecting}
              </span>
            ) : (
              ETSY_PANEL_COPY.connect
            )}
          </button>
        </div>
      )}

      {state.kind === 'needs_reconnect' && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 sm:p-4 space-y-3" data-testid="etsy-reconnect">
          <p className="font-semibold text-amber-900 dark:text-amber-200">{ETSY_PANEL_COPY.needsReconnect}</p>
          <p className="text-sm text-amber-900 dark:text-amber-200">{ETSY_PANEL_COPY.reconnectHelp}</p>
          {connection?.shopName && (
            <p className="text-sm text-amber-900 dark:text-amber-200 break-words">
              {ETSY_PANEL_COPY.shopLabel}: <span className="font-medium">{connection.shopName}</span>
            </p>
          )}
          {props.connectError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300 break-words">
              {props.connectError}
            </p>
          )}
          <button type="button" onClick={props.onConnect} className={PRIMARY_BTN}>
            {ETSY_PANEL_COPY.reconnect}
          </button>
        </div>
      )}

      {state.kind === 'connected' && (
        <div className="space-y-4">
          <div className="p-3 sm:p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 flex-shrink-0 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="font-semibold text-green-800 dark:text-green-200">{ETSY_PANEL_COPY.connectedTitle}</p>
            </div>
            {connection?.shopName && (
              <p className="text-sm text-green-700 dark:text-green-300 break-words">
                {ETSY_PANEL_COPY.shopLabel}: <span className="font-medium">{connection.shopName}</span>
              </p>
            )}
            {connectedOn && (
              <p className="text-sm text-green-700 dark:text-green-300">
                {ETSY_PANEL_COPY.connectedOn} {connectedOn}
              </p>
            )}
          </div>

          {state.busy && (
            <p role="status" className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-800 dark:text-blue-200" data-testid="etsy-busy">
              {ETSY_PANEL_COPY.busy}
            </p>
          )}

          {state.currencyUnsupported && connection?.currencyMessage && (
            <p role="alert" className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200 break-words" data-testid="etsy-currency">
              {connection.currencyMessage}
            </p>
          )}

          {state.refreshExpiresSoon && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2" data-testid="etsy-expires-soon">
              <p className="text-sm text-amber-900 dark:text-amber-200">{ETSY_PANEL_COPY.expiresSoon}</p>
              <button type="button" onClick={props.onConnect} className={SECONDARY_BTN}>
                {ETSY_PANEL_COPY.reconnect}
              </button>
            </div>
          )}

          {props.setup && props.showSetup && (
            // Keyed so the pickers start from the saved choices once the Etsy lists have loaded.
            <SetupSection
              key={
                props.setup.setup
                  ? `ready:${props.setup.setup.selected.shipping ?? ''}:${props.setup.setup.selected.returnPolicy ?? ''}:${props.setup.setup.selected.processing ?? ''}`
                  : 'pending'
              }
              {...props.setup}
            />
          )}
          {!props.showSetup && (
            <div className="space-y-2 pt-4 border-t border-warm-200 dark:border-gray-700">
              <p className="text-sm text-warm-600 dark:text-gray-400">{ETSY_PANEL_COPY.setupDone}</p>
              <button type="button" onClick={props.onShowSetup} className={SECONDARY_BTN}>
                {ETSY_PANEL_COPY.setupHeading}
              </button>
            </div>
          )}
        </div>
      )}

      {canDisconnect && (
        <div className="space-y-3 pt-4 border-t border-warm-200 dark:border-gray-700" data-testid="etsy-disconnect">
          {showNotice && (
            <p role="status" className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-800 dark:text-blue-200 break-words">
              {ETSY_PANEL_COPY.disconnectNotice}
            </p>
          )}
          {props.disconnectError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300 break-words">
              {props.disconnectError}
            </p>
          )}
          {confirmCount !== null ? (
            <div role="alertdialog" aria-label={ETSY_PANEL_COPY.disconnect} className="rounded-lg border border-red-200 dark:border-red-800 p-3 space-y-2">
              <p className="text-sm text-warm-800 dark:text-gray-200">{etsyConfirmDisconnectMessage(confirmCount)}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" disabled={props.isDisconnecting} onClick={() => runDisconnect(true)} className={DANGER_BTN}>
                  {props.isDisconnecting ? ETSY_PANEL_COPY.disconnecting : ETSY_PANEL_COPY.confirmDisconnect}
                </button>
                <button type="button" disabled={props.isDisconnecting} onClick={() => setConfirmCount(null)} className={SECONDARY_BTN}>
                  {ETSY_PANEL_COPY.keepConnected}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={props.isDisconnecting} onClick={() => runDisconnect(false)} className={SECONDARY_BTN}>
              {props.isDisconnecting ? ETSY_PANEL_COPY.disconnecting : ETSY_PANEL_COPY.disconnect}
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-warm-500 dark:text-gray-400 break-words pt-2" data-testid="etsy-attribution">
        {ETSY_ATTRIBUTION}
      </p>
    </section>
  );
}

/** The Etsy tab for Settings: connect, reconnect, choose shipping and processing, disconnect. */
export default function EtsyConnectPanel() {
  const router = useRouter();
  const etsy = useEtsyConnection();
  const [showSetup, setShowSetup] = useState(false);
  const [bannerKey, setBannerKey] = useState<keyof typeof ETSY_BANNER_MESSAGES | null>(null);

  const connection = etsy.connection;
  const isHealthy = Boolean(connection && connection.enabled && connection.connected);
  const setupOpen = showSetup || Boolean(connection && !connection.setupComplete);
  const setupQuery = useEtsyShopSetup(isHealthy && setupOpen);

  const state = deriveEtsyPanelState({
    isLoading: etsy.isLoading,
    isError: etsy.isError,
    connection,
    isStartingConnect: etsy.isStartingConnect,
    setup: setupQuery.setup,
  });

  // The callback page sends the organizer back with ?etsy=connected or ?etsy=error&reason=<key>.
  // Only whitelisted keys become text; the address is cleaned right away.
  const refetchConnection = etsy.refetch;
  useEffect(() => {
    if (!router.isReady) return;
    const key = resolveEtsyBannerKey(router.query.etsy, router.query.reason);
    if (!key) return;
    setBannerKey(key);
    refetchConnection();
    router.replace('/organizer/settings?tab=etsy', undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.etsy, router.query.reason]);

  return (
    <EtsyConnectPanelView
      state={state}
      connection={connection}
      bannerKey={bannerKey}
      onDismissBanner={() => setBannerKey(null)}
      onRetryLoad={() => {
        refetchConnection();
      }}
      connectError={etsy.connectError}
      onConnect={etsy.startConnect}
      onDisconnect={etsy.disconnect}
      isDisconnecting={etsy.isDisconnecting}
      disconnectError={etsy.disconnectError}
      showSetup={setupOpen}
      onShowSetup={() => setShowSetup(true)}
      setup={
        isHealthy
          ? {
              setup: setupQuery.setup,
              isLoading: setupQuery.isLoading,
              errorMessage: setupQuery.errorMessage,
              onRetry: () => {
                setupQuery.refetch();
              },
              isSaving: setupQuery.isSaving,
              saveError: setupQuery.saveError,
              needed: Boolean(connection && !connection.setupComplete),
              onSave: (values) => {
                setupQuery
                  .save(values)
                  .then(() => setShowSetup(false))
                  .catch(() => undefined);
              },
            }
          : null
      }
    />
  );
}
