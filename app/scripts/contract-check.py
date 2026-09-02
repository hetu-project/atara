# 用与 React app 完全相同的请求形状，经 Vite 代理走一遍核心链路。
# 目的不是测后端（那有 make smoke），是验证前端 API 层的契约。
import json, urllib.request, urllib.error, time
B = 'http://localhost:5173/api/v1'
def call(path, body=None, who='demo', conf=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(B+path, data=data,
        method=method or ('POST' if data is not None else 'GET'))
    r.add_header('Content-Type','application/json')
    r.add_header('X-Atara-User', who)
    if conf: r.add_header('X-Atara-Confirmation', conf)
    try: return json.load(urllib.request.urlopen(r))
    except urllib.error.HTTPError as e: return json.load(e)

FAIL=[]
def chk(label, got, want):
    ok = got==want
    if not ok: FAIL.append(f'{label}: got {got!r}, want {want!r}')
    print(f"  [{'ok ' if ok else 'FAIL'}] {label}: {got}")

print('── 1 账户（Wallet 视图）──')
me = call('/me'); chk('身份', me['display_name'], 'Demo')
w = call('/wallet'); chk('自托管', w['custody'], 'self')
chk('钱包里没有法币', all(a['asset'] in ('USDT','USDC','BTC','ETH') for a in w['assets']), True)

print('── 2 池子（Market：side=我的意图，后端自己翻方向）──')
# side 传的是我的意图：我要买币
offers = call('/offers?side=buy')['offers']
chk('有能卖给我的做市方', len(offers)>0, True)
o = offers[0]
chk('挂单带做市方信誉', 'trust_score' in o['maker'], True)
chk('起投额是法币口径', o['min_lot'] != o['remaining_qty'], True)

print('── 3 吃单（不需要令牌）──')
d = call(f"/offers/{o['id']}/take", {'amount': o['min_lot'], 'amount_kind':'fiat', 'network': o['network']})
chk('建单成功', 'id' in d, True)
oid = d['id']
chk('状态 match', d['state'], 'match')
chk('taker 方向 buy', d['otc']['side'], 'buy')
chk('rail 有站点', len(d['rail'])>0, True)

print('── 4 承诺（买方向 → commit 档，endpoints.accept 自动选）──')
t = call('/passkey/assert', {'scope':'accept','parts':[oid],'grade':'commit'})['confirmation']
d = call(f'/orders/{oid}/accept', {}, conf=t)
chk('进 s1', d['state'], 's1')

print('── 5 等调度器绑定挂单锁仓 → s3 ──')
for _ in range(40):
    d = call(f'/orders/{oid}')
    if d['state']=='s3' or d.get('terminal'): break
    time.sleep(0.5)
chk('到 s3', d['state'], 's3')
chk('phase 该我打款', f"{d['phase']}/{d['actor']}", 'pay/you')

print('── 6 上传回执（multipart）──')
import subprocess
open('/tmp/rc.txt','w').write('bank receipt')
out = subprocess.run(['curl','-s','-X','POST','-H','X-Atara-User: demo',
    '-F','file=@/tmp/rc.txt','http://localhost:5173/api/v1/uploads'],
    capture_output=True, text=True).stdout
ref = json.loads(out)['file_ref']
chk('拿到 file_ref', bool(ref), True)
d = call(f'/orders/{oid}/receipt', {'file_ref': ref})
chk('进 s3v', d['state'], 's3v')
chk('付方无事可做', f"{d['phase']}/{d['actor']}", 'lock/auto')

print('── 7 切到对手方视角（身份切换器的价值）──')
peer = o['maker']['name']
p = call(f'/orders/{oid}', who=peer)
chk('对手方该核验', f"{p['phase']}/{p['actor']}", 'verify/you')

print('── 8 上传者自核（必须被拒）──')
bad = call(f'/orders/{oid}/verify-receipt', {'ok':True})
chk('NOT_YOUR_CALL', bad.get('error',{}).get('code'), 'NOT_YOUR_CALL')

print('── 9 对手方核验放行 ──')
d = call(f'/orders/{oid}/verify-receipt', {'ok':True}, who=peer)
chk('进 s4', d['state'], 's4')
for _ in range(40):
    d = call(f'/orders/{oid}')
    if d.get('terminal'): break
    time.sleep(0.5)
chk('终态 completed', d['terminal'], 'completed')

print('── 10 待办投影 ──')
tk = call('/tasks')['tasks']
chk('工单进了待办', any(x['order_ref']==d['ref'] for x in tk), True)

print()
if FAIL:
    print('有失败：'); [print(' ', f) for f in FAIL]; raise SystemExit(1)
print('核心链路全部通过 — 前端 API 层契约与后端一致')
