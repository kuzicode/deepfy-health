// 运行版本：hosted 是官方托管（app.deepfy.si：邮箱验证码、Google、早鸟申请、额度、官网、协议、反馈、发信）；
// self 是自托管（只有邮箱 + 密码，首次访问创建管理员，没有上面这些线上专属功能）。
// 默认 hosted：官方实例的 .env 不用改；自托管由 scripts/selfhost-init.sh 写入 KZ_EDITION=self。
// 不读 node: 模块，proxy.ts 也能用。

export type Edition = "hosted" | "self";

export function edition(): Edition {
  const v = (process.env.KZ_EDITION ?? "").trim() || "hosted";
  if (v !== "hosted" && v !== "self") throw new Error(`KZ_EDITION 只能是 hosted 或 self，当前是 ${v}`);
  return v;
}

export const isHosted = () => edition() === "hosted";
export const isSelfHosted = () => edition() === "self";
