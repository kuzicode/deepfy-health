import type { CatalogEntry } from "./schema";
import { ALLERGENS, BODY_BLOOD_ENTRIES } from "./catalog/body-blood";
import { URINE_EXAM_ENTRIES } from "./catalog/urine-exam";

// 内置指标字典：数据按类别放在 ./catalog/（helpers 构造行，body-blood 体征与血液，urine-exam 尿检与检查结论）；这里补英文名、易混提示和装配。



const ENTRIES: CatalogEntry[] = [...BODY_BLOOD_ENTRIES, ...URINE_EXAM_ENTRIES];


const NAME_EN: Record<string, string> = {
  VFL: "Visceral fat level", VFA: "Visceral fat area", SMM: "Skeletal muscle mass", BMR: "Basal metabolic rate", WHR: "Waist-to-hip ratio",
  U_RBC_M: "Urine RBC (microscopy)", U_WBC_M: "Urine WBC (microscopy)", UACR: "Urine albumin-to-creatinine ratio", U_MALB: "Urine microalbumin",
  GA_PCT: "Glycated albumin", HBDH: "α-Hydroxybutyrate dehydrogenase", ALDO: "Aldosterone", RENIN: "Renin", ARR: "Aldosterone-to-renin ratio", PTH: "Parathyroid hormone",
  CAP: "Liver CAP (fat)", LSM: "Liver stiffness", IGE_TOTAL: "Total IgE", US_BLADDER: "Bladder ultrasound",
  ...Object.fromEntries(ALLERGENS.map(([code, , lc]) => [code, `Specific IgE ${lc}`])),
  HEIGHT: "Height", WEIGHT: "Weight", BMI: "Body mass index", WAIST: "Waist", BODY_FAT: "Body fat", SBP: "Systolic BP", DBP: "Diastolic BP", HR: "Heart rate",
  WBC: "White blood cells", NEUT_PCT: "Neutrophils %", LYMPH_PCT: "Lymphocytes %", MONO_PCT: "Monocytes %", EO_PCT: "Eosinophils %", BASO_PCT: "Basophils %",
  MCV: "Mean corpuscular volume", MCH: "Mean corpuscular hemoglobin", MCHC: "MCH concentration", RDW: "Red cell distribution width", PLT: "Platelets",
  RBC: "Red blood cells", HGB: "Hemoglobin", HCT: "Hematocrit",
  AST: "AST", ALP: "Alkaline phosphatase", TBIL: "Total bilirubin", DBIL: "Direct bilirubin", IBIL: "Indirect bilirubin",
  TP: "Total protein", ALB: "Albumin", GLB: "Globulin", AG_RATIO: "Albumin/globulin ratio", ALT: "ALT", GGT: "GGT",
  BUN: "Urea", CYSC: "Cystatin C", EGFR: "eGFR", CREA: "Creatinine", UA: "Uric acid",
  TC: "Total cholesterol", TG: "Triglycerides", HDL_C: "HDL cholesterol", LDL_C: "LDL cholesterol", APOA1: "Apolipoprotein A1", APOB: "Apolipoprotein B", LPA: "Lipoprotein(a)",
  FBG: "Fasting glucose", GLU_RAND: "Random glucose", HBA1C: "HbA1c", INS: "Fasting insulin",
  TSH: "TSH", FT3: "Free T3", FT4: "Free T4", TT3: "Total T3", TT4: "Total T4", TPOAB: "TPO antibodies",
  K: "Potassium", NA: "Sodium", CL: "Chloride", CA: "Calcium", MG: "Magnesium", P: "Phosphorus",
  VITD: "Vitamin D (25-OH)", VITB12: "Vitamin B12", FOLATE: "Folate", HCY: "Homocysteine", CRP: "C-reactive protein", HSCRP: "hs-CRP", FER: "Ferritin",
  AFP: "Alpha-fetoprotein", CEA: "CEA", PSA: "PSA", CA125: "CA-125", CA199: "CA 19-9",
  ECG: "ECG", US_LIVER: "Liver ultrasound", US_GALLBLADDER: "Gallbladder ultrasound", US_PANCREAS: "Pancreas ultrasound", US_SPLEEN: "Spleen ultrasound",
  US_KIDNEY: "Kidney ultrasound", US_THYROID: "Thyroid ultrasound", US_BREAST: "Breast ultrasound", US_PROSTATE: "Prostate ultrasound", US_CAROTID: "Carotid ultrasound", US_HEART: "Echocardiography",
  CHEST_XRAY: "Chest X-ray", CHEST_CT: "Chest CT", FUNDUS: "Fundus exam", DENTAL: "Dental exam", ENT: "ENT exam", PHYS_EXAM: "Physical exam",
  TCT: "Cervical cytology (TCT)", HPV: "HPV test", FOBT: "Fecal occult blood", HP_BREATH: "H. pylori breath test", BMD: "Bone density",
  HIP: "Hip circumference", NEUT_ABS: "Neutrophils (abs)", LYMPH_ABS: "Lymphocytes (abs)", MONO_ABS: "Monocytes (abs)", EO_ABS: "Eosinophils (abs)", BASO_ABS: "Basophils (abs)",
  MPV: "Mean platelet volume", PDW: "Platelet distribution width", PLT_PCT: "Plateletcrit", TBA: "Total bile acids", LDH: "Lactate dehydrogenase", TGAB: "Thyroglobulin antibodies",
  FE_SERUM: "Serum iron", TIBC: "Total iron-binding capacity", TRF: "Transferrin", ESR: "Erythrocyte sedimentation rate", CK: "Creatine kinase", CK_MB: "CK-MB",
  CA153: "CA 15-3", CA724: "CA 72-4", NSE: "Neuron-specific enolase", CYFRA21_1: "CYFRA 21-1", FPSA: "Free PSA",
  U_NIT: "Urine nitrite", U_BIL: "Urine bilirubin", U_URO: "Urobilinogen", U_COLOUR: "Urine colour",
  TE_FE: "Whole-blood iron", TE_CA: "Whole-blood calcium", TE_MG: "Whole-blood magnesium", TE_CU: "Whole-blood copper", TE_ZN: "Whole-blood zinc",
  HBSAG: "HBsAg", HBSAB: "Anti-HBs", HBEAG: "HBeAg", HBEAB: "Anti-HBe", HBCAB: "Anti-HBc", HCV_AB: "Anti-HCV", HIV_AGAB: "HIV Ag/Ab", TP_AB: "Syphilis antibodies", HP_AB: "H. pylori antibodies",
  VA_OD: "Visual acuity (right)", VA_OS: "Visual acuity (left)", COLOR_VISION: "Colour vision",
  EYE: "Eye exam", GYNE: "Gynecological exam", US_UTERUS: "Uterus ultrasound", US_ADNEXA: "Adnexa ultrasound", LUNG_FUNC: "Lung function", BODY_COMP: "Body composition", STOOL: "Stool routine",
  U_SG: "Urine specific gravity", U_PH: "Urine pH", U_PRO: "Urine protein", U_GLU: "Urine glucose", U_BLD: "Urine blood", U_WBC: "Urine leukocytes", U_KET: "Urine ketones",
};

/** 容易错映射的项目：lookup_indicator 会把 note 一并返回给 agent */
const NOTES: Record<string, string> = {
  VFL: "内脏脂肪等级（无单位，1–20 级）。报告给的是面积（cm²）时用 VFA",
  VFA: "内脏脂肪面积（cm²）。报告给的是等级（无单位）时用 VFL",
  FER: "血清铁蛋白（ng/mL）。不是血清铁 FE_SERUM，也不是全血铁 TE_FE",
  FE_SERUM: "血清铁。不是铁蛋白 FER，也不是全血微量元素铁 TE_FE",
  TE_FE: "全血微量元素铁（常见 mmol/L）。不是铁蛋白 FER，也不是血清铁 FE_SERUM",
  CA: "血清钙。全血微量元素钙用 TE_CA",
  TE_CA: "全血微量元素钙。血清钙用 CA",
  MG: "血清镁。全血微量元素镁用 TE_MG",
  TE_MG: "全血微量元素镁。血清镁用 MG",
  HP_BREATH: "碳 13 / 14 呼气试验。血清抗体用 HP_AB",
  HP_AB: "幽门螺杆菌血清抗体（常见 AU/mL 或阴阳性）。呼气试验用 HP_BREATH",
  PLT_PCT: "血小板压积（血常规里的 PCT）。不是降钙素原",
  U_RBC_M: "显微镜下计数（个/HPF 或 /μL）。试纸法「尿潜血」用 U_BLD", U_WBC_M: "显微镜下计数。试纸法「尿白细胞」用 U_WBC",
  GA_PCT: "糖化白蛋白百分比（%）。报告里同时给出的 g/L 绝对值和白蛋白放 other_items / ALB",
  CAP: "FibroScan 受控衰减参数，反映肝脏脂肪；切点因设备而异，以报告为准", LSM: "FibroScan 肝脏硬度，反映纤维化；切点以报告为准",
  LPA: "脂蛋白(a)。报告单位有 mg/L 和 nmol/L 两种，不能直接换算：照报告原单位录入并带上报告的参考范围",
  FBG: "空腹血糖。面板写「随机」「非空腹」时用 GLU_RAND；餐后 2 小时 / OGTT 不要放这里",
  US_HEART: "心脏彩超的主结论（文字）。EF、E/A、E/E′ 等测值放 other_items 并保留单位；报告结论写「未见明显异常」但正文有舒张功能减低等提示时，结论里一并写出",
  GLU_RAND: "随机 / 非空腹血糖。空腹采血用 FBG；同一管血的血脂多半也非空腹（TG 会偏高）。字典不给参考范围：按报告印的范围录入",
  NEUT_PCT: "百分比。绝对值用 NEUT_ABS", LYMPH_PCT: "百分比。绝对值用 LYMPH_ABS", MONO_PCT: "百分比。绝对值用 MONO_ABS",
  EO_PCT: "百分比。绝对值用 EO_ABS", BASO_PCT: "百分比。绝对值用 BASO_ABS",
  NEUT_ABS: "绝对值。百分比用 NEUT_PCT", LYMPH_ABS: "绝对值。百分比用 LYMPH_PCT", MONO_ABS: "绝对值。百分比用 MONO_PCT",
  EO_ABS: "绝对值。百分比用 EO_PCT", BASO_ABS: "绝对值。百分比用 BASO_PCT",
  HBSAB: "阳性多为接种后的保护性抗体，不自动判异常；按报告结论传 flag",
};

/** 本身不分高低的测量项：没有报告范围或标记时不算「无法判定」 */
const MEASURE_ONLY = new Set(["HEIGHT", "WEIGHT", "WAIST", "HIP", "BODY_FAT", "VA_OD", "VA_OS"]);

/** 也常见、但不能直接换算的单位：Lp(a) 质量浓度 mg/L 与颗粒数 nmol/L 的换算因人而异 */
const ALT_UNITS: Record<string, string[]> = { LPA: ["nmol/L"] };

export const BUILTIN_CATALOG: CatalogEntry[] = ENTRIES.map((e) => ({
  ...e, name_en: NAME_EN[e.code], ...(NOTES[e.code] ? { note: NOTES[e.code] } : {}), ...(MEASURE_ONLY.has(e.code) ? { measure_only: true } : {}),
  ...(ALT_UNITS[e.code] ? { alt_units: ALT_UNITS[e.code] } : {}),
}));
