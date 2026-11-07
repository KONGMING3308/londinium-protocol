# 伦蒂尼姆协议 · 部署说明（v__VERSION__）

四人线上联机版的服务端发布包。**不需要 npm install，不需要构建，解压即可跑。**

## 一、最简部署（3 步）

前置：服务器上装了 **Node.js 20 或更高版本**（`node -v` 能查到版本号即可）。

```bash
# 1. 把整个目录上传到服务器，例如 /opt/londinium
cd /opt/londinium

# 2. 启动
node server.mjs

# 3. 浏览器打开
#    http://<服务器IP>:8787/
```

看到下面这几行就说明启动成功：

```
  伦蒂尼姆协议 · 联机服务端
  HTTP   http://localhost:8787/
  WS     ws://localhost:8787/ws
  静态   /opt/londinium/dist
```

然后四个人各自打开 `http://<服务器IP>:8787/`，一个人建房，另外三人凭房间码进房，
四人全部点「准备」即自动开局。

## 一之二、Windows 上双击 start.cmd 没反应？

**先说结论：start.cmd 现在会自己找 Node，找不到会停下来告诉你原因，不会再一闪而过。**

之前如果你双击后窗口瞬间消失、什么都没发生，通常是这两种原因：

### 原因 1：Node 没装，或者没在 PATH 里（最常见）

\`start.cmd\` 里执行的是 \`node server.mjs\`。如果系统 PATH 里没有 \`node\`，
Windows 会报「'node' 不是内部或外部命令」然后立刻关窗，你根本来不及看。

**怎么确认**：按 \`Win + R\`，输入 \`cmd\` 回车，在黑窗口里敲：

\`\`\`
node -v
\`\`\`

- 显示 \`v20.x.x\` 之类的版本号 → Node 正常，跳到原因 2。
- 显示「不是内部或外部命令」→ **Node 没进 PATH**，看下面的解决办法。

**解决办法（任选一个）**：

1. **重新装一次 Node（最省事）**：去 https://nodejs.org 下载 LTS 的 Windows 安装包，
   一路默认下一步。安装程序会自动把 Node 加进 PATH。
   装完**关掉所有已打开的窗口**，再重新双击 \`start.cmd\`。
2. **已有便携版 Node**：把 Node 所在目录加进用户环境变量 \`PATH\`，
   例如 \`C:\Users\你的名字\.local\share\nodejs\node-v20.18.0-win-x64\`。
   加完也要重开窗口才生效。
3. **不改 PATH**：本项目这台机器的便携版是放在
   \`%USERPROFILE%\.local\share\nodejs\node-v20.18.0-win-x64`，
   \`start.cmd\` 已经会自动去这个位置找，找不到才报错。

> 新版 \`start.cmd\` 会依次尝试：PATH → \`%LOCALAPPDATA%\Programs\nodejs\` →
> \`%ProgramFiles%\nodejs\` → 上述便携版目录 → scoop / nvm 常见位置。
> 所以你**可能什么都不用做，重新双击就行**。

### 原因 2：端口 8787 被占用

如果上一次的服务端没关干净，端口还占着，新进程会启动失败。
新版脚本会在启动前检查并提示：

\`\`\`
[WARN] Port 8787 seems to be in use already.
\`\`\`

**怎么处理**：关掉之前的黑窗口；或换个端口启动：

\`\`\`
set PORT=8788 && start.cmd
\`\`\`

查询是谁占了端口：

\`\`\`
netstat -ano | findstr :8787
\`\`\`

最后一列是 PID，然后 \`taskkill /PID <PID> /F\` 结束它。

### 还是不行？手动启动看真实报错

双击方式会自动关窗，看不到完整信息。改成手动：

1. 在包目录里按住 \`Shift\` + 右键空白处 →「在此处打开 PowerShell 窗口」；
2. 输入：

\`\`\`powershell
node server.mjs
\`\`\`

这样报错会留在屏幕上。看到什么错就按上文对照。

---

## 二、改端口

```bash
PORT=9000 node server.mjs          # Linux / macOS
```
```powershell
$env:PORT=9000; node server.mjs    # Windows PowerShell
```

或编辑 `start.sh` / `start.cmd` 里的默认值。

> **端口被占用时会自动顺延**：如果 8787 已经被别的程序（或上一次没关干净的服务端）占着，
> 服务端会自动改用 8788、8789……直到找到空闲端口，并在控制台明确打印新端口：
>
> ```
>   端口 8787 被占用，已自动改用 8788。
>   请让朋友访问 http://<服务器IP>:8788/ （不是 8787）
> ```
>
> 这时一定要把**新端口**告诉玩家，否则他们连不上。

## 二之二、对局计时规则

服务端对每个需要玩家决策的阶段都设了时限，到点自动执行保守的默认操作，
**不会因为有人发呆而卡住整局**：

| 阶段 | 时限 | 超时后自动做什么 |
|---|---|---|
| 战前简报 | 60 秒 | 自动确认已读 |
| 暗选卡牌 | **30 秒** | 自动打出 2 张行动牌，**指定牌保留不打人** |
| 盟约窗口 | 45 秒 | 自动跳过结盟，直接进结算 |
| 统一结算 | 60 秒 | 自动准备下一回合 |

大厅等待和最终结算页不计时。

想调整时长可以用环境变量（毫秒）：

```bash
PHASE_MS_PICKING=60000 node server.mjs    # 把暗选改成 60 秒
```

可用的变量：`PHASE_MS_BRIEFING`、`PHASE_MS_PICKING`、`PHASE_MS_COUNCIL`、`PHASE_MS_RESOLVED`。

> 倒计时由服务端权威计时，客户端只负责显示。玩家改自己电脑的系统时间
> 不会影响剩余时间——快照里带了服务端时间戳用于校正。

## 二之三、这一版新增的玩法（剧情事件 + 中立资源争夺）

### 剧情事件：每回合三选一

之前每个回合的剧情是固定的（R3 永远是「夺剑」），打两局所有玩家都能背下来，
剧情退化成纯数值噪声。现在每个回合有 **3 个候选剧情事件**，每局随机抽 1 个，
**对全场 6 个阵营同时生效**。

- 同一回合在不同局里可能发生完全不同的事，玩家不能靠背板过关；
- 回合页顶部会显示本回合抽到了什么、影响到哪些阵营；
- 数值增减同时写进回合日志，结算后可以复盘。

### 中立资源争夺：四人暗标竞拍

之前的中立援助是「人手一张、各抽各的、各自掷骰」，四个人之间零交互，
本质上是并行的单人骰子游戏。现在每回合刷出 **2 个中立资源点**，
四人在暗选时**秘密出价**争夺：

| 规则 | 说明 |
|---|---|
| 出价来源 | 从**补给**里扣，和行动牌代价是同一个池子 |
| 归属 | 同一个点出价最高者独得奖励 |
| 输家 | **出价一律不退**（这是核心张力：输了也要付钱） |
| 并列 | 最高价并列 → **流拍**，谁都不拿，但出价照扣 |
| 无人出价 | 不扣任何人 |
| 透支 | 允许出价超过当前补给，但结算后可能当场崩溃，风险自担 |
| 保密 | 结算前只能看到「已有几人出价」，看不到具体数额 |

抢点和打牌会直接冲突：抢得凶就容易兵力不足。这是全游戏唯一需要「读人」的环节。

## 三、放行防火墙

```bash
# Linux（ufw）
sudo ufw allow 8787/tcp

# Linux（firewalld）
sudo firewall-cmd --add-port=8787/tcp --permanent && sudo firewall-cmd --reload
```

云服务器（阿里云/腾讯云/AWS 等）还需要在**控制台的安全组**里放行该端口，
这一步漏了会表现为「本机能访问、外面一直转圈」。

## 四、常驻运行

### 方式 A：systemd（推荐）

```ini
# /etc/systemd/system/londinium.service
[Unit]
Description=Londinium Protocol Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/londinium
ExecStart=/usr/bin/node /opt/londinium/server.mjs
Environment=PORT=8787
Environment=HOST=0.0.0.0
Restart=always
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now londinium
sudo systemctl status londinium
journalctl -u londinium -f        # 看日志
```

> `ExecStart` 里的 node 路径用 `which node` 查到的实际路径。
> 如果用 nvm 装的 Node，路径通常是 `/home/用户/.nvm/versions/node/vXX/bin/node`。

### 方式 B：pm2

```bash
npm install -g pm2
pm2 start server.mjs --name londinium
pm2 save && pm2 startup
```

### 方式 C：Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 8787
ENV HOST=0.0.0.0
CMD ["node", "server.mjs"]
```

```bash
docker build -t londinium .
docker run -d -p 8787:8787 --name londinium --restart unless-stopped londinium
```

## 五、验证部署是否成功

```bash
# 健康检查：应返回 {"ok":true,"rooms":0}
curl http://127.0.0.1:8787/healthz

# 首页：应返回 HTML
curl -I http://127.0.0.1:8787/
```

从**另一台机器**再访问一次 `http://<服务器IP>:8787/healthz`，
这一步能区分「服务没起来」和「防火墙/安全组没放行」。

## 六、必须知道的限制

1. **对局状态全在内存里**：重启进程 = 所有进行中的对局消失。要用 systemd/pm2 的
   自动重启能保证服务不死，但正在打的局救不回来。
2. **超时托管偏保守**：有人掉线时，到点会自动替他走完流程（暗选打牌、赚约就绪、
   准备下一回合），但**不会替他抢中立资源、也不会替他打指定牌**——
   这两件事涉及针对他人和花钱，宁可让他少做，也不替他做错。
   所以掉线的人会白白错过每回合的资源争夺。
3. **没有账号体系**：座位身份靠浏览器 localStorage 里的 token，换设备或清缓存就回不到原座位。
4. **没有 HTTPS**：本包只提供 HTTP/WS。放在公网建议前面挂一层 Nginx/Caddy 做 TLS。
   注意：挂 HTTPS 时需要把 WebSocket 也代理过去，见下方「七」。
5. **同一浏览器的多个标签页共用登录态**：本机四开自测请用「本地热座调试」，
   或开不同浏览器 / 无痕窗口。真人各自一台设备不会遇到。

## 七、反向代理（可选，想要域名/HTTPS 时）

### Nginx

```nginx
server {
    listen 80;
    server_name game.example.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }
}
```

```bash
sudo certbot --nginx -d game.example.com     # 自动配 HTTPS
```

> `proxy_read_timeout` 必须调大（默认 60 秒会掐断长连接），
> 因为 WebSocket 是靠心跳维持的，超时会表现为「玩一会儿突然掉线」。

### Caddy（更简单）

```
game.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Caddy 会自动处理 WebSocket 升级和 HTTPS 证书。

## 八、包内容说明

| 文件 | 作用 |
|---|---|
| `server.mjs` | 服务端单文件，包含 HTTP 静态服务 + WebSocket 房间逻辑，`ws` 已内联 |
| `dist/` | 前端静态资源（HTML/JS/CSS） |
| `package.json` | 仅声明 `type: module` 与版本号，**没有依赖，无需 install** |
| `start.sh` / `start.cmd` | 一键启动脚本 |
| `.env.example` | 端口等配置示例 |

服务端只依赖 Node 内置模块（`node:http`、`node:fs`、`node:path` 等）和已内联的 `ws`。
