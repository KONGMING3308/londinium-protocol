# 伦蒂尼姆协议 · 四人联机版

以《明日方舟》第 9–14 章（伦蒂尼姆篇）为背景的四人回合制卡牌策略游戏。4 名玩家各自一台设备进入同一房间，各自暗选，7 回合内各自追求非对称胜利目标。

## 怎么开始一局

一个人建房间，其余三人凭房间码进房，四人**全部点准备**后自动开局。

```powershell
# 一条命令同时起 Node 服务端与前端
npm run dev:online
```

终端会打印两个地址，**四个人各自打开**其中一个（同一台机器开四个标签页也能测试）：

```
本机测试：  http://localhost:5173/
发给朋友：  http://192.168.1.10:5173/    ← 换成你实际的局域网 IP
```

1. 第一个人填昵称 → 点「创建房间」→ 得到 4 位房间码（如 `7KQ2`）；
2. 另外三人填昵称 + 输入房间码 → 点「加入房间」；
3. 四人在大厅里各自点「准备」；
4. 四人全部准备 → 服务端自动开局 → 进入战前简报。

想四人从**不同电脑**连进来时，把「发给朋友」那个局域网地址发给他们，并确认防火墙已放行 5173（前端）与 8787（服务端）端口。开发模式已用 `vite --host` 监听所有网卡，服务端本来就是 `0.0.0.0`，无需额外配置。前端开发服务器把 `/ws` 代理到 8787，所以其他人只需要访问前端的地址。

> **想少踩坑就用生产模式**：`npm run build` + `npm start` 只占一个 8787 端口，不用管代理和两个端口。详见 [docs/08-联机试玩手册.md](docs/08-联机试玩手册.md)。

## 生产部署

### 方式一：打包后上传服务器（推荐给真服务器）

```powershell
npm run release    # 生成 release/londinium-protocol-v0.4.4/ 和同名 .zip
```

把 zip 传到服务器解压，然后：

```bash
cd londinium-protocol-v0.4.4
node server.mjs
```

**服务器上不需要 `npm install`**：`ws` 已内联进 `server.mjs`，整个后端就是一个文件，
只依赖 Node 内置模块。包里自带 `README-部署.md`（systemd / pm2 / Docker / Nginx 反代 / HTTPS 都有）。

包内容：

| 文件 | 作用 |
|---|---|
| `server.mjs` | 后端全部逻辑（138 KB，含内联的 ws） |
| `dist/` | 前端静态资源 |
| `package.json` | 仅声明 `type: module`，无依赖 |
| `start.sh` / `start.cmd` | 一键启动（会自动找 Node、检查版本、报错时停住不闪退） |
| `.env.example` / `README-部署.md` | 配置示例与部署说明 |

> **Windows 上双击 `start.cmd` 没反应？** 通常是 Node 没装或没进 PATH。
> 新版启动脚本会自己搜索常见安装位置（含本项目的便携版目录），
> 找不到时打印明确指引并 `pause` 停住窗口，不会再一闪而过。
> 详见包内 `README-部署.md` 的「一之二」节。

### 方式二：在服务器上直接构建

```bash
npm install && npm run build
npm start
```

打开 `http://<服务器地址>:8787/` 即可。可用环境变量调整：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `PORT` | `8787` | 服务端监听端口 |
| `HOST` | `0.0.0.0` | 监听地址（局域网/公网联机需保持 `0.0.0.0`） |
| `STATIC_DIR` | `./dist` | 前端静态产物目录 |
| `ROOM_TTL` | `21600000`（6 小时） | 空房间回收时限，单位毫秒 |

## 联机是怎么实现的

**服务端权威**：所有随机、发牌、结算、判胜都只在服务端发生。客户端发过去的只是「意图」（我要选这两张牌、我要打这张指定牌、目标是他），服务端校验后推进状态，再把结果推回来。所以：

- 改前端代码无法作弊（手牌根本不在你的浏览器里）；
- 四台设备看到的规则结果必然一致；
- 断线重连后能接着打，状态在服务端没丢。

**视角脱敏**：服务端给每个玩家单独生成一份快照，别人的手牌、保留的指定牌、胜利条件根本不会下发给你。这也是原热座版"四个人围观同一块屏幕"问题的根本解法——现在物理上就看不到别人的牌。

**阶段流转**：

```
大厅(lobby) → 战前简报(briefing) → 暗选(picking) → 盟约窗口(council) → 结算(resolved) → 下一回合 / 终局(result)
```

与原热座版的关键差别：

| | 本地热座（原版） | 四人联机（现在） |
|---|---|---|
| 暗选 | 交接设备，一次一人选 | **四人同时选**，各自提交后等待 |
| 简报 | 设备依次传阅，手动遮挡 | **各看各屏**，服务端只发自己的目标 |
| 结盟 | 同一台设备上点两下就成立 | **提议 → 对方同意** 才成立 |
| 阵营交换 | 按座次逐对排队拍板 | **每对同盟并行拍板**，不用排队 |
| 存档 | 浏览器 localStorage | 服务端内存，凭 token 重连 |

## 版本

当前版本 **v0.4.4**。

版本号只写在 `package.json` 的 `version` 字段，其余通道全部自动派生，不存在第二处需要手工同步的地方：

| 读取方 | 通道 | 读到的内容 |
|---|---|---|
| 玩家 | 界面页脚右下角 | `v0.4.4`（鼠标悬停可看构建时刻） |
| 浏览器控制台 | `__LONDINIUM__.version` | `"0.4.4"` |
| 爬虫 / 查看网页源码 | `<meta name="app-version" content="0.4.4">` | 无需执行 JS |
| 静态托管 / 运维 | `GET /version.json`、`GET /version.txt` | JSON / 单行文本 |
| 工程侧 / CI | `npm run version:check` | 不一致则以非 0 退出 |

升版本只有两步：

1. 改 `package.json` 的 `version`；
2. `npm run build`（`prebuild` 会先同步 `public/version.json` 与 `public/version.txt`）。

## 第一次玩？

点顶栏「新手引导」，3 分钟读完就能上桌。它把玩法拆成：一回合的 4 个步骤、三条数值怎么看、四种牌分别干什么、新手最常犯的 5 个错。

想查细节（结算顺序、KEY 标签、流亡规则、FAQ）去「规则」页。

## 怎么玩（一局 5 分钟上手）

1. 四人进同一房间，全部准备 → 系统随机分配 4 个不同阵营，且至少一对敌对。
2. 战前简报看自己的胜利条件，记下来（别人看不到）。
3. 每回合：从 3 张随机牌中选 2 张 + 决定指定牌打出还是保留 → 四人提交后进入盟约窗口 → 结算。
4. 第 6、7 回合结束时判定胜负，先达成者胜。

完整规则见应用内「规则」页，或 [docs/03-页面与流程.md](docs/03-页面与流程.md)。

## 目录速览

| 路径 | 作用 |
|---|---|
| `server/index.ts` | **Node 后端**：HTTP 静态资源 + WebSocket 房间服务 |
| `src/shared/protocol.ts` | 前后端共享的消息与视图类型（联机协议契约） |
| `src/game/engine.ts` | **权威对局引擎**：状态迁移 + 按视角脱敏的视图生成 |
| `src/net/client.ts` | WebSocket 客户端封装（连接、断线重连、发消息） |
| `src/store/roomStore.ts` | 客户端状态中枢：只存服务端快照，不自算规则 |
| `src/pages/` | 页面：首页／大厅／简报／回合／结算／总览／终局／规则／引导 |
| `src/components/` | 跨页组件 |
| `src/mocks/` | **所有可调数据**：阵营、卡牌、剧情事件（每回合 3 候选随机抽 1）、中立资源点、盟约事件 |
| `src/utils/game/` | 纯逻辑：分阵营、牌库、结算、竞标、判胜（前后端共用） |
| `scripts/dev-online.mjs` | 一键同时启动服务端与前端 |
| `scripts/build-server.mjs` | 用 esbuild 打包服务端 |
| `scripts/test-engine.mjs` | 引擎蒙特卡洛压测（200 局完整对局） |
| `scripts/test-online.mjs` | 四客户端协议级端到端测试 |
| `scripts/test-bid-protection.mjs` | B7 低补给竞标扣费减半的边界锁定（17 项） |
| `scripts/test-victory-thresholds.mjs` | 各阵营判胜门槛 / 并列判胜规则的数值锁定（44 项） |
| `scripts/test-resume.mjs` | 断线保座、token 24 小时有效期、全员离线冻结托管（13 项） |
| `scripts/test-identity.mjs` | 多标签页身份隔离：sessionStorage 分标签页 + 心跳快照（15 项） |
| `scripts/test-multitab.mjs` | 同一浏览器两个标签页互不干扰、不互顶号的真实浏览器实测（12 项） |
| `server/persist.ts` | 房间落盘：原子写 + 节流 + 卡牌按 id 还原 |
| `scripts/test-persist.mjs` | 落盘与重启恢复：SIGKILL 杀进程后重新起，手牌与回合原样（15 项） |
| `scripts/test-browser.mjs` | 四个真实浏览器上下文的联机实测 |

## 改数据在哪改

- 数值／胜利条件／敌对与可结盟关系：`src/mocks/factions.ts`
- 剧情事件（每回合 3 候选随机抽 1）：`src/mocks/story.ts`；回合主题名（仅名字、无数值）在 `src/mocks/modifiers.ts`
- 中立资源点与竞标奖励：`src/mocks/neutral.ts`
- 盟约事件（三类走向）：`src/mocks/pacts.ts`
- 卡牌：`src/mocks/cards/`（每阵营一个文件如 `sark.ts`，通用牌 `generic.ts`，中立援助 `helper.ts`，同盟交换牌 `factionCards.ts`）
- 上限与流亡规则：`src/utils/game/resolve.ts`
- 流程与校验（谁能做什么）：`src/game/engine.ts`

> 改了卡牌数据后跑一次 `node scripts/sync-card-tables.mjs`，设计文档 4.2–4.9 的卡牌表会与代码对齐；`--check` 只校验不写回。

改完 `npm run build`，然后重启 `npm start`。联机版的规则改动必须改在服务端（`engine.ts`），只改前端无效。

## 两种运行模式

| | 线上联机（主模式） | 本地热座调试 |
|---|---|---|
| 怎么进 | `npm run dev:online` 或 `npm start`，四人各一台设备 | 首页点「本地热座调试」，或访问 `?local=1` |
| 需要后端 | 是 | **不需要**，浏览器内跑 |
| 适合 | 真的四个人玩 | 一个人验证流程、调平衡、复现 bug |
| 规则来源 | `src/game/engine.ts` | **同一个** `src/game/engine.ts` |

本地热座模式是把「传输层」从 WebSocket 换成内存里的 `LocalServer`（`src/net/localServer.ts`），
调用的仍是服务端那套引擎，**所以调试得到的结论对线上一定成立**。
页面底部会出现一条调试栏：可切换当前操作者（等于「把设备传给下一个人」），
也可一键让四人全部准备／全部确认。

## 测试

```powershell
npm run test                # 全部十四个套件，共 390 项检查
npm run test:engine         # 引擎：200 局完整对局，验证无死锁（9 项）
npm run test:online         # 协议：四客户端联机、脱敏、重连（35 项）
npm run test:security       # 安全：伪造身份/越权、四视角脱敏、畸形消息与洪泛（72 项）
npm run test:local          # 本地热座模式：独立跑完整局、与联机同源校验（15 项）
npm run test:timer          # 30 秒决策倒计时与超时托管（20 项）
npm run test:hold           # 指定牌「最多保留一回合」（17 项）
npm run test:faction        # 同盟阵营牌交换（25 项）
npm run test:story          # 剧情事件与中立竞标（66 项）
npm run test:pact           # 阵营名/盟约事件/战争进度（27 项）
npm run test:bidprot        # B7 低补给竞标扣费减半（17 项）
npm run test:victory        # 各阵营判胜门槛与并列判胜规则（44 项）
npm run test:resume         # 断线保座 / token 有效期 / 全员离线冻结托管（13 项）
npm run test:identity       # 多标签页身份隔离：两个标签页不再互相顶号（15 项）
npm run test:persist        # 房间落盘：SIGKILL 后重启，凭 token 回原位、手牌不差（15 项）
npm run test:release        # 发布包验收：解压到干净目录、无 node_modules 打完一整局（27 项）
npm run test:browser        # 四个真实浏览器上下文打完整局（需先 build，调用本机 Edge，21 项）
npm run test:multitab       # 同一浏览器两个标签页互不干扰（需先 build，12 项）
npm run test:local:browser  # 浏览器里验证本地热座模式（13 项，无需任何后端）
npm run typecheck           # 类型检查
```

> `test:release` 是最贴近真实部署的测试：把发布包复制到一个全新的临时目录
> （没有 `node_modules`），只用 `node server.mjs` 启动，再开四个 WebSocket 客户端
> 走完「建房 → 加入 → 准备 → 开局 → 打完一整局」，同时复查脱敏是否仍生效。

## 已知限制

- **房间已落盘**（v0.4.7）：状态写到 `data/rooms.json`，服务端重启会自动读回进行中的对局，玩家刷新即可回位。断电最多丢最近一秒的动作（写盘攒 800ms）；正常停止（Ctrl+C）会先写完再退出。
- 落盘是**单机本地文件**：多进程 / 多台服务器共享同一批房间还不支持（需要真正的数据库或一致性存储）。
- 无账号体系：座位身份靠一次性 token（**有效期 24 小时，重连与在线时自动续期**），清掉浏览器存储就回不到原座位。
- **同一浏览器的多个标签页各用各的身份**（每页一份 sessionStorage + 带心跳的「最近会话」快照）：后开的标签页不会抢前一页的座位，刷新只恢复自己那一局。
- **刷新 / 切屏 / 锁屏都不会丢座位**：所有阶段（含大厅）断线都保留座位；四个人一起断线时倒计时会冻结，不会被托管代打。只有点「离开房间」才释放座位。
- 数值平衡经过一轮蒙特卡洛调参（v0.4.3），仍待真人试玩反馈后继续调整（见 [docs/06-交接说明.md](docs/06-交接说明.md) 的 TODO 清单）。
