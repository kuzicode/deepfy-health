import { getLocale } from "next-intl/server";
import { LegalDoc } from "../LegalDoc";

export async function generateMetadata() {
  return { title: (await getLocale()) === "zh" ? "服务协议" : "Terms of Service" };
}

const ZH = (
  <>
    <h2>1. 服务内容</h2>
    <p>Deepfy 健康档案（以下简称「本服务」）帮助你记录和整理本人及家人的健康资料，包括基本档案、体检与化验结果、用药与补剂计划，并给出趋势与参考提示。</p>
    <h2>2. 不构成医疗建议</h2>
    <p>本服务中的分析、提示和建议仅供参考，不能替代执业医生的诊断与治疗。涉及用药、停药或调整剂量，请遵医嘱。你接入的 agent 给出的补剂建议和注意事项来自你自己选择的 AI 服务，不是本服务或医生的意见，开始服用前请自行判断，必要时咨询医生。出现紧急症状请立即就医。</p>
    <h2>3. 账号</h2>
    <p>你可以使用 Google 或邮箱注册和登录。你需要妥善保管账号和本服务签发的 API token，因账号或 token 泄露导致的损失由你自行承担。</p>
    <p>如果账号违反本协议或法律法规，或被用于攻击、滥用本服务，我们可以停用该账号。停用后不能登录，API token 失效，数据不会因此被删除；如需导出或删除这些数据，请联系我们。</p>
    <h2>4. 你上传的内容</h2>
    <p>你对上传的资料拥有全部权利。为家人建档前，应取得其同意或具有合法的监护、代理权限。我们仅为向你提供服务而处理这些内容，处理方式见《隐私政策》。</p>
    <p>目前每个账号使用免费额度：最多 6 位家人、500 MB 附件、3 个 Agent 接入、Agent 每 24 小时 200 次写入、每天 3 次完整导出。当前用量可在「设置 → 用量」查看；额度可能随服务调整，调整前会提前告知。</p>
    <h2>5. 导出与删除</h2>
    <p>你可以随时在「设置」中导出全部数据，或永久删除账号。删除后数据不可恢复。</p>
    <h2>6. 服务变更与终止</h2>
    <p>本服务仍在持续开发和测试中，功能可能调整。若计划停止服务，我们会提前通知并保留导出的时间窗口。</p>
  </>
);

const EN = (
  <>
    <h2>1. The service</h2>
    <p>Deepfy Health Record (the “Service”) helps you record and organize health information for yourself and your family — profiles, checkup and lab results, medication and supplement plans — with trends and reference notes.</p>
    <h2>2. Not medical advice</h2>
    <p>Analyses, notes and suggestions are for reference only and do not replace diagnosis or treatment by a licensed physician. Follow your doctor on starting, stopping or adjusting any medication. Supplement suggestions and precautions from an agent you connect come from the AI service you chose, not from the Service or a doctor; use your own judgment and consult a doctor where needed before starting. Seek care immediately in an emergency.</p>
    <h2>3. Your account</h2>
    <p>You can sign up and sign in with Google or email. Keep your account and any API tokens secure — you are responsible for losses caused by their disclosure.</p>
    <p>If an account breaks these terms or the law, or is used to attack or abuse the Service, we may disable it. A disabled account cannot sign in and its API tokens stop working. Its data is not deleted as a result; contact us to export or delete it.</p>
    <h2>4. Your content</h2>
    <p>You keep all rights to what you upload. Before creating records for family members, obtain their consent or hold lawful authority to act for them. We process your content only to provide the Service, as described in the Privacy Policy.</p>
    <p>Every account is currently on the free plan: up to 6 family members, 500 MB of attachments, 3 agent tokens, 200 agent writes per 24 hours and 3 full exports per day. See Settings → Usage; limits may change with notice.</p>
    <h2>5. Export and deletion</h2>
    <p>You can export all your data or permanently delete your account in Settings at any time. Deletion cannot be undone.</p>
    <h2>6. Changes and termination</h2>
    <p>The Service is still in active development and testing and may change. If we plan to shut it down, we will give notice and leave time for you to export your data.</p>
  </>
);

export default async function Terms() {
  const zh = (await getLocale()) === "zh";
  return <LegalDoc title={zh ? "服务协议" : "Terms of Service"} updated="2026-11-06">{zh ? ZH : EN}</LegalDoc>;
}
