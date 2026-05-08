import requests
import json

GRAPHQL_URL = "https://www.facebook.com/api/graphql/"

HEADERS = {
    "sec-fetch-site": "same-origin",
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.74 Safari/537.36",
    "accept": "*/*",
    "origin": "https://www.facebook.com",
    "referer": "https://www.facebook.com/marketplace/",
}

# Grand Rapids, MI coordinates
LAT = 42.9634
LNG = -85.6681

variables = {
    "count": 24,
    "params": {
        "bqf": {
            "callsite": "COMMERCE_MKTPLACE_WWW",
            "query": "garage sale"
        },
        "browse_request_params": {
            "commerce_enable_local_pickup": True,
            "commerce_enable_shipping": False,
            "filter_location_latitude": LAT,
            "filter_location_longitude": LNG,
            "filter_radius_km": 40
        }
    }
}

payload = {
    "doc_id": "7111939778879383",
    "variables": json.dumps(variables)
}

print("POSTing to FB GraphQL...")
resp = requests.post(GRAPHQL_URL, headers=HEADERS, data=payload, timeout=15)
print(f"Status: {resp.status_code}")

if resp.status_code == 200:
    data = resp.json()
    try:
        edges = data["data"]["marketplace_search"]["feed