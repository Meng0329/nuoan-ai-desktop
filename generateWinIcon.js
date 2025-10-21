const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

async function generateWinIcon() {
  const srcJpg = path.join(__dirname, 'assets', 'logo.jpg');
  const outIco = path.join(__dirname, 'assets', 'logo.ico');
  
  // 创建临时PNG文件目录
  const tempDir = path.join(__dirname, 'temp-icons');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  if (!fs.existsSync(srcJpg)) {
    throw new Error(`未找到源文件: ${srcJpg}`);
  }

  // 为Windows图标生成多种尺寸的图片
  // 确保包含Windows常用的所有尺寸，特别是256x256对于高DPI屏幕很重要
  const sizes = [256, 128, 96, 64, 48, 40, 32, 24, 20, 16];
  const pngPaths = [];
  const buffers = [];

  console.log(`[icon] 从 ${srcJpg} 生成图标`);

  // 对于每个尺寸生成一个PNG文件
  for (const size of sizes) {
    const pngPath = path.join(tempDir, `icon-${size}.png`);
    pngPaths.push(pngPath);
    
    try {
      await sharp(srcJpg)
        .resize(size, size, { 
          fit: 'contain', 
          background: { r: 255, g: 255, b: 255, alpha: 0 } 
        })
        .png({ compressionLevel: 9 })
        .toFile(pngPath);
        
      console.log(`[icon] 已生成 ${size}x${size} PNG`);
      
      // 读取生成的PNG用于ICO转换
      const buffer = fs.readFileSync(pngPath);
      buffers.push(buffer);
    } catch (err) {
      console.error(`[icon] 生成 ${size}x${size} PNG 失败:`, err);
      throw err;
    }
  }

  try {
    // 生成ICO文件
    console.log('[icon] 正在从PNG生成ICO文件...');
    const ico = await pngToIco(buffers);
    fs.writeFileSync(outIco, ico);
    console.log(`[icon] Windows ICO 生成成功 → ${outIco}`);
    console.log(`[icon] ICO文件大小: ${(fs.statSync(outIco).size / 1024).toFixed(2)} KB`);
    
    // 生成一个单独的大尺寸PNG，用于其他场合可能需要
    await sharp(srcJpg)
      .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(__dirname, 'assets', 'logo.png'));
    console.log(`[icon] 生成了256x256的PNG图标`);
    
    // 复制ICO文件到可能需要的位置
    const extraIconPaths = [
      path.join(__dirname, 'logo.ico'),  // 根目录
      path.join(__dirname, 'build', 'icon.ico') // build目录
    ];
    
    for (const extraPath of extraIconPaths) {
      try {
        // 确保目标目录存在
        const dir = path.dirname(extraPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.copyFileSync(outIco, extraPath);
        console.log(`[icon] 已复制图标至 ${extraPath}`);
      } catch (err) {
        console.warn(`[icon] 无法复制图标至 ${extraPath}:`, err.message);
      }
    }
    
    // 清理临时文件
    for (const pngPath of pngPaths) {
      fs.unlinkSync(pngPath);
    }
    fs.rmdirSync(tempDir);
  } catch (err) {
    console.error('[icon] ICO生成失败:', err);
    throw err;
  }
}

if (require.main === module) {
  generateWinIcon().catch((err) => {
    console.error('[icon] 生成失败:', err.message);
    process.exit(1);
  });
}

module.exports = generateWinIcon; 