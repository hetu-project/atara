import { useCallback, useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import Qr from './Qr'
import type { KycSession, KycStatus } from '../api/types'

/**
 * 身份核验那一步：把人交给 ID Analyzer 的 DocuPass 托管流程。
 *
 * 证件拍照、正反面、人脸活体全在他们那一侧完成，影像不经过我们。原来这一步
 * 是三个上传框（ID front / ID back / Liveness check）——那不是核验，那是收图：
 * 谁都能传三张随手拍的照片，没有任何一步在检查证件是真的、上面那张脸是不是
 * 本人。上传框旁边还有个「Demo fill」能把整份材料一键填成假的。
 *
 * ── 浏览器这一侧说的不算 ──
 *
 * 这里能拿到的只有 reference（短效、单次有效）。API key 留在后端——ID Analyzer
 * 自己的文档把这条写成硬规矩。流程结束时那个回调也只是「用户点完了」的 UI 信号：
 * 任何人打开控制台都能手敲一句「我完成了」。所以这个组件走完之后不声称任何结论，
 * 只去问后端一句 kycStatus——那一份是后端从签名回调或主动拉取落定的。
 */

/* 不用他们那个官方 lightbox（v.idanalyzer.com/js/docupassembed.js）。
   两个原因：

   一、它有 bug。整段代码包在 document.addEventListener('DOMContentLoaded', …)
   里，window.DocupassEmbed 只在那个事件里赋值。它假设你把 <script> 静态写在
   <head> 里；我们是点按钮时才插进去的，那时 DOMContentLoaded 早过了，
   监听器永远不执行，全局量永远是 undefined。

   二、就算没那个 bug 也不该用。要让它工作就得把这段第三方脚本静态挂在每一页，
   而这一页上还装着用户的钱包。一个 3.8KB 的 lightbox 换整站的 DOM 访问权，
   不划算——它做的事无非是造一个 div 套一个 iframe，我们自己写四十行就有了。

   DocuPass 那一侧没有 X-Frame-Options，也没有 CSP frame-ancestors，可以直接嵌。
   他们文档里也写着「可以用任何支持 iframe 的 lightbox 插件」。 */

export default function IdCheck({
  identity, status, onDone,
}: {
  identity: string
  /** 当前状态。由上层拉，这个组件不自己轮询空转。 */
  status: KycStatus | null
  /** 状态可能变了——让上层重新拉一次。 */
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /* 这次会话。开着弹窗时才有值——关掉不作废它，人可能是切去手机上扫码走完的，
     那条会话还在跑。 */
  const [sess, setSess] = useState<KycSession | null>(null)
  /* 有一次没走完的核验在挂着才轮询。
     还没开过（state 'none'）就不问：那时每隔几秒问一次后端毫无意义，
     而后端每次问都会去上游拉一遍——那是按次计费的。
     反过来，进来时就已经是 pending 也得问：人可能是在手机上拍完照
     再回到这个页面的，那条流程不是在这个标签页里跑完的。 */
  const [watching, setWatching] = useState(status?.state === 'pending')
  const timer = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (timer.current !== null) { clearInterval(timer.current); timer.current = null }
  }, [])

  useEffect(() => {
    if (!watching) return
    /* 人在那一侧拍照要花一分多钟，问太密没有意义。
       问一阵就停：停了也不卡住——重新打开这一步会再拉一次。 */
    let left = 60 // ~5 分钟
    timer.current = setInterval(() => {
      if (left-- <= 0) { stop(); setWatching(false); return }
      onDone()
    }, 5000) as unknown as number
    return stop
  }, [watching, onDone, stop])

  /* 状态一到就跟着走：有结论了别再问；还挂着没走完就接着问。 */
  useEffect(() => {
    if (!status) return
    if (status.state === 'pending') setWatching(true)
    else if (status.state !== 'none') { stop(); setWatching(false); setSess(null) }
  }, [status, stop])

  const start = async () => {
    setBusy(true); setErr('')
    try {
      const s = await ep.startKyc(identity)
      setSess(s)
      setWatching(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'could not start verification')
    } finally {
      setBusy(false)
    }
  }

  if (status && !status.configured) {
    /* 照实说。摆一颗按不动的按钮，或者假装通过了，都是在骗操作的人。 */
    return (
      <div className="sfnote">
        Identity verification is not configured on this server. Ask an operator to set
        <code> IDANALYZER_API_KEY</code>.
      </div>
    )
  }

  const st = status?.state ?? 'none'
  const sim = !!status?.simulated

  if (st === 'accept') return <Verified status={status!} />

  if (st === 'reject') {
    return (
      <div className="idck">
        <Banner tone="bad" title="Verification did not pass"
          note="The checks below did not clear. You can try again with a different document." />
        <Warnings status={status} />
        <button className="btn btn-secondary" disabled={busy} onClick={() => void start()}>
          {busy ? 'Opening…' : 'Try again'}
        </button>
      </div>
    )
  }

  if (st === 'review') {
    return (
      <div className="idck">
        <Banner tone="warn" title="Sent for manual review"
          note="Your documents were read, but at least one check needs a person to look at it. You will be able to trade once it clears." />
        <Warnings status={status} />
      </div>
    )
  }

  return (
    <div className="idck">
      {/* 模拟模式先把话说在前面：这一步不会验任何东西。
          放在按钮上方而不是下方——说明要在动作之前读到才有用。 */}
      {sim ? (
        <Banner tone="warn" title="Identity checks are switched off on this server"
          note="Nothing will be verified — this passes the step with a placeholder document. Local development only." />
      ) : (
        <p className="sfnote">
          {st === 'pending'
            ? 'Verification is in progress. Finish it in the window that opened, or start over.'
            : 'Photograph your ID and take a short selfie. The capture runs on ID Analyzer — your images do not pass through Atara.'}
        </p>
      )}
      {/* 走完之后这里不说「已通过」——那句话得后端说。
          模拟模式没有「等结果」这回事：后端当场就落了结论。 */}
      {watching && !sim && <p className="sfnote">Waiting for the result…</p>}
      <button className="btn btn-primary" disabled={busy} onClick={() => void start()}>
        {busy ? 'Opening…'
          : sim ? 'Skip verification'
            : st === 'pending' ? 'Start over' : 'Verify my identity'}
      </button>
      {err ? <p className="sfnote bad">{err}</p> : null}
      {/* 模拟会话没有 URL，弹出来是一张空白页。 */}
      {sess?.url && <DocuPassSheet sess={sess} onClose={() => setSess(null)} />}
    </div>
  )
}

/**
 * DocuPass 那个流程，嵌在我们自己的弹窗里。
 *
 * 两条路并排给：屏幕上这台机器有摄像头就直接在框里拍；没有（大多数台式机）
 * 就扫下面那个码用手机走。二维码是建会话时 ID Analyzer 一起给的，
 * 不是我们另画的——它指向同一条会话，手机上走完这边一样会亮。
 */
function DocuPassSheet({ sess, onClose }: { sess: KycSession; onClose: () => void }) {
  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard dpcard">
        <header className="mhead">
          <h3>Verify your identity</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody dpbody">
          {/* allow 这一条不能少：摄像头权限要显式委派给内嵌的源，
              不给的话 DocuPass 那边取流会被浏览器直接拒掉，
              而它只会显示一句「打不开摄像头」，看不出是被我们挡的。 */}
          <iframe className="dpframe" src={sess.url} title="Identity verification"
            allow="camera; microphone; fullscreen" />
          <div className="dpside">
            {/* 码是我们按这条链接自己生成的，不用 ID Analyzer 随会话给的那张。
                他们那张编的是没带 ?l= 的原始链接——手机扫进去会按手机的系统语言
                铺界面，屏幕上是英文、手机上是中文，同一次核验两种语言。
                顺带这张是 SVG，他们那张是 JPEG（给二维码用有损格式）。 */}
            <Qr text={sess.url} size={158} />
            <p className="sfnote">
              No camera on this machine? Scan the code — it opens the same session on your phone.
            </p>
            <a className="btn btn-secondary btn-sm" href={sess.url}
              target="_blank" rel="noreferrer noopener">Open in a new tab</a>
            <p className="sfnote">
              Leave this open — the result lands here on its own when you finish.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 通过之后显示证件上读出来的那几项——用户不用再手打一遍。 */
function Verified({ status }: { status: KycStatus }) {
  const id = status.identity
  /* 模拟出来的「已通过」必须带着标签活下去，不只是在点的那一刻说一句。
     这张卡是之后一直看得到的那一张——标在这里，任何时候看都知道它的来历。 */
  const sim = !!status.simulated
  const name = [id?.first_name, id?.last_name].filter(Boolean).join(' ') || id?.full_name
  const rows: [string, string | undefined][] = [
    ['Name', name],
    ['Date of birth', id?.dob],
    ['Document', [id?.doc_type, id?.doc_number].filter(Boolean).join(' · ') || undefined],
    ['Expires', id?.expiry],
    ['Nationality', id?.nationality],
  ]
  return (
    <div className="idck">
      {sim ? (
        <Banner tone="warn" title="Simulated — nothing was verified"
          note="Identity checks are switched off on this server (ATARA_KYC=false)." />
      ) : null}
      <Banner tone="ok" title="Identity verified"
        note="Read from your document — nothing here was typed in." />
      <div className="idkv">
        {rows.filter(([, v]) => !!v).map(([k, v]) => (
          <div className="afc" key={k}><span>{k}</span><b>{v}</b></div>
        ))}
      </div>
      {/* 通过但带保留意见的情况是有的（severity 低的警告不挡放行）。
          挡不住不等于不该说——它记在这次核验的档里。 */}
      <Warnings status={status} />
    </div>
  )
}

function Warnings({ status }: { status: KycStatus | null }) {
  const w = status?.warnings ?? []
  if (!w.length) return null
  return (
    <ul className="idwarn">
      {w.map(x => (
        <li key={x.code}><b>{x.code}</b> — {x.description}</li>
      ))}
    </ul>
  )
}

function Banner({ tone, title, note }: { tone: 'ok' | 'warn' | 'bad'; title: string; note: string }) {
  return (
    <div className={'idbn ' + tone}>
      <b>{title}</b>
      <em>{note}</em>
    </div>
  )
}
