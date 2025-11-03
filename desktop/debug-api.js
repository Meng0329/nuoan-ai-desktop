const axios = require('axios');

// 禁用SSL证书验证（仅用于开发调试）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// 配置不同的API基础地址进行测试
const apiUrls = [
  'http://nuoanai.com/api',
  'https://nuoanai.com/api',
  'http://localhost:8808/api',
  'https://localhost:8808/api',
  'http://127.0.0.1:8808/api',
];

// 测试设备UID（用于测试）
const testUid = '592b5088fce5229fd323a3ec72cdcf14';

// 测试的接口列表
const endpoints = [
  { method: 'GET', path: '/health', data: null },
  { method: 'GET', path: '/desktop/version', data: null },
  { method: 'GET', path: '/desktop/download-info', data: null },
  { method: 'POST', path: '/desktop/authenticate', data: { 
      uid: testUid, 
      deviceInfo: { platform: 'win32', os: 'Windows', version: '10.0.26100' } 
    } 
  },
  { method: 'POST', path: '/desktop/verify-device', data: { uid: testUid } },
  { method: 'POST', path: '/desktop/smart-migrate', data: { currentUid: testUid } },
];

// 测试单个接口
async function testEndpoint(baseUrl, endpoint) {
  const url = `${baseUrl}${endpoint.path}`;
  try {
    const config = {
      timeout: 5000,
      validateStatus: () => true, // 接受所有状态码
    };

    let response;
    if (endpoint.method === 'GET') {
      response = await axios.get(url, config);
    } else {
      response = await axios.post(url, endpoint.data, config);
    }

    const status = response.status;
    const success = response.data?.success;
    const message = response.data?.message || '';
    
    let statusEmoji = '✅';
    if (status === 404) statusEmoji = '❌ 404';
    else if (status === 403) statusEmoji = '⚠️ 403';
    else if (status === 500) statusEmoji = '💥 500';
    else if (status >= 400) statusEmoji = `⚠️ ${status}`;

    console.log(`  ${statusEmoji} ${endpoint.method} ${endpoint.path}`);
    console.log(`     状态: ${status}, 成功: ${success}, 消息: ${message}`);
    
    return { status, success, message };
  } catch (error) {
    const errorMsg = error.code === 'ECONNREFUSED' 
      ? '连接被拒绝' 
      : error.code === 'ETIMEDOUT'
      ? '连接超时'
      : error.message;
    
    console.log(`  ❌ ${endpoint.method} ${endpoint.path}`);
    console.log(`     错误: ${errorMsg}`);
    return { error: errorMsg };
  }
}

// 测试所有API地址
async function testAllApis() {
  console.log('='.repeat(80));
  console.log('🔍 开始测试诺安AI接口可用性');
  console.log('='.repeat(80));
  console.log();

  for (const baseUrl of apiUrls) {
    console.log(`\n📡 测试API地址: ${baseUrl}`);
    console.log('-'.repeat(80));
    
    for (const endpoint of endpoints) {
      await testEndpoint(baseUrl, endpoint);
    }
    
    console.log();
  }

  console.log('='.repeat(80));
  console.log('✅ 测试完成');
  console.log('='.repeat(80));
}

// 运行测试
testAllApis().catch(console.error);

