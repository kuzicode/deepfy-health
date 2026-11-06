---
last_updated: 2026-11-06
status: active
---

# 问题记录 — 历史归档

> 本文件是 `issues.md` 的历史归档，存放已归档的 resolved 条目。
> **新会话默认不读此文件**，仅在按 ID 追溯历史问题时打开。
> 活跃问题与完整索引见 [issues.md](./issues.md)。

---

<!-- issues.md 正文超阈值后，将最旧的 resolved 条目整体迁入此处，保留原始内容；issues.md 索引表中位置改为 archive。 -->

## ISS-010 · 概览把「没有可判定指标」显示成「没有异常」✅ 2026-11-03

- 现象：报告只有一个标了 H 的其他项目时，汇总三个计数都是 0，概览仍显示「各项指标的最新结果都没有异常」。
- 修复：没有判为正常的项目时显示「还没有可以判定高低的指标」；有其他项目时在「需要关注」下注明「另有 N 项其他项目未纳入上面的判断，其中 M 项报告标了异常」并链接到记录页（`emptyKey`、`OtherItemsNote`，`app/(app)/m/[id]/page.tsx`）。
- 经验：「0 异常」不等于「正常」——任何汇总文案都要区分「判定为正常」和「没有可判定的数据」（同类：ISS-009 的记录页「全部正常」）。（已升级 → docs/conventions.md「健康数据展示」）

## ISS-009 · 0.11 未部署改动的 code review（a100adf..c8b6ee9）✅ 2026-11-03

- P1 改名只校验长度：读取时 `FamilyMemberSchema` 不允许换行与 `[ ] | # ^`，写入却放行——一旦存进去，每次 `exportRaw` 都解析失败，整个账号的页面与 MCP 都打不开，也无法在网页改回。修复：`renameMember` 用同一条名字规则校验。
- P1 检查结论整句匹配过严：「正常心电图」「窦性心律，正常心电图」被判 A。修复：按标点切段、每段都是正常结论才判 N，并补常见正常写法；「窦性心律，ST-T 改变」仍为 A（ISS-008 的回归不变）。逻辑抽成 `textFlag`。
- 记录页只有纯测量项时误显示「全部正常」→ 只在确有判为正常的项目时显示。
- `list_records` 的 items 不含其他项目 → 计入并返回 `other_items` 数。
- 缺口反馈：用 `FeedbackItems` 统一校验（去空格）；一条多行 upsert（一次往返、不会部分计数）；同一账号同一份报告只计一次（进程内）；时间只记到月；读记录改为只解密那一份（`getDoc`）；改名也只读档案那一份。
- 未改：自定义指标没有范围时计为「无法判定」是有意为之（之前会被当成纯测量项吞掉报告标记，见 ISS-008）；需要时在 indicators.yaml 设 `measure_only: true`。
- 经验：任何写入路径都要用读取时同一套 schema 校验，否则「能写不能读」会让整个账号不可用。

## ISS-008 · 检查结论误判正常、纯测量过滤吞掉异常、只有其他项目无法保存✅ 2026-11-03

- P1 文字结论误判：检查结论沿用化验定性的前缀匹配，「窦性心律，ST-T改变」因以「窦性心律」开头被判 N。修复：字典条目新增 `normal_match`，检查结论类为 `exact`——整句（去掉结尾标点）等于正常词才判 N，否则为 A；化验定性结果仍按前缀。
- P1 纯测量过滤隐藏异常：`measureOnly` 把所有无默认范围的项目都当纯测量，MPV=15 flag=H 被过滤。修复：字典条目新增 `measure_only`，只有身高、体重、腰围、臀围、体脂、视力标记为纯测量；且有任何 flag 或范围时一律不过滤。
- P2 只有 other_items 的报告被拒：schema 与 MCP 参数要求 indicators 至少一项。修复：indicators 可为空，改为「indicators + other_items 合计至少一项」；记录页项数包含其他项目，空指标时不显示「全部正常」。
- 测试：analysis.test.ts 三项回归（含审查里的最小复现），write-tools.test.ts 只有其他项目的保存。

## ISS-007 · MCP 写入并发与报告替换✅ 2026-11-03

- P1 并发更新覆盖未修改字段：`update_profile` / `add_measurements`（以及网页「编辑档案」「身体数据」）在事务外读取再整份写回，两个请求同时改不同字段时后者覆盖前者。
- P1 并发首次写入后还原误删：两个请求同时写一份尚不存在的笔记 / 方案，`SELECT … FOR UPDATE` 都读不到旧行，后者的修改记录 `prev=null`，还原它会删掉整份文档。
- 修复：同一账号的所有写入（`applyChanges`、`importRaw`、`revertAgentChange`）先取事务级 advisory lock（`pg_advisory_xact_lock(hashtext('kzh-write:<userId>'))`）；`applyChanges` 接受函数，在锁内读取最新数据再计算改动。写入被串行化后，后一个请求能读到前一个的结果，修改记录里的旧内容也正确。修改记录的 `createdAt` 改为锁内时间，保证「新到旧」顺序与实际写入一致。
- P2 `add_record(replace=true)` 清空附件：`recordDoc` 固定写 `attachments: []` → 替换时继承原记录的附件和备注。
- 测试：`write-tools.test.ts`「并发写入与替换」3 项；去掉锁后两项并发测试 3 次运行全部失败，加锁后通过。

## ISS-006 · 快速记录写入：并发覆盖、kzh 漏传日志照片、删日志误删共享附件✅ 2026-11-03

- P1 并发新增日志静默覆盖：日志 key 在事务外按快照算出，两个请求拿到同一个 key 后 upsert 互相覆盖；照片路径由 key 推出，也会互相覆盖，回滚时还可能删掉对方的照片。修复：`applyChanges` 新增 `create`（`onConflictDoNothing`，key 被占用抛 `KeyTaken`，`addLogAction` 换下一个编号重试，最多 5 次）；照片路径改成 `attachments/logs/<日期>-<随机>.<ext>`，与 key 无关。
- P2 `kzh push` 漏传日志照片：`localAttachments` 只收集 record 的附件 → 改为 record + log。
- P2 删除日志误删共享附件：删除时直接删掉它引用的全部附件 → 改为在合并改动后检查同一成员的其余文档，只删除已经没有引用的。
- 测试：`pg-repository.test.ts`（create 冲突、并发竞争、共享附件），`sync.test.ts`（日志照片收集）。

## ISS-005 · 登录查询期间改邮箱导致分流错配✅ 2026-11-03

- 现象：点「继续」后邮箱框仍可编辑；查询 A 时改成 B，页面按 A 分流、验证码发给 A，后续却用 B 提交。
- 修复：查询期间输入框只读；记下请求时的邮箱，响应返回时若当前邮箱已变化就丢弃结果；验证码发给请求时的邮箱（`app/login/LoginView.tsx` `lookup`）。
- 同批：只用 Google 的账号没有设置密码的入口 → 登录页「设置密码」+ 设置页密码区。

## ISS-004 — 云端数据被当作可信输入（路径、HTML）等 6 项 [resolved]

- **日期**：2026-11-03
- **现象**：① 记录 key 为 `../../../../escaped` 时 `kzh pull` 写到 Personal 之外；② pull 默认直接覆盖本地附件且不报冲突；③ 笔记里的 `<img onerror>` 原样渲染进登录后的页面；④ `*.cloud.md` 冲突副本放在 records/ 下，被当成第 4 条记录参与计算与推送；⑤ 附件更新后立即删除旧文件，备份（先 pg_dump 后打包）可能缺文件；⑥ 后台按表单里的 email 判断目标是否管理员，可被篡改
- **根因**：把"来自自己的 vault / 云端"当成信任边界；key 只限制长度；冲突策略只覆盖了 Markdown；渲染 Markdown 未清洗；删除与备份顺序没有协调；服务端信任客户端字段
- **方案**：`isSafeDocKey` 在导入接口、校验组装、本地读取三处校验；`planPull` 先规划并确认全部路径在目标目录内再写，冲突（含附件）统一放 `_conflicts/<时间>/`（加载器忽略 `_` 目录）；`renderMarkdown` 用 sanitize-html 白名单清洗；附件改为延迟 48 小时清理（`gcOrphanAttachments`）；`disableTarget` 按 userId 查库。各项都有回归测试
- **经验**：导入数据与云端数据一律不可信——拼路径前校验并确认落在目标目录内，渲染前清洗；冲突策略要覆盖所有数据类型；服务端从不信任表单里的身份字段（已升级 → AGENTS.md SEC6）

## ISS-003 — 校验命令接管道掩盖失败 [resolved]

- **日期**：2026-11-02
- **现象**：`nginx -t` 失败后，reload 仍被执行。
- **根因**：`nginx -t 2>&1 | tail -1 && reload` 中，管道返回的是 `tail` 的退出码。
- **方案**：写成 `if sudo nginx -t; then reload; fi`。
- **经验**：校验和后续动作之间不要接管道。

## ISS-002 — Codex 复核：目录大小写冲突与两处修复遗漏 [resolved]

- **日期**：2026-11-02
- **现象**：① 已有目录 `KZ`，新增 `id=other, dir=kz` 成功，other 读到了 kz 的档案和 3 条记录（仅报 id 不一致，数据照常返回）；② 5 mmol/L → 100 mg/dL 仍输出 `previous: 5` 和升降箭头；③ 摘要页对未判定结果仍显示"没有异常"
- **根因**：目录查重区分大小写，而 macOS 文件系统不区分；已存在的文件被"跳过"后照样登记新成员；loader 在 id 不一致时仍返回数据；`previous` 未比较单位；摘要页没复用 `summarize`
- **方案**：`assertNoConflict` 不区分大小写查重，目标目录已有 `Health/` 一律拒绝；loader 遇到 id 不一致报错并不加载该目录数据；`previous` 只取同单位的值；摘要页用 `summarize` 显示未判定数量。均有回归测试
- **经验**：修一类问题时要把同一判断的所有出口一起改（记录页修了、摘要页漏了）；文件系统相关的唯一性检查要按"不区分大小写"做

## ISS-001 — Codex review：建档写盘与指标判定的 5 个边界问题 [resolved]

- **日期**：2026-11-02
- **现象**：① `init-member ../../escaped` 写到目录外并写坏 family.yaml，之后所有成员加载为 0；② FBG=100 mg/dL 被拿去和 3.9–6.1 mmol/L 比较标为偏高，趋势图混入不同单位；③ `2026-99-99` 通过校验后让提醒计算抛 Invalid time value；④ 名字 `Test: Person` 生成的 profile 无法解析；⑤ 无参考范围（未判定）的记录显示"全部正常"，无记录时显示"没有异常"
- **根因**：写盘前只校验已有 family，没校验新输入，也没限制路径；`effectiveRange` 不看单位；日期只校验字符串形状；模板用字符串拼接 YAML；页面把"非异常"等同于"正常"
- **方案**：`planMember` 先生成并校验全部内容（FamilyMemberSchema、ProfileSchema、路径必须在 root 内）再写盘；`unitsComparable` 控制默认范围回退，`series` 只保留最新单位的点；`isoDate` 增加真实日历日期校验，时间限定 00:00–23:59；模板改为 `YAML.stringify`；新增 `summarize`，页面区分异常 / 未判定 / 正常 / 无记录。各项均有回归测试
- **经验**：写外部数据前做全量校验、全部通过才落盘；跨单位的数值不比较，宁可"未判定"也不误判（已升级 → AGENTS.md DATA5 / DATA6）
