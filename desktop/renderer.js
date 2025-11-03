const { ipcRenderer, clipboard } = require('electron');

// DOM元素
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const networkIndicator = document.getElementById('networkIndicator');
const networkText = document.getElementById('networkText');
const backendIndicator = document.getElementById('backendIndicator');
const backendText = document.getElementById('backendText');
const hardwareIdElement = document.getElementById('hardwareId');
const copyHardwareIdBtn = document.getElementById('copyHardwareId');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');
const successElement = document.getElementById('success');
const authenticateBtn = document.getElementById('authenticateBtn');
const verifyBtn = document.getElementById('verifyBtn');
const apiUrlElement = document.getElementById('apiUrl');
const openWebBtnElement = document.getElementById('openWebBtn');

// 初始化
async function init() {
    try {
        // 获取存储的数据
        const storedData = await ipcRenderer.invoke('get-stored-data');
        
        // 如果有存储的硬件ID，立即显示
        if (storedData.hardwareId) {
            hardwareIdElement.textContent = storedData.hardwareId;
        } else {
            hardwareIdElement.textContent = '正在获取...';
        }
        
        // 显示API地址
        if (storedData.apiBaseUrl && apiUrlElement) {
            apiUrlElement.textContent = storedData.apiBaseUrl;
            if (storedData.isDev) {
                apiUrlElement.textContent += ' (开发模式)';
                apiUrlElement.style.color = '#ff9800';
            }
        }
        
        // 如果有存储的认证信息，立即更新UI
        if (storedData.authToken && storedData.userInfo) {
            updateStatus('online', '已连接');
            verifyBtn.disabled = false;
        }
        
        // 监听主进程初始化完成事件
        ipcRenderer.on('init-complete', (event, data) => {
            if (data.hardwareId) {
                hardwareIdElement.textContent = data.hardwareId;
            }
            
            // 网络状态检查已禁用
        });
        
        // 已禁用：自动认证功能会导致新注册用户自动生成reclaimed重复UID问题
        // ipcRenderer.on('auto-auth-success', (event, data) => {
        //     console.log('自动认证成功，设备信息已上报到管理后台');
        //     updateStatus('online', '已自动认证');
        //     verifyBtn.disabled = false;
        //     
        //     // 显示用户信息
        //     if (data.user) {
        //         console.log('用户信息:', data.user.username);
        //     }
        //     if (data.device) {
        //         console.log('设备信息已同步到管理后台');
        //     }
        //     
        //     // 显示成功提示并高亮按钮
        //     showSuccess('✅ 设备已自动认证！现在可以点击"一键打开AI绘图"按钮开始创作');
        //     highlightWebButton();
        // });
        // 
        // ipcRenderer.on('auto-auth-failed', (event, data) => {
        //     console.log('自动认证失败:', data.error);
        //     // 打印更多调试信息
        //     try {
        //         ipcRenderer.invoke('get-stored-data').then(stored => {
        //             console.log('[Desktop][Debug] 当前配置:', {
        //                 apiBaseUrl: stored.apiBaseUrl,
        //                 hasAuthToken: !!stored.authToken,
        //                 hasUserInfo: !!stored.userInfo,
        //                 hardwareId: stored.hardwareId,
        //             });
        //         });
        //     } catch (_) {}
        //     updateStatus('offline', '未认证');
        //     // 不显示错误提示，用户可以手动点击认证按钮
        // });
    } catch (error) {
        console.error('初始化失败:', error);
        showError('初始化失败: ' + error.message);
    }
}

// 设备认证
async function authenticate() {
    try {
        setLoading(true);
        updateStatus('connecting', '正在认证...');
        
        // 网络状态检查已禁用，直接进行认证
        const result = await ipcRenderer.invoke('authenticate');
        
        if (result.success) {
            updateStatus('online', '认证成功');
            verifyBtn.disabled = false;
            showSuccess('设备认证成功！');
        } else {
            updateStatus('offline', '认证失败');
            showError('认证失败: ' + result.error);
        }
    } catch (error) {
        updateStatus('offline', '认证失败');
        showError('认证失败: ' + error.message);
    } finally {
        setLoading(false);
    }
}

// 验证状态
async function verifyStatus() {
    try {
        setLoading(true);
        updateStatus('connecting', '正在验证...');
        
        const result = await ipcRenderer.invoke('verify-status');
        
        if (result.success) {
            updateStatus('online', '验证成功');
            showSuccess('设备状态验证成功！');
        } else {
            updateStatus('offline', '验证失败');
            showError('验证失败: ' + result.error);
        }
    } catch (error) {
        updateStatus('offline', '验证失败');
        showError('验证失败: ' + error.message);
    } finally {
        setLoading(false);
    }
}

// 打开Web应用（已弃用，请使用openWebAppDirect）
function openWebApp() {
    // 不再使用localhost，改为打开官网
    openWebAppDirect();
}

// 新增：打开外部链接
function openExternalLink(url) {
    ipcRenderer.invoke('open-external-link', url);
}

// 新增：一键打开官网AI绘图页面
async function openWebAppDirect() {
    try {
        // 获取存储的API配置
        const storedData = await ipcRenderer.invoke('get-stored-data');
        let webUrl = 'https://nuoanai.com';
        
        // 如果配置了API地址，尝试提取网站域名（但过滤掉localhost）
        if (storedData.apiBaseUrl) {
            try {
                const apiUrl = new URL(storedData.apiBaseUrl);
                // 从 API 地址提取网站地址（去掉 /api 后缀）
                const extractedUrl = `${apiUrl.protocol}//${apiUrl.host}`;
                
                // 只有非localhost地址才使用，否则使用默认线上地址
                if (!apiUrl.hostname.includes('localhost') && 
                    !apiUrl.hostname.includes('127.0.0.1') && 
                    !apiUrl.hostname.includes('0.0.0.0')) {
                    webUrl = extractedUrl;
                } else {
                    console.log('检测到localhost地址，使用默认官网地址');
                }
            } catch (e) {
                console.log('无法解析API地址，使用默认官网地址');
            }
        }
        
        // 打开登录页，添加 autoLogin 参数触发自动登录
        const loginUrl = `${webUrl}/login?autoLogin=true`;
        console.log('打开官网并自动登录:', loginUrl);
        
        await ipcRenderer.invoke('open-external-link', loginUrl);
        showSuccess('正在打开浏览器，页面将自动登录...');
        
        // 提示用户
        setTimeout(() => {
            showSuccess('浏览器已打开，页面将自动登录并跳转到AI绘图页面');
        }, 2000);
    } catch (error) {
        console.error('打开官网失败:', error);
        showError('打开官网失败: ' + error.message);
    }
}

// 更新状态
function updateStatus(status, text) {
    statusIndicator.className = `status-indicator status-${status}`;
    statusText.textContent = text;
}

// 更新网络状态 - 已禁用
async function updateNetworkStatus() {
    // 网络状态检查已禁用
    // 默认显示为正常状态
    if (networkIndicator && networkText) {
        updateNetworkIndicator(true);
    }
    if (backendIndicator && backendText) {
        updateBackendIndicator(true);
    }
}

// 更新网络状态指示器
function updateNetworkIndicator(isOnline) {
    if (networkIndicator && networkText) {
        networkIndicator.className = `status-indicator status-${isOnline ? 'online' : 'offline'}`;
        networkText.textContent = isOnline ? '正常' : '异常';
    }
}

// 更新后端服务状态指示器
function updateBackendIndicator(isOnline) {
    if (backendIndicator && backendText) {
        backendIndicator.className = `status-indicator status-${isOnline ? 'online' : 'offline'}`;
        backendText.textContent = isOnline ? '正常' : '异常';
    }
}

// 显示加载状态
function setLoading(loading) {
    loadingElement.style.display = loading ? 'block' : 'none';
    if (authenticateBtn) authenticateBtn.disabled = loading;
    if (verifyBtn) verifyBtn.disabled = loading;
}

// 显示错误信息
function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

// 显示成功信息
function showSuccess(message) {
    successElement.textContent = message;
    successElement.style.display = 'block';
    setTimeout(() => {
        successElement.style.display = 'none';
    }, 3000);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 绑定“一键打开AI绘图”按钮点击事件（避免内联事件被CSP拦截）
if (openWebBtnElement) {
    openWebBtnElement.addEventListener('click', () => {
        try { openWebAppDirect(); } catch (_) {}
    });
}

// 复制硬件ID
if (copyHardwareIdBtn) {
    copyHardwareIdBtn.addEventListener('click', () => {
        const hardwareId = (hardwareIdElement?.textContent || '').trim();
        if (hardwareId) {
            clipboard.writeText(hardwareId);
            showSuccess('硬件ID已复制到剪贴板');
        }
    });
}

// 高亮"一键打开AI绘图"按钮
function highlightWebButton() {
    const openWebBtn = document.getElementById('openWebBtn');
    if (!openWebBtn) return;
    
    // 添加脉冲动画
    openWebBtn.style.animation = 'pulse 2s infinite';
    openWebBtn.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.6)';
    
    // 添加CSS动画
    if (!document.getElementById('pulseAnimation')) {
        const style = document.createElement('style');
        style.id = 'pulseAnimation';
        style.textContent = `
            @keyframes pulse {
                0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(76, 175, 80, 0.6); }
                50% { transform: scale(1.05); box-shadow: 0 0 30px rgba(76, 175, 80, 0.8); }
            }
        `;
        document.head.appendChild(style);
    }
}

// 定期检查连接状态
setInterval(async () => {
    try {
        const storedData = await ipcRenderer.invoke('get-stored-data');
        if (storedData.authToken) {
            const result = await ipcRenderer.invoke('verify-status');
            if (result.success) {
                updateStatus('online', '已连接');
            } else {
                updateStatus('offline', '连接断开');
            }
        }
    } catch (error) {
        console.error('状态检查失败:', error);
    }
}, 30000); // 每30秒检查一次 