# 诺安AI桌面程序

## 📦 安装包构建完成！

### 🎉 构建结果
- **可执行文件**: `dist/诺安AI桌面程序-win32-x64/诺安AI桌面程序.exe`
- **压缩包**: `dist/诺安AI桌面程序-v1.0.0.zip`
- **文件大小**: 约 165MB (包含所有依赖)

### 🚀 使用方法

#### 1. 下载安装包
访问后端API获取下载链接：
```
http://localhost:5000/api/desktop/download-info
```

#### 2. 解压运行
1. 下载 `诺安AI桌面程序-v1.0.0.zip`
2. 解压到任意目录
3. 双击运行 `诺安AI桌面程序.exe`

#### 3. 首次使用
1. 程序会自动获取硬件唯一ID
2. 点击"设备认证"按钮进行认证
3. 认证成功后会自动开始定时验证

### 🔧 功能特性

- ✅ **自动硬件ID获取**: 基于CPU、硬盘、主板、网卡信息生成唯一ID
- ✅ **定时验证**: 每5分钟自动验证设备状态
- ✅ **用户认证**: JWT令牌认证机制
- ✅ **状态监控**: 实时显示连接状态和用户信息
- ✅ **数据持久化**: 自动保存认证信息，重启后无需重新认证
- ✅ **现代化界面**: 美观的用户界面设计

### 🛠️ 开发信息

#### 技术栈
- **框架**: Electron 27.3.11
- **语言**: JavaScript/HTML/CSS
- **硬件信息**: systeminformation 库
- **网络通信**: axios
- **数据存储**: electron-store

#### 构建命令
```bash
# 开发模式
npm start

# 构建Windows版本
npx electron-packager . "诺安AI桌面程序" --platform=win32 --arch=x64 --out=dist --overwrite

# 创建压缩包
Compress-Archive -Path "dist\诺安AI桌面程序-win32-x64" -DestinationPath "dist\诺安AI桌面程序-v1.0.0.zip" -Force
```

### 📋 系统要求

- **操作系统**: Windows 10/11 (64位)
- **内存**: 至少 4GB RAM
- **存储空间**: 至少 500MB 可用空间
- **网络**: 需要连接互联网进行认证

### 🔗 相关链接

- **后端API**: http://localhost:5000/api
- **Web前端**: http://localhost:3000
- **下载页面**: http://localhost:5000/api/desktop/download/windows

### 📝 注意事项

1. **首次运行**: 可能需要允许防火墙访问
2. **硬件ID**: 每个设备生成的硬件ID是唯一的，不可更改
3. **认证状态**: 程序会自动保存认证状态，无需重复认证
4. **网络连接**: 需要保持网络连接以进行定时验证

### 🐛 故障排除

#### 常见问题
1. **程序无法启动**: 检查是否被杀毒软件拦截
2. **认证失败**: 检查后端服务是否正常运行
3. **硬件ID获取失败**: 检查系统权限

#### 日志查看
程序运行时会输出详细日志，可通过开发者工具查看：
```bash
npm run dev  # 开发模式会显示控制台
```

## Windows 打包图标

使用 `assets/logo.jpg` 生成 Windows 可执行文件图标：

```bash
npm run build:icon
npm run build:win
```

如未安装依赖，请先执行：

```bash
npm install
```

## Windows 安装包构建（NSIS）

生成安装包（.exe 安装器），用户可直接安装：

```bash
npm run build:win-installer
Set-Location -LiteralPath 'D:\项目\诺安ai\server\desktop'; npm install --no-audit --no-fund --loglevel=error; npm run build:icon; node build-no-sign.js
```

输出位置在 `desktop/dist/`，文件名形如：`诺安AI桌面程序-Setup-1.0.0-x64.exe`。

---

**版本**: v1.0.0  
**构建时间**: 2024年1月  
**开发者**: 诺安AI团队 

## 自动更新（electron-updater）

- 构建时会生成用于自动更新的产物：
  - Windows NSIS：`latest.yml`、安装包 `.exe`
- 部署：将 `dist/latest.yml` 与对应 `.exe` 上传至
  `https://nuoanai.com/desktop/updates/`（或设置 `NUOAN_UPDATER_URL` 环境变量覆盖）
- 应用启动后会自动检查更新，并在下载完成后提示安装。

可选：渲染进程手动触发检查
```js
const { ipcRenderer } = require('electron')
// 检查更新
ipcRenderer.invoke('updater-check')
// 监听进度/状态
ipcRenderer.on('updater:event', (_e, payload) => {
  console.log('update event', payload)
})
// 下载完成后安装
ipcRenderer.invoke('updater-quit-and-install')
``` 