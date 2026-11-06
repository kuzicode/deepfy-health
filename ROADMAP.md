---
last_updated: 2026-11-06
status: active
---

# Deepfy Health — 路线图

> 想认领就在对应 Issue 里说一声。已发布的内容见 `CHANGELOG.md`，踩坑记录见 `docs/issues.md`。跨文件的改动先在 Issue 或 PR 描述里写清问题、方案、影响文件和验收（WF1）。

## 适合入手

| 方向 | 说明 |
|---|---|
| 指标字典 | 候选：动态心电、胃肠镜、钼靶、有毒元素、胃蛋白酶原、EBV。要求见 `CONTRIBUTING.md` |
| agent 兼容性 | 实测各家 agent 接入 `/mcp`，记录配置方式；WorkBuddy、Hermes Agent 还没测 |
| 多语言 | `messages/` 补充和校对 |
| 网页导入 | 现在导入自托管实例要用 `kzh push`，可以在设置页直接上传导出的 zip（注意大小限制、校验和账号隔离） |
| 趋势图时间轴 | X 轴现在按类目等距，改成按真实时间比例 |
| 登录后回到原页面 | 未登录入口登录后回到原目标页，现在回 App 首页 |

## 进行中和计划

| 优先级 | 事项 | 说明 |
|---|---|---|
| 高 | MCP 上传附件（M3.4） | 报告原件可追溯，字典更新后可重新映射 |
| 中 | 成员范围授权 / 家庭共享 | token 只授权部分家人；家人各自登录查看 |
| 中 | 个人主页其他板块云端同步 | 兴趣爱好、保险配置目前只在本地 vault |
| 低 | 病情状态字段 | conditions 增加确诊 / 待诊 / 自述状态，替代写在括号里的说明 |
| 低 | 日历订阅 | 提醒增加 .ics |
| 待定 | MCP OAuth 网页连接器（M3.3） | 暂不提前 |

## 暂不做

站内 AI 分析（靠用户自己的 agent）；药品库和相互作用库、用药打卡。

## 技术债基线

- lint 13 个警告，多为单函数复杂度 11–18（`computeFlag`、`latestReadings`、`checkupPlan`、`mergeChange`、`applyChanges`、`addRecordTool`、`TrendChart` 等），改到时顺手拆，不要增加。
- knip 未用导出 0；jscpd 4 处小克隆（路由限速、测试夹具），未到第三处不抽。
