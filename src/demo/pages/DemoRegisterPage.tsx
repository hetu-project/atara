import DemoAuthPage from './DemoAuthPage';

export default function DemoRegisterPage() {
  return (
    <DemoAuthPage
      title="注册"
      subtitle="演示环境 · 无需验证邮箱"
      cta="创建演示账号并进入"
      footerText="已经有账号？"
      footerLinkText="去登录"
      footerLinkTo="/login"
    />
  );
}
