# redeem-system
礼包码兑换系统 - 完整分类管理版
# 礼包码兑换系统

一键部署的礼包码兑换系统，支持文件夹式分类管理。

## 一键部署步骤

### 1. Fork 本仓库

点击右上角 Fork 按钮

### 2. 创建 KV 命名空间

在 Cloudflare Dashboard → KV 创建两个命名空间：
- `REDEEM_CODES`
- `RATE_LIMIT`

记录下两个 KV 的 ID

### 3. 部署 Worker

- 进入 Cloudflare Workers → 创建 Worker
- 名称填 `redeem-system`
- 复制 `worker.js` 内容粘贴
- 点击「保存并部署」

### 4. 绑定 KV 和设置环境变量

在 Worker 设置中：

**KV 绑定：**
| 变量名 | KV 命名空间 |
|--------|-------------|
| REDEEM_CODES | 你创建的 REDEEM_CODES |
| RATE_LIMIT | 你创建的 RATE_LIMIT |

**环境变量：**
| 变量名 | 值 |
|--------|-----|
| ADMIN_PASSWORD | 你的管理密码 |

### 5. 绑定域名（可选）

在 Worker → 触发器 → 添加自定义域

## 使用

- 兑换页面：`https://你的域名/`
- 管理后台：`https://你的域名/admin`

## 功能

- 📁 文件夹式分类管理
- 🔐 管理后台独立密码
- 🎁 兑换页面记录用户信息
- 📥 CSV 导出
- ✅ 批量操作
