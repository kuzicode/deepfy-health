// 北京时间：服务器容器是 UTC，提醒、汇总邮件、后台列表都按用户所在时区显示

const shift = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString();

/** 北京时间的今天 YYYY-MM-DD */
export const todayCN = (now = new Date()) => shift(now).slice(0, 10);

/** 北京时间 YYYY-MM-DD HH:mm */
export const cnDateTime = (d: Date) => shift(d).slice(0, 16).replace("T", " ");
