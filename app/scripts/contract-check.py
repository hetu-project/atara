#!/usr/bin/env python3
"""Frontend/backend contract regression.

Runs the whole set of paths through the Vite dev server proxy, using exactly the same request shapes as the React app.
The point is not to test the backend (atara-pay's make smoke does that) but to verify **the frontend API layer's
contract** -- field names, parameter semantics, token tiers, the things both sides have to agree on.

Both the backend and npm run dev have to be running first. A clean database is preferable (make clean).
"""
"""
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import quote

B = 'http://localhost:5173/api/v1'
FAIL = []


def call(path, body=None, who='demo', conf=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(B + path, data=data,
                               method=method or ('POST' if data is not None else 'GET'))
    r.add_header('Content-Type', 'application/json')
    r.add_header('X-Atara-User', who)
    if conf:
        r.add_header('X-Atara-Confirmation', conf)
    try:
        return json.load(urllib.request.urlopen(r))
    except urllib.error.HTTPError as e:
        return json.load(e)


def tok(scope, parts, grade, who='demo'):
    return call('/passkey/assert', {'scope': scope, 'parts': parts, 'grade': grade},
                who=who)['confirmation']


def chk(label, got, want):
    ok = got == want
    if not ok:
        FAIL.append(f'{label}: got {got!r}, want {want!r}')
    print(f"  [{'ok ' if ok else 'FAIL'}] {label}: {got}")


def section(t):
    print(f'\n-- {t} --')


def upload(path, who='demo'):
    out = subprocess.run(
        ['curl', '-s', '-X', 'POST', '-H', f'X-Atara-User: {who}',
         '-F', f'file=@{path}', 'http://localhost:5173/api/v1/uploads'],
        capture_output=True, text=True).stdout
    return json.loads(out)['file_ref']


# -- Accounts --
section('Wallet view: account and funds')
me = call('/me')
chk('identity', me['display_name'], 'Demo')
chk('self-custody wallet', me['wallet_kind'], 'atara')
w = call('/wallet')
chk('platform holds nothing', w['custody'], 'self')
chk('no fiat in the wallet', all(a['asset'] in ('USDT', 'USDC', 'BTC', 'ETH')
                          for a in w['assets']), True)
chk('escrow contract exposed for review', bool(w['escrow_contract']['address']), True)

# -- Pool and taking orders --
section('Market view: side is my intent, the backend inverts the direction itself')
offers = [o for o in call('/offers?side=buy')['offers']
          if o['asset'] == 'USDT' and o['fiat'] == 'CNY']
chk('there are makers who can sell to me', len(offers) > 0, True)
o = offers[0]
chk('listings carry maker reputation', 'trust_score' in o['maker'], True)
chk('missing qualification documents are public too', 'docs' in o['maker'], True)
peer = o['maker']['name']

section('Matching: match first, assess second')
m = call('/orders/match', {'intent': 'buy', 'amount': '1000', 'amount_kind': 'coin',
                           'asset': 'USDT', 'fiat': 'CNY'})
chk('candidates returned', len(m['candidates']) > 0, True)
chk('at most three', len(m['candidates']) <= 3, True)
bad = call('/orders/match', {'intent': 'buy', 'amount': '1000', 'amount_kind': 'coin',
                             'asset': 'USDT', 'fiat': 'CNY', 'counterparty_id': 'nobody'})
chk('a named counterparty that does not match does not fall back', bad['violation']['code'], 'NO_MATCH_WITH_COUNTERPARTY')

section('Candidate counterparties: five criteria, units not mixed')
el = call('/orders/eligible-counterparties'
          '?side=buy&asset=USDT&fiat=CNY&amount=1000&amount_kind=coin')
chk('carries avatar and reputation', all('hue' in p and 'trust_score' in p
                        for p in el['counterparties']), True)
low = call('/orders/eligible-counterparties'
           '?side=buy&asset=USDT&fiat=CNY&amount=1&amount_kind=fiat')
chk('empty when below every minimum', len(low['counterparties']), 0)

# -- The core settlement path --
section('OTC settlement: take -> commit -> receipt -> verify -> terminal')
d = call(f"/offers/{o['id']}/take", {'amount': o['min_lot'], 'amount_kind': 'fiat',
                                     'network': o['network']})
oid = d['id']
chk('taking an order needs no token', d['state'], 'match')
chk('taker direction buy', d['otc']['side'], 'buy')

d = call(f'/orders/{oid}/accept', {}, conf=tok('accept', [oid], 'commit'))
chk('the buy direction only needs the commit tier', d['state'], 's1')

for _ in range(50):
    d = call(f'/orders/{oid}')
    if d['state'] == 's3' or d.get('terminal'):
        break
    time.sleep(0.3)
chk('the scheduler binds the lock -> s3', d['state'], 's3')
chk('phase says it is mine to pay', f"{d['phase']}/{d['actor']}", 'pay/you')
chk('the track stops at the third station', [s['state'] for s in d['rail']].index('now'), 2)

open('/tmp/cc-receipt.txt', 'w').write('bank receipt')
ref = upload('/tmp/cc-receipt.txt')
d = call(f'/orders/{oid}/receipt', {'file_ref': ref})
chk('submitting the receipt -> s3v', d['state'], 's3v')
chk('the payer has nothing to do at this point', f"{d['phase']}/{d['actor']}", 'lock/auto')

p = call(f'/orders/{oid}', who=peer)
chk('the same order is awaiting verification in the payee eyes', f"{p['phase']}/{p['actor']}", 'verify/you')
chk('both sides track stops at the fourth station', [s['state'] for s in p['rail']].index('now'), 3)

self_v = call(f'/orders/{oid}/verify-receipt', {'ok': True})
chk('the uploader cannot self-verify', self_v['error']['code'], 'NOT_YOUR_CALL')

d = call(f'/orders/{oid}/verify-receipt', {'ok': True}, who=peer)
chk('the payee verifies -> s4', d['state'], 's4')
for _ in range(50):
    d = call(f'/orders/{oid}')
    if d.get('terminal'):
        break
    time.sleep(0.3)
chk('terminal completed', d['terminal'], 'completed')
chk('a terminal state emits no phase', d['phase'], None)

section('Tasks view: the derived projection of a ticket')
tk = call('/tasks')['tasks']
chk('the ticket entered the to-do list', any(x['order_ref'] == d['ref'] for x in tk), True)
chk('state has only three values', set(x['state'] for x in tk) <= {'you', 'run', 'done'}, True)

# -- Money view --
section('Money view: spending authority')
a = call('/allowances', {'spender': 'CC agent', 'kind': 'agent', 'per_payment': '300',
                         'window_cap': '1200', 'cycle': 'weekly', 'expires': '30 days',
                         'recipients': ''},
         conf=tok('allowance', ['CC agent', '300', '1200'], 'signature'))
chk('allowance issued', a['status'], 'live')
aid = a['id']
over = call('/allowances', {'spender': 'X', 'kind': 'agent', 'per_payment': '9999',
                            'window_cap': '100', 'cycle': 'weekly', 'expires': '',
                            'recipients': ''},
            conf=tok('allowance', ['X', '9999', '100'], 'signature'))
chk('a single payment may not exceed the window total', over['error']['code'], 'CAP_ABOVE_WINDOW')
chk('revoke', call(f'/allowances/{aid}', method='DELETE')['status'], 'revoked')

section('Money view: payees and the withdrawal loop')
# A different address on every run -- (owner, chain, address) is unique, and reuse would hit the dedupe rule
addr = 'TXcc' + str(int(time.time()))
pay = call('/payees', {'label': 'CC ops', 'chain': 'TRON', 'address': addr})
chk('added to the address book', bool(pay.get('id')), True)
dup = call('/payees', {'label': 'dup', 'chain': 'TRON', 'address': addr})
chk('same chain, same address is deduped', dup['error']['code'], 'PAYEE_EXISTS')

nc = call('/withdrawals', {'payee_id': pay['id'], 'asset': 'USDT',
                           'amount': '100', 'purpose': 'OTC settlement'})
chk('withdrawal needs a token', nc['error']['code'], 'CONFIRMATION_REQUIRED')
com = call('/withdrawals', {'payee_id': pay['id'], 'asset': 'USDT',
                            'amount': '100', 'purpose': 'OTC settlement'},
           conf=tok('withdraw', [pay['id'], 'USDT', '100'], 'commit'))
chk('the commit tier cannot pass as the signature tier', com['error']['code'], 'SIGNATURE_REQUIRED')
fiat = call('/withdrawals', {'payee_id': pay['id'], 'asset': 'CNY',
                             'amount': '100', 'purpose': 'x'},
            conf=tok('withdraw', [pay['id'], 'CNY', '100'], 'signature'))
chk('fiat cannot be withdrawn', fiat['error']['code'], 'ASSET_REQUIRED')
wd = call('/withdrawals', {'payee_id': pay['id'], 'asset': 'USDT',
                           'amount': '100', 'purpose': 'OTC settlement'},
          conf=tok('withdraw', [pay['id'], 'USDT', '100'], 'signature'))
chk('submitted after submission', wd['state'], 'submitted')
br = call(f"/withdrawals/{wd['id']}/broadcast", {'tx_hash': '0xcc123'})
chk('writing back the tx -> broadcast', br['state'], 'broadcast')
chk('a duplicate write-back is rejected',
    call(f"/withdrawals/{wd['id']}/broadcast",
         {'tx_hash': '0xdup'})['error']['code'], 'NOT_SUBMITTED')

# -- Discover and maker onboarding --
section('Discover view: the vertical catalog')
mk = call('/discover/markets')['markets']
chk('three verticals', len(mk), 3)
chk('only OTC is live', [m['key'] for m in mk if m['live']], ['otc'])

section('Discover view: two-stage onboarding review plus the listing gate')
# The onboarding path uses a freshly created temporary user rather than demo -- so repeated runs of this script are
# unaffected by state already in the database. Register and sign in share one endpoint, and an existing address returns that account.
NEW = 'cc-maker-' + str(int(time.time()))
call('/auth/connect', {'method': 'passkey', 'name': NEW})
app = call('/maker/application', who=NEW)
chk('a new user has not applied yet', app['approved'], False)

OFFER = {'side': 'buy', 'asset': 'USDT', 'fiat': 'CNY', 'unit_price': '7.3',
         'qty': '100', 'min_lot': '100', 'network': 'TRON'}
gate = call('/offers', OFFER, who=NEW,
            conf=tok('offer', ['USDT', '100'], 'commit', who=NEW))
chk('cannot list before approval', gate['error']['code'], 'MAKER_NOT_APPROVED')

call('/maker/application', {'phase': 'kyc', 'form': {'kind': 'Individual',
                                                     'legal_name': 'CC Tester'}},
     who=NEW)
skip = call('/maker/application', {'phase': 'listing', 'form': {'dir': ['sell']}},
            who=NEW)
chk('configuration cannot be submitted before identity approval', skip['error']['code'], 'KYC_NOT_APPROVED')

nr = call('/admin/maker/applications', who=NEW)
chk('an ordinary user cannot see the review queue', nr['error']['code'], 'ROLE_REQUIRED')
uid = call('/me', who=NEW)['id']
pend = call('/admin/maker/applications', who='reviewer')['applications']
chk('a reviewer sees the pending item', any(x['user_id'] == uid for x in pend), True)

nore = call(f'/admin/maker/applications/{uid}/review',
            {'stage': 'kyc', 'decision': 'reject'}, who='reviewer')
chk('a rejection must give a reason', nore['error']['code'], 'REASON_REQUIRED')
r = call(f'/admin/maker/applications/{uid}/review',
         {'stage': 'kyc', 'decision': 'approve'}, who='reviewer')
chk('identity approved -> into the configuration stage', (r['kyc_ok'], r['phase']), (True, 'listing'))
call('/maker/application', {'phase': 'listing', 'form': {'dir': ['sell'],
                                                         'coins': ['USDT']}},
     who=NEW)
r = call(f'/admin/maker/applications/{uid}/review',
         {'stage': 'listing', 'decision': 'approve'}, who='reviewer')
chk('configuration approved -> approved', r['approved'], True)

mine = call('/offers', OFFER, who=NEW,
            conf=tok('offer', ['USDT', '100'], 'commit', who=NEW))
chk('can post a buy listing once approved', mine.get('status'), 'active')
chk('own listings can be listed',
    any(x['id'] == mine['id'] for x in call('/offers/mine', who=NEW)['offers']), True)
chk('delist', call(f"/offers/{mine['id']}", method='DELETE', who=NEW)['status'],
    'delisted')

# -- People view --
section('People view: directory and conversations')
c = call('/contacts')
chk('relationship types sent along', len(c['relationships']) > 0, True)
nf = call('/contacts', {'query': 'this person does not exist', 'label': 'Supplier'})
chk('no such person', nf['error']['code'], 'NO_SUCH_ACCOUNT')

# /threads/{peer} takes a user ID, not a display name -- the backend looks the user up by ID.
# The frontend's People view passes the contact card's id, which matches.
peer_id = d['counterparty_id']
th = call('/threads/' + quote(peer_id))
chk('chat and orders in one stream', 'messages' in th and 'orders' in th, True)
chk('that order is in this thread', any(x['id'] == oid for x in th['orders']), True)
msg = call('/threads/' + quote(peer_id) + '/messages',
           {'body': 'a message from the contract regression'})
chk('send a message', msg.get('author'), 'me')
empty = call('/threads/' + quote(peer_id) + '/messages', {'body': ''})
chk('an empty message is rejected', empty['error']['code'], 'EMPTY_MESSAGE')

# -- Catalog --
section('Catalog')
chk('asset catalog', len(call('/catalog/assets')['assets']) > 0, True)
chk('fiat grouped by corridor', len(call('/catalog/fiats')['corridors']) > 0, True)
chk('condition atom definitions', len(call('/catalog/conditions')['atoms']) > 0, True)

print()
if FAIL:
    print(f'{len(FAIL)} failure(s):')
    for f in FAIL:
        print('  ', f)
    sys.exit(1)
print('All passed -- the frontend API layer matches the backend contract')
