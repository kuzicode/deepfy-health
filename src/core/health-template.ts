import { abnormalReadings, isAbnormal, latestReadings, upcomingRechecks } from "./analysis";
import type { Catalog, HealthRecord, MemberBundle } from "./schema";

/**
 * 健康模板：成年职场人群常规观察项（参考《健康体检基本项目专家共识》与常见职工体检套餐整理）。
 * 只做提示——按已有记录判断哪些项目查过、过期或从未查过，并优先提示与异常指标 / 近期症状相关的项目。
 * 不是诊断，也不替代医生的个体化建议（UI1）。
 */

interface TemplateItem {
  id: string;
  /** 有数值的项目：任一 code 出现在检测记录中即算查过 */
  codes?: string[];
  /** 无数值的检查（心电图、B 超…）：优先按「检查结论」类 code 判断；旧记录没有 code 时匹配标题 / 正文 / 指标名兜底 */
  keywords?: string[];
  intervalMonths: number;
  sex?: "male" | "female";
  minAge?: number;
  /** 与这些症状 / 习惯关键词相关时优先提示 */
  symptoms?: string[];
  /** 只有相关时才提示（例如颈腰椎：没有不适就不建议专门检查） */
  onlyIfRelated?: boolean;
  /** 已知病情 / 诊断关键词（档案 conditions）：用来把「轻度脂肪肝」关联到肝功能、腹部 B 超 */
  conditions?: string[];
}

const HEALTH_TEMPLATE: TemplateItem[] = [
  { id: "body", codes: ["WEIGHT", "BMI", "WAIST", "BODY_FAT"], intervalMonths: 12, symptoms: ["体重", "肥胖", "weight"], conditions: ["肥胖", "超重", "代谢综合征", "obes"] },
  { id: "bp", codes: ["SBP", "DBP"], intervalMonths: 12, symptoms: ["头晕", "头痛", "心慌", "dizz", "headache"], conditions: ["高血压", "血压", "hypertension"] },
  { id: "cbc", codes: ["WBC", "RBC", "HGB", "PLT"], intervalMonths: 12, symptoms: ["乏力", "疲劳", "头晕", "脸色", "出血", "fatigue", "tired"], conditions: ["贫血", "anemia"] },
  { id: "liver", codes: ["ALT", "AST", "GGT", "TBIL"], intervalMonths: 12, symptoms: ["饮酒", "喝酒", "应酬", "脂肪肝", "alcohol"], conditions: ["脂肪肝", "肝炎", "肝功能", "转氨酶", "fatty liver", "hepat"] },
  { id: "kidney", codes: ["CREA", "BUN", "UA", "EGFR"], intervalMonths: 12, symptoms: ["痛风", "尿酸", "水肿", "关节痛", "gout"], conditions: ["痛风", "尿酸", "肾", "gout", "kidney"] },
  { id: "lipid", codes: ["TC", "TG", "HDL_C", "LDL_C"], intervalMonths: 12, symptoms: ["油腻", "外卖", "肥胖", "胸闷"], conditions: ["血脂", "胆固醇", "甘油三酯", "脂肪肝", "冠脉", "冠状动脉", "动脉硬化", "动脉粥样", "lipid", "cholesterol", "coronary", "atheroscl"] },
  { id: "glucose", codes: ["FBG", "HBA1C", "GLU_RAND"], intervalMonths: 12, symptoms: ["口渴", "多尿", "体重下降", "thirst"], conditions: ["糖尿病", "血糖", "糖耐量", "糖调节", "胰岛素抵抗", "diabet"] },
  { id: "urine", codes: ["U_PRO", "U_GLU", "U_BLD", "U_WBC"], intervalMonths: 12, symptoms: ["尿频", "尿痛", "泡沫尿"] },
  { id: "thyroid", codes: ["TSH", "FT3", "FT4", "US_THYROID"], intervalMonths: 24, symptoms: ["乏力", "怕冷", "怕热", "心慌", "脱发", "情绪", "失眠", "fatigue", "palpitation"], conditions: ["甲状腺", "甲亢", "甲减", "桥本", "thyroid"] },
  { id: "vitd", codes: ["VITD"], intervalMonths: 24, symptoms: ["乏力", "久坐", "少晒", "骨", "抽筋", "fatigue"] },
  { id: "ecg", codes: ["ECG"], keywords: ["心电图", "ECG", "EKG"], intervalMonths: 12, symptoms: ["心慌", "胸闷", "胸痛", "心悸", "palpitation", "chest"], conditions: ["心律", "早搏", "心脏", "冠心病", "冠脉", "冠状动脉", "arrhythm", "coronary"] },
  { id: "ultrasound", codes: ["US_LIVER", "US_GALLBLADDER", "US_PANCREAS", "US_SPLEEN", "US_KIDNEY"], keywords: ["腹部B超", "腹部超声", "肝胆", "B超", "彩超", "ultrasound"], intervalMonths: 12, symptoms: ["腹痛", "胃", "脂肪肝"], conditions: ["脂肪肝", "胆囊", "结石", "囊肿", "息肉", "fatty liver"] },
  { id: "chest", codes: ["CHEST_XRAY", "CHEST_CT"], keywords: ["胸片", "胸部X", "胸部CT", "低剂量CT", "chest x-ray", "chest ct"], intervalMonths: 12, symptoms: ["咳嗽", "吸烟", "抽烟", "cough", "smok"], conditions: ["肺结节", "哮喘", "肺"] },
  { id: "eye", codes: ["FUNDUS"], keywords: ["眼科", "视力", "眼底", "眼压", "eye"], intervalMonths: 12, symptoms: ["眼干", "眼睛", "视疲劳", "视力", "近视", "eye"], conditions: ["近视", "青光眼", "干眼", "glaucoma"] },
  { id: "dental", codes: ["DENTAL"], keywords: ["口腔", "牙", "洁牙", "dental"], intervalMonths: 12, symptoms: ["牙", "牙龈", "口腔"] },
  { id: "spine", keywords: ["颈椎", "腰椎", "骨科", "spine"], intervalMonths: 24, symptoms: ["颈椎", "腰", "背痛", "肩颈", "手麻", "neck", "back pain"], onlyIfRelated: true },
  { id: "breast", codes: ["US_BREAST"], keywords: ["乳腺", "breast"], intervalMonths: 12, sex: "female", minAge: 30 },
  { id: "cervix", codes: ["TCT", "HPV"], keywords: ["宫颈", "TCT", "HPV", "cervical"], intervalMonths: 36, sex: "female", minAge: 25 },
  { id: "colon", codes: ["FOBT"], keywords: ["粪便潜血", "便潜血", "大便潜血", "肠镜", "胃肠镜", "FOBT"], intervalMonths: 12, minAge: 40, symptoms: ["便血", "腹泻", "便秘"] },
  { id: "psa", codes: ["PSA"], intervalMonths: 24, sex: "male", minAge: 50 },
];

type PlanStatus = "covered" | "due" | "missing";
export interface PlanItem {
  id: string;
  status: PlanStatus;
  last?: string;
  /** 相关依据：abnormal:<CODE>、condition:<档案里的病情> 或 symptom:<关键词> */
  related: string[];
}
export interface CheckupPlan {
  items: PlanItem[];
  covered: number;
  total: number;
  /** 建议下次体检加查（未覆盖的项，相关的在前） */
  suggestions: PlanItem[];
}

const SYMPTOM_WINDOW_DAYS = 120;

function lastDate(records: HealthRecord[], item: TemplateItem): string | undefined {
  const kw = (item.keywords ?? []).map((k) => k.toLowerCase());
  const hits = records.filter((r) =>
    r.indicators.some((x) => item.codes?.includes(x.code)) ||
    (kw.length > 0 && kw.some((k) => `${r.title}\n${r.body}\n${r.indicators.map((x) => x.name ?? "").join(" ")}`.toLowerCase().includes(k))));
  return hits.map((r) => r.date).sort().at(-1);
}

function monthsBetween(from: string, to: string) {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** 近期症状与生活习惯文本（日志标题 / 标签 / 正文 + 档案里的病史与习惯），小写 */
function contextText(m: MemberBundle, today: string): string {
  const since = new Date(Date.parse(today) - SYMPTOM_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  const logs = m.logs.filter((l) => l.date >= since).map((l) => `${l.title} ${l.tags.join(" ")} ${l.body}`);
  const p = m.profile;
  const profile = p ? [...p.conditions, ...Object.values(p.habits ?? {})].join(" ") : "";
  return `${logs.join(" ")} ${profile}`.toLowerCase();
}

/** 档案里的一条已知状况，以及与它相关的检查项、指标和调养方案情况 */
export interface ConditionFocus {
  name: string;
  /** 相关的模板检查项（含是否查过 / 过期） */
  checks: PlanItem[];
  /** 相关指标 code（复查、写分析、调养方案 focus 用） */
  codes: string[];
  /** 其中最新结果异常的 */
  abnormal: string[];
  /** 调养方案是否已覆盖这个状况（focus 有相关指标或正文提到它） */
  hasPlan: boolean;
  /** 相关指标里最早的待复查日期 */
  nextRecheck?: string;
  /** 已愈 / 既往（见 isResolved） */
  resolved: boolean;
}

/** 已愈 / 既往的状况（约定写法「肺炎（2024-03，已愈）」）：概览收起，不计入需关注、不触发加查 */
export const isResolved = (name: string) =>
  /(?<!未|尚未|没有|没|不)(已愈|痊愈|治愈|已康复)|既往/u.test(name.replace(/(未|尚未|没有|没|不)(已经)?(痊愈|治愈|康复)/gu, ""))
  || /(?<!not\s)\b(resolved|cured|recovered)\b/i.test(name);

/** 「需关注」的唯一口径：最新结果异常的指标 + 未愈的已知状况。既没有记录也没有状况时返回 null（显示「—」） */
export function attentionCount(m: MemberBundle, catalog: Catalog): number | null {
  const conditions = (m.profile?.conditions ?? []).filter((c) => c.trim());
  if (!m.records.length && !conditions.length) return null;
  return abnormalReadings(m, catalog).length + conditions.filter((c) => !isResolved(c)).length;
}

const matchesCondition = (it: TemplateItem, cond: string) => (it.conditions ?? []).some((k) => cond.includes(k.toLowerCase()) || k.toLowerCase().includes(cond));

export function conditionFocus(m: MemberBundle, catalog: Catalog, today: string, plan = checkupPlan(m, catalog, today)): ConditionFocus[] {
  const abnormal = new Set(latestReadings(m, catalog).filter((r) => isAbnormal(r.flag)).map((r) => r.code));
  const care = m.carePlan;
  const rechecks = upcomingRechecks(m);
  return (m.profile?.conditions ?? []).filter((c) => c.trim()).map((name) => {
    const cond = name.trim().toLowerCase();
    const items = HEALTH_TEMPLATE.filter((it) => matchesCondition(it, cond));
    const codes = [...new Set(items.flatMap((it) => it.codes ?? []))];
    const checks = plan.items.filter((x) => items.some((it) => it.id === x.id));
    const hasPlan = !!care && (care.focus.some((c) => codes.includes(c)) || care.body.includes(name.trim()));
    const nextRecheck = rechecks.find((r) => codes.includes(r.code))?.due;
    return { name: name.trim(), checks, codes, abnormal: codes.filter((c) => abnormal.has(c)), hasPlan, nextRecheck, resolved: isResolved(name) };
  });
}

export function checkupPlan(m: MemberBundle, catalog: Catalog, today: string): CheckupPlan {
  const p = m.profile;
  const age = p ? monthsBetween(p.birth_date, today) / 12 : undefined;
  const abnormal = new Set(latestReadings(m, catalog).filter((r) => isAbnormal(r.flag)).map((r) => r.code));
  const ctx = contextText(m, today);

  const items: PlanItem[] = [];
  for (const it of HEALTH_TEMPLATE) {
    if (it.sex && p?.sex !== it.sex) continue;
    if (it.minAge && (age === undefined || age < it.minAge)) continue;
    const conds = (p?.conditions ?? []).filter((c) => c.trim() && !isResolved(c) && matchesCondition(it, c.trim().toLowerCase()));
    const related = [
      ...(it.codes ?? []).filter((c) => abnormal.has(c)).map((c) => `abnormal:${c}`),
      ...conds.map((c) => `condition:${c.trim()}`),
      ...(it.symptoms ?? []).filter((s) => ctx.includes(s.toLowerCase()) && !conds.some((c) => c.includes(s))).map((s) => `symptom:${s}`),
    ];
    if (it.onlyIfRelated && related.length === 0) continue;
    const last = lastDate(m.records, it);
    const status: PlanStatus = !last ? "missing" : monthsBetween(last, today) >= it.intervalMonths ? "due" : "covered";
    items.push({ id: it.id, status, last, related });
  }
  const rank = (x: PlanItem) => (x.related.length ? 0 : 2) + (x.status === "missing" ? 0 : 1);
  const suggestions = items.filter((x) => x.status !== "covered" || x.related.some((r) => r.startsWith("abnormal:")))
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i)
    .map(({ x }) => x);
  return { items, covered: items.filter((x) => x.status === "covered").length, total: items.length, suggestions };
}
