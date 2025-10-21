const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('========================================');
console.log('macOS 构建环境诊断工具');
console.log('========================================\n');

const checks = [];

// 1. 检查操作系统
function checkOS() {
  console.log('1. 检查操作系统...');
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      const version = execSync('sw_vers -productVersion').toString().trim();
      console.log(`   ✅ macOS ${version}`);
      checks.push({ name: '操作系统', status: 'pass', message: `macOS ${version}` });
    } else {
      console.log(`   ⚠️  当前系统: ${platform} (macOS 构建需要在 macOS 上进行)`);
      checks.push({ name: '操作系统', status: 'warn', message: `当前系统: ${platform}` });
    }
  } catch (e) {
    console.log(`   ❌ 无法检测操作系统: ${e.message}`);
    checks.push({ name: '操作系统', status: 'fail', message: e.message });
  }
  console.log('');
}

// 2. 检查 Node.js 版本
function checkNode() {
  console.log('2. 检查 Node.js 版本...');
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    if (major >= 18) {
      console.log(`   ✅ Node.js ${version}`);
      checks.push({ name: 'Node.js', status: 'pass', message: version });
    } else {
      console.log(`   ⚠️  Node.js ${version} (建议使用 18.x 或更高)`);
      checks.push({ name: 'Node.js', status: 'warn', message: `${version} (需要 18.x+)` });
    }
  } catch (e) {
    console.log(`   ❌ 检查失败: ${e.message}`);
    checks.push({ name: 'Node.js', status: 'fail', message: e.message });
  }
  console.log('');
}

// 3. 检查必需的命令行工具
function checkTools() {
  console.log('3. 检查 macOS 工具...');
  const tools = [
    { name: 'iconutil', required: true },
    { name: 'sips', required: false },
    { name: 'file', required: false }
  ];
  
  for (const tool of tools) {
    try {
      execSync(`which ${tool.name}`, { stdio: 'ignore' });
      console.log(`   ✅ ${tool.name} 可用`);
      checks.push({ name: tool.name, status: 'pass', message: '已安装' });
    } catch (e) {
      if (tool.required) {
        console.log(`   ❌ ${tool.name} 不可用（必需）`);
        checks.push({ name: tool.name, status: 'fail', message: '未安装' });
      } else {
        console.log(`   ⚠️  ${tool.name} 不可用（可选）`);
        checks.push({ name: tool.name, status: 'warn', message: '未安装' });
      }
    }
  }
  console.log('');
}

// 4. 检查项目文件
function checkProjectFiles() {
  console.log('4. 检查项目文件...');
  
  const files = [
    { path: 'package.json', required: true },
    { path: 'main.js', required: true },
    { path: 'assets/logo.png', required: true },
    { path: 'generateMacIcon.js', required: true },
    { path: 'afterPack.js', required: true }
  ];
  
  for (const file of files) {
    const fullPath = path.join(__dirname, file.path);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      const size = (stats.size / 1024).toFixed(2);
      console.log(`   ✅ ${file.path} (${size} KB)`);
      checks.push({ name: file.path, status: 'pass', message: `${size} KB` });
    } else {
      if (file.required) {
        console.log(`   ❌ ${file.path} 不存在（必需）`);
        checks.push({ name: file.path, status: 'fail', message: '文件不存在' });
      } else {
        console.log(`   ⚠️  ${file.path} 不存在（可选）`);
        checks.push({ name: file.path, status: 'warn', message: '文件不存在' });
      }
    }
  }
  console.log('');
}

// 5. 检查依赖
function checkDependencies() {
  console.log('5. 检查关键依赖...');
  
  const deps = [
    { name: 'electron', required: true },
    { name: 'electron-builder', required: true },
    { name: 'sharp', required: true },
    { name: 'png2icons', required: true }
  ];
  
  for (const dep of deps) {
    try {
      const pkgPath = require.resolve(`${dep.name}/package.json`);
      const pkg = require(pkgPath);
      console.log(`   ✅ ${dep.name}@${pkg.version}`);
      checks.push({ name: dep.name, status: 'pass', message: `v${pkg.version}` });
    } catch (e) {
      if (dep.required) {
        console.log(`   ❌ ${dep.name} 未安装（必需）`);
        checks.push({ name: dep.name, status: 'fail', message: '未安装' });
      } else {
        console.log(`   ⚠️  ${dep.name} 未安装（可选）`);
        checks.push({ name: dep.name, status: 'warn', message: '未安装' });
      }
    }
  }
  console.log('');
}

// 6. 检查 package.json 配置
function checkPackageConfig() {
  console.log('6. 检查 package.json 配置...');
  
  try {
    const pkg = require('./package.json');
    
    // 检查 build 配置
    if (pkg.build) {
      console.log('   ✅ build 配置存在');
      
      if (pkg.build.mac) {
        console.log('   ✅ mac 配置存在');
        
        // 检查图标
        if (pkg.build.mac.icon) {
          console.log(`   ✅ 图标路径: ${pkg.build.mac.icon}`);
        } else {
          console.log('   ⚠️  未配置 mac.icon');
        }
        
        // 检查签名配置
        if (pkg.build.mac.identity === null) {
          console.log('   ✅ 已禁用代码签名（identity: null）');
        } else {
          console.log('   ⚠️  未禁用代码签名（可能导致构建失败）');
        }
        
        checks.push({ name: 'package.json 配置', status: 'pass', message: '配置正确' });
      } else {
        console.log('   ❌ 缺少 build.mac 配置');
        checks.push({ name: 'package.json 配置', status: 'fail', message: '缺少 mac 配置' });
      }
    } else {
      console.log('   ❌ 缺少 build 配置');
      checks.push({ name: 'package.json 配置', status: 'fail', message: '缺少 build 配置' });
    }
  } catch (e) {
    console.log(`   ❌ 检查失败: ${e.message}`);
    checks.push({ name: 'package.json 配置', status: 'fail', message: e.message });
  }
  console.log('');
}

// 7. 测试图标生成
function testIconGeneration() {
  console.log('7. 测试图标生成...');
  
  if (process.platform !== 'darwin') {
    console.log('   ⚠️  跳过（仅在 macOS 上测试）');
    checks.push({ name: '图标生成测试', status: 'skip', message: '仅在 macOS 上测试' });
    console.log('');
    return;
  }
  
  try {
    console.log('   运行 generateMacIcon.js...');
    execSync('node generateMacIcon.js', { stdio: 'inherit' });
    
    // 检查生成的文件
    const icnsPath = path.join(__dirname, 'build', 'icon.icns');
    if (fs.existsSync(icnsPath)) {
      const stats = fs.statSync(icnsPath);
      const size = (stats.size / 1024).toFixed(2);
      console.log(`   ✅ icon.icns 生成成功 (${size} KB)`);
      checks.push({ name: '图标生成测试', status: 'pass', message: `${size} KB` });
    } else {
      console.log('   ❌ icon.icns 未生成');
      checks.push({ name: '图标生成测试', status: 'fail', message: '文件未生成' });
    }
  } catch (e) {
    console.log(`   ❌ 图标生成失败: ${e.message}`);
    checks.push({ name: '图标生成测试', status: 'fail', message: e.message });
  }
  console.log('');
}

// 生成总结
function generateSummary() {
  console.log('========================================');
  console.log('诊断总结');
  console.log('========================================\n');
  
  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const skipped = checks.filter(c => c.status === 'skip').length;
  
  console.log(`通过: ${passed}  失败: ${failed}  警告: ${warned}  跳过: ${skipped}\n`);
  
  if (failed > 0) {
    console.log('❌ 存在失败项，请修复以下问题：\n');
    checks.filter(c => c.status === 'fail').forEach(c => {
      console.log(`   • ${c.name}: ${c.message}`);
    });
    console.log('');
  }
  
  if (warned > 0) {
    console.log('⚠️  存在警告项，建议检查：\n');
    checks.filter(c => c.status === 'warn').forEach(c => {
      console.log(`   • ${c.name}: ${c.message}`);
    });
    console.log('');
  }
  
  if (failed === 0) {
    console.log('✅ 所有必需项检查通过！可以尝试构建 macOS 应用。\n');
    console.log('下一步：');
    console.log('  npm run build:mac\n');
  }
}

// 运行所有检查
async function runDiagnostics() {
  checkOS();
  checkNode();
  checkTools();
  checkProjectFiles();
  checkDependencies();
  checkPackageConfig();
  testIconGeneration();
  generateSummary();
}

runDiagnostics().catch(err => {
  console.error('诊断过程出错:', err);
  process.exit(1);
});

