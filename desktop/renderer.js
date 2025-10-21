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
            
            // 初始化完成后，异步检查网络状态
            setTimeout(() => {
                updateNetworkStatus().catch(err => {
                    console.error('网络状态检查失败:', err);
                });
            }, 1000);
        });
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
        
        // 先检查网络状态
        const networkResult = await ipcRenderer.invoke('check-network');
        if (!networkResult.success) {
            throw new Error('网络检测失败: ' + networkResult.error);
        }
        
        if (!networkResult.data.network) {
            throw new Error('网络连接不可用，请检查网络设置');
        }
        
        if (!networkResult.data.backend) {
            throw new Error('后端服务不可用，请检查服务状态或联系管理员');
        }
        
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

// 打开Web应用
function openWebApp() {
    ipcRenderer.invoke('open-external-link', 'http://localhost:3000');
}

// 新增：打开外部链接
function openExternalLink(url) {
    ipcRenderer.invoke('open-external-link', url);
}

// 更新状态
function updateStatus(status, text) {
    statusIndicator.className = `status-indicator status-${status}`;
    statusText.textContent = text;
}

// 更新网络状态
async function updateNetworkStatus() {
    try {
        const result = await ipcRenderer.invoke('check-network');
        if (result.success) {
            if (networkIndicator && networkText) {
                updateNetworkIndicator(result.data.network);
            }
            if (backendIndicator && backendText) {
                updateBackendIndicator(result.data.backend);
            }
        }
    } catch (error) {
        console.error('网络状态更新失败:', error);
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