# Atoms Demo 设计文档

> 版本：v0.4
> 日期：2026-05-30
> 背景：ROOT 全栈岗位笔试 —— 完成一个可运行的 Atoms Demo

---

## 0. 项目定位

实现一个 **Atoms.dev 风格的 AI 多智能体应用工厂**：用户用自然语言描述创意，一支带角色分工的 AI 团队协作产出可见结果。

本 Demo 不追求与 Atoms 官方 1:1 对齐，聚焦能讲清楚其差异化价值的功能切片：**多 Agent 角色化协作 + Mode 切换（含 Race Mode 多模型并排对比） + 项目/会话持久化**。

### 0.1 笔试硬性要求（必须满足）

| 项 | 要求 |
|---|---|
| **真实交互** | 非纯静态展示 |
| **数据持久化** | 不限技术方案 |
| **基本使用流程** | 初始化 / 注册 / 核心主流程 |
| **至少一个延展能力** | 在基础之上的扩展 |
| **可测试在线访问链接** | 公网部署 |
| **公开 GitHub 源码** | repo 设为 public |
| **说明文档** | 实现思路 / 取舍 / 完成度 / 后续扩展 |

### 0.2 已对齐的设计约束

| 项 | 选择 |
|---|---|
| 技术栈 | Next.js (App Router) 全栈 |
| LLM 策略 | Mock + 真实 API 双轨（默认 Mock，配置 Key 后切真实） |
| 数据库 | 开发 SQLite，部署 Postgres |
| LLM 代理 | NewAPI 风格代理 `https://mynewapi.n1neman.fun`，同一 key 同时支持 OpenAI / Anthropic 协议 |
| 多语言 | 中文 + 英文（i18n） |
| Agent 角色名 | 照搬 Atoms：Mike / Emma / Bob / Alex / David / Iris / Sarah |

### 0.3 设计原则

1. **基础功能必须全部完成且可用**，扩展功能从优先级高的依次添加
2. **部署链路尽早打通**，不到最后才上线
3. **每个扩展功能与基础功能解耦**，砍掉任一扩展不破坏基础
4. **Mock Provider 始终可用**，真实 API 是增强而非必需

---

## 1. 基础功能（MUST，必做）

> 满足笔试硬性要求所需的最小完整闭环。

### 1.1 用户系统
- 邮箱 + 密码注册 / 登录
- Session 持久化（HTTP-only Cookie）
- 登出
- 简单的用户菜单（显示昵称、邮箱）

### 1.2 项目（Project）管理
- 新建项目（一段初始 Prompt 创建）
- 项目列表（按更新时间倒序，仅显示自己的）
- 项目详情页
- 重命名 / 删除项目

### 1.3 对话与流式输出（核心交互）
- 用户在项目内输入 Prompt
- 服务端流式（SSE）回写 AI 响应
- 消息持久化（按时间序）
- 进入项目自动恢复历史对话
- 中止生成（Stop 按钮）

### 1.4 AI Agent 角色化（核心叙事的最简版）
- 至少 3 个角色：**Mike（团队领导）**、**Emma（产品经理）**、**Alex（工程师）**
- 用户的一次提问 → Mike 先发分派消息，再串行调度 Emma → Alex
- 每条消息携带 `agent` 字段，UI 用头像 + 颜色区分
- 调度策略 v1：固定串行（Mike → Emma → Alex），不做关键词路由

### 1.5 数据持久化
- 用户、项目、会话、消息全部入库
- 开发期 SQLite（仓库带 `dev.db`，零配置）
- 部署期 Postgres（Neon / Vercel Postgres）
- 用 Prisma 管理 schema 与迁移

### 1.6 部署与交付
- 公网可访问（默认 Vercel）
- GitHub repo public
- README 含：项目简介、本地运行步骤、`.env` 模板、技术栈、在线 demo 链接
- 说明文档（可放 `docs/REPORT.md`）：实现思路、关键取舍、完成度、未来扩展优先级

### 1.7 多语言（i18n 中英）
- 全局语言切换：中文 / 英文
- **切换方式：Cookie 持久化**（不走 URL 前缀 `/zh` / `/en`；保持路由结构简单）
- **范围（v1）：仅 UI 字典**（导航、按钮、表单标签、状态文案等）
- Agent 系统提示与角色描述 v1 **暂保留中文**，不双语化
- 用户 locale 持久化到数据库（`User.locale`），未登录用走 Cookie
- 实现：`next-intl` + `messages/zh.json` + `messages/en.json`
- **后续升级路径**：① Agent 系统提示双语化  ② URL 前缀路由（更利于 SEO）

---

## 2. 扩展功能（按重要程度排序，Atoms 原生具备）

> 完成基础后按优先级依次添加。**每一项独立，删任意一项不影响其它**。

### 2.1 Mode 切换 + Race Mode【最高优先级，Atoms 最有辨识度的功能】
- 输入框左下角的 Mode Switch：Engineer / Team / Race / Deep Research
- **Engineer Mode**：仅调度 Alex
- **Team Mode**：基础功能 1.4 已覆盖
- **Race Mode**：同一 Prompt 并行跑 2–4 个候选
  - **可用模型清单** 由环境变量 `RACE_AVAILABLE_MODELS` 维护（运维侧决定提供哪几家）
  - 用户每次进入 Race Mode → 弹出多选 UI → 从可用清单勾选 2-4 个 → 提交
  - 选中的清单记入 `RaceRun.candidates`（持久化，便于回溯 / Replay）
  - 多列卡片并排流式渲染
  - "Pick this" 选定一个，其它标记 `discarded`
  - 中途可整体 Stop
  - **v1**：候选可全部用 Mock（不同性格脚本），便于 demo 上线即用
  - **v2**：env 里配真实模型，例如 `gpt-4o-mini,deepseek-chat,claude-haiku-4-5,grok-2-mini`
- **Deep Research Mode**：见 2.2

### 2.2 Deep Research 模式
- 由 **Iris**（深度研究员）独立产出
- 结构化报告（带 Section 标题、来源引用号）
- v1 仅 Markdown 渲染；后续支持一键导出 PDF / PPT

### 2.3 完整 Agent 团队
- 在 Mike/Emma/Alex 之上扩充：**Bob（架构师）**、**David（数据科学家）**、**Iris（深度研究员）**、**Sarah（SEO 专家）**
- 升级调度策略：关键词路由 → 后续可上 LLM tool calling

### 2.4 App Viewer（沙箱预览）
- 项目详情页右栏 iframe 沙箱
- Alex 产出的 HTML/JSX 字符串注入沙箱预览
- 桌面 / 移动两种 viewport 切换

### 2.5 Publish / Share
- 项目可 Publish 生成稳定公开链接（含 `slug`）
- 匿名访问者只读浏览
- Share 按钮复制链接 / 跳社交平台

### 2.6 Remix
- 在 Publish 后的项目页有 "Remix" 按钮
- 登录用户克隆该项目到自己的工作区继续迭代

### 2.7 App World（社区广场）
- 已 Publish 项目的聚合页
- 按热度 / 时间排序，支持搜索

### 2.8 Atoms Cloud 进阶（积分 / Wallet）
- 用户表 `credits` 字段（注册赠送）
- 每次生成按估算 token 扣减
- 余额不足拒绝请求
- 充值入口占位（无需真实支付）

### 2.9 集成生态
- **Supabase Connect**：替代自带后端做数据源
- **GitHub Connect**：把生成的代码导出到 GitHub repo
- **Stripe Connect**：项目内一键接支付能力

### 2.10 SEO Agent（Sarah）
- 项目发布前 Sarah 自动生成 meta / sitemap / SEO 描述
- 支持多语言 SEO 文案

### 2.11 Ads / Marketing Agent（Adrian）
- 自动生成 Google Ads / 社交媒体推广文案与素材

### 2.12 Prompt Polish
- 用户输入原始 Prompt → AI 先"精修" → 并排显示原版 vs 精修版
- 用户选择用哪一版提交
- 呼应 Atoms 官方"polish prompt 省积分"叙事

### 2.13 文件 / 文件夹上传
- 用户可在对话中上传图片 / 文档作为 Agent 的参考材料

### 2.14 Issue Report
- 项目内发现 bug 一键反馈，由 Alex 自动修复

---

## 3. 创新延展占位（Atoms 没有的方向，暂不考虑）

> 目前先不投入，留位置便于后续讨论是否加入。

- `TODO`：在用户体验或评估"创新性"维度上自创的独特功能
- `TODO`：跨项目能力 / 知识图谱 / 个性化记忆等方向
- `TODO`：可视化 Agent 协作时间线、Replay 重放等表达层创新

---

## 4. 模块技术栈

### 4.1 Web 框架与运行时

| 模块 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js 16 (App Router) | 全栈一体，原生流式响应 |
| 语言 | TypeScript 6 | 全栈类型安全 |
| 包管理 | pnpm | 速度快、空间省 |
| Node | Node.js 20 LTS 或 22 LTS | App Router 与 `ReadableStream` 行为稳定 |

### 4.2 UI 层

| 模块 | 选型 | 说明 |
|---|---|---|
| CSS | Tailwind CSS v4 | 主流、零配置 |
| 组件库 | shadcn/ui | 源码可改，无锁定 |
| 图标 | lucide-react | shadcn 默认搭配 |
| Markdown | react-markdown + remark-gfm | Agent 报告渲染 |
| 代码高亮 | shiki（按需） | Alex 输出代码块 |

### 4.3 状态与数据

| 模块 | 选型 | 说明 |
|---|---|---|
| 客户端状态 | Zustand | 轻量全局状态 |
| 服务端数据 | Server Components + Server Actions | 列表/详情走 RSC |
| 表单 | react-hook-form + zod | 注册/登录/重命名 |

### 4.4 数据库 & ORM

| 模块 | 选型 | 说明 |
|---|---|---|
| 开发 DB | SQLite（文件） | 本地零依赖 |
| 生产 DB | PostgreSQL（Neon） | 改 `DATABASE_URL` 切换 |
| ORM | Prisma 7（新 `prisma-client` generator） | 迁移、类型、Studio |

### 4.5 鉴权

| 模块 | 选型 | 说明 |
|---|---|---|
| Auth | Auth.js (NextAuth v5) Credentials Provider | MVP 仅账密 |
| 密码哈希 | bcryptjs | 纯 JS，无 native 编译 |
| Session | JWT in HTTP-only Cookie | Auth.js 默认 |

### 4.6 LLM Provider 抽象

| 模块 | 选型 | 说明 |
|---|---|---|
| 接口契约 | 自定义 `LLMProvider` 接口（`lib/llm/`） | `stream(messages, opts) → AsyncIterable<Chunk>` |
| Mock Provider | 内置脚本 + 节流 | 默认启用，零依赖、离线可跑 |
| OpenAI 协议适配 | `openai` SDK + 自定义 `baseURL` | 走代理 |
| Anthropic 协议适配 | `@anthropic-ai/sdk` + 自定义 `baseURL` | 走代理 |
| 代理地址 | `https://mynewapi.n1neman.fun` | NewAPI 风格，同一 key 兼容两种协议 |
| 选择策略 | 项目级 > 用户级 > 环境变量 | 三级回退 |

**协议 → 可承载模型族**（按代理后台实际可开通为准）：

| 协议路径 | SDK | 默认便宜模型 | 同协议下其它常用模型 |
|---|---|---|---|
| `/v1/chat/completions` | `openai` | `gpt-4o-mini` | DeepSeek（`deepseek-chat`）、Grok（`grok-2-mini`）、GPT 其它型号 |
| `/v1/messages` | `@anthropic-ai/sdk` | `claude-haiku-4-5` | Claude 其它型号 |

> DeepSeek 和 Grok 的官方 API 都兼容 OpenAI 格式，因此走同一条 SDK 路径；只需更换 `model` 参数即可。具体 model ID 字符串在开发期到代理后台核对。

### 4.7 Agent 编排

| 模块 | 选型 | 说明 |
|---|---|---|
| 编排实现 | 手写状态机（v1：固定串行） | 逻辑放 `lib/agents/orchestrator.ts` |
| Agent 定义 | 静态配置 `lib/agents/registry.ts` | 角色、prompt 模板、Mock 脚本 |
| Race 调度 | `Promise.all` + 多通道 SSE | 每个 candidate 一个 channelId |

### 4.8 流式传输

| 模块 | 选型 | 说明 |
|---|---|---|
| 传输 | Server-Sent Events (SSE) via Route Handler + ReadableStream | 简单、与 fetch 自然集成 |
| 客户端 | Vercel AI SDK (`ai` + `@ai-sdk/react`) | `useChat` / `useCompletion` |

### 4.9 校验与错误

| 模块 | 选型 |
|---|---|
| Schema 校验 | zod |
| 日志 | pino（服务端） |
| 错误边界 | Next.js `error.tsx` |

### 4.10 代码质量

| 模块 | 选型 |
|---|---|
| Lint | ESLint（Next.js 默认） |
| Format | Prettier + prettier-plugin-tailwindcss |

### 4.11 多语言（i18n）

| 模块 | 选型 | 说明 |
|---|---|---|
| 库 | next-intl | App Router 一等支持，文档完善 |
| 词典 | `messages/zh.json` + `messages/en.json` | 按 key 扁平结构 |
| 切换方式 | Cookie 持久化（默认）| URL 前缀方案作为可选升级 |
| 用户偏好 | `User.locale` 字段 | 登录态优先于 Cookie |

### 4.12 部署

| 模块 | 选型 | 说明 |
|---|---|---|
| Web | Vercel | Next.js 默认伴侣 |
| DB | Neon Postgres | Vercel 友好、免费额度足 |
| 域名 | Vercel 默认子域 | 自定义域名可选 |

---

## 5. 核心数据模型（Prisma schema 草案）

> 仅列字段意图，具体类型实现时落到 `schema.prisma`。

- **User**：`id, email(unique), passwordHash, name, locale(default 'zh'), credits(default 1000), createdAt`
- **Account / Session**：Auth.js 标准表（若用 JWT session 可省 Session 表）
- **Project**：`id, ownerId(→User), name, defaultMode, providerPref, createdAt, updatedAt`
- **Conversation**：`id, projectId(→Project), title, mode, createdAt`
- **Message**：`id, conversationId, role(user|assistant|system), agent(nullable), content, tokensIn, tokensOut, createdAt`
- **RaceRun**（扩展 2.1 启用）：`id, conversationId, prompt, status(running|done|stopped), pickedCandidateId, createdAt`
- **RaceCandidate**（扩展 2.1 启用）：`id, raceRunId, provider, model, content, status(streaming|done|discarded), tokensIn, tokensOut`

索引：`Project.ownerId`、`Message.conversationId+createdAt`、`RaceCandidate.raceRunId`。

---

## 6. 关键 API 路由约定

| 路径 | 方法 | 用途 | 阶段 |
|---|---|---|---|
| `/api/auth/[...nextauth]` | * | Auth.js | 基础 |
| `/api/projects` | GET/POST | 项目列表 / 新建 | 基础 |
| `/api/projects/:id` | GET/PATCH/DELETE | 详情 / 改名 / 删 | 基础 |
| `/api/chat` | POST (SSE) | 单 Agent / Team 流式对话 | 基础 |
| `/api/race` | POST (SSE multi-channel) | Race 并行对话 | 扩展 2.1 |
| `/api/race/:id/pick` | POST | 选择某个 candidate | 扩展 2.1 |
| `/api/projects/:id/publish` | POST | 发布项目 | 扩展 2.5 |
| `/api/projects/:slug/remix` | POST | 克隆项目 | 扩展 2.6 |

---

## 7. 建议目录结构

```
D:\Atoms_Demo\
├── docs/
│   ├── SPEC.md                  # 本文件
│   └── REPORT.md                # 提交时的说明文档（实现思路/取舍/完成度）
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
│   └── avatars/                 # Agent 头像
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/login, signup
│   │   ├── (app)/projects, projects/[id]
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]
│   │   │   ├── chat/route.ts    # 主对话 SSE
│   │   │   └── race/route.ts    # Race 并行 SSE
│   │   ├── layout.tsx
│   │   └── page.tsx             # 落地页
│   ├── components/              # UI 组件（含 shadcn 派生）
│   ├── lib/
│   │   ├── auth/                # Auth.js 配置
│   │   ├── db/                  # Prisma client
│   │   ├── llm/                 # Provider 抽象 + 实现
│   │   │   ├── types.ts
│   │   │   ├── mock.ts
│   │   │   ├── anthropic.ts
│   │   │   └── index.ts         # 工厂
│   │   └── agents/              # Agent 注册表 + 编排器
│   │       ├── registry.ts
│   │       ├── orchestrator.ts
│   │       └── prompts/
│   ├── stores/                  # Zustand
│   └── types/
├── .env.example
├── .env.local                   # gitignored
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 8. 开发环境需求

### 8.1 必装
| 工具 | 版本 | 备注 |
|---|---|---|
| Node.js | 20 LTS 或 22 LTS | 推荐 nvm-windows 或 fnm |
| pnpm | 9+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| Git | 任意近版 | |
| VS Code | 任意近版 | |

### 8.2 推荐 VS Code 插件
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Prisma

### 8.3 数据库
| 阶段 | 方案 |
|---|---|
| 本地开发 | SQLite（仓库带 `dev.db`） |
| 生产部署 | Neon Postgres（免费档） |

### 8.4 环境变量（`.env.local`）

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_URL="http://localhost:3000"

# LLM 代理（NewAPI 风格，同一 key 兼容 OpenAI 与 Anthropic 协议）
# 真实 key 仅写入本文件，绝不 commit；本文件已在 .gitignore
# OpenAI SDK 的 baseURL 需包含 /v1；Anthropic SDK 的 baseURL 不需要
OPENAI_API_KEY=
OPENAI_BASE_URL="https://mynewapi.n1neman.fun/v1"
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL="https://mynewapi.n1neman.fun"

# 默认 Provider 与默认模型（"暂时用便宜的"）
DEFAULT_PROVIDER="mock"            # mock | openai | anthropic
DEFAULT_OPENAI_MODEL="gpt-4o-mini"
DEFAULT_ANTHROPIC_MODEL="claude-haiku-4-5"

# Race Mode 可用候选清单（逗号分隔，model ID 需在代理后台确认实际可用）
# 示例：gpt-4o-mini,deepseek-chat,claude-haiku-4-5,grok-2-mini
RACE_AVAILABLE_MODELS=""
```

### 8.5 Windows 注意事项
- 推荐 PowerShell 7+
- 用 bcryptjs 而非 bcrypt，避免 node-gyp / VS Build Tools 依赖
- Prisma 路径勿含中文 / 空格（`D:\Atoms_Demo` OK）

### 8.6 一次性初始化命令清单
> 记录用，实际执行留到开发阶段。
1. `pnpm create next-app@latest .`（TS / App Router / Tailwind / ESLint 全 yes）
2. `pnpm add prisma @prisma/client bcryptjs zod zustand`
3. `pnpm add next-auth@beta`
4. `pnpm add ai @ai-sdk/react`
5. `pnpm add openai @anthropic-ai/sdk`（OpenAI 与 Anthropic 协议都走同一代理）
6. `pnpm add next-intl`
7. `pnpm dlx shadcn@latest init`
8. `pnpm prisma init --datasource-provider sqlite`

### 8.7 环境隔离
> 6-8h 项目无需上 Docker / WSL / VM；以下三层做到即可。

| 层 | 必要性 | 方案 |
|---|---|---|
| Node 版本 | 必装 | **本项目直接装 Node 20 LTS**：`winget install OpenJS.NodeJS.LTS`。若未来需要切多版本，可改装 fnm。 |
| 包依赖 | 自动 | pnpm 默认 per-project `node_modules`，无需额外配置 |
| 密钥 / 环境变量 | 必须 | `.env.local`，已加入 `.gitignore`；**绝不** 写入任何 git tracked 文件 |
| PowerShell / WSL | 直接 PowerShell | Next.js / Prisma / pnpm 在 Windows 上稳定，无需切换 |

---

## 9. 部署与交付要求

### 9.1 部署
- 默认平台：Vercel
- 数据库：Neon Postgres（部署时通过 `DATABASE_URL` 切换，开发期不变）
- 部署前需把 `.env` 中 LLM Key、`AUTH_SECRET`、`AUTH_URL` 配到 Vercel 环境变量

### 9.2 GitHub
- repo public
- README 包含：
  - 项目简介与在线 demo 链接
  - 本地运行步骤
  - `.env.example` 引用
  - 技术栈速览
  - 截图 / 短录屏（可选）

### 9.3 说明文档（`docs/REPORT.md`）
- 实现思路与关键取舍
- 当前完成程度（基础功能 / 扩展功能逐项标 ✅/❌）
- 已知问题与限制
- 如果继续投入时间会如何扩展，以及优先级判断

---

## 10. 开放问题

> 截至 v0.4，所有已识别问题均已确认。开发期若发现新决策点，追加到本节。

- ~~v0.2 五个问题~~ → 已确认，见 §0.2 与 §4.6
- ~~v0.3 三个问题~~ → 已确认（v0.4）：
  - i18n 切换 → Cookie 持久化，不上 URL 前缀
  - i18n 范围 → 仅 UI 字典，Agent 提示暂用中文
  - Race 模型管理 → 全局环境变量 `RACE_AVAILABLE_MODELS` 维护可用清单，用户每次勾选 2-4 个

---

*本文为 v0.2。每次范围或扩展功能调整请直接修改本文件并在文末记录变更点；新增模块的细节文档放在 `docs/` 同目录，例如 `docs/race-mode.md`。*

### 变更记录
- **v0.4 (2026-05-30)**：关闭 v0.3 三个开放问题 —— i18n 走 Cookie 不走 URL 前缀；i18n v1 仅做 UI 字典、Agent 提示保留中文；Race 模型走 `RACE_AVAILABLE_MODELS` env 清单 + 用户每次勾选；同时澄清"OpenAI 协议路径承载 GPT/DeepSeek/Grok，Anthropic 协议路径承载 Claude"，避免误以为要装 4 个 SDK。
- **v0.3 (2026-05-30)**：纳入 v0.2 五个开放问题的答复 —— Agent 名照搬 Atoms、加入中英 i18n、LLM 走 NewAPI 代理（同一 key 兼容 OpenAI / Anthropic 协议）、不启用 Atoms 70 美元额度、Race candidates 第一版走 Mock。新增 §1.7（i18n）、§4.11（i18n 技术栈）、§8.7（环境隔离）。
- **v0.2 (2026-05-30)**：按笔试硬要求重构，拆分"基础功能 / 扩展功能"两层；扩展功能按 Atoms 已有功能的重要度排序；新增创新延展占位符；移除时间评估。
- **v0.1 (2026-05-30)**：初稿。
