#!/usr/bin/env python3
"""
FindA.Sale Analytics OAuth2 Setup
Re-authorizes the Google OAuth2 token for GA4 + Search Console.
Run this when analytics-weekly.py reports "invalid_grant".

Usage:
  python oauth_setup2.py

Opens a browser window to authorize with deseee@yahoo.com.
Writes a fresh refresh_token to .analytics-creds.json when done.
"""

import json
import os
import subprocess
import sys

CREDS_FILE = os.path.join(os.path.dirname(__file__), '.analytics-creds.json')

SCOPES = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
]


def install_deps():
    pkgs = ['google-auth-oauthlib']
    subprocess.run(
        [sys.executable, '-m', 'pip', 'install', '-q'] + pkgs,
        capture_output=True
    )


def main():
    install_deps()

    from google_auth_oauthlib.flow import InstalledAppFlow

    # Load existing creds to get client_id / client_secret
    if not os.path.exists(CREDS_FILE):
        print(f"ERROR: {CREDS_FILE} not found.")
        sys.exit(1)

    with open(CREDS_FILE) as f:
        existing = json.load(f)

    client_config = {
        "installed": {
            "client_id": existing["client_id"],
            "client_secret": existing["client_secret"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": existing.get("token_uri", "https://oauth2.googleapis.com/token"),
            "redirect_uris": ["http://localhost"],
        }
    }

    print("Opening browser for Google authorization...")
    print("Sign in as deseee@yahoo.com and grant access.")
    print()

    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
    creds = flow.run_local_server(port=0)

    # Write updated creds back
    updated = {
        "type": "oauth2",
        "client_id": existing["client_id"],
        "client_secret": existing["client_secret"],
        "refresh_token": creds.refresh_token,
        "token_uri": existing.get("token_uri", "https://oauth2.googleapis.com/token"),
    }

    with open(CREDS_FILE, 'w') as f:
        json.dump(updated, f, indent=2)

    print()
    print(f"✅ New refresh token saved to {CREDS_FILE}")
    print("You can now run analytics-weekly.py or wait for the next scheduled run.")


if __name__ == '__main__':
    main()
