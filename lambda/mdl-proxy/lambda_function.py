import re
import urllib.error
import urllib.request

# Node's fetch/https clients get hit with Cloudflare's JS challenge on this
# site (TLS/HTTP client fingerprinting); plain urllib does not, so this is
# Python on purpose, not just "whatever runtime was handy."
ALLOWED_URL_PATTERN = re.compile(r'^https://(www\.)?mydramalist\.com/dramalist/', re.IGNORECASE)

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)


def lambda_handler(event, context):
    method = (event.get('requestContext') or {}).get('http', {}).get('method')
    if method == 'OPTIONS':
        return {'statusCode': 204, 'headers': CORS_HEADERS, 'body': ''}

    target = (event.get('queryStringParameters') or {}).get('url')
    if not target or not ALLOWED_URL_PATTERN.match(target):
        return {
            'statusCode': 400,
            'headers': {**CORS_HEADERS, 'Content-Type': 'text/plain'},
            'body': 'Only https://mydramalist.com/dramalist/... URLs are allowed',
        }

    req = urllib.request.Request(target, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode('utf-8', 'replace')
            status = resp.status
    except urllib.error.HTTPError as err:
        body = err.read().decode('utf-8', 'replace')
        status = err.code
    except Exception as err:
        return {
            'statusCode': 502,
            'headers': {**CORS_HEADERS, 'Content-Type': 'text/plain'},
            'body': f'Upstream fetch failed: {err}',
        }

    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8'},
        'body': body,
    }
