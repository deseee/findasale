#!/usr/bin/env python3
"""
FindA.Sale Weekly Analytics Report
Calls GA4 Data API + Google Search Console API via OAuth2 or service account credentials.

Usage:
  python3 analytics-weekly.py '<SERVICE_ACCOUNT_JSON_STRING>'
  # OR set env var GOOGLE_ANALYTICS_CREDENTIALS_JSON before running

Outputs a markdown-formatted report with actionable insights.
GA4 Property ID: 539593833
Search Console Site: sc-domain:finda.sale
"""

import sys
import json
import os
import subprocess
from datetime import date, timedelta

def install_deps():
    pkgs = ['google-analytics-data', 'google-api-python-client', 'google-auth']
    subprocess.run(
        [sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages'] + pkgs,
        capture_output=True
    )

def pct_change(new_val, old_val):
    if old_val == 0:
        return '+∞' if new_val > 0 else '0%'
    pct = ((new_val - old_val) / old_val) * 100
    return f'{pct:+.0f}%'

def fmt_dur(seconds):
    s = float(seconds)
    return f"{int(s//60)}m {int(s%60)}s"

def main():
    # --- Get credentials ---
    key_json = ''
    if len(sys.argv) > 1:
        key_json = sys.argv[1]
    if not key_json:
        key_json = os.environ.get('GOOGLE_ANALYTICS_CREDENTIALS_JSON', '')
    if not key_json:
        key_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON', '')
    if not key_json:
        print("ERROR: No credentials JSON provided.")
        print("Pass it as argv[1] or set GOOGLE_ANALYTICS_CREDENTIALS_JSON env var.")
        sys.exit(1)

    # Strip surrounding quotes if passed from shell
    key_json = key_json.strip().strip("'\"")

    try:
        key_data = json.loads(key_json)
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse credentials JSON: {e}")
        sys.exit(1)

    install_deps()

    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        RunReportRequest, DateRange, Dimension, Metric, OrderBy
    )
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError

    PROPERTY_ID = "539593833"
    SITE_URL = "sc-domain:finda.sale"

    scopes = [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/webmasters.readonly',
    ]

    # Support both OAuth2 (Desktop app) and service account credentials
    if key_data.get('type') == 'oauth2' or 'refresh_token' in key_data:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        creds = Credentials(
            token=None,
            refresh_token=key_data['refresh_token'],
            token_uri=key_data.get('token_uri', 'https://oauth2.googleapis.com/token'),
            client_id=key_data['client_id'],
            client_secret=key_data['client_secret'],
            scopes=scopes,
        )
        creds.refresh(Request())
    else:
        from google.oauth2 import service_account
        creds = service_account.Credentials.from_service_account_info(key_data, scopes=scopes)

    today = date.today()
    w1_end   = today - timedelta(days=1)       # last 7 days (yesterday back)
    w1_start = today - timedelta(days=7)
    w2_end   = today - timedelta(days=8)       # prior 7 days
    w2_start = today - timedelta(days=14)

    print(f"\n{'='*65}")
    print(f"  FindA.Sale Weekly Analytics Report")
    print(f"  Week: {w1_start} → {w1_end}  |  Generated: {today}")
    print(f"{'='*65}\n")

    ga = BetaAnalyticsDataClient(credentials=creds)

    # ---- GA4: Overview ------------------------------------------------
    try:
        overview = ga.run_report(RunReportRequest(
            property=f"properties/{PROPERTY_ID}",
            date_ranges=[
                DateRange(start_date=str(w1_start), end_date=str(w1_end)),
                DateRange(start_date=str(w2_start), end_date=str(w2_end)),
            ],
            metrics=[
                Metric(name="sessions"),
                Metric(name="totalUsers"),
                Metric(name="newUsers"),
                Metric(name="screenPageViews"),
                Metric(name="bounceRate"),
                Metric(name="averageSessionDuration"),
            ]
        ))

        def mv(row, idx): return row.metric_values[idx].value

        print("## Traffic Overview (last 7 days vs prior 7 days)")
        print()
        if overview.rows:
            curr = overview.rows[0]
            prev = overview.rows[1] if len(overview.rows) > 1 else None

            sessions   = int(mv(curr, 0))
            users      = int(mv(curr, 1))
            new_users  = int(mv(curr, 2))
            pageviews  = int(mv(curr, 3))
            bounce_pct = float(mv(curr, 4)) * 100
            avg_dur    = float(mv(curr, 5))

            if prev:
                p_sess  = int(mv(prev, 0))
                p_users = int(mv(prev, 1))
                p_pv    = int(mv(prev, 3))
                print(f"  Sessions  : {sessions:,}  {pct_change(sessions, p_sess)} vs prior week")
                print(f"  Users     : {users:,}  {pct_change(users, p_users)}")
                print(f"  Pageviews : {pageviews:,}  {pct_change(pageviews, p_pv)}")
            else:
                print(f"  Sessions  : {sessions:,}")
                print(f"  Users     : {users:,}")
                print(f"  Pageviews : {pageviews:,}")

            print(f"  New Users : {new_users:,}  ({(new_users/users*100):.0f}% of users)" if users else "  New Users : 0")
            print(f"  Bounce    : {bounce_pct:.1f}%")
            print(f"  Avg Dur   : {fmt_dur(avg_dur)}")
        else:
            print("  No data returned from GA4. Check that the service account has Viewer access.")

    except Exception as e:
        print(f"  GA4 overview error: {e}")

    # ---- GA4: Top Pages -----------------------------------------------
    print()
    print("## Top 10 Pages (by sessions, last 7 days)")
    print()
    try:
        top_pages = ga.run_report(RunReportRequest(
            property=f"properties/{PROPERTY_ID}",
            date_ranges=[DateRange(start_date=str(w1_start), end_date=str(w1_end))],
            dimensions=[Dimension(name="pagePath"), Dimension(name="pageTitle")],
            metrics=[Metric(name="sessions"), Metric(name="screenPageViews"), Metric(name="bounceRate")],
            order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)],
            limit=10
        ))
        if top_pages.rows:
            print(f"  {'Sess':>5}  {'Views':>5}  {'Bnc':>5}  Path")
            print(f"  {'-'*5}  {'-'*5}  {'-'*5}  ----")
            for row in top_pages.rows:
                path  = row.dimension_values[0].value[:60]
                sess  = int(row.metric_values[0].value)
                views = int(row.metric_values[1].value)
                bnc   = float(row.metric_values[2].value) * 100
                print(f"  {sess:>5}  {views:>5}  {bnc:>4.0f}%  {path}")
        else:
            print("  No page data.")
    except Exception as e:
        print(f"  GA4 top pages error: {e}")

    # ---- GA4: Traffic Sources -----------------------------------------
    print()
    print("## Traffic Sources (last 7 days)")
    print()
    try:
        sources = ga.run_report(RunReportRequest(
            property=f"properties/{PROPERTY_ID}",
            date_ranges=[DateRange(start_date=str(w1_start), end_date=str(w1_end))],
            dimensions=[Dimension(name="sessionSource"), Dimension(name="sessionMedium")],
            metrics=[Metric(name="sessions"), Metric(name="totalUsers")],
            order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)],
            limit=8
        ))
        if sources.rows:
            print(f"  {'Sess':>5}  {'Users':>5}  Source / Medium")
            print(f"  {'-'*5}  {'-'*5}  ---------------")
            for row in sources.rows:
                src   = row.dimension_values[0].value
                med   = row.dimension_values[1].value
                sess  = int(row.metric_values[0].value)
                users = int(row.metric_values[1].value)
                print(f"  {sess:>5}  {users:>5}  {src} / {med}")
        else:
            print("  No source data.")
    except Exception as e:
        print(f"  GA4 sources error: {e}")

    # ---- Search Console -----------------------------------------------
    print()
    print("## Google Search Console — Top Queries (last 7 days)")
    print()
    try:
        sc = build('searchconsole', 'v1', credentials=creds)
        result = sc.searchanalytics().query(
            siteUrl=SITE_URL,
            body={
                'startDate': str(w1_start),
                'endDate':   str(w1_end),
                'dimensions': ['query'],
                'rowLimit':   25,
                'orderBy':    [{'fieldName': 'clicks', 'sortOrder': 'DESCENDING'}]
            }
        ).execute()

        rows = result.get('rows', [])
        if rows:
            print(f"  {'Clk':>4}  {'Impr':>5}  {'CTR':>5}  {'Pos':>5}  Query")
            print(f"  {'-'*4}  {'-'*5}  {'-'*5}  {'-'*5}  -----")

            branded_clicks = 0
            unbranded_clicks = 0
            opps = []  # pos 5-20 with >50 impressions

            for row in rows:
                q      = row['keys'][0]
                clicks = int(row['clicks'])
                impr   = int(row['impressions'])
                ctr    = row['ctr'] * 100
                pos    = row['position']
                print(f"  {clicks:>4}  {impr:>5}  {ctr:>4.1f}%  {pos:>5.1f}  {q}")

                branded_kws = ['finda', 'find a sale', 'findasale', 'find.a.sale']
                if any(b in q.lower() for b in branded_kws):
                    branded_clicks += clicks
                else:
                    unbranded_clicks += clicks

                if 5 <= pos <= 20 and impr >= 50:
                    opps.append((q, clicks, impr, ctr, pos))

            total_sc_clicks = branded_clicks + unbranded_clicks
            print()
            if total_sc_clicks > 0:
                print(f"  Branded clicks  : {branded_clicks} ({branded_clicks/total_sc_clicks*100:.0f}%)")
                print(f"  Unbranded clicks: {unbranded_clicks} ({unbranded_clicks/total_sc_clicks*100:.0f}%)")

            if opps:
                print()
                print("## SEO Quick Wins — Positions 5-20, >50 impressions (optimize title/meta)")
                print()
                print(f"  {'Clk':>4}  {'Impr':>5}  {'CTR':>5}  {'Pos':>5}  Query")
                print(f"  {'-'*4}  {'-'*5}  {'-'*5}  {'-'*5}  -----")
                for q, clicks, impr, ctr, pos in sorted(opps, key=lambda x: x[2], reverse=True):
                    print(f"  {clicks:>4}  {impr:>5}  {ctr:>4.1f}%  {pos:>5.1f}  {q}")
        else:
            print("  No Search Console data yet.")
            print("  This can happen if:")
            print("   - The service account was added to Search Console very recently (allow 24-48h)")
            print("   - The site URL 'sc-domain:finda.sale' doesn't match your verified property")
            print("   - There were no impressions in the last 7 days")

    except HttpError as e:
        if e.resp.status == 403:
            print(f"  403 Forbidden — the service account may not have Search Console access yet.")
            print(f"  Go to search.google.com/search-console → Settings → Users and permissions")
            print(f"  Add the service account email as Full user.")
        else:
            print(f"  Search Console error: {e}")
    except Exception as e:
        print(f"  Search Console error: {e}")

    # ---- Summary & Actions -------------------------------------------
    print()
    print(f"{'='*65}")
    print("## Standard Action Checklist")
    print()
    print("  1. Traffic up or down? If down >20% WoW — check for crawl errors")
    print("     in Search Console Coverage report and check Vercel deploy log.")
    print()
    print("  2. Pages with bounce >80% and sessions >20 — review page content,")
    print("     load speed, and mobile layout.")
    print()
    print("  3. SEO Quick Wins above: each position-5-20 query is a page that")
    print("     ranks but underperforms on CTR. Improve <title> and meta description")
    print("     to match the query intent. One fix = compounding organic growth.")
    print()
    print("  4. Unbranded clicks growing? That's the demand-side flywheel working.")
    print("     Any unbranded query with >10 clicks deserves a dedicated landing page.")
    print()
    print("  5. Any new pages in Top 10 that weren't there before?")
    print("     Flag for Patrick — amplify with social/email.")
    print(f"{'='*65}\n")

if __name__ == '__main__':
    main()
