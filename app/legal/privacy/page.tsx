import { getLocale } from "next-intl/server";
import { LegalDoc } from "../LegalDoc";

export async function generateMetadata() {
  return { title: (await getLocale()) === "zh" ? "隐私政策" : "Privacy Policy" };
}

const ZH = (
  <>
    <p>本政策适用于官方托管的 app.deepfy.si。运营者是个人开发者 kuzicode，可以通过 <a href="https://github.com/kuzicode">GitHub</a> 或登录后的「意见反馈」联系。自托管的实例由部署者负责。</p>
    <h2>1. 我们收集什么</h2>
    <ul>
      <li>账号信息：登录方式提供的姓名、邮箱，以及你使用的界面语言（决定邮件的语言）。头像是注册时随机分配的预设头像，不使用 Google 等登录方式提供的头像，可在设置里更换。</li>
      <li>症状照片：你在快速记录里上传的照片，与其他健康数据一样加密存储；上传前在你的浏览器里压缩并去掉拍摄位置等元数据。</li>
      <li>内测申请：你的邮箱，以及你自愿填写的在用 agent 和用途说明，仅用于审批与通知；申请未通过的记录可应你的要求删除。</li>
      <li>提醒邮件：默认开启，可在「邮件提醒」里随时暂停。我们会在复查 / 体检到期前通过邮件服务商 Resend 发送提醒，邮件内容只有家人称呼、日期、检查项目名称和到期的用药或补剂名称，不含检测数值与分析；每封邮件都可以一键暂停。</li>
      <li>意见反馈：你在「意见反馈」里写的内容不加密，会连同登录邮箱保存，每周汇总发给维护者，用于改进产品和回复你；请不要在反馈里填写检查数值等健康信息。</li>
      <li>字典缺口反馈：只有你在记录页主动点击「反馈项目名称」时，才会发送字典暂未收录的项目名称、单位和分组，不含检测数值，也不关联你的账号，按名称汇总计数，用于完善指标字典。</li>
      <li>健康数据：你或你授权的工具（如本地 kzh、经 MCP 接入的 agent）上传的档案、检测记录、分析笔记、用药补剂计划、健康计划和附件（病历、体检报告等）。这些属于敏感个人信息。</li>
      <li>必要的技术信息：登录会话、IP 地址和浏览器标识，用于安全防护。为了在官网（deepfy.si）也显示你的登录状态，登录后会在 deepfy.si 域名下存一个只含头像编号的 cookie，不含任何身份信息，退出登录时清除。</li>
    </ul>
    <h2>2. 如何保护</h2>
    <ul>
      <li>传输全程使用 HTTPS。</li>
      <li>健康数据和附件在服务器上以 AES-256-GCM 加密存储，每个账号使用独立的数据密钥；数据密钥再由单独保管的主密钥加密。报告日期和标题、指标代码、家人目录名、家庭名、附件路径、自定义指标的定义等用于检索的元数据目前未加密，只有服务器和数据库备份的管理者能看到，并计划改为加密。</li>
      <li>只有在你查看页面、导出或使用分析功能时，服务器才会在内存中解密。这不是端到端加密：为了提供分析等功能，服务器在处理时能够读取明文。</li>
      <li>不同账号的数据严格隔离；工作人员不会主动查看你的健康数据。</li>
    </ul>
    <h2>3. 如何使用</h2>
    <p>仅用于向你提供本服务（展示、趋势分析、提醒）。我们不出售你的数据，不用于广告，也不会在未经你同意的情况下提供给第三方。若未来引入 AI 分析服务商，会事先说明并征得你的同意。</p>
    <h2>4. 存储位置与期限</h2>
    <p>数据存储在我们自管的服务器上（日本），保存至你删除账号为止。删除后，数据库记录与附件文件会被删除，备份在 14 天内轮换清除。</p>
    <h2>5. 你的权利</h2>
    <p>你可以随时查看、导出（设置 → 导出全部数据）或删除全部数据，也可以撤销已签发的 API token。</p>
  </>
);

const EN = (
  <>
    <p>This policy applies to the hosted app at app.deepfy.si. It is operated by an individual developer, kuzicode, who you can reach on <a href="https://github.com/kuzicode">GitHub</a> or through Feedback after signing in. A self-hosted instance is the responsibility of whoever runs it.</p>
    <h2>1. What we collect</h2>
    <ul>
      <li>Account information: name and email from your sign-in method, and your interface language (which sets the language of our emails). Your avatar is a preset picked at random when you sign up — we don't use the picture from Google or other sign-in providers — and you can change it in Settings.</li>
      <li>Symptom photos: photos you add to quick logs are encrypted like the rest of your health data; your browser compresses them and strips location metadata before upload.</li>
      <li>Beta requests: your email plus the agents and use case you choose to share, used only to review the request and notify you; we delete it on request.</li>
      <li>Reminder emails: on by default; pause any time under "Reminders". We send recheck / checkup reminders through our email provider Resend, containing only the family member's name, dates, item names and the names of medications or supplements coming due — no results or analysis. Every email has a one-click pause link.</li>
      <li>Feedback: what you write on the Feedback page is stored unencrypted with your sign-in email and sent to the maintainers in a weekly digest, to improve the product and reply to you. Please don't include test results or other health details.</li>
      <li>Dictionary feedback: only when you click "Send item names" on the records page do we receive the names, units and sections of items not yet in our dictionary — no results, not linked to your account, counted per name — to improve the marker dictionary.</li>
      <li>Health data: profiles, records, analysis notes, medication and supplement plans, health plans and attachments (medical records, checkup reports) uploaded by you or tools you authorize (the local kzh CLI, agents connected over MCP). This is sensitive personal information.</li>
      <li>Necessary technical data: sessions, IP address and browser identifiers, used for security. To show that you're signed in on our website (deepfy.si), we store a cookie on that domain containing only your avatar number — no identifying information — and clear it when you sign out.</li>
    </ul>
    <h2>2. How we protect it</h2>
    <ul>
      <li>HTTPS for all traffic.</li>
      <li>Health data and attachments are stored with AES-256-GCM encryption. Each account has its own data key, wrapped by a separately kept master key. Metadata used for lookups, such as report dates and titles, marker codes, member folder names, household name, attachment paths and custom marker definitions, is not yet encrypted. Only those who administer the server and its database backups can see it, and we plan to encrypt it.</li>
      <li>The server decrypts data in memory only when you view pages, export, or use analysis. This is not end-to-end encryption: to provide analysis, the server can read plaintext while processing.</li>
      <li>Accounts are strictly isolated; staff do not access your health data.</li>
    </ul>
    <h2>3. How we use it</h2>
    <p>Only to provide the Service (display, trend analysis, reminders). We never sell your data or use it for advertising, and never share it with third parties without your consent. If we add an AI analysis provider, we will tell you and ask first.</p>
    <h2>4. Where and how long</h2>
    <p>Data is stored on servers we operate (Japan) until you delete your account. Deletion removes database records and attachment files; backups rotate out within 14 days.</p>
    <h2>5. Your rights</h2>
    <p>You can view, export (Settings → Export all data) or delete all your data at any time, and revoke any API token.</p>
  </>
);

export default async function Privacy() {
  const zh = (await getLocale()) === "zh";
  return <LegalDoc title={zh ? "隐私政策" : "Privacy Policy"} updated="2026-11-06">{zh ? ZH : EN}</LegalDoc>;
}
