# Atoms Demo — 笔试说明文档

> 杨丰瑞 | 2026-06-01

---

## 在线体验

**Demo 地址**：https://atoms-demo-lac.vercel.app（配置$100 api key）

注册账号后即可使用全部功能。

**GitHub**：https://github.com/a007god/atoms-demo

---

## 实现思路

### 核心理念

以 Atoms.dev 的多智能体协作为核心叙事，实现一个完整可用的 AI 应用工厂：用户输入自然语言 → 多 Agent 团队分工协作 → 产出可预览的网页应用。

### 技术选型

| 决策 | 选择 | 理由 |
|------|------|------|
| 框架 | Next.js 16 App Router | 全栈一体，原生 SSE 流式支持 |
| 数据库 | Prisma 7 + SQLite/Postgres 双轨 | 本地零配置，生产无缝切换 |
| LLM | Anthropic Claude (via NewAPI proxy) | 角色扮演能力强，多 Agent 人格区分明显 |
| 部署 | Vercel + Neon Postgres | Next.js 原生支持，免费版足够 demo |

### 关键取舍

**架构层面**

1. **深度优先于广度**：选择把核心链路（多 Agent 流式对话 + 实时预览）做到完整可用，而非铺开大量半成品功能。
2. **自建编排，不引入框架**：没有使用 LangChain / CrewAI / AutoGen，而是手写轻量 pipeline。在 demo 规模下框架是负担，且自建更能精确控制 Agent 调度逻辑、展示对编排本质的理解。
3. **Server-side orchestration**：Agent 编排全部在服务端 route handler 完成，客户端只消费 SSE 事件流。好处：prompt 和调度逻辑不暴露给前端、易于扩展为 DAG、天然支持 abort。
4. **UX 投入后置**：先跑通核心功能验证架构可行，再投入主题系统 / 动画 / 拖拽等体验层打磨。避免在不确定的地基上做装修。

**实现层面**

5. **i18n 延后**：v1 仅中文，避免过早引入 `t()` 抽象拖慢迭代
6. **图片生成禁用**：API 代理无可用图片模型（503），务实地改用 CSS/SVG 方案
7. **文件上传不入库**：图片 base64 仅在 LLM 调用时使用，避免数据库膨胀

---

## 完成程度

### 基础功能（SPEC §1）— 全部完成 ✅

| 模块 | 状态 |
|------|------|
| 用户系统（注册/登录/登出） | ✅ |
| 项目管理（CRUD + 列表） | ✅ |
| 对话与流式输出（SSE） | ✅ |
| AI Agent 角色化（7 人团队） | ✅ |
| 数据持久化（Prisma） | ✅ |
| 部署与交付 | ✅ |

### 扩展功能（SPEC §2）— 部分完成

| 功能 | 状态 | 说明 |
|------|------|------|
| Mode 切换 (Chat/Team/Engineer) | ✅ | |
| 完整 Agent 团队 (7人) | ✅ | 动态路由 + @mention |
| App Viewer 沙箱预览 | ✅ | iframe + 桌面/移动切换 |
| 文件拖拽上传 | ✅ | 文本 + 图片，多模态 LLM |
| 3 套主题切换 | ✅ | Warm/Dark/Ocean，localStorage 持久化 |
| ZIP 导出 | ✅ | 纯 JS 生成有效 ZIP |
| @mention 路由 | ✅ | 精确指定 Agent 执行顺序 |
| Race Mode | ❌ | 设计完成，未实现 |
| Deep Research | ❌ | |
| Publish / Share | ❌ | |

---

## 如果继续投入时间

### 首要方向

1. **MCP 工具系统**：为每个 Agent 配备可调用的 Tools（代码执行、Web 搜索、数据查询），从"对话"升级为"行动"
2. **Agent Workflow 重设计**：引入 DAG 编排替代线性 pipeline，支持并行执行、条件分支、循环反馈

### 高价值扩展

3. **Race Mode**：同一 Prompt 并行跑多个模型，用户 Pick 最佳结果——Atoms 最有辨识度的功能
4. **Publish + Remix**：项目发布为公开链接 + 社区 Remix 机制，形成内容飞轮
5. **实时协作**：WebSocket 多人同时编辑同一项目，Agent 作为团队成员参与

### 优先级判断

MCP > Workflow > Race > Publish。理由：工具调用是 Agent 从"建议者"变为"执行者"的关键跃迁，直接决定产品的实用价值上限。

---

## 工程亮点

- **动态路由防循环**：`MAX_DEPTH=8` + visited set + 自引用过滤，确保 Agent 编排不会死循环
- **双数据库适配**：运行时根据 `DATABASE_URL` 前缀自动选择 SQLite/Postgres adapter，本地开发零配置
- **纯 JS ZIP 生成**：无依赖实现 ZIP 文件构造（Local File Header + Central Directory + End Record + CRC32）
- **流式 SSE 协议**：自定义事件类型（start/delta/saved/replace-content/done），支持多 Agent 串行流式输出

---

## 附加说明

- **AI 工具**：全程使用 Claude Code（企业版 Opus 账号）进行开发

  ![image-20260601065732872](C:\Users\yfr\AppData\Roaming\Typora\typora-user-images\image-20260601065732872.png)

- **LLM 资源**：自建 NewAPI 号池，约 5000 美元余额，支撑 demo 长期运行无忧

  ![image-20260601065801065](C:\Users\yfr\AppData\Roaming\Typora\typora-user-images\image-20260601065801065.png)

- **开发时长**：约 10 小时有效编码时间，分 5 个 session 完成

---

*完整设计文档见 `docs/SPEC.md`，开发日志见 `docs/CHANGELOG.md`*
