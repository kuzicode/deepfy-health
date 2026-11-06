import YAML from "yaml";
import { todayISO } from "./analysis";
import type { Profile } from "./schema";

export interface MemberTemplateInput { id: string; name: string; dir: string; sex: Profile["sex"]; birthDate: string; linkBase: string }

// 按 YAML 1.1 输出：06:00、2026-01-01、yes 这类值会加引号，按 1.1 解析的工具也不会读错（06:00 在 1.1 里是六十进制数）
export const toYaml = (data: unknown) => YAML.stringify(data, { nullStr: "", version: "1.1" });

// frontmatter 一律序列化生成，名字里有冒号、引号等字符也能得到合法 YAML
export function frontmatter(data: Record<string, unknown>, body: string): string {
  return `---\n${toYaml(data)}---\n\n${body.trim()}\n`;
}

function profileData(m: MemberTemplateInput) {
  return {
    id: m.id, name: m.name, sex: m.sex, birth_date: m.birthDate,
    height_cm: null, weight_kg: null, blood_type: null,
    conditions: [], allergies: [], family_history: [],
    habits: { sleep: null, diet: null, exercise: null, smoking: null, alcohol: null },
    checkup_interval_months: 12, updated: todayISO(),
  };
}

const link = (target: string, label: string) => `[[${target}|${label.replaceAll("|", "／").replaceAll("]", "］")}]]`;

/** 返回 相对于 Personal/<dir>/ 的路径 → 文件内容 */
export function memberTemplates(m: MemberTemplateInput): Record<string, string> {
  const today = todayISO();
  const base = `${m.linkBase}${m.dir}`;
  return {
    [`${m.dir}.md`]: frontmatter({ type: "index", summary: `${m.name} 的个人主页：健康、工作、兴趣、保险` }, `
# ${m.name}

## 板块

- ${link(`${base}/Health/Health`, "健康档案")}：体检指标、用药补剂、健康计划（deepfy-health）
- ${link(`${base}/兴趣爱好`, "兴趣爱好")}
- ${link(`${base}/保险配置`, "保险配置")}

## 工作

（在这里链接工作档案）
`),
    "兴趣爱好.md": frontmatter({ type: "note", date: null, summary: null, tags: [] }, `
# 兴趣爱好

（运动、饮食偏好、作息习惯等，agent 分析健康时会参考）
`),
    "保险配置.md": frontmatter({ type: "ledger", date: null, summary: null, tags: ["insurance"] }, `
# 保险配置

| 险种 | 保险公司 / 产品 | 保额 | 年缴保费 | 缴费期 | 保障期 / 到期 | 受益人 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |

保单号、账号等敏感信息记录后在 frontmatter 加 \`secret: true\`。
`),
    "Health/Health.md": frontmatter({ type: "index", summary: `${m.name} 的健康档案` }, `
# ${m.name} · 健康档案

- ${link(`${base}/Health/profile`, "档案卡")}
- ${link(`${base}/Health/care-plan`, "健康计划")}
- ${link(`${base}/Health/regimen`, "用药与补剂")}

检测记录在 \`records/\`，单项指标分析在 \`indicators/\`，原始报告在 \`attachments/\`。返回 ${link(base + "/" + m.dir, m.name)}
`),
    "Health/profile.md": frontmatter(profileData(m), `
# ${m.name} 的健康档案

（自由记录：生活习惯细节、既往就医经历等，供 agent 分析时参考）
`),
    "Health/regimen.md": frontmatter({ updated: today, items: [] }, "# 用药与补剂计划"),
    "Health/care-plan.md": frontmatter({ updated: today, focus: [] }, `
# 整体健康计划

## 重点关注

## 饮食

## 作息与运动

## 复查安排
`),
  };
}
