// 简单的API测试工具
const axios = require('axios');

// 禁用SSL证书验证（用于测试）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const testUid = '592b5088fce5229fd323a3ec72cdcf14';

// 要测试的服务器地址列表
const servers = [
  'http://nuoanai.com',
  'https://nuoanai.com',
  'http://www.nuoanai.com',
  'https://www.nuoanai.com',
];

// 要测试的接口
const testApis = async (baseUrl) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 测试服务器: ${baseUrl}`);
  console.log('='.repeat(60));

  const tests = [
    { name: 'Health检查', url: `${baseUrl}/api/health`, method: 'GET' },
    { name: '桌面版本', url: `${baseUrl}/api/desktop/version`, method: 'GET' },
    { name: '桌面下载信息', url: `${baseUrl}/api/desktop/download-info`, method: 'GET' },
    { name: '设备认证', url: `${baseUrl}/api/desktop/authenticate`, method: 'POST', data: { uid: testUid, deviceInfo: {} } },
    { name: '设备验证', url: `${baseUrl}/api/desktop/verify-device`, method: 'POST', data: { uid: testUid } },
  ];

  for (const test of tests) {
    try {
      const config = {
        timeout: 5000,
        validateStatus: () => true,
      };

      let response;
      if (test.method === 'GET') {
        response = await axios.get(test.url, config);
      } else {
        response = await axios.post(test.url, test.data, config);
      }

      const status = response.status;
      const statusIcon = status === 200 ? '✅' : 
                        status === 404 ? '❌ 404' : 
                        status === 403 ? '⚠️  403' : 
                        `⚠️  ${status}`;

      console.log(`  ${statusIcon} ${test.name}`);
      console.log(`     URL: ${test.url}`);
      console.log(`     状态: ${status}`);
      
      if (response.data) {
        if (response.data.success !== undefined) {
          console.log(`     成功: ${response.data.success}`);
        }
        if (response.data.message) {
          console.log(`     消息: ${response.data.message}`);
        }
      }
    } catch (error) {
      const errorMsg = error.code === 'ECONNREFUSED' ? '连接被拒绝' : 
                      error.code === 'ETIMEDOUT' ? '连接超时' :
                      error.code === 'ENOTFOUND' ? '域名解析失败' :
                      error.message;
      
      console.log(`  ❌ ${test.name}`);
      console.log(`     URL: ${test.url}`);
      console.log(`     错误: ${errorMsg}`);
    }
  }
};

// 运行所有测试
(async () => {
  console.log('\n🚀 诺安AI服务器接口测试工具');
  console.log('测试设备UID:', testUid);
  
  for (const server of servers) {
    await testApis(server);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成');
  console.log('='.repeat(60));
  console.log('\n💡 提示：');
  console.log('  - 如果所有接口都返回404，说明服务器未运行或地址不对');
  console.log('  - 如果返回403，说明设备未授权');
  console.log('  - 如果连接被拒绝，说明服务器地址或端口不对');
  console.log('  - 如果域名解析失败，说明域名不存在或DNS配置有问题');
})();

