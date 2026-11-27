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

## 家庭知识库进度

- 家庭菜谱已支持网页与 MCP 录入、封面和 Obsidian 同步。`household_doc` 和 `household_attachment` 存放家庭文档与附件元数据，菜谱无需绑定成员。
- 家庭首页并列展示成员健康卡、近期提醒和最近更新的三道菜。中英文官网加入菜谱示例，`/kitchen` 提供完整列表。App 导航使用 `listMemberStubs()` 读取成员摘要。
- 后续计划包括结合成员健康情况查看菜谱、在界面中按栏目授权 Agent，以及新增保险栏目。

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

- lint 6 个警告（2026-11-28）：`computeFlag`、`latestReadings`、`checkupPlan`、`addRecordTool`、`TrendChart` 的圈复杂度，以及 PgRepository 测试的函数长度。
- knip 未用导出 1（`inviteHtml`）；jscpd 14 处小克隆，基本都是测试夹具（2026-11-09）。
