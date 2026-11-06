/** 项目名称归一化：NFKC（全角转半角）、去空白、括号统一、小写——字典查找与缺口反馈去重共用 */
export const normName = (v: string) =>
  v.normalize("NFKC").replace(/\s+/g, "").replace(/[（【]/g, "(").replace(/[）】]/g, ")").toLowerCase();
