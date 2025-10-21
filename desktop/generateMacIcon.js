const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sizes = [16, 32, 64, 128, 256, 512, 1024];

async function generateMacIcon() {
  try {
    console.log('开始生成 macOS 图标...');
    
    // 检查源文件
    const sourcePng = path.join(__dirname, 'assets', 'logo.png');
    if (!fs.existsSync(sourcePng)) {
      console.error('错误: 找不到源文件 assets/logo.png');
      process.exit(1);
    }

    // 创建临时目录
    const tempDir = path.join(__dirname, 'temp-icons');
    const iconsetDir = path.join(tempDir, 'icon.iconset');
    
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(iconsetDir, { recursive: true });

    console.log('生成不同尺寸的图标...');
    
    // 生成各种尺寸的图标
    for (const size of sizes) {
      // 1x 版本
      await sharp(sourcePng)
        .resize(size, size)
        .toFile(path.join(iconsetDir, `icon_${size}x${size}.png`));
      console.log(`  ✓ icon_${size}x${size}.png`);
      
      // 2x 版本（Retina）
      if (size <= 512) {
        await sharp(sourcePng)
          .resize(size * 2, size * 2)
          .toFile(path.join(iconsetDir, `icon_${size}x${size}@2x.png`));
        console.log(`  ✓ icon_${size}x${size}@2x.png`);
      }
    }

    // 确保 build 目录存在
    const buildDir = path.join(__dirname, 'build');
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    // 使用 iconutil 生成 .icns 文件
    const icnsPath = path.join(buildDir, 'icon.icns');
    
    try {
      console.log('\n尝试使用 iconutil 生成 .icns 文件...');
      execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { 
        stdio: 'inherit' 
      });
      console.log(`✓ 成功生成: ${icnsPath}`);
    } catch (error) {
      console.log('iconutil 不可用（非 macOS 系统），将使用备用方案...');
      
      // 备用方案：使用 png2icons 库
      try {
        const png2icons = require('png2icons');
        
        // 读取 1024x1024 的 PNG
        const sourceBuffer = await sharp(sourcePng)
          .resize(1024, 1024)
          .png()
          .toBuffer();
        
        // 转换为 ICNS
        const icnsBuffer = png2icons.createICNS(sourceBuffer, png2icons.BILINEAR, 0);
        
        // 写入文件
        fs.writeFileSync(icnsPath, icnsBuffer);
        console.log(`✓ 使用备用方案成功生成: ${icnsPath}`);
      } catch (fallbackError) {
        console.error('备用方案也失败了:', fallbackError.message);
        console.log('\n提示: 在 macOS 系统上运行此脚本以生成真正的 .icns 文件');
        console.log('或者安装 png2icons: npm install png2icons');
        
        // 至少复制一个 PNG 作为占位符
        const placeholder = path.join(iconsetDir, 'icon_512x512@2x.png');
        fs.copyFileSync(placeholder, icnsPath.replace('.icns', '.png'));
        console.log('已创建 PNG 占位符');
      }
    }

    // 清理临时文件
    console.log('\n清理临时文件...');
    fs.rmSync(tempDir, { recursive: true });
    
    console.log('\n✅ macOS 图标生成完成！');
    
  } catch (error) {
    console.error('生成图标时出错:', error);
    process.exit(1);
  }
}

generateMacIcon();

