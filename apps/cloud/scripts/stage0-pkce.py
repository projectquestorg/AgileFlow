#!/usr/bin/env python3
"""Stage 0 PKCE probe for the first-party CLI client (stdlib only, read-only).

  python3 -I stage0-pkce.py login     # browser PKCE sign-in, 127.0.0.1 loopback receiver, token file mode 600
  python3 -I stage0-pkce.py test      # read + rejection checks (no writes)
  python3 -I stage0-pkce.py refresh   # refresh-token rotation, then test again

AGILEFLOW_SERVICE overrides the service (default: production). Mirrors the CLI's
login in apps/cli/src/cloud/client.ts. Never prints tokens or authorization codes.
"""
import base64, hashlib, http.server, json, os, secrets, sys, urllib.error, urllib.parse, urllib.request, webbrowser

SERVICE = os.environ.get('AGILEFLOW_SERVICE', 'https://app.agileflow.projectquestorg.com').rstrip('/')
TOKEN_FILE = os.path.expanduser('~/.af-probe/prod-cli-token.json')


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
    assert s == 200, s
    d = json.loads(b)
    assert d['capabilitySource'] == 'grants' and d['dashboard']['devAuth'] is False
    s, b, _ = req('GET', d['authorizationServer'] + '/.well-known/oauth-authorization-server')
    m = json.loads(b)
    assert 'S256' in m.get('code_challenge_methods_supported', ['S256'])
    return d, m


def save(rec):
    os.makedirs(os.path.dirname(TOKEN_FILE), mode=0o700, exist_ok=True)
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(rec, f)
    os.chmod(TOKEN_FILE, 0o600)


def load():
    return json.load(open(TOKEN_FILE))


def token_request(endpoint, params):
    s, b, _ = req('POST', endpoint, params, form=True)
    if s != 200:
        sys.exit(f'token endpoint HTTP {s}: {json.loads(b).get("error", "?") if b.startswith("{") else "non-JSON"}')
    return json.loads(b)


def login():
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
            ok = u.path == '/callback' and q.get('state') == [state] and 'code' in q
            if ok:
                got['code'] = q['code'][0]
            elif u.path == '/callback':
                got['error'] = q.get('error', ['state mismatch or no code'])[0]
            self.send_response(200 if ok else 400)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Signed in. You can close this tab.' if ok else b'Sign-in failed.')

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(('127.0.0.1', 0), H)
    redirect = f'http://127.0.0.1:{srv.server_port}/callback'
    url = m['authorization_endpoint'] + '?' + urllib.parse.urlencode({
        'response_type': 'code', 'client_id': client_id, 'redirect_uri': redirect,
        'scope': ' '.join(d['defaultScopes']['cli']), 'state': state,
        'code_challenge': challenge, 'code_challenge_method': 'S256', 'resource': resource,
    })
    print('Opening browser (loopback receiver on', redirect + ')')
    webbrowser.open(url)
    srv.timeout = 900
    while 'code' not in got and 'error' not in got:
        srv.handle_request()
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
            'has_org_id': bool(c.get('org_id')), 'exp_in_s': c.get('exp', 0) - c.get('iat', 0)}


def check(label, status, body, want_status, want_code=None):
    code = None
    try:
        code = (json.loads(body).get('error') or {}).get('code')
    except Exception:
        pass
    ok = status == want_status and (want_code is None or code == want_code)
    print(f'{"PASS" if ok else "FAIL"}  {label}: HTTP {status}{" " + code if code else ""}')
    return ok


def test():
    rec = load()
    tok = rec['access']
    print('claims (non-secret):', claims(tok))
    A = {'Authorization': 'Bearer ' + tok}
    r = []
    s, b, _ = req('GET', SERVICE + '/cli/v1/context', headers=A)
    r.append(check('cli token GET /cli/v1/context', s, b, 200))
    if s == 200:
        data = json.loads(b).get('data') or {}
        print('   context:', {'workspace': (data.get('workspace') or {}).get('name'), 'keys': sorted(data)})
    s, b, _ = req('POST', SERVICE + '/cli/v1/tools/agileflow_context', {}, A)
    r.append(check('cli token POST /cli/v1/tools/agileflow_context', s, b, 200))
    s, b, _ = req('POST', SERVICE + '/cli/v1/tools/agileflow_context', {})
    r.append(check('no token /cli', s, b, 401))
    s, b, _ = req('POST', SERVICE + '/cli/v1/tools/agileflow_context', {}, {'Authorization': 'Bearer not.a.jwt'})
    r.append(check('garbage token /cli', s, b, 401))
    s, b, _ = req('POST', SERVICE + '/local-control/v1/projects/prj_probe/poll', {}, A)
    # Grants mode refuses a token without `aud` by client binding (403); a token with `aud` fails the exact audience check (401).
    want = (401, None) if claims(tok)['aud'] is not None else (403, 'CLIENT_NOT_ALLOWED')
    r.append(check('cli token at /local-control', s, b, *want))
    s, b, _ = req('POST', SERVICE + '/mcp', {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
        'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'probe', 'version': '0'}}}, A)
    r.append(check('cli token at /mcp', s, b, *want))
    print('ALL PASS' if all(r) else 'SOME CHECKS FAILED')


def refresh():
    rec = load()
    if not rec.get('refresh'):
        sys.exit('no refresh token stored')
    old = hashlib.sha256(rec['refresh'].encode()).hexdigest()[:12]
    t = token_request(rec['tokenEndpoint'], {'grant_type': 'refresh_token', 'refresh_token': rec['refresh'],
                                             'client_id': rec['clientId'], 'resource': rec['resource']})
    rec['access'] = t['access_token']
    rec['refresh'] = t.get('refresh_token') or rec['refresh']
    save(rec)
    new = hashlib.sha256(rec['refresh'].encode()).hexdigest()[:12]
    print('refreshed; refresh token rotated:', old != new)
    s, b, _ = req('POST', rec['tokenEndpoint'], {'grant_type': 'refresh_token', 'refresh_token': 'x' * 32,
                                                 'client_id': rec['clientId']}, form=True)
    check('bogus refresh token rejected', s, b, 400)
    test()


if __name__ == '__main__':
    {'login': login, 'test': test, 'refresh': refresh}[sys.argv[1] if len(sys.argv) > 1 else 'test']()
