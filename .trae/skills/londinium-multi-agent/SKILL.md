---
name: "londinium-multi-agent"
description: "Runs the Londinium card-game multi-agent review chain inside TRAE: rule-consistency check, code audit, numeric balance review, browser verification. Invoke when the user asks to audit, review, or rebalance this prototype."
---

# 伦蒂尼姆多智能体协作流程

用于《伦蒂尼姆协议》本地热座原型（4 人、7 回合、6 阵营）。本流程只使用 TRAE 内置子 Agent 与项目文件交接，不依赖外部编排工具。

## 铁律

1. **主控会话唯一**：所有写操作由主控串行执行；同一时间不得有两路 Agent 修改同一文件。
2. **只读角色可并行**：审计、校验、数值分析互不影响，一次派发。
3. **子 Agent 无状态**：派发时必须给全量上下文（目标、文件路径、禁止事项、输出格式）。
4. **产物落盘**：交接靠 `docs/` 与代码文件，不靠对话记忆。
5. **主控亲自验收**：子 Agent 自述「已完成」不作数，构建与页面必须主控复核。

## 角色与权限

| 角色 | 子 Agent 类型 | 权限 | 产物 | 可并行 |
|---|---|---|---|---|
| 规则校验 | Explore | 只读 | 规则—实现差异清单 | 是 |
| 代码审计 | general-purpose | 只读 | 按严重度排序的问题表（含 file:line） | 是 |
| 数值平衡 | general-purpose | 只读，可跑脚本 | 阵营胜率/资源曲线（标注为估算） | 是 |
| 实现 | general-purpose | 可写，限定文件 | 代码改动 | 否 |
| 验证 | browser_use | 只读页面 | 真实对局结果与报错 | 否（需先启动 dev） |

## 审计基线文件

- 规则来源：`docs/00-澄清记录.md`、`docs/01-需求说明.md`、`docs/03-页面与流程.md`、`docs/05-验收标准.md`
- 实现来源：`src/mocks/factions.ts`、`src/mocks/modifiers.ts`、`src/mocks/cards/`、`src/utils/game/`、`src/store/gameStore.ts`、`src/api/gameApi.ts`

## 执行顺序

1. **并行只读阶段**：同时派发「规则校验」「代码审计」「数值平衡」三个子 Agent，各自返回 Markdown。
2. **主控去重合并**：把三份结果合并为一张问题表，标注严重度 P0/P1/P2，并剔除子 Agent 的臆测条目。
3. **主控复核**：对每条 P0/P1 亲自读对应文件确认，跑 `npm run build`。
4. **实现阶段**（仅在用户确认后）：按文件分组串行派发，禁止顺手重构。
5. **验证阶段**：`npm run dev` 起服务后用 browser_use 跑一局，覆盖交接页、选牌、结算、终局四个节点。
6. **收尾**：更新 `docs/06-交接说明.md` 的 TODO 清单。

## 派发模板

```
你是本次[角色]子 Agent，只读，禁止修改任何文件。
项目：d:\TRAE的屎（React + Vite 热座卡牌原型）。
目标：[具体目标]
必读文件：[路径列表]
禁止：[范围外改动 / 猜测数值]
输出：Markdown 表格，列为 严重度 | 位置(file:line) | 问题 | 建议；无证据的条目不写。
```

## 触发语

- 「跑一遍审计」→ 并行只读阶段 + 主控复核
- 「跑一遍平衡检查」→ 只派数值平衡 + 主控复核
- 「做完再验一局」→ 全链路，含实现与浏览器验证
