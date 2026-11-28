---
last_updated: 2026-11-28
status: active
---

# Deepfy 家庭知识库 — 路线图

> 想认领就在对应 Issue 里说一声。已发布的内容见 `CHANGELOG.md`，踩坑记录见 `docs/issues.md`。跨文件的改动先在 Issue 或 PR 描述里写清问题、方案、影响文件和验收（WF1）。

## 适合入手

| 方向 | 说明 |
|---|---|
| 指标字典 | 候选：动态心电、胃肠镜、钼靶、有毒元素、胃蛋白酶原、EBV。要求见 `.github/CONTRIBUTING.md` |
| agent 兼容性 | 实测各家 agent 接入 `/mcp`，记录配置方式；WorkBuddy、Hermes Agent 还没测 |
| 多语言 | `messages/` 补充和校对 |
| 网页导入 | 现在导入自托管实例要用 `kzh push`，可以在设置页直接上传导出的 zip（注意大小限制、校验和账号隔离） |
| 趋势图时间轴 | X 轴现在按类目等距，改成按真实时间比例 |
| 登录后回到原页面 | 未登录入口登录后回到原目标页，现在回 App 首页 |

## v0.23.0 已交付

- 菜谱支持网页与 MCP 录入，以及 Obsidian 双向同步。在菜谱页选定成员后，可查看基于该成员健康档案的饮食适配提示。
- Agent 接入页支持按栏目授权 Token，可选择全部栏目、仅健康或仅菜谱。MCP 附件上传支持通过 `upload_recipe_image` 保存菜谱封面。
- `/insurance` 汇总各成员的保单，支持在线编辑与 Obsidian 同步。续保日期会进入日程和提醒，Agent 可通过 `get_insurance` 查询。
- 首页并列展示成员健康卡、近期提醒和最近更新的三道菜，`/kitchen` 提供完整菜谱列表。

## 进行中和计划

| 优先级 | 事项 | 说明 |
|---|---|---|
| 中 | 成员范围授权 / 家庭共享 | token 只授权部分家人；家人各自登录查看 |
| 中 | 个人主页其他板块云端同步 | 扩展兴趣爱好等其余板块的同步范围 |
| 低 | 病情状态字段 | conditions 增加确诊 / 待诊 / 自述状态，替代写在括号里的说明 |
| 低 | 日历订阅 | 提醒增加 .ics |
| 待定 | MCP OAuth 网页连接器（M3.3） | 暂不提前 |

## 暂不做

站内 AI 分析（靠用户自己的 agent）；药品库和相互作用库、用药打卡。

## 技术债基线

- lint 6 个警告（2026-11-28）：`computeFlag`、`latestReadings`、`checkupPlan`、`addRecordTool`、`TrendChart` 的圈复杂度，以及 PgRepository 测试的函数长度。
- knip 未用导出 1（`inviteHtml`）；jscpd 14 处小克隆，基本都是测试夹具（2026-11-09）。
