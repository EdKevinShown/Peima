# 澳洲 IP 内测部署（路线 B · 无域名 · 约 30 人）

最简流程：**托管数据库 + 一台悉尼 VPS + Docker**。内测用户只访问一个链接：`http://你的公网IP:5173`。

详细环境变量见 [`peima-beta.env.example`](./peima-beta.env.example)，编排文件见 [`docker-compose.beta.yml`](../../docker-compose.beta.yml)。

---

## 一张图看懂

```
[内测用户] ──http://IP:5173──► [Web 容器]
                                  │
                                  ▼
                            http://IP:3000
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
              [API 容器]                 [Worker 容器]
                    │                           │
                    └───────────┬───────────────┘
                                ▼
                    [托管 PostgreSQL（云端）]
```

---

## 最简 8 步（照着做）

### 0. 准备两样东西

| 东西 | 说明 |
|------|------|
| **托管 Postgres** | 悉尼/近澳小规格即可；记下连接串；**防火墙只允许 VPS 的 IP** |
| **悉尼 VPS** | 建议 2C4G；Ubuntu 22.04；记下 **公网 IP**（下文叫 `IP`） |

### 1. 装 Docker（SSH 登录 VPS 后执行一次）

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker "$USER"
```

退出 SSH 再登录一次（让 docker 组生效）。

### 2. 拉代码

```bash
git clone <你的仓库地址> peima
cd peima/Peima
```

### 3. 写配置

```bash
cp docs/ops/peima-beta.env.example .env
nano .env
```

**必改 4 处：**

1. `DATABASE_URL` → 托管库连接串  
2. `JWT_SECRET` → 运行 `openssl rand -hex 32` 粘贴  
3. `YOUR_VPS_IP` → 全部换成 VPS 公网 IP（`API_PUBLIC_BASE_URL` 与 `VITE_API_BASE_URL` 两处）

### 4. 数据库迁移（只做一次，或每次发版有新 migration 时重做）

```bash
chmod +x scripts/beta-migrate.sh
./scripts/beta-migrate.sh
```

看到 `All migrations have been successfully applied` 即成功。

### 5. 构建并启动

```bash
chmod +x scripts/beta-up.sh
./scripts/beta-up.sh
```

等价于：

```bash
docker compose -f docker-compose.beta.yml build
docker compose -f docker-compose.beta.yml up -d
```

### 6. 开防火墙端口

```bash
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 5173/tcp
sudo ufw enable
```

云厂商控制台安全组也要放行 **5173、3000**（来源可设 `0.0.0.0/0` 或团队 IP 段）。

### 7. 自己先测一遍

1. 浏览器打开 **`http://IP:5173`**  
2. 注册 / 登录  
3. 填问卷 → 上传照片 → 走匹配  
4. 若一直卡在匹配：执行 `docker compose -f docker-compose.beta.yml logs -f worker` 看 Worker 是否在跑  

### 8. 发给内测同学

**入口链接：** `http://IP:5173`  

不要公开到公网论坛；`JWT_SECRET` 和数据库密码仅保存在服务器 `.env`。

---

## 发版更新（以后每次改代码）

在 VPS 上：

```bash
cd peima/Peima
git pull
./scripts/beta-migrate.sh    # 若有新数据库迁移
./scripts/beta-up.sh         # 会重新 build 并重启
```

若改了 `VITE_API_BASE_URL` 或 IP，必须重新 build（`beta-up.sh` 已包含 build）。

---

## 常用命令

```bash
# 状态
docker compose -f docker-compose.beta.yml ps

# 日志
docker compose -f docker-compose.beta.yml logs -f api
docker compose -f docker-compose.beta.yml logs -f worker

# 停止
docker compose -f docker-compose.beta.yml down

# 停止但保留上传与数据卷
docker compose -f docker-compose.beta.yml down
# 上传文件在 Docker 卷 beta_uploads 中
```

---

## 手机上传照片失败？

部分手机浏览器要求 **HTTPS**。无域名时可二选一：

1. **Cloudflare Tunnel**（免费临时 HTTPS 域名）  
2. 免费二级域（如 DuckDNS）+ Let’s Encrypt  

内测若全员用电脑，可继续 `http://IP:5173`。

---

## 故障排查

| 现象 | 检查 |
|------|------|
| 页面打不开 | VPS 防火墙 / 云安全组是否放行 5173 |
| 登录后接口报错 | `VITE_API_BASE_URL` 是否为 `http://IP:3000`；是否重建过 web |
| 图片裂图 | `API_PUBLIC_BASE_URL` 是否为 `http://IP:3000` |
| 匹配一直不动 | `docker compose ... ps` 里 worker 是否 Up；看 worker 日志 |
| 数据库连不上 | 托管库白名单是否包含 **VPS 公网 IP**；`DATABASE_URL` 是否正确 |

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `docker-compose.beta.yml` | 仅 API + Worker + Web，无本地 Postgres |
| `docs/ops/peima-beta.env.example` | 内测 `.env` 模板 |
| `scripts/beta-migrate.sh` | 一键迁移 |
| `scripts/beta-up.sh` | 一键构建并启动 |
