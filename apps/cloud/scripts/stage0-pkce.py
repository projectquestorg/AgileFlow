#!/usr/bin/env python3
"""Stage 0 PKCE probe for the first-party CLI client (stdlib only, read-only).

  python3 -I stage0-pkce.py login [--no-browser]   # PKCE sign-in, 127.0.0.1 loopback receiver, token file mode 600
  python3 -I stage0-pkce.py test                   # read + rejection checks (no writes)
  python3 -I stage0-pkce.py refresh                # refresh-token rotation, then test again

Environment:
  AGILEFLOW_SERVICE            service origin (default: production)
  AGILEFLOW_PROBE_TOKEN_FILE   token file path (default: ~/.af-probe/prod-cli-token.json)
  AGILEFLOW_PROBE_LOGIN_TIMEOUT  absolute login deadline in seconds (default: 900)

--no-browser prints the authorization URL instead of opening a browser. Exit
status is nonzero when any check fails. Mirrors the CLI's login in
apps/cli/src/cloud/client.ts. Never prints tokens or authorization codes.
"""
import base64, hashlib, http.server, json, os, secrets, sys, time, urllib.error, urllib.parse, urllib.request, webbrowser

SERVICE = os.environ.get('AGILEFLOW_SERVICE', 'https://app.agileflow.projectquestorg.com').rstrip('/')
TOKEN_FILE = os.path.abspath(os.path.expanduser(os.environ.get('AGILEFLOW_PROBE_TOKEN_FILE') or '~/.af-probe/prod-cli-token.json'))
LOGIN_TIMEOUT = float(os.environ.get('AGILEFLOW_PROBE_LOGIN_TIMEOUT') or 900)


def req(method, url, body=None, headers=None, form=False):
    h = dict(headers or {})
    data = None
    if body is not None:
        data = urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
        h['Content-Type'] = 'application/x-www-form-urlencoded' if form else 'application/json'
    h.setdefault('Accept', 'application/json, text/event-stream')
    h.setdefault('User-Agent', 'agileflow-stage0-pkce/1')  # the default urllib agent is refused (403) by the issuer
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=30) as r:
            return r.status, r.read().decode(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), dict(e.headers)


def discovery():
    s, b, _ = req('GET', SERVICE + '/.well-known/agileflow.json')
    if s != 200:
        sys.exit(f'discovery HTTP {s}')
    d = json.loads(b)
    if d.get('capabilitySource') != 'grants' or d.get('dashboard', {}).get('devAuth') is not False:
        sys.exit('discovery: expected capabilitySource grants and devAuth false')
    s, b, _ = req('GET', d['authorizationServer'] + '/.well-known/oauth-authorization-server')
    if s != 200:
        sys.exit(f'authorization server metadata HTTP {s}')
    m = json.loads(b)
    if 'S256' not in m.get('code_challenge_methods_supported', ['S256']):
        sys.exit('authorization server does not support S256')
    return d, m


def save(rec):
    os.makedirs(os.path.dirname(TOKEN_FILE), mode=0o700, exist_ok=True)
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(rec, f)
    os.chmod(TOKEN_FILE, 0o600)


def load():
    try:
        return json.load(open(TOKEN_FILE))
    except FileNotFoundError:
        sys.exit(f'no token file at {TOKEN_FILE}; run login first')


def error_of(body):
    try:
        return json.loads(body).get('error')
    except Exception:
        return None


def token_request(endpoint, params):
    s, b, _ = req('POST', endpoint, params, form=True)
    if s != 200:
        sys.exit(f'token endpoint HTTP {s}: {error_of(b) or "non-JSON"}')
    return json.loads(b)


def login(no_browser=False):
    d, m = discovery()
    resource, client_id = d['resources']['cli'], d['clients']['cli']
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    state = secrets.token_urlsafe(16)
    got = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            u = urllib.parse.urlsplit(self.path)
            q = urllib.parse.parse_qs(u.query)
            status, msg = 404, b'Not found.'
            if u.path == '/callback':
                if q.get('state') != [state]:
                    # Wrong or missing state: refuse this request but keep waiting for the legitimate callback.
                    status, msg = 400, b'State mismatch; ignored.'
                    print('ignored a callback with a wrong or missing state')
                elif 'code' in q:
                    got['code'] = q['code'][0]
                    status, msg = 200, b'Signed in. You can close this tab.'
                else:
                    got['error'] = q.get('error', ['no code'])[0]
                    status, msg = 400, b'Sign-in failed.'
            self.send_response(status)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(msg)

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(('127.0.0.1', 0), H)
    redirect = f'http://127.0.0.1:{srv.server_port}/callback'
    url = m['authorization_endpoint'] + '?' + urllib.parse.urlencode({
        'response_type': 'code', 'client_id': client_id, 'redirect_uri': redirect,
        'scope': ' '.join(d['defaultScopes']['cli']), 'state': state,
        'code_challenge': challenge, 'code_challenge_method': 'S256', 'resource': resource,
    })
    print('loopback receiver on', redirect, f'(deadline {int(LOGIN_TIMEOUT)} s)')
    if no_browser:
        print('Open this URL in the browser on this machine:')
        print(url)
    else:
        webbrowser.open(url)
    deadline = time.monotonic() + LOGIN_TIMEOUT
    try:
        while 'code' not in got and 'error' not in got:
            left = deadline - time.monotonic()
            if left <= 0:
                sys.exit('login timed out; no token saved')
            srv.timeout = min(left, 5)
            srv.handle_request()
    finally:
        srv.server_close()
    if 'error' in got:
        sys.exit('authorization failed: ' + got['error'])
    t = token_request(m['token_endpoint'], {
        'grant_type': 'authorization_code', 'code': got['code'], 'redirect_uri': redirect,
        'client_id': client_id, 'code_verifier': verifier, 'resource': resource,
    })
    save({'tokenEndpoint': m['token_endpoint'], 'clientId': client_id, 'resource': resource,
          'access': t['access_token'], 'refresh': t.get('refresh_token'), 'scope': t.get('scope')})
    print('token saved (mode 600):', TOKEN_FILE, '| scope:', t.get('scope'), '| refresh token:', bool(t.get('refresh_token')))


def claims(tok):
    p = tok.split('.')[1]
    c = json.loads(base64.urlsafe_b64decode(p + '=' * (-len(p) % 4)))
    h = json.loads(base64.urlsafe_b64decode(tok.split('.')[0] + '=='))
    return {'typ': h.get('typ'), 'iss': c.get('iss'), 'aud': c.get('aud'), 'client_id': c.get('client_id'),
            'org_id': c.get('org_id'), 'exp_in_s': c.get('exp', 0) - c.get('iat', 0)}


def check(label, ok, detail=''):
    print(f'{"PASS" if ok else "FAIL"}  {label}{": " + detail if detail else ""}')
    return ok


def check_http(label, status, body, want_status, want_code=None):
    err = error_of(body)
    code = err.get('code') if isinstance(err, dict) else err
    return check(label, status == want_status and (want_code is None or code == want_code), f'HTTP {status}{" " + str(code) if code else ""}')


def run_tests():
    rec = load()
    tok = rec['access']
    c = claims(tok)
    print('claims (non-secret):', c)
    A = {'Authorization': 'Bearer ' + tok}
    r = [check('token is at+jwt with an organization', c['typ'] in ('at+jwt', 'application/at+jwt') and bool(c['org_id']))]
    s, b, _ = req('GET', SERVICE + '/cli/v1/context', headers=A)
    data = {}
    if s == 200:
        data = json.loads(b).get('data') or {}
    ws = data.get('workspace') or {}
    # A successful context must be bound to the token's organization, not just return 200.
    r.append(check('cli token GET /cli/v1/context bound to its organization', s == 200 and bool(ws.get('id')) and ws.get('orgId') == c['org_id'],
                   f'HTTP {s} workspace {ws.get("name")!r} org match {ws.get("orgId") == c["org_id"]}'))
    s, b, _ = req('POST', SERVICE + '/cli/v1/tools/agileflow_context', {}, A)
    r.append(check_http('cli token POST /cli/v1/tools/agileflow_context', s, b, 200))
    s, b, _ = req('POST', SERVICE + '/cli/v1/tools/agileflow_context', {})
    r.append(check_http('no token /cli', s, b, 401))
    s, b, _ = req('POST', SERVICE + '/cli/v1/tools/agileflow_context', {}, {'Authorization': 'Bearer not.a.jwt'})
    r.append(check_http('garbage token /cli', s, b, 401))
    # Grants mode refuses a token without `aud` by client binding (403); a token with `aud` fails the exact audience check (401).
    want = (401, None) if c['aud'] is not None else (403, 'CLIENT_NOT_ALLOWED')
    s, b, _ = req('POST', SERVICE + '/local-control/v1/projects/prj_probe/poll', {}, A)
    r.append(check_http('cli token at /local-control', s, b, *want))
    s, b, _ = req('POST', SERVICE + '/mcp', {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
        'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'probe', 'version': '0'}}}, A)
    r.append(check_http('cli token at /mcp', s, b, *want))
    return r


def test():
    r = run_tests()
    print('ALL PASS' if all(r) else 'SOME CHECKS FAILED')
    return 0 if all(r) else 1


def refresh():
    rec = load()
    if not rec.get('refresh'):
        sys.exit('no refresh token stored')
    old = hashlib.sha256(rec['refresh'].encode()).hexdigest()
    t = token_request(rec['tokenEndpoint'], {'grant_type': 'refresh_token', 'refresh_token': rec['refresh'],
                                             'client_id': rec['clientId'], 'resource': rec['resource']})
    rec['access'] = t['access_token']
    rec['refresh'] = t.get('refresh_token') or rec['refresh']
    save(rec)
    r = [check('refresh token rotated', old != hashlib.sha256(rec['refresh'].encode()).hexdigest())]
    s, b, _ = req('POST', rec['tokenEndpoint'], {'grant_type': 'refresh_token', 'refresh_token': 'x' * 32,
                                                 'client_id': rec['clientId']}, form=True)
    r.append(check_http('bogus refresh token rejected', s, b, 400, 'invalid_grant'))
    r += run_tests()
    print('ALL PASS' if all(r) else 'SOME CHECKS FAILED')
    return 0 if all(r) else 1


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'test'
    if cmd == 'login':
        login(no_browser='--no-browser' in sys.argv[2:])
    elif cmd in ('test', 'refresh'):
        sys.exit((test if cmd == 'test' else refresh)())
    else:
        sys.exit('usage: stage0-pkce.py login [--no-browser] | test | refresh')
