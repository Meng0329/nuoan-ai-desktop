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
      console.error('❌ iconutil 执行失败:', error.message);
      console.log('\n尝试备用方案...');
      
      // 备用方案1：使用 sips 命令（macOS 自带）
      try {
        const largest = path.join(iconsetDir, 'icon_512x512@2x.png');
        execSync(`sips -s format icns "${largest}" --out "${icnsPath}"`, {
          stdio: 'inherit'
        });
        console.log(`✓ 使用 sips 命令成功生成: ${icnsPath}`);
      } catch (sipsError) {
        console.error('❌ sips 命令也失败了:', sipsError.message);
        
        // 备用方案2：使用 png2icons 库（最后的备选）
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
          console.log(`✓ 使用 png2icons 库成功生成: ${icnsPath}`);
        } catch (fallbackError) {
          console.error('❌ 所有方案都失败了:', fallbackError.message);
          console.log('\n错误: 无法生成 .icns 文件，构建将失败');
          process.exit(1);
        }
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

