const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const si = require('systeminformation');
const Store = require('electron-store');
const http = require('http');
const url = require('url');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');

// 新增：加载 .env 配置（如果存在）
require('dotenv').config({ path: path.join(__dirname, '.env') })

// 新增：在 Windows 设置 AppUserModelID，确保任务栏与快捷方式关联正确
try {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.nuoan-ai.desktop');
  }
} catch (_e) {}

// 配置存储
const store = new Store();

// 后端API配置
// 调整优先级：优先使用环境变量，其次使用持久化配置，最后默认本地
let apiBaseUrl = process.env.NUOAN_API_BASE_URL || store.get('apiBaseUrl') || 'http://localhost:5000/api';
let authToken = '';
let hardwareId = store.get('hardwareId') || ''; // 优先从存储中获取，避免启动时重新计算
let prevHardwareId = store.get('prevHardwareId') || '';
let verificationInterval = null;
let localServer = null;
let mainWindow = null;
let updateTimer = null;
let deviceJsonPath = null;
let usageTimer = null;
let sessionStartMs = Date.now();

// 设备JSON读写（统一来源）
function getDeviceJsonPath() {
  if (!deviceJsonPath) {
    let baseDir = null;
    try {
      baseDir = app.getPath('userData');
    } catch (_) {
      baseDir = null;
    }
    if (!baseDir) {
      try {
        // 次级选择：用户主目录下专用隐藏目录
        baseDir = path.join(app.getPath('home'), '.nuoan-ai');
      } catch (_) {
        // 最后兜底：当前工作目录下专用目录（仍在用户可写位置）
        baseDir = path.join(process.cwd(), '.nuoan-ai');
      }
    }
    deviceJsonPath = path.join(baseDir, 'device.json');
  }
  return deviceJsonPath;
}

function migrateLegacyDeviceJsonIfNeeded() {
  try {
    const legacyPath = path.join(__dirname, 'device.json');
    const targetPath = getDeviceJsonPath();
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    if (fs.existsSync(legacyPath) && !fs.existsSync(targetPath)) {
      fs.copyFileSync(legacyPath, targetPath);
      try { fs.unlinkSync(legacyPath); } catch (_) {}
      console.log('已迁移 legacy device.json 到用户目录:', targetPath);
    }
    console.log('device.json 路径:', targetPath);
  } catch (e) {
    console.warn('迁移/初始化 device.json 路径失败:', e.message);
  }
}

function loadDeviceJson() {
  try {
    const p = getDeviceJsonPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const data = JSON.parse(raw || '{}');
      // 基础字段兜底
      return {
        currentUid: data.currentUid || '',
        uids: Array.isArray(data.uids) ? data.uids : [],
        lastKnownPoints: typeof data.lastKnownPoints === 'number' ? data.lastKnownPoints : 0,
        pointsSnapshots: Array.isArray(data.pointsSnapshots) ? data.pointsSnapshots : [],
        deviceInfo: typeof data.deviceInfo === 'object' && data.deviceInfo ? data.deviceInfo : {},
        // 新增创建状态
        status: data.status === 'authorized' ? 'authorized' : 'unauthorized',
        usageSeconds: typeof data.usageSeconds === 'number' ? data.usageSeconds : 0,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        origin: typeof data.origin === 'string' ? data.origin : ''
      };
    }
  } catch (e) {
    console.warn('读取device.json失败:', e.message);
  }
  return { currentUid: '', uids: [], lastKnownPoints: 0, pointsSnapshots: [], deviceInfo: {}, status: 'unauthorized', usageSeconds: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), origin: '' };
}

function saveDeviceJson(data) {
  try {
    const p = getDeviceJsonPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload = { ...data, updatedAt: new Date().toISOString() };
    fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (e) {
    console.warn('写入device.json失败:', e.message);
  }
}

function addUsageSeconds(deltaSeconds) {
  try {
    const json = loadDeviceJson();
    const next = Math.max(0, (json.usageSeconds || 0) + Math.max(0, deltaSeconds || 0));
    json.usageSeconds = next;
    saveDeviceJson(json);
  } catch (_) {}
}

function setLocalAuthorized(flag) {
  try {
    const json = loadDeviceJson();
    json.status = flag ? 'authorized' : 'unauthorized';
    saveDeviceJson(json);
  } catch (_) {}
}

function ensureDeviceJsonSyncWithStore() {
  // 以 device.json 为权威；若为空则用 store 填充
  const json = loadDeviceJson();
  if (!json.currentUid) {
    if (hardwareId) {
      json.currentUid = hardwareId;
      json.uids = [...json.uids, { uid: hardwareId, createdAt: new Date().toISOString() }];
      const storedFingerprint = store.get('hardwareFingerprint');
      const storedId = store.get('hardwareId');
      if (storedId && !storedFingerprint) {
        json.origin = 'legacy-store';
      } else {
        json.origin = json.origin || 'generated';
      }
      saveDeviceJson(json);
    }
    return;
  }

  // 如果 device.json 与 store 不一致，以 device.json 为准
  if (json.currentUid && json.currentUid !== hardwareId) {
    prevHardwareId = hardwareId || prevHardwareId || '';
    store.set('prevHardwareId', prevHardwareId);
    hardwareId = json.currentUid;
    store.set('hardwareId', hardwareId);
  }
}

// 网络连接检测
async function checkNetworkConnection() {
  try {
    // 尝试连接百度作为网络检测
    await axios.get('https://www.baidu.com', { timeout: 5000 });
    return true;
  } catch (error) {
    console.log('网络连接检测失败:', error.message);
    return false;
  }
}

// 检测后端服务可用性
async function checkBackendAvailability() {
  try {
    const response = await axios.get(`${apiBaseUrl}/health`, { timeout: 10000 });
    return response.status === 200;
  } catch (error) {
    console.log('后端服务检测失败:', error.message);
    return false;
  }
}

// 自动更新：初始化
function setupAutoUpdater() {
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    // 如果提供了自定义更新地址，则覆盖（可选）
    const customFeed = process.env.NUOAN_UPDATER_URL;
    if (customFeed && typeof customFeed === 'string' && customFeed.startsWith('http')) {
      try {
        autoUpdater.setFeedURL({ provider: 'generic', url: customFeed });
      } catch (_e) {}
    }

    autoUpdater.on('checking-for-update', () => {
      console.log('[updater] 正在检查更新...');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:event', { type: 'checking' });
      }
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[updater] 发现可用更新:', info.version);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:event', { type: 'available', info });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[updater] 暂无更新');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:event', { type: 'none', info });
      }
    });

    autoUpdater.on('error', (err) => {
      console.warn('[updater] 更新错误:', err?.message || err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:event', { type: 'error', error: err?.message || String(err) });
      }
    });

    autoUpdater.on('download-progress', (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:event', { type: 'progress', progress });
      }
    });

    autoUpdater.on('update-downloaded', async (info) => {
      console.log('[updater] 更新已下载，准备安装');
      try {
        const result = await dialog.showMessageBox({
          type: 'question',
          buttons: ['立即安装'],
          defaultId: 0,
          cancelId: 1,
          title: '发现新版本',
          message: `已下载新版本 ${info.version}，是否现在安装并重启？`
        });
        if (result.response === 0) {
          setImmediate(() => autoUpdater.quitAndInstall(false, true));
        }
      } catch (_e) {
        // 兜底：退出并安装
        setImmediate(() => autoUpdater.quitAndInstall(false, true));
      }
    });
  } catch (e) {
    console.warn('[updater] 初始化失败:', e.message);
  }
}

function startUpdateChecks() {
  // 启动后检查一次，然后每6小时检查一次
  try { autoUpdater.checkForUpdatesAndNotify(); } catch (_e) {}
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(() => {
    try { autoUpdater.checkForUpdatesAndNotify(); } catch (_e) {}
  }, 6 * 60 * 60 * 1000);
}

// 创建主窗口
function createWindow() {
  // 应用图标的完整路径（打包后从 resourcesPath 读取，开发时从源码目录读取）
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'logo.ico')
    : path.join(__dirname, 'assets', 'logo.ico');
  
  // 输出图标路径，检查是否存在
  console.log('应用图标路径:', iconPath);
  console.log('图标文件是否存在:', require('fs').existsSync(iconPath));
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: iconPath,
    title: '诺安科技身份认证',
    show: false, // 先不显示窗口，等加载完成后再显示
    backgroundColor: '#f5f7fa' // 设置背景色，减少白屏闪烁
  });

  // 加载主页面
  mainWindow.loadFile('index.html');
  
  // 当页面加载完成后再显示窗口，减少白屏时间
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setTitle('诺安科技身份认证');
  });

  // 开发模式打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
}

// 自动检测并迁移旧设备数据
async function autoCheckAndMigrate() {
  try {
    console.log('开始自动迁移检测...');
    
    if (!hardwareId) {
      console.log('hardwareId未生成，跳过迁移检测');
      return;
    }
    
    // 调用后端迁移接口
    const response = await axios.post(`${apiBaseUrl}/desktop/smart-migrate`, {
      currentUid: hardwareId
    }, {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success && response.data.migrated) {
      console.log('自动迁移成功:', response.data.message);
      console.log('已恢复积分:', response.data.data.points);
      
      // 清除旧的认证信息，强制重新认证
      store.delete('authToken');
      store.delete('userInfo');
      store.delete('deviceInfo');
      authToken = '';
      
      // 通知渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('migration-success', response.data);
      }
    } else {
      console.log('无需迁移或迁移未执行:', response.data.message);
    }
  } catch (error) {
    console.log('自动迁移检测失败:', error.message);
  }
}

// 获取硬件唯一ID
async function getHardwareId(forceRecompute = false) {
  try {
    if (!forceRecompute && hardwareId) {
      return hardwareId;
    }
    
    const storedId = store.get('hardwareId');
    const storedFingerprint = store.get('hardwareFingerprint');
    const isOldVersion = storedId && !storedFingerprint;
    
    // 检测到旧版本的UID，需要升级
    if (isOldVersion && !forceRecompute) {
      console.log('检测到旧版本UID，准备升级...');
      console.log('旧UID:', storedId);
      prevHardwareId = storedId;
      store.set('prevHardwareId', prevHardwareId);
      // 继续生成新UID
    } else if (storedId && !forceRecompute && storedFingerprint) {
      console.log('使用已存储的设备ID');
      hardwareId = storedId;
      return storedId;
    }
    
    // 强制重算时保存旧的UID用于数据迁移
    if (storedId && forceRecompute) {
      console.log('强制重算UID，保存旧UID用于迁移:', storedId);
      prevHardwareId = storedId;
      store.set('prevHardwareId', prevHardwareId);
    }
    
    console.log('开始收集硬件信息...');
    
    const system = await si.system();
    const baseboard = await si.baseboard();
    const cpu = await si.cpu();
    const osInfo = await si.osInfo();
    const diskLayout = await si.diskLayout();
    const bios = await si.bios();
    
    const fingerprints = [];
    
    const isValidSerial = (value) => {
      if (!value || typeof value !== 'string') return false;
      const trimmed = value.trim();
      return trimmed !== '' && 
             trimmed !== 'unknown' && 
             trimmed !== 'Default string' && 
             trimmed !== '00000000-0000-0000-0000-000000000000';
    };
    
    if (isValidSerial(system.uuid)) {
      fingerprints.push(`board_uuid:${system.uuid}`);
      console.log('主板UUID:', system.uuid);
    } else {
      console.log('主板UUID不可用:', system.uuid);
    }
    
    if (isValidSerial(system.serial)) {
      fingerprints.push(`board_serial:${system.serial}`);
      console.log('主板序列号:', system.serial);
    } else {
      console.log('主板序列号不可用:', system.serial);
    }
    
    if (isValidSerial(baseboard.serial)) {
      fingerprints.push(`baseboard:${baseboard.manufacturer}-${baseboard.model}-${baseboard.serial}`);
      console.log('主板信息:', baseboard.manufacturer, baseboard.model, baseboard.serial);
    }
    
    if (isValidSerial(bios.serial)) {
      fingerprints.push(`bios:${bios.serial}`);
      console.log('BIOS序列号:', bios.serial);
    }
    
    if (isValidSerial(cpu.serial)) {
      fingerprints.push(`cpu:${cpu.serial}`);
      console.log('CPU序列号:', cpu.serial);
    }
    
    if (diskLayout && diskLayout.length > 0) {
      const mainDisk = diskLayout[0];
      if (isValidSerial(mainDisk.serialNum)) {
        fingerprints.push(`disk:${mainDisk.serialNum}`);
        console.log('硬盘序列号:', mainDisk.serialNum);
      }
    }
    
    if (isValidSerial(osInfo.serial)) {
      fingerprints.push(`os:${osInfo.serial}`);
      console.log('OS序列号:', osInfo.serial);
    }
    
    if (fingerprints.length === 0) {
      console.warn('警告：无法获取任何硬件信息，使用随机UUID');
      
      let randomId = store.get('randomDeviceId');
      if (!randomId) {
        const { v4: uuidv4 } = require('uuid');
        randomId = uuidv4();
        store.set('randomDeviceId', randomId);
        console.log('生成新的随机设备ID:', randomId);
      } else {
        console.log('使用已存储的随机设备ID');
      }
      
      fingerprints.push(`random:${randomId}`);
    }
    
    const combinedFingerprint = fingerprints.join('|');
    
    const crypto = require('crypto');
    const salt = process.env.UID_SALT || 'nuoan-desktop-salt-v2';
    const hash = crypto.createHash('sha256').update(`${combinedFingerprint}:${salt}`).digest('hex');
    const id = hash.substring(0, 32);
    
    store.set('hardwareId', id);
    store.set('hardwareFingerprint', combinedFingerprint);
    store.set('hardwareFingerprintCount', fingerprints.length);
    hardwareId = id;

    // 同步写入 device.json（保留历史，最新识别）
    const json = loadDeviceJson();
    if (!json.currentUid) {
      json.currentUid = id;
      json.uids = [...json.uids, { uid: id, createdAt: new Date().toISOString() }];
    } else if (json.currentUid !== id) {
      // 新创建设备如出现重复/变更，更新为最新ID并记录历史
      const existed = json.uids.some((u) => u.uid === id);
      if (!existed) {
        json.uids.push({ uid: id, createdAt: new Date().toISOString() });
      }
      // 总是识别最新的
      json.currentUid = id;
    }
    saveDeviceJson(json);
    
    console.log('生成设备UID:', id);
    console.log('使用的指纹源数量:', fingerprints.length);
    
    return id;
    
  } catch (error) {
    console.error('获取硬件ID失败:', error);
    
    const fallbackId = `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    store.set('hardwareId', fallbackId);
    hardwareId = fallbackId;
    // 同步 device.json
    const json = loadDeviceJson();
    const existed = json.uids.some((u) => u.uid === fallbackId);
    if (!existed) {
      json.uids.push({ uid: fallbackId, createdAt: new Date().toISOString() });
    }
    json.currentUid = fallbackId;
    saveDeviceJson(json);
    
    console.error('使用异常fallback ID:', fallbackId);
    return fallbackId;
  }
}

async function ensureNonConflictingUidForNewInstall() {
  try {
    // 仅对“新设备”判断：未授权且使用时长很短（例如 < 5 分钟）
    const json = loadDeviceJson();
    const storedFingerprint = store.get('hardwareFingerprint');
    const storedId = store.get('hardwareId');
    const isLegacyCarryOver = storedId && !storedFingerprint; // 旧版本兼容场景：跳过冲突检测，不改UID
    const isNew = (json.status !== 'authorized') && ((json.usageSeconds || 0) < 300) && !isLegacyCarryOver && json.origin !== 'legacy-store';
    if (!isNew) return;

    // 使用当前 UID 查询后端是否已存在（避免劫持老账号）
    const resp = await axios.post(`${apiBaseUrl}/desktop/verify-device`, { uid: hardwareId }, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });
    if (resp?.data?.success) {
      // 设备已存在于后端：视为冲突 → 更新“新的”UID，而不动老的
      const crypto = require('crypto');
      const freshHash = crypto.createHash('sha256').update(`${json.deviceInfo?.platform || ''}:${json.deviceInfo?.os || ''}:${json.deviceInfo?.version || ''}:${Date.now()}:${Math.random()}`).digest('hex');
      const newUid = freshHash.substring(0, 32);
      // 写入 json 与 store，仅更新“新的”
      const existed = json.uids.some((u) => u.uid === newUid);
      if (!existed) {
        json.uids.push({ uid: newUid, createdAt: new Date().toISOString() });
      }
      json.currentUid = newUid;
      saveDeviceJson(json);
      store.set('hardwareId', newUid);
      hardwareId = newUid;
      console.log('检测到 UID 冲突，已为新设备生成新UID:', newUid);
    }
  } catch (e) {
    // verify-device 不存在或网络失败：忽略，按现有流程继续
    console.log('UID 冲突检测失败或未启用，跳过:', e?.message || e);
  }
}

// 与后端API通信
async function authenticateWithBackend(retryCount = 0) {
  const maxRetries = 3;
  const retryDelay = 2000; // 2秒延迟
  
  try {
    if (!hardwareId) {
      // 默认优先使用缓存；若无缓存再计算
      hardwareId = await getHardwareId(false);
    }
    
    // 确保后端服务可用
    const isBackendAvailable = await checkBackendAvailability();
    if (!isBackendAvailable) {
      const err = new Error('后端服务不可用，请检查服务状态或联系管理员');
      err.status = 502;
      throw err;
    }
    
    const deviceInfo = {
      platform: process.platform,
      os: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
      version: process.getSystemVersion()
    };

    // 设置请求超时和重试配置
    // 新设备冲突检测：若存在冲突，则只更新“新的”UID（不动老的）
    await ensureNonConflictingUidForNewInstall();

    const response = await axios.post(`${apiBaseUrl}/desktop/authenticate`, {
      uid: hardwareId,
      deviceInfo
    }, {
      timeout: 30000, // 30秒超时
      headers: {
        'User-Agent': 'NuoaAI-Desktop/1.0.0',
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      authToken = response.data.data.token;
      store.set('authToken', authToken);
      store.set('userInfo', response.data.data.user);
      store.set('deviceInfo', response.data.data.device);

      // 记录积分快照到 device.json（仅记录最后一次，不参与实际使用）
      try {
        const d = response.data.data.device || {};
        const pts = typeof d.points === 'number' ? d.points : 0;
        const json = loadDeviceJson();
        json.lastKnownPoints = pts;
        json.pointsSnapshots = Array.isArray(json.pointsSnapshots) ? json.pointsSnapshots : [];
        json.pointsSnapshots.push({ uid: hardwareId, points: pts, recordedAt: new Date().toISOString() });
        // 同步记录设备信息概览
        json.deviceInfo = {
          platform: process.platform,
          os: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
          version: process.getSystemVersion()
        };
        // 同步授权状态
        json.status = d && d.isActive ? 'authorized' : 'unauthorized';
        saveDeviceJson(json);
      } catch (_) {}
      
      console.log('设备认证成功:', response.data.data.user.username);

      // 若后端要求刷新UID，则执行一次强制重算并通知后端清除标记
      try {
        if (response.data.data.device?.requireUidRefresh) {
          const freshId = await getHardwareId(true);
          if (freshId && freshId !== hardwareId) {
            prevHardwareId = hardwareId;
            store.set('prevHardwareId', prevHardwareId);
            hardwareId = freshId;
            store.set('hardwareId', hardwareId);
            // 同步 device.json（追加历史并切换当前）
            const json = loadDeviceJson();
            const existed = json.uids.some((u) => u.uid === freshId);
            if (!existed) {
              json.uids.push({ uid: freshId, createdAt: new Date().toISOString() });
            }
            json.currentUid = freshId;
            saveDeviceJson(json);
          }
          // 清除后端标记
          await axios.post(`${apiBaseUrl}/desktop/clear-uid-refresh`, { uid: hardwareId }, {
            headers: { Authorization: `Bearer ${authToken}` },
            timeout: 15000
          });
          // 弹窗提示：UID 已重置
          try {
            await dialog.showMessageBox({
              type: 'info',
              buttons: ['确定'],
              defaultId: 0,
              title: '设备UID已重置',
              message: '本机设备UID已重置',
              detail: `新的UID已生效。如网页端仍显示旧数据，请刷新页面或重新登录。\n新UID: ${hardwareId}`
            });
          } catch (_) {}
        }
      } catch (flagErr) {
        console.warn('处理UID刷新标记失败:', flagErr?.message || flagErr);
      }

      // 移除认证后的补偿覆盖逻辑；仅使用 device.json 中的 UID

      return response.data.data;
    } else {
      throw new Error(response.data.message || '认证失败');
    }
  } catch (error) {
    console.error(`设备认证失败 (尝试 ${retryCount + 1}/${maxRetries + 1}):`, error.message);
    
    // 检查是否是网络相关错误
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
        error.message.includes('socket hang up') || error.message.includes('timeout')) {
      
      if (retryCount < maxRetries) {
        console.log(`网络错误，${retryDelay/1000}秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return authenticateWithBackend(retryCount + 1);
      } else {
        throw new Error(`网络连接失败，已重试${maxRetries}次。请检查网络连接和后端服务状态。`);
      }
    }
    
    // 如果后端返回403，统一替换为自定义提示
    const status = error.response?.status;
    if (status === 403) {
      const contact = process.env.ADMIN_CONTACT || '';
      const customMessage = contact ? `未授权，联系管理员进行授权，联系方式：${contact}` : '未授权，联系管理员进行授权';
      const err = new Error(customMessage);
      err.status = 403;
      throw err;
    }
    
    // 其他错误
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    } else if (error.message) {
      throw new Error(error.message);
    } else {
      throw new Error('未知认证错误');
    }
  }
}

// 定时验证设备状态
async function verifyDeviceStatus(retryCount = 0) {
  const maxRetries = 2;
  const retryDelay = 1000; // 1秒延迟
  
  try {
    const response = await axios.post(`${apiBaseUrl}/desktop/verify-device`, {
      uid: hardwareId
    }, {
      headers: { Authorization: `Bearer ${authToken}` },
      timeout: 15000 // 15秒超时
    });

    if (response.data.success) {
      console.log('设备状态验证成功');
      return response.data.data;
    }
  } catch (error) {
    console.error(`设备状态验证失败 (尝试 ${retryCount + 1}/${maxRetries + 1}):`, error.message);
    
    // 检查是否是网络相关错误
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
        error.message.includes('socket hang up') || error.message.includes('timeout')) {
      
      if (retryCount < maxRetries) {
        console.log(`网络错误，${retryDelay/1000}秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return verifyDeviceStatus(retryCount + 1);
      } else {
        console.error('设备状态验证网络失败，已重试最大次数');
        return null;
      }
    }
    
    // 如果验证失败，尝试重新认证
    if (error.response?.status === 401) {
      console.log('Token过期，尝试重新认证...');
      try {
        await authenticateWithBackend();
        return await verifyDeviceStatus(); // 重新验证
      } catch (authError) {
        console.error('重新认证失败:', authError.message);
        return null;
      }
    }
    
    return null;
  }
}

// 启动定时验证
function startVerificationTimer() {
  // 每5分钟验证一次设备状态
  verificationInterval = setInterval(async () => {
    await verifyDeviceStatus();
  }, 5 * 60 * 1000);
}

// 停止定时验证
function stopVerificationTimer() {
  if (verificationInterval) {
    clearInterval(verificationInterval);
    verificationInterval = null;
  }
}

// 创建本地HTTP服务器
function createLocalServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // 新增：允许私有网络访问（Chrome PNA 预检）
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    
    if (req.method === 'OPTIONS') {
      // 预检请求也需要返回 PNA 头
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/status' && req.method === 'GET') {
      // 返回桌面程序状态
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const json = loadDeviceJson();
      res.end(JSON.stringify({
        success: true,
        data: {
          status: 'running',
          version: '1.0.0',
          hardwareId: json.currentUid || hardwareId,
          isAuthenticated: !!authToken,
          apiBaseUrl,
          timestamp: new Date().toISOString(),
          deviceJson: {
            currentUid: json.currentUid,
            prevUid: json.uids && json.uids.length > 1 ? json.uids[json.uids.length - 2]?.uid : '',
            history: json.uids || [],
            lastKnownPoints: json.lastKnownPoints || 0,
            status: json.status || 'unauthorized',
            usageSeconds: json.usageSeconds || 0
          }
        }
      }));
    } else if (pathname === '/api/uid' && req.method === 'GET') {
      // 返回设备UID
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const json = loadDeviceJson();
      const current = json.currentUid || hardwareId;
      res.end(JSON.stringify({
        success: true,
        data: {
          uid: current,
          prevUid: json.uids && json.uids.length > 1 ? json.uids[json.uids.length - 2]?.uid : '',
          history: json.uids || [],
          lastKnownPoints: json.lastKnownPoints || 0,
          status: json.status || 'unauthorized',
          usageSeconds: json.usageSeconds || 0,
          deviceInfo: {
            platform: process.platform,
            os: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
            version: process.getSystemVersion()
          }
        }
      }));
    } else if (pathname === '/api/uid/update' && req.method === 'POST') {
      // 手动更新当前UID（用于处理新创建设备重复码，切换为最新）
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const newUid = typeof payload.newUid === 'string' ? payload.newUid.trim() : '';
          if (!newUid || newUid.length < 10) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: '无效的UID' }));
            return;
          }
          const json = loadDeviceJson();
          const existed = json.uids.some((u) => u.uid === newUid);
          if (!existed) {
            json.uids.push({ uid: newUid, createdAt: new Date().toISOString() });
          }
          json.currentUid = newUid;
          saveDeviceJson(json);
          // 同步内存与store
          store.set('hardwareId', newUid);
          hardwareId = newUid;
          prevHardwareId = json.uids.length > 1 ? json.uids[json.uids.length - 2]?.uid : '';
          store.set('prevHardwareId', prevHardwareId || '');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { uid: newUid } }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: '请求数据无效' }));
        }
      });
    } else if (pathname === '/api/config' && req.method === 'GET') {
      // 返回当前配置
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { apiBaseUrl } }));
    } else if (pathname === '/api/config' && req.method === 'POST') {
      // 设置配置（支持设置apiBaseUrl）
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const json = body ? JSON.parse(body) : {};
          if (json.apiBaseUrl && typeof json.apiBaseUrl === 'string') {
            apiBaseUrl = json.apiBaseUrl.replace(/\/$/, ''); // 去掉末尾斜杠
            store.set('apiBaseUrl', apiBaseUrl);
            console.log('已更新后端API地址为:', apiBaseUrl);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { apiBaseUrl } }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: '无效的配置数据' }));
        }
      });
    } else if (pathname === '/api/authenticate' && req.method === 'POST') {
      // 处理认证请求（允许请求体携带apiBaseUrl）
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          if (payload.apiBaseUrl && typeof payload.apiBaseUrl === 'string') {
            apiBaseUrl = payload.apiBaseUrl.replace(/\/$/, '');
            store.set('apiBaseUrl', apiBaseUrl);
            console.log('认证前更新后端API地址为:', apiBaseUrl);
          }
          const result = await authenticateWithBackend();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: result
          }));
        } catch (error) {
          let status = error.status || error.response?.status;
          if (!status) {
            const msg = error.message || '';
            if (msg.includes('网络连接不可用')) status = 503;
            else if (msg.includes('后端服务不可用')) status = 502;
            else status = 500;
          }
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: error.message
          }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: '接口不存在'
      }));
    }
  });

  const PORT = 3001; // 桌面程序本地服务器端口
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`桌面程序本地服务器启动在端口 ${PORT}`);
  });

  return server;
}

// IPC通信处理
ipcMain.handle('get-hardware-id', async () => {
  if (!hardwareId) {
    hardwareId = await getHardwareId();
  }
  return hardwareId;
});

ipcMain.handle('authenticate', async () => {
  try {
    const result = await authenticateWithBackend();
    startVerificationTimer();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('verify-status', async () => {
  try {
    const result = await verifyDeviceStatus();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-network', async () => {
  try {
    const networkStatus = await checkNetworkConnection();
    const backendStatus = await checkBackendAvailability();
    return {
      success: true,
      data: {
        network: networkStatus,
        backend: backendStatus,
        apiUrl: apiBaseUrl
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-stored-data', () => {
  return {
    hardwareId: store.get('hardwareId'),
    authToken: store.get('authToken'),
    userInfo: store.get('userInfo'),
    deviceInfo: store.get('deviceInfo'),
    apiBaseUrl: store.get('apiBaseUrl') || apiBaseUrl
  };
});

ipcMain.handle('open-external-link', async (event, url) => {
  await shell.openExternal(url);
});

// 自动更新：IPC
ipcMain.handle('updater-check', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('updater-quit-and-install', () => {
  try {
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-app-version', () => {
  return { version: app.getVersion() };
});
 
// 应用生命周期
app.whenReady().then(() => {
  // 设置应用程序的名称
  app.setName('诺安科技身份认证');
  
  // 先创建窗口，优先显示UI
  createWindow();
  
  // 然后在后台异步执行其他初始化操作
  setTimeout(async () => {
    // 检查是否需要升级UID（从旧版本升级）
    const storedId = store.get('hardwareId');
    const storedFingerprint = store.get('hardwareFingerprint');
    const isOldVersion = storedId && !storedFingerprint;
    
    if (isOldVersion) {
      // 兼容旧版本：沿用旧UID，不做重算，后续认证会同步授权状态
      console.log('检测到旧版本UID，保持兼容，沿用旧UID:', storedId);
      hardwareId = storedId;
      store.set('hardwareId', hardwareId);
    } else if (!hardwareId) {
      // 正常情况，获取或生成UID
      hardwareId = await getHardwareId(false);
      store.set('hardwareId', hardwareId);
    }

    // 初始化/迁移并对齐 device.json（确保保存到用户目录）
    migrateLegacyDeviceJsonIfNeeded();
    ensureDeviceJsonSyncWithStore();

    // 启动使用时长定时器：每60秒累计一次
    if (usageTimer) clearInterval(usageTimer);
    usageTimer = setInterval(() => {
      try {
        addUsageSeconds(60);
      } catch (_) {}
    }, 60 * 1000);
    
    // 尝试从存储中恢复认证信息
    const storedToken = store.get('authToken');
    if (storedToken) {
      authToken = storedToken;
      startVerificationTimer();
    }
    
    // 移除自动迁移检测：避免频繁迁移，按“新设备不迁移”的策略执行
    
    // 启动本地服务器
    localServer = createLocalServer();
    
    // 自动更新
    setupAutoUpdater();
    startUpdateChecks();

    // 通知渲染进程初始化完成
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('init-complete', { hardwareId });
    }
  }, 500); // 延迟500毫秒执行初始化，优先保证UI显示
});

app.on('window-all-closed', () => {
  stopVerificationTimer();
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  if (localServer) {
    localServer.close();
  }
  try {
    const delta = Math.floor((Date.now() - sessionStartMs) / 1000);
    if (delta > 0) addUsageSeconds(delta);
  } catch (_) {}
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopVerificationTimer();
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  if (localServer) {
    localServer.close();
  }
  try {
    // 退出前累计本次会话使用时长
    const delta = Math.floor((Date.now() - sessionStartMs) / 1000);
    if (delta > 0) addUsageSeconds(delta);
  } catch (_) {}
}); 