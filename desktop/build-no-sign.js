const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 清理环境变量，确保没有签名相关配置
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.DISABLE_CODE_SIGNING = 'true';
delete process.env.WIN_CSC_LINK;
delete process.env.CSC_LINK;
delete process.env.CSC_KEY_PASSWORD;
delete process.env.CSC_NAME;

// 从.env文件获取更新URL（如果存在）
let updateUrl = 'https://nuoanai.oss-cn-beijing.aliyuncs.com/updates/';
try {
  if (fs.existsSync(path.join(__dirname, '.env'))) {
    const dotenv = require('dotenv');
    const envConfig = dotenv.config({ path: path.join(__dirname, '.env') }).parsed;
    if (envConfig && envConfig.NUOAN_UPDATER_URL) {
      updateUrl = envConfig.NUOAN_UPDATER_URL;
    }
  }
} catch (e) {
  console.log('无法读取.env文件，使用默认更新URL');
}

// 创建临时配置文件完全禁用签名
const tempConfigPath = path.join(__dirname, 'temp-no-sign-config.json');

// 使用绝对路径指向图标
const iconPath = path.resolve(__dirname, 'assets', 'logo.ico');

const config = {
  "productName": "诺安科技身份认证",
  "win": {
    "signAndEditExecutable": false,
    "verifyUpdateCodeSignature": false,
    "icon": iconPath,
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ]
  },
  "forceCodeSigning": false,
  "npmRebuild": false,
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "shortcutName": "诺安科技身份认证",
    "installerIcon": iconPath,
    "uninstallerIcon": iconPath,
    "installerHeaderIcon": iconPath,
    "menuCategory": "诺安科技",
    "artifactName": "诺安科技身份认证-Setup-${version}.${ext}",
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  },
  // 添加publish配置，以生成latest.yml文件
  "publish": [
    {
      "provider": "generic",
      "url": updateUrl
    }
  ]
};

fs.writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));

// 先运行图标生成
console.log('生成图标...');
const iconProcess = spawn('node', ['generateWinIcon.js'], {
  stdio: 'inherit',
  shell: true
});

iconProcess.on('close', (code) => {
  if (code !== 0) {
    console.error('图标生成失败');
    process.exit(code);
  }
  
  // 确保图标文件存在
  if (!fs.existsSync(iconPath)) {
    console.error(`错误: 图标文件不存在: ${iconPath}`);
    process.exit(1);
  } else {
    console.log(`图标文件存在且大小为: ${(fs.statSync(iconPath).size / 1024).toFixed(2)} KB`);
  }
  
  // 确保在根目录也有一个图标文件（一些打包工具会寻找这个位置）
  const rootIconPath = path.join(__dirname, 'logo.ico');
  try {
    fs.copyFileSync(iconPath, rootIconPath);
    console.log(`已复制图标到根目录: ${rootIconPath}`);
  } catch (e) {
    console.warn(`无法复制图标到根目录: ${e.message}`);
  }
  
  console.log('开始构建安装包（禁用签名）...');
  
  // 运行 electron-builder，使用临时配置文件和额外参数
  const buildProcess = spawn(
    'npx',
    [
      'electron-builder',
      '--win',
      'nsis',
      '--publish never', // 只生成更新文件，不发布
      '--config.forceCodeSigning=false',
      `--config.extends=${tempConfigPath}`,
      '--config.extraMetadata.main=main.js',
      '--config.directories.app=./'
    ],
    {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        DISABLE_CODE_SIGNING: 'true',
        DO_NOT_SIGN: 'true',
        ELECTRON_BUILDER_ALLOW_UNRESOLVED: 'true'
      }
    }
  );

  buildProcess.on('close', (code) => {
    // 清理临时文件
    try {
      fs.unlinkSync(tempConfigPath);
    } catch (e) {}
    
    if (code !== 0) {
      console.error('构建失败');
      process.exit(code);
    }
    
    console.log('构建成功！输出位于 dist/ 目录');
    
    // 检查latest.yml文件是否生成
    const latestYmlPath = path.join(__dirname, 'dist', 'latest.yml');
    if (fs.existsSync(latestYmlPath)) {
      console.log(`latest.yml文件已生成: ${latestYmlPath}`);
      try {
        const ymlContent = fs.readFileSync(latestYmlPath, 'utf8');
        console.log('latest.yml内容预览:');
        console.log(ymlContent.substring(0, 300) + (ymlContent.length > 300 ? '...' : ''));
      } catch (e) {
        console.log('无法读取latest.yml内容');
      }
    } else {
      console.log('警告: latest.yml文件未生成，检查publish配置');
    }
  });
}); 