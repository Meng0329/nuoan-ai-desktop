# macOS 构建故障排查指南

## 快速诊断

如果 macOS 构建失败，请按以下步骤操作：

### 1. 查看完整错误日志

在 GitHub Actions 页面：
1. 点击失败的 workflow run
2. 点击 "构建 macOS 应用" job
3. 展开失败的步骤
4. 滚动到最底部查看实际错误信息

### 2. 运行调试工作流

我们提供了专门的调试工作流：

```bash
# 在 GitHub Actions 页面
# 选择 "调试 macOS 构建" workflow
# 点击 "Run workflow"
```

这个工作流会：
- 检查系统环境
- 测试图标生成
- 进行最小化构建测试
- 上传详细的调试日志

### 3. 常见问题和解决方案

#### 问题 1：图标生成失败

**症状：**
```
❌ 错误: build/icon.icns 不存在！
```

**解决方案：**

1. **检查源文件：** 确保 `assets/logo.png` 存在且是有效的 PNG 文件
2. **检查依赖：** 确保 `sharp` 和 `png2icons` 已正确安装
3. **手动测试：**
   ```bash
   cd desktop
   npm run build:icon:mac
   ```

#### 问题 2：Universal 构建失败

**症状：**
```
• building        target=macOS universal
Error: ...
```

**解决方案：**

使用分架构构建代替 universal 构建：

```bash
# 方案 1: 使用分架构工作流
# 在 GitHub Actions 中运行 "构建 macOS 桌面应用（分架构）"

# 方案 2: 修改 package.json
# 将 target 改为：
"target": [
  { "target": "dmg", "arch": "x64" },
  { "target": "dmg", "arch": "arm64" }
]
```

#### 问题 3：签名相关错误

**症状：**
```
Error: Cannot find specified identity
Code signing required
```

**解决方案：**

确保在 `package.json` 中正确配置了无签名选项：

```json
"mac": {
  "hardenedRuntime": false,
  "gatekeeperAssess": false,
  "identity": null,
  "entitlements": null,
  "entitlementsInherit": null,
  "provisioningProfile": null
},
"dmg": {
  "sign": false
}
```

#### 问题 4：依赖解析失败

**症状：**
```
• unresolved deps  unresolved=...
```

**解决方案：**

1. **清理并重新安装依赖：**
   ```bash
   cd desktop
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **使用 npm ci（CI 环境）：**
   修改工作流中的安装步骤：
   ```yaml
   - name: 安装依赖
     working-directory: desktop
     run: npm ci
   ```

#### 问题 5：内存不足

**症状：**
```
JavaScript heap out of memory
```

**解决方案：**

增加 Node.js 内存限制：

```yaml
- name: 构建 macOS 应用
  working-directory: desktop
  run: |
    export NODE_OPTIONS="--max-old-space-size=4096"
    npx electron-builder --mac --universal
  env:
    CSC_IDENTITY_AUTO_DISCOVERY: false
```

#### 问题 6：afterPack 钩子错误

**症状：**
```
Error in afterPack hook
```

**解决方案：**

临时禁用 afterPack 进行测试：

```json
"build": {
  // "afterPack": "./afterPack.js",  // 注释掉这一行
  ...
}
```

## 诊断工具

### 本地测试

在 macOS 上本地测试：

```bash
# 1. 安装依赖
cd desktop
npm install

# 2. 测试图标生成
npm run build:icon:mac

# 3. 测试打包（仅目录，不创建 DMG）
npx electron-builder --mac --dir

# 4. 完整打包
npm run build:mac
```

### GitHub Actions 工作流

我们提供了三个工作流：

1. **构建 macOS 桌面应用** (`build-mac.yml`)
   - 默认工作流，使用 universal 构建
   - 适用于生产环境

2. **构建 macOS 桌面应用（分架构）** (`build-mac-separate.yml`)
   - 分别构建 x64 和 arm64 版本
   - 适用于 universal 构建失败时

3. **调试 macOS 构建** (`debug-mac.yml`)
   - 详细的诊断信息
   - 适用于故障排查

## 环境要求

确保满足以下要求：

- **Node.js**: 18.x 或更高
- **npm**: 9.x 或更高
- **macOS**: GitHub Actions 使用 `macos-latest` (通常是 macOS 13 或 14)
- **磁盘空间**: 至少 10 GB
- **内存**: 至少 4 GB

## 获取帮助

如果以上方案都无法解决问题：

1. 运行 "调试 macOS 构建" 工作流
2. 下载调试日志（Artifacts）
3. 查看完整的错误信息
4. 根据具体错误搜索 electron-builder 的 GitHub Issues

## 相关资源

- [electron-builder 文档](https://www.electron.build/)
- [macOS 代码签名指南](https://www.electron.build/code-signing)
- [GitHub Actions macOS 环境](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners)


