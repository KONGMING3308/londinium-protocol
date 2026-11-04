# 伦蒂尼姆协议 · 本地热座原型

以《明日方舟》第 9–14 章（伦蒂尼姆篇）为背景的四人回合制卡牌策略原型。4 名玩家共用一台设备轮流暗选，7 回合内各自追求非对称胜利目标。

## 快速开始

- **双击 `dev.cmd`**，等待终端出现 `Local: http://localhost:5173/`，用浏览器打开该地址。
- 或手动执行：

```powershell
$env:PATH = "C:\Users\35232\.local\share\nodejs\node-v20.18.0-win-x64;" + $env:PATH
npm run dev
```

依赖已安装；若删除了 `node_modules`，先执行 `npm install`（可用镜像 `--registry=https://registry.npmmirror.com`）。

## 第一次玩？

点顶栏「新手引导」，或用首页那张引导卡，3 分钟读完就能上桌。
它把玩法拆成：一回合的 4 个步骤、三条数值怎么看、四种牌分别干什么、新手最常犯的 5 个错。

想查细节（结算顺序、KEY 标签、流亡规则、FAQ）去「规则」页。

## 怎么玩（一局 5 分钟上手）

1. 首页填 4 名玩家 → 开始新对局，系统随机分配 4 个不同阵营，且至少一对敌对。
2. 战前简报看自己的胜利条件，记下来。
3. 每回合：交接设备 → 从 3 张随机牌中选 2 张，并决定指定牌打出还是保留 → 4 人完成后进入盟约窗口 → 结算。
4. 第 6、7 回合结束时判定胜负，先达成者胜。

完整规则见应用内「规则」页，或 [docs/03-页面与流程.md](docs/03-页面与流程.md)。

## 目录速览

| 路径 | 作用 |
|---|---|
| `src/pages/` | 8 个页面：首页／简报／回合／结算／总览／终局／规则／新手引导 |
| `src/components/` | 跨页组件 |
| `src/mocks/` | **所有可调数据**：阵营、卡牌、七回合剧情修正 |
| `src/utils/game/` | 纯逻辑：分阵营、牌库、结算、判胜 |
| `src/store/gameStore.ts` | 对局状态机 |
| `src/api/gameApi.ts` | 本地存档（localStorage） |
| `src/types/` | 全局类型 |
| `docs/` | 00 澄清记录 + 01–06 产品文档 |

## 改数据在哪改

- 数值／胜利条件／敌对与可结盟关系：`src/mocks/factions.ts`
- 七回合剧情增减益：`src/mocks/modifiers.ts`
- 卡牌：`src/mocks/cards/`（每阵营一个文件，通用牌 `generic.ts`，中立援助 `neutral.ts`）
- 上限与流亡规则：`src/utils/game/resolve.ts`

改完刷新页面；旧存档可能不兼容，点顶栏「重开」。

## 构建

```powershell
npm run build
```

## 已知限制

- 仅本地热座，无联机、无 AI、无账号。
- 防窥屏依赖交接页的物理遮挡。
- 数值平衡为首版，待真人试玩反馈后调整（见 [docs/06-交接说明.md](docs/06-交接说明.md) 的 TODO 清单）。
