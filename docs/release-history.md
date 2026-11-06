---
last_updated: 2026-11-06
status: active
---

# Release history

Release notes from before this repository was public, moved from the now-archived `kuzicode/deepfy` repository. These versions have no tags here because the public history starts at one commit. Newer versions are on [GitHub Releases](https://github.com/kuzicode/deepfy-health/releases).

公开前的版本说明，从已归档的 `kuzicode/deepfy` 迁移而来。公开历史从一个提交开始，所以这些版本在本仓库没有 tag。之后的版本见 GitHub Releases。

## v0.18.4 · 2026-11-06

**中文**

- 加强注册和登录的安全：邮箱验证后，密码才生效；验证码不再明文保存，并限制每个邮箱的校验次数。注册和登录的操作不变。
- 日志照片不再留在浏览器缓存里。
- 隐私政策更新：说明报告日期和标题等检索用的元数据目前未加密，提醒邮件可能包含用药和补剂名称。

**English**

- Stronger sign-up and sign-in security: a password takes effect only after the email is verified, and verification codes are no longer stored in plain text and are limited per email. The steps you follow haven't changed.
- Log photos no longer stay in the browser cache.
- Privacy Policy update: lookup metadata such as report dates and titles is not yet encrypted, and reminder emails may include medication and supplement names.

## v0.18.3 · 2026-11-05

## 中文

- 邮件和暂停页按语言显示：验证码、邀请、提醒邮件都有完整英文版，账号语言在打开 App 时自动同步。
- 全站英文统一术语、拼写和单复数；手动记录的标题在英文界面显示为 “Daily log”。
- 官网区块标题在宽屏上显示成一行；记录框提示日常可以直接告诉 agent。
- 手机上家庭页的提醒行不再挤压正文，英文也不再撑出横向滚动；家庭卡片三列对齐。
- 修复：网页编辑用药时，还没测过的关联指标不再被清空。
- 修复：采纳过期的 agent 建议不再产生起止日期倒置的记录。带结束日期的建议要先确认日期，agent 写入倒置日期会被拒绝。

## English

- Emails and the pause page now follow your language: sign-in codes, invitations and reminders have full English versions. Your account language syncs when you open the app.
- English copy across the site now uses consistent terms, spelling and plurals. Manual entries show as "Daily log" in the English interface.
- Section titles on the website stay on one line on wide screens. The quick log box now mentions that you can simply tell your agent.
- On phones, reminder rows on the Family page no longer squeeze their text, and English no longer causes sideways scrolling. Family card columns line up.
- Fixed: editing medication on the web no longer clears linked markers that haven't been tested yet.
- Fixed: accepting an expired agent suggestion no longer creates an entry whose end date is before its start date. Suggestions with an end date now ask you to confirm it, and agent writes with reversed dates are rejected.

## v0.18.2 · 2026-11-05

## 中文

- 登录页新增「申请抢先体验」入口，填邮箱就能提交。
- Google 账号还没开通时，会直接进入申请表。之前只显示一行提示，没有地方提交申请。
- 已开通的邮箱不会进候补名单，页面会提示直接登录或创建账号。

## English

- The sign-in page now has a "Request early access" entry: enter your email and submit.
- If your Google account doesn't have access yet, you now go straight to the request form. Before, you only saw a message with nowhere to submit a request.
- Emails that already have access are no longer added to the waitlist. The page tells you to log in or create your account.

## v0.18.1 · 2026-11-05

## 中文

- 家庭页、家人切换器和个人页的「需关注」现在是同一个数字：最新结果异常的指标 + 未愈的已知状况。之前家庭页和切换器漏算了已知状况，所以比个人页少。
- 只有已知状况、还没有检测记录的家人，家庭页也会显示状况数，不再显示「—」。

## English

- The "To watch" number now matches on the family page, the member switcher and the member page: abnormal latest results plus unresolved known conditions. The family page and switcher previously left out known conditions, so they showed a lower number.
- Family members with known conditions but no records yet now show the condition count on the family page instead of "—".

## v0.18.0 · 2026-11-05

- 用药页可以添加、编辑、停用和删除了；也可以把处方或药盒拍给 agent，由它记下来。已停用的保留历史，默认折叠。
- 药物只记录医生开的或你明确在吃的。agent 可以解释用途、整理注意事项、提出该问医生的问题，不建议开始、停药、换药或改量。
- agent 可以结合档案建议常见补剂。建议单独列出，标着「agent 建议，非医嘱」，不进今日安排，你同意后才算开始吃。
- 拍下自己买的补剂，agent 可以记下品名、规格、用法和有效期。临近有效期时显示在用药页，并进入「接下来」和提醒邮件。
- 指标趋势图标出相关用药的开始和停用；概览页显示在用什么、今天几项；agent 分析指标时也能看到。
- 不知道具体钟点可以只写频率（如「每日 2 次」），也可以选按需。
- 修复：已停用的药不再一直显示逾期。
- agent 写入药物或在用补剂时必须带上你的原话或处方内容，显示在用药页上作为依据；每次写入都可在「Agent 接入」页还原。
- 服务条款和文档补充了 agent 建议补剂的说明。

---

- The medication page now lets you add, edit, stop and delete entries, or send a prescription or package photo to your agent to record. Stopped entries stay in the history, collapsed by default.
- Medication is recorded only as prescribed or as you say you take it. Your agent can explain what it's for, compile precautions and list questions for your doctor, but it doesn't suggest starting, stopping, switching or changing a dose.
- Your agent can suggest common supplements based on the profile. Suggestions are listed separately and labelled "Agent suggestion, not medical advice". They stay out of today's schedule until you agree.
- Send a photo of a supplement you bought and your agent can record its name, strength, directions and use-by date. Upcoming expiry shows on the medication page, in "Up next" and in reminder emails.
- Trend charts mark when related medication started and stopped. The overview shows what's being taken and how many today, and your agent sees this when analysing results.
- If you don't know exact times, enter a frequency such as "twice a day", or choose as needed.
- Fixed: stopped medication no longer shows as overdue.
- When your agent records medication or a supplement in use, it must include your words or the prescription text, shown on the medication page as the basis. Every write can be undone on the Agent page.
- The terms and docs now explain agent supplement suggestions.

## v0.17.8 · 2026-11-05

- 家人头像可以自己选了：建档时默认选好一张家里没人用的，也能换成别的；以后在家人概览页点头像就能更换，保存后家庭卡片和顶部菜单同步更新。头像跟档案走，导出和同步都会带上。
- 修复：内脏脂肪面积（VFA）99.5 被提前标为偏高，现在 100 才算偏高；内脏脂肪等级（VFL）同样处理（10 才算偏高）。范围显示为「< 100」。
- 过敏原 sIgE 刚好等于 0.35 时按 1 级阳性标为偏高（报告印了范围的仍按报告）。
- 备份恢复演练以备份自身为准：历史备份也能验，线上数据变化或旧附件已清理只提示，不算失败；同名附件内容不同仍算失败。新增 `--strict-live`，用于刚备份完时要求与线上完全一致。

---

- Family avatars are now yours to choose: when you add a family member, an avatar nobody else in the family uses is preselected, and you can pick another. Change it later by clicking the avatar on the member's overview; family cards and the top menu update right after saving. Avatars live in the profile, so exports and sync include them.
- Fixed: a visceral fat area (VFA) of 99.5 was flagged high too early; it now counts as high from 100. Visceral fat level (VFL) works the same way, high from 10. The range now displays as "< 100".
- An allergen sIgE of exactly 0.35 is now flagged high, as class 1 positive. Ranges printed on the report still take priority.
- The backup restore drill now judges a backup on its own contents, so older backups can be verified too. Live data changes or cleaned-up old attachments only produce a note; a same-named attachment with different content still fails. New `--strict-live` requires an exact match with production, for use right after a backup.

## v0.17.7 · 2026-11-05

- 家人也有头像了：「本人」用账号头像，其他家人各自固定分到一个，互不重复；已有的家人自动生效。
- 字典新增「内脏脂肪面积」（VFA，cm²），和「内脏脂肪等级」分开，不再用等级的范围判断面积。
- 修复：报告名称里带 % 时，从概览点进记录无法展开定位。
- 修复（review）：以前标题带「2026-01-02」这类日期的旧记录，agent 用新标题替换时会覆盖原记录，不再另起一条。
- 备份恢复演练逐个核对附件内容（校验和），不只数文件个数；每日备份同时记下附件校验和清单。
- 内部重构（不影响使用）：首页动画、登录页、成员概览、数据加载与同步拆成更小的模块；指标字典按类别分文件。

## v0.17.6 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 字典新增 37 项：常见过敏原 sIgE 19 项和总 IgE、人体成分（内脏脂肪等级、骨骼肌量、基础代谢率、腰臀比）、尿镜检与尿微量白蛋白、糖化白蛋白、α-羟丁酸脱氢酶、醛固酮 / 肾素、甲状旁腺激素、肝脏弹性检查、膀胱超声。过敏原现在可以画趋势、进入「需要关注」。
- 尿潜血「+/-」这类阴阳性结果，报告标了 ↑ 时显示为「异常」而不是「偏高」。
- 字典查找时完整名称优先。

## What's new

- 37 new dictionary entries: 19 common allergen sIgE tests plus total IgE, body composition, urine microscopy and albumin, glycated albumin, HBDH, aldosterone / renin, PTH, liver elastography and bladder ultrasound. Allergens now get trends and show under "Needs attention".
- Positive / negative results like urine blood "+/-" show as "Abnormal" instead of "High".
- Dictionary lookup prefers full-name matches.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.17.5 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 「调养方案」改名为「健康计划」，统一成 5 部分精简写法：现在的情况、饮食与生活、复查（重点）、及时就医、目标。agent 写计划时也按这个格式，写得过长会被提醒精简。
- 概览「需要关注」下方列出报告标了异常、但字典暂未收录的项目（如过敏原），点一下打开对应记录。
- 官网点头像弹出账号菜单（进入 App、设置、邮件提醒、意见反馈、退出登录）；App 左上角显示完整的 Deepfy 字标。
- 修复：数据校验误报（心率单位、脂蛋白(a) 单位）；心率不同写法的历史点不再从趋势里丢失；随机血糖没有报告范围时显示「无法判定」。

## What's new

- "Care plan" is now "Health plan", written in a short 5-part format: current situation, diet & lifestyle, rechecks (the key part), when to see a doctor, goals. Agents follow the same format and are nudged to shorten long plans.
- The overview now lists report-flagged items that aren't in our dictionary yet (e.g. allergens), each linking to its record.
- Clicking your avatar on the website opens the account menu; the App header shows the full Deepfy wordmark.
- Fixed: false unit warnings (heart rate, Lp(a)); heart-rate history no longer drops points; random glucose without a report range shows as undetermined.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.17.4 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 「冠脉钙化」「动脉硬化」等病情会关联到血脂和心电图检查，概览会提示还缺哪些检查。
- 复制给 agent 的病情分析请求里，没有对应指标时改为请 agent 结合档案选定。

## What's new

- Conditions like coronary calcification or atherosclerosis now link to lipid and ECG checks, so the overview shows what's missing.
- The condition analysis prompt no longer shows a bare dash when no markers are linked.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.17.3 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 字典新增「随机血糖」和「心脏超声」：随机 / 非空腹血糖不再记成空腹血糖，趋势不混在一起。
- 「其他项目」（如过敏原 sIgE）里的异常计入记录的异常数，agent 读概览时也能看到。
- agent 录入规则补充：只有全面体检才算「体检」（单项彩超、化验不会顶替年度体检提醒）；检查结论照抄报告原话；标题不写日期；症状记成带日期的日志；看不清的截图逐张说明；写完提示还缺的检查。
- 「糖调节异常」等说法会关联到血糖相关检查。

## What's new

- New dictionary entries for random glucose and echocardiography, so random glucose no longer mixes with fasting glucose.
- Abnormal results among "other items" (e.g. allergen sIgE) now count toward a record's abnormal total and show up for agents.
- Clearer rules for agents: only full checkups count as "checkup"; copy exam conclusions verbatim; no dates in titles; symptoms go to dated log entries; report unreadable images one by one; suggest missing checks afterwards.
- Conditions like "impaired glucose regulation" now link to glucose checks.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.17.2 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 修复：心电图、CT、超声等较长的文字结论，在指标页「历次结果」里会把日期和机构名挤成竖排；「最新结果」右侧留出大片空白。现在结论会自动换行、按整行宽度显示。记录页、指标浏览和「其他项目」列表一并修复。

## What's new

- Fixed: long text results (ECG, CT, ultrasound) squeezed the date and clinic name into a narrow column under "History", and left a large gap in "Latest result". They now wrap and use the full width — also fixed on the Records page, the indicator list and "Other items".

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.17.1 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 修复：从设置页退出登录、注销账号或登录过期后，官网右上角仍显示头像的问题。

## What's new

- Fixed: the website kept showing your avatar after signing out from Settings, deleting your account, or when your session expired.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.17.0 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 官网也显示登录状态：登录后右上角换成你的头像和「进入 App」。
- 新的预设头像「暖柔健康」：注册时随机分配一个，可在「设置 → 头像」里更换；已有账号进入 App 时自动分配。
- 首页新增「为什么用 Deepfy」：对比直接用 agent 和接入 Deepfy 的 agent 在记忆、资料、知识库、持续、主动、可控上的差别。
- 首页顺序与导航调整：为什么用 Deepfy · Agent 接入 · 场景 · 隐私安全 · 文档。
- 手机上官网页脚可以切换中英文。
- 高海拔出行示例改为更严谨的说法：常规检查不能单独判断高原风险。

## What's new

- The website now shows when you're signed in: your avatar and "Open app" appear in the top right.
- New preset avatars: one is picked at random when you sign up, and you can change it under Settings → Avatar. Existing accounts get one automatically.
- New "Why Deepfy" section comparing an agent on its own with an agent connected to Deepfy: memory, input, knowledge, continuity, reminders and control.
- Reordered homepage and navigation: Why Deepfy · Agents · Use cases · Privacy · Docs.
- Switch language from the site footer on phones.
- The high-altitude example now says routine checkups alone can't tell your altitude risk.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.16.3 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 手机上官网顶部导航新增「文档」入口。

## What's new

- The site's mobile navigation now has a Docs link.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.16.2 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 文档页新增「复制为 Markdown」：整页文档连同一段给 agent 的说明一起复制，发给你的 agent，它会一步步带你注册、建档和接入。
- 官网页脚精简：品牌、宣传语和 GitHub；底部只保留版本发布、意见反馈、服务协议、隐私政策。
- 修复：手机上文档页出现横向滚动。

## What's new

- "Copy as Markdown" on the Docs page: copies the whole guide plus a short note for your agent, so it can walk you through signing up, adding profiles and connecting.
- Simpler site footer: brand, tagline and GitHub, with just Releases, Feedback, Terms and Privacy below.
- Fixed: the Docs page scrolled sideways on phones.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.16.1 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 首页新增「问问你的 Agent」：饮食运动、出行、家人复查、看医生前、记一笔、录报告 6 个对话场景，一眼看出 Deepfy 能帮你做什么（示例人物为虚构）。
- 「工作方式」重做：交给 Agent → 云端健康档案 → 追踪与邮件提醒（附提醒邮件样例）。
- 首页顺序调整为：场景 → Agent 接入 → 工作方式 → 隐私安全。

## What's new

- New "Ask your agent" section on the homepage: six example conversations — diet & exercise, travel, family rechecks, before the doctor, quick log, adding a report (example people are fictional).
- Redesigned "How it works": hand it to your agent → cloud health record → tracking & email reminders (with a sample reminder email).
- Homepage order is now: use cases → agents → how it works → privacy.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.

## v0.16.0 · 2026-11-04

测试版本（内测期间）。正式版从 v1.0 开始。 · Beta release — the stable line starts at v1.0.

## 本版更新

- 新宣传语：「构建你的健康云档案，让 Agent 读懂你。」
- 新增文档页（官网和 App 顶栏的「文档」）：快速上手、接入 Agent（一句话接入与 Claude Code / Codex / 通用 JSON 配置）、各部分简介、数据与隐私。
- 官网页脚重做；意见反馈统一在 App 内提交（头像菜单 →「意见反馈」）。
- 服务协议与隐私政策页面显示更新日期。

## 目前已有

- **家庭档案**：为每位家人建档（昵称、关系、出生日期或大概年龄），体检、化验、病历、日志（可带照片）。
- **指标与分析**：异常项汇总、历次数值与参考范围趋势。
- **复查与提醒**：自动排复查计划（已查 / 免查、逾期顺延），到期前邮件提醒，可随时暂停。
- **接入 Agent（MCP）**：只读或可写入的 token；agent 的每次写入都有记录，可一键还原。
- **数据**：服务器加密存储（AES-256-GCM，每个账号独立密钥），随时完整导出，删除账号即删除数据。
- **内测免费额度**：6 位家人、500 MB 附件、3 个 Agent token。

## What's new

- New tagline in Chinese; the English one stays "Built for your health. Read by your agents."
- New Docs page (Docs in the site and App header): quick start, connecting an agent (one-line setup plus Claude Code / Codex / generic JSON), what's in the App, data & privacy.
- Redesigned site footer; feedback now goes through the App only (avatar menu → Feedback).
- Terms and Privacy pages show their last-updated date.

---

反馈请在 App 内提交，不要在 GitHub 公开任何健康信息。 · Please send feedback from the App and never post health information on GitHub.
