import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useToast } from './Toast'

/**
 * 选一个文件并上传，带进度、预览和重传。
 *
 * 替掉项目里三处裸的 `<input type="file">`（付款回执、异议证据、准入材料）。
 * 那三处的共同毛病：点完按钮到成功之间界面完全不动——传一张几 MB 的照片
 * 要好几秒，那几秒里人不知道是在传、还是点漏了。其中准入那处的 catch
 * 甚至是空的，传失败了界面上一个字都不说。
 *
 * 上传本身是「选完就传」，不等提交表单：等提交再传的话，人填完点保存，
 * 又得盯着一个不知道多久的等待；而且那时才发现文件太大，已经填完一整页了。
 */

type State =
  | { s: 'idle' }
  | { s: 'up'; name: string; pct: number }
  /* url is the signed link the upload came back with. It is separate from ref
     because ref names the file and url is permission to open it — and when the
     component starts from a ref handed in through `value`, there is no url yet
     and no link to show. */
  | { s: 'ok'; name: string; ref: string; url?: string }
  | { s: 'bad'; name: string; why: string }

/*
What a receipt, a piece of evidence or an onboarding document is allowed to be.

Images and PDF, and deliberately nothing else. The list is short because
everything on it has to be openable by the person on the other end — a market
maker checking a bank transfer, a reviewer reading a licence. A .docx or a
.zip uploads perfectly well and then arrives as a download of unknown type in
the middle of a two-hour verification window, which is worse than being told
up front that it will not do.

`accept` on the input is only a filter on the picker: the dialog offers "all
files" and curl ignores it entirely. So it is repeated as a real check below,
and again on the server — three places because they answer three different
questions (what to offer, what to tell you immediately, what to actually
store).
*/
const OK_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
const OK_ACCEPT = OK_TYPES.join(',')
/** The same list as a sentence. Derived, so the words cannot drift from the
    filter the way a hand-written hint does. */
const OK_LABEL = 'JPG, PNG, GIF, WebP or PDF'

/** Does the browser think this file is one of the allowed kinds?
 *
 *  Type first, because it is what the server will decide on. An empty type
 *  (which happens: an unknown extension, some Android pickers) falls through
 *  to the extension rather than being refused — the server sniffs the bytes
 *  and has the final say, and refusing here on a guess would block a real
 *  receipt over a missing MIME string. */
const OK_EXT = /\.(jpe?g|png|gif|webp|pdf)$/i
function allowed(f: File): boolean {
  if (f.type) return OK_TYPES.includes(f.type.toLowerCase())
  return OK_EXT.test(f.name)
}

export default function FilePick({
  onDone,
  value,
  label = 'Attach',
  hint,
  accept = OK_ACCEPT,
  identity,
  className = '',
  variant = 'field',
  disabled = false,
}: {
  /** 上传成功后拿到的 file_ref。 */
  onDone: (ref: string, meta: { name: string; url?: string }) => void
  /** 已经传过的那一份（回填用）。给了就直接显示成已附。 */
  value?: string
  label?: string
  /** 没选文件时那行小字，说明该传什么。 */
  hint?: string
  accept?: string
  identity?: string
  className?: string
  /**
   * 'field'：表单里的虚线框（准入材料、异议证据）。
   * 'button'：页脚的一颗主按钮（付款回执）——那一处是个一次性动作，
   *   不是一个要一直显示着的字段，摆一个虚线框会把页脚整行撑开。
   */
  variant?: 'field' | 'button'
  /** button 形态下禁用（比如外面正在提交别的东西）。 */
  disabled?: boolean
}) {
  const [st, setSt] = useState<State>(value ? { s: 'ok', name: short(value), ref: value } : { s: 'idle' })
  const pick = useRef<HTMLInputElement>(null)
  const job = useRef<{ abort: () => void } | null>(null)
  const last = useRef<File | null>(null)
  const { toast } = useToast()

  /* 离开时掐掉还在传的那个。不掐的话它会传完、然后在一个已经不存在的
     组件上调 setState，而那份文件根本没人要了。 */
  useEffect(() => () => job.current?.abort(), [])

  const send = (f: File) => {
    /* Type first, because it costs nothing to check and the alternative is
       sending sixteen megabytes before being told no. The server checks the
       bytes themselves — this one only saves the trip. */
    if (!allowed(f)) {
      const why = `${OK_LABEL} only — that one is ${f.type || 'a kind we cannot read'}`
      setSt({ s: 'bad', name: f.name, why })
      toast(why, { kind: 'err' })
      return
    }
    /* 先在本地拦大小。后端那边是 io.LimitReader 静默截断——超了不报错，
       而是存下一个被砍掉一半的文件。等到审核员打不开才发现就太晚了。 */
    if (f.size > ep.MAX_UPLOAD) {
      const why = `That file is ${mb(f.size)}, over the ${mb(ep.MAX_UPLOAD)} limit`
      setSt({ s: 'bad', name: f.name, why })
      toast(why, { kind: 'err' })
      return
    }
    last.current = f
    setSt({ s: 'up', name: f.name, pct: 0 })
    const j = ep.uploadProgress(f, pct => setSt(s => (s.s === 'up' ? { ...s, pct } : s)), identity)
    job.current = j
    j.done.then(u => {
      job.current = null
      setSt({ s: 'ok', name: f.name, ref: u.file_ref, url: u.url })
      /* Hand back what it is, not just the reference. A caller that has to
         show the person what they picked — before doing something with it
         that cannot be taken back — has no way to name the file otherwise. */
      onDone(u.file_ref, { name: f.name, url: u.url })
    }).catch((e: unknown) => {
      job.current = null
      const msg = e instanceof Error ? e.message : 'Upload failed'
      /* 自己取消的不算失败：退回未选状态，不留一条红字。 */
      if (msg === 'Upload cancelled') { setSt({ s: 'idle' }); return }
      setSt({ s: 'bad', name: f.name, why: msg })
      toast(msg, { kind: 'err', action: { label: 'Retry', onClick: () => send(f) } })
    })
  }

  const input = (
    <input type="file" hidden ref={pick} accept={accept}
      onChange={e => {
        const f = e.target.files?.[0]
        /* 值要清掉：不清的话连着选同一个文件不会触发 change，
           上传失败后想重选同一份就点不动了。 */
        e.target.value = ''
        if (f) send(f)
      }} />
  )

  /* 按钮形态：进度画在按钮自己身上（--pct 驱动一层底色），页脚那一行
     容不下一条独立的进度条。传的时候点它就是取消。 */
  if (variant === 'button') {
    const up = st.s === 'up'
    return (
      <>
        {input}
        {/* className overrides the default emphasis. When this button is the
            one action on the card it is primary; when it sits beside a submit
            it must not compete with it. */}
        <button type="button" disabled={disabled && !up}
          className={'btn ' + (className || 'btn-primary') + ' fpbtn1' + (up ? ' uping' : '')}
          style={up ? ({ ['--pct' as string]: st.pct + '%' } as React.CSSProperties) : undefined}
          /* Say it here too, for anyone who reaches the button by keyboard or
             screen reader rather than by reading the line under it. */
          title={`${OK_LABEL}, up to ${mb(ep.MAX_UPLOAD)}`}
          onClick={() => { if (up) { job.current?.abort(); return } pick.current?.click() }}>
          {up ? `${st.pct}% · Cancel` : label}
        </button>
        {/* The field variant has always carried this line; the button variant
            had nothing, so the one place a bank receipt is attached was also
            the one place that never said what a receipt may be. A rejection
            replaces it, because at that moment the rule matters more than the
            restatement of it. */}
        <span className={'fphint' + (st.s === 'bad' ? ' bad' : '')}>
          {st.s === 'bad' ? st.why : `${OK_LABEL} · up to ${mb(ep.MAX_UPLOAD)}`}
        </span>
      </>
    )
  }

  return (
    <div className={'fpick ' + className}>
      {input}
      <button type="button" className={'sfup fpbtn' + (st.s === 'ok' ? ' ok' : st.s === 'bad' ? ' bad' : '')}
        onClick={() => {
          if (st.s === 'up') { job.current?.abort(); return }
          pick.current?.click()
        }}>
        <span className="fptx">
          <b>{label}</b>
          <em>{st.s === 'idle' ? (hint ?? `${OK_LABEL}, up to ${mb(ep.MAX_UPLOAD)}`)
            : st.s === 'bad' ? st.why : st.name}</em>
        </span>
        <span className="sfst">
          {st.s === 'up' ? `${st.pct}% · Cancel`
            : st.s === 'ok' ? 'Attached'
              : st.s === 'bad' ? 'Try again' : 'Choose'}
        </span>
      </button>

      {/* 进度条只在传的时候占位。常驻一条空槽会让静止的表单看起来像在等什么。 */}
      {st.s === 'up' && (
        <div className="fpbar" role="progressbar" aria-valuenow={st.pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: st.pct + '%' }} />
        </div>
      )}

      {/* 传上去的东西要能点开看。显示一句「已上传」等于让人相信一份他看不到的
          文件——这条在别处（证据包）已经是既定做法，这里保持一致。 */}
      {st.s === 'ok' && st.url && (
        <a className="fplink" href={st.url} target="_blank" rel="noopener">View file</a>
      )}
    </div>
  )
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1) + ' MB'
/** 回填时只有 ref，没有原始文件名——取末段当名字，好过显示一长串 uuid。 */
const short = (ref: string) => ref.split('/').pop() ?? ref
