import { PrivyProvider } from '@privy-io/react-auth'
import type { ReactNode } from 'react'

/**
 * Privy 接管登录。
 *
 * 原来那套是自己写的：EIP-6963 发现注入的扩展、逐个钱包连。能用，但只覆盖
 * 浏览器扩展这一种——手机钱包扫码要自己接 WalletConnect，Google / 邮箱登录
 * 要自己造托管钱包。Privy 把这几条路收在一个弹窗里，所以整块换掉。
 *
 * appId 和 WalletConnect 的 project ID 都可以在构建时覆盖：
 *
 *     VITE_PRIVY_APP_ID=xxx VITE_WC_PROJECT_ID=yyy npm run build
 *
 * appId 是 Atara 自己的 Privy 应用，公开值，进前端产物没问题。
 * **app secret 绝不能进来**：Vite 会把 VITE_* 全部内联进 JS 产物，那是公开文件。
 * 它是服务端凭证，而且这个项目用不到——后端不校验 Privy token，只要地址。
 *
 * **appId 绑定来源**：Privy 后台有一份 allowed origins 名单，不在名单里的来源，
 * 登录用的 iframe 会被 CSP 的 frame-ancestors 挡掉——弹窗能弹出来，但登不进去，
 * 而且界面上没有任何提示，只有控制台里一条报错。换域名或换端口部署前，
 * 先去后台把新来源加进去。
 */
const APP_ID = import.meta.env.VITE_PRIVY_APP_ID ?? 'cmtmpvriq01ue0dihpt5kkxkc'
/* WalletConnect（手机钱包扫码）的 project ID。不写死：Privy 后台里给这个
   应用配了就用后台那份，这里留一个构建时覆盖的口子。借别的项目的 ID 能跑，
   但用量和封禁都会算到人家头上。 */
const WC_ID = import.meta.env.VITE_WC_PROJECT_ID ?? ''

export default function PrivyRoot({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        // 钱包、Google、Twitter。钱包列表不收窄，用 Privy 的默认全集。
        loginMethods: ['wallet', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
          accentColor: '#2563eb',
        },
        // Google / 邮箱进来的人没有钱包。Privy 给他们造一个托管钱包，
        // 这样「身份就是地址」这条前提对所有登录方式都成立——
        // 后端的账户表以地址为唯一键，拿不到地址就等于开不了户。
        embeddedWallets: { createOnLogin: 'all-users' },
        // 手机钱包扫码
        externalWallets: { walletConnect: { enabled: true } },
        ...(WC_ID ? { walletConnectCloudProjectId: WC_ID } : {}),
      }}
    >
      {children}
    </PrivyProvider>
  )
}
