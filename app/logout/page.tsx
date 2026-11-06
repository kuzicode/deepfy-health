import { LogoutRun } from "./LogoutRun";

// 官网（另一个域名）上的「退出登录」：跳到这里，在 App 域名下退出会话、清掉官网标记，再回登录页
export default function LogoutPage() {
  return <LogoutRun />;
}
