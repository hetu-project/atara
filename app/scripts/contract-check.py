#!/usr/bin/env python3
"""前后端契约回归。

用与 React app 完全相同的请求形状，经 Vite dev server 代理跑一遍全部链路。
目的不是测后端（那有 atara-pay 的 make smoke），是验证**前端 API 层的契约**
——字段名、参数语义、令牌档位这些两端必须一致的东西。

跑之前后端和 npm run dev 都要起着。库最好是干净的（make clean）。
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


# -- 账户 --
section('Wallet 视图：账户与资金')
me = call('/me')
chk('身份', me['display_name'], 'Demo')
chk('自托管钱包', me['wallet_kind'], 'atara')
w = call('/wallet')
chk('平台不持有', w['custody'], 'self')
chk('钱包里没有法币', all(a['asset'] in ('USDT', 'USDC', 'BTC', 'ETH')
                          for a in w['assets']), True)
chk('暴露托管合约供复核', bool(w['escrow_contract']['address']), True)

# -- 池子与吃单 --
section('Market 视图：side 是我的意图，后端自己翻方向')
offers = [o for o in call('/offers?side=buy')['offers']
          if o['asset'] == 'USDT' and o['fiat'] == 'CNY']
chk('有能卖给我的做市方', len(offers) > 0, True)
o = offers[0]
chk('挂单带做市方信誉', 'trust_score' in o['maker'], True)
chk('资质件缺项也公开', 'docs' in o['maker'], True)
peer = o['maker']['name']

section('撮合：先撮合后评估')
m = call('/orders/match', {'intent': 'buy', 'amount': '1000', 'amount_kind': 'coin',
                           'asset': 'USDT', 'fiat': 'CNY'})
chk('给出候选', len(m['candidates']) > 0, True)
chk('最多三个', len(m['candidates']) <= 3, True)
bad = call('/orders/match', {'intent': 'buy', 'amount': '1000', 'amount_kind': 'coin',
                             'asset': 'USDT', 'fiat': 'CNY', 'counterparty_id': 'nobody'})
chk('指定对手方撮不到不回退', bad['violation']['code'], 'NO_MATCH_WITH_COUNTERPARTY')

section('候选对手方：五条判定，单位不混')
el = call('/orders/eligible-counterparties'
          '?side=buy&asset=USDT&fiat=CNY&amount=1000&amount_kind=coin')
chk('带头像与信誉', all('hue' in p and 'trust_score' in p
                        for p in el['counterparties']), True)
low = call('/orders/eligible-counterparties'
           '?side=buy&asset=USDT&fiat=CNY&amount=1&amount_kind=fiat')
chk('低于所有起投额时为空', len(low['counterparties']), 0)

# -- 核心结算链路 --
section('OTC 结算：吃单 → 承诺 → 回执 → 核验 → 终态')
d = call(f"/offers/{o['id']}/take", {'amount': o['min_lot'], 'amount_kind': 'fiat',
                                     'network': o['network']})
oid = d['id']
chk('吃单不需要令牌', d['state'], 'match')
chk('taker 方向 buy', d['otc']['side'], 'buy')

d = call(f'/orders/{oid}/accept', {}, conf=tok('accept', [oid], 'commit'))
chk('买方向 commit 档即可', d['state'], 's1')

for _ in range(50):
    d = call(f'/orders/{oid}')
    if d['state'] == 's3' or d.get('terminal'):
        break
    time.sleep(0.3)
chk('调度器绑定锁仓 → s3', d['state'], 's3')
chk('phase 该我打款', f"{d['phase']}/{d['actor']}", 'pay/you')
chk('轨道停在第三站', [s['state'] for s in d['rail']].index('now'), 2)

open('/tmp/cc-receipt.txt', 'w').write('bank receipt')
ref = upload('/tmp/cc-receipt.txt')
d = call(f'/orders/{oid}/receipt', {'file_ref': ref})
chk('提交回执 → s3v', d['state'], 's3v')
chk('付方此刻无事可做', f"{d['phase']}/{d['actor']}", 'lock/auto')

p = call(f'/orders/{oid}', who=peer)
chk('同一张单在收方眼里该核验', f"{p['phase']}/{p['actor']}", 'verify/you')
chk('轨道两侧一致停第四站', [s['state'] for s in p['rail']].index('now'), 3)

self_v = call(f'/orders/{oid}/verify-receipt', {'ok': True})
chk('上传者不能自核', self_v['error']['code'], 'NOT_YOUR_CALL')

d = call(f'/orders/{oid}/verify-receipt', {'ok': True}, who=peer)
chk('收方核验 → s4', d['state'], 's4')
for _ in range(50):
    d = call(f'/orders/{oid}')
    if d.get('terminal'):
        break
    time.sleep(0.3)
chk('终态 completed', d['terminal'], 'completed')
chk('终态不产出 phase', d['phase'], None)

section('Tasks 视图：工单的派生投影')
tk = call('/tasks')['tasks']
chk('工单进了待办', any(x['order_ref'] == d['ref'] for x in tk), True)
chk('state 只有三种', set(x['state'] for x in tk) <= {'you', 'run', 'done'}, True)

# -- Money 视图 --
section('Money 视图：支配权')
a = call('/allowances', {'spender': 'CC agent', 'kind': 'agent', 'per_payment': '300',
                         'window_cap': '1200', 'cycle': 'weekly', 'expires': '30 days',
                         'recipients': ''},
         conf=tok('allowance', ['CC agent', '300', '1200'], 'signature'))
chk('签发额度', a['status'], 'live')
aid = a['id']
over = call('/allowances', {'spender': 'X', 'kind': 'agent', 'per_payment': '9999',
                            'window_cap': '100', 'cycle': 'weekly', 'expires': '',
                            'recipients': ''},
            conf=tok('allowance', ['X', '9999', '100'], 'signature'))
chk('单笔不得超过窗口总额', over['error']['code'], 'CAP_ABOVE_WINDOW')
chk('撤销', call(f'/allowances/{aid}', method='DELETE')['status'], 'revoked')

section('Money 视图：收款方与提现闭环')
# 地址每次跑都换一个——(owner, chain, address) 唯一，复用会撞去重规则
addr = 'TXcc' + str(int(time.time()))
pay = call('/payees', {'label': 'CC ops', 'chain': 'TRON', 'address': addr})
chk('加入地址簿', bool(pay.get('id')), True)
dup = call('/payees', {'label': 'dup', 'chain': 'TRON', 'address': addr})
chk('同链同地址去重', dup['error']['code'], 'PAYEE_EXISTS')

nc = call('/withdrawals', {'payee_id': pay['id'], 'asset': 'USDT',
                           'amount': '100', 'purpose': 'OTC settlement'})
chk('提现要令牌', nc['error']['code'], 'CONFIRMATION_REQUIRED')
com = call('/withdrawals', {'payee_id': pay['id'], 'asset': 'USDT',
                            'amount': '100', 'purpose': 'OTC settlement'},
           conf=tok('withdraw', [pay['id'], 'USDT', '100'], 'commit'))
chk('承诺档不能冒充签名档', com['error']['code'], 'SIGNATURE_REQUIRED')
fiat = call('/withdrawals', {'payee_id': pay['id'], 'asset': 'CNY',
                             'amount': '100', 'purpose': 'x'},
            conf=tok('withdraw', [pay['id'], 'CNY', '100'], 'signature'))
chk('法币不能提', fiat['error']['code'], 'ASSET_REQUIRED')
wd = call('/withdrawals', {'payee_id': pay['id'], 'asset': 'USDT',
                           'amount': '100', 'purpose': 'OTC settlement'},
          conf=tok('withdraw', [pay['id'], 'USDT', '100'], 'signature'))
chk('提交后 submitted', wd['state'], 'submitted')
br = call(f"/withdrawals/{wd['id']}/broadcast", {'tx_hash': '0xcc123'})
chk('回填 tx → broadcast', br['state'], 'broadcast')
chk('重复回填被拒',
    call(f"/withdrawals/{wd['id']}/broadcast",
         {'tx_hash': '0xdup'})['error']['code'], 'NOT_SUBMITTED')

# -- Discover 与做市准入 --
section('Discover 视图：纵向目录')
mk = call('/discover/markets')['markets']
chk('三个纵向', len(mk), 3)
chk('只有 OTC 上线', [m['key'] for m in mk if m['live']], ['otc'])

section('Discover 视图：做市准入两段审核 + 挂单闸门')
# 准入链路用一个新建的临时用户，不用 demo——这样脚本重复跑也不受库里
# 已有状态影响。注册与登录是同一个端点，地址已存在就返回那个账户。
NEW = 'cc-maker-' + str(int(time.time()))
call('/auth/connect', {'method': 'passkey', 'name': NEW})
app = call('/maker/application', who=NEW)
chk('新用户尚未申请', app['approved'], False)

OFFER = {'side': 'buy', 'asset': 'USDT', 'fiat': 'CNY', 'unit_price': '7.3',
         'qty': '100', 'min_lot': '100', 'network': 'TRON'}
gate = call('/offers', OFFER, who=NEW,
            conf=tok('offer', ['USDT', '100'], 'commit', who=NEW))
chk('未过审不能挂单', gate['error']['code'], 'MAKER_NOT_APPROVED')

call('/maker/application', {'phase': 'kyc', 'form': {'kind': 'Individual',
                                                     'legal_name': 'CC Tester'}},
     who=NEW)
skip = call('/maker/application', {'phase': 'listing', 'form': {'dir': ['sell']}},
            who=NEW)
chk('身份未过审不能提配置', skip['error']['code'], 'KYC_NOT_APPROVED')

nr = call('/admin/maker/applications', who=NEW)
chk('普通用户看不到审核台', nr['error']['code'], 'ROLE_REQUIRED')
uid = call('/me', who=NEW)['id']
pend = call('/admin/maker/applications', who='reviewer')['applications']
chk('reviewer 看到待审', any(x['user_id'] == uid for x in pend), True)

nore = call(f'/admin/maker/applications/{uid}/review',
            {'stage': 'kyc', 'decision': 'reject'}, who='reviewer')
chk('拒绝必须给理由', nore['error']['code'], 'REASON_REQUIRED')
r = call(f'/admin/maker/applications/{uid}/review',
         {'stage': 'kyc', 'decision': 'approve'}, who='reviewer')
chk('身份过审 → 进配置段', (r['kyc_ok'], r['phase']), (True, 'listing'))
call('/maker/application', {'phase': 'listing', 'form': {'dir': ['sell'],
                                                         'coins': ['USDT']}},
     who=NEW)
r = call(f'/admin/maker/applications/{uid}/review',
         {'stage': 'listing', 'decision': 'approve'}, who='reviewer')
chk('配置过审 → approved', r['approved'], True)

mine = call('/offers', OFFER, who=NEW,
            conf=tok('offer', ['USDT', '100'], 'commit', who=NEW))
chk('过审后能挂买单', mine.get('status'), 'active')
chk('自己的挂单列得出来',
    any(x['id'] == mine['id'] for x in call('/offers/mine', who=NEW)['offers']), True)
chk('下架', call(f"/offers/{mine['id']}", method='DELETE', who=NEW)['status'],
    'delisted')

# -- People 视图 --
section('People 视图：名录与会话')
c = call('/contacts')
chk('关系类型一并下发', len(c['relationships']) > 0, True)
nf = call('/contacts', {'query': '这个人不存在', 'label': 'Supplier'})
chk('查无此人', nf['error']['code'], 'NO_SUCH_ACCOUNT')

# /threads/{peer} 收的是用户 ID，不是显示名——后端按 ID 查用户。
# 前端 People 视图传的是联系人卡片的 id，一致。
peer_id = d['counterparty_id']
th = call('/threads/' + quote(peer_id))
chk('聊天与订单同流', 'messages' in th and 'orders' in th, True)
chk('这条线程里有那张单', any(x['id'] == oid for x in th['orders']), True)
msg = call('/threads/' + quote(peer_id) + '/messages',
           {'body': '契约回归的一条消息'})
chk('发消息', msg.get('author'), 'me')
empty = call('/threads/' + quote(peer_id) + '/messages', {'body': ''})
chk('空消息被拒', empty['error']['code'], 'EMPTY_MESSAGE')

# -- 目录 --
section('目录')
chk('资产目录', len(call('/catalog/assets')['assets']) > 0, True)
chk('法币按走廊分组', len(call('/catalog/fiats')['corridors']) > 0, True)
chk('条件原子定义', len(call('/catalog/conditions')['atoms']) > 0, True)

print()
if FAIL:
    print(f'有 {len(FAIL)} 处失败：')
    for f in FAIL:
        print('  ', f)
    sys.exit(1)
print('全部通过 — 前端 API 层与后端契约一致')
