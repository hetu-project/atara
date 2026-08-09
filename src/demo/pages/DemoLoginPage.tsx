import DemoAuthPage from './DemoAuthPage';

export default function DemoLoginPage() {
  return (
    <DemoAuthPage
      title="登录"
      subtitle="演示环境 · 任意邮箱均可进入"
      cta="以演示身份进入"
      footerText="还没有账号？"
      footerLinkText="去注册"
      footerLinkTo="/register"
    />
  );
}
