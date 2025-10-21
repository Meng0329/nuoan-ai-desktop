#!/usr/bin/env node

/**
 * 测试 electron-builder 配置是否正确
 * 在推送到 GitHub 前运行此脚本验证配置
 */

const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('  electron-builder 配置验证');
console.log('========================================\n');

let hasErrors = false;

// 1. 检查 package.json
console.log('1. 检查 package.json...');
try {
  const pkg = require('./package.json');
  
  if (!pkg.build) {
    console.error('❌ 缺少 build 配置');
    hasErrors = true;
  } else {
    console.log('✓ build 配置存在');
    
    if (pkg.build.mac) {
      console.log('✓ mac 配置存在');
      console.log('  - target:', pkg.build.mac.target);
      console.log('  - icon:', pkg.build.mac.icon);
    } else {
      console.error('❌ 缺少 mac 配置');
      hasErrors = true;
    }
    
    if (pkg.build.dmg) {
      console.log('✓ dmg 配置存在');
    }
  }
  
  if (pkg.scripts && pkg.scripts['build:mac']) {
    console.log('✓ build:mac 脚本存在');
  } else {
    console.error('❌ 缺少 build:mac 脚本');
    hasErrors = true;
  }
} catch (error) {
  console.error('❌ package.json 解析失败:', error.message);
  hasErrors = true;
}

console.log('');

// 2. 检查图标文件
console.log('2. 检查图标文件...');
const iconPaths = [
  { path: 'assets/logo.png', desc: '源图标文件' },
  { path: 'build/icon.icns', desc: 'macOS 图标文件', optional: true }
];

for (const { path: iconPath, desc, optional } of iconPaths) {
  const fullPath = path.join(__dirname, iconPath);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`✓ ${desc}: ${iconPath} (${(stats.size / 1024).toFixed(2)} KB)`);
  } else if (optional) {
    console.log(`⚠️  ${desc}: ${iconPath} (将在构建时生成)`);
  } else {
    console.error(`❌ ${desc}: ${iconPath} 不存在`);
    hasErrors = true;
  }
}

console.log('');

// 3. 检查必要文件
console.log('3. 检查必要文件...');
const requiredFiles = [
  'main.js',
  'index.html',
  'renderer.js',
  'generateMacIcon.js',
  'afterPack.js'
];

for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ ${file}`);
  } else {
    console.error(`❌ ${file} 不存在`);
    hasErrors = true;
  }
}

console.log('');

// 4. 检查依赖
console.log('4. 检查依赖...');
try {
  const pkg = require('./package.json');
  const requiredDeps = {
    devDependencies: ['electron', 'electron-builder', 'png2icons'],
    dependencies: ['sharp']
  };
  
  for (const [type, deps] of Object.entries(requiredDeps)) {
    for (const dep of deps) {
      if (pkg[type] && pkg[type][dep]) {
        console.log(`✓ ${dep} (${type})`);
      } else {
        console.error(`❌ ${dep} 未在 ${type} 中找到`);
        hasErrors = true;
      }
    }
  }
} catch (error) {
  console.error('❌ 依赖检查失败:', error.message);
  hasErrors = true;
}

console.log('');
console.log('========================================');

if (hasErrors) {
  console.log('❌ 配置验证失败！请修复上述错误');
  process.exit(1);
} else {
  console.log('✓ 配置验证通过！可以进行构建');
  console.log('');
  console.log('下一步:');
  console.log('1. 本地测试图标生成: npm run build:icon:mac');
  console.log('2. 推送到 GitHub 进行构建');
  console.log('3. 或在 macOS 上本地构建: npm run build:mac');
}

console.log('========================================');

