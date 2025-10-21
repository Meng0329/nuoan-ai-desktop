const fs = require('fs');
const path = require('path');

/**
 * electron-builder afterPack hook
 * Removes unnecessary locales and optional runtime files to shrink artifact size.
 */
exports.default = async function afterPack(context) {
	const appOutDir = context.appOutDir;
	const platform = context.electronPlatformName;
	
	console.log(`[afterPack] 开始清理，平台: ${platform}, 输出目录: ${appOutDir}`);
	
	// macOS 平台的清理
	if (platform === 'darwin') {
		try {
			// macOS 应用在 .app/Contents/Resources 下
			const appName = context.packager.appInfo.productFilename;
			const resourcesDir = path.join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
			
			// 清理语言包
			const localesDir = path.join(resourcesDir, 'locales');
			const keepLocales = new Set(['zh-CN.pak', 'en-US.pak']);
			if (fs.existsSync(localesDir)) {
				for (const file of fs.readdirSync(localesDir)) {
					if (!keepLocales.has(file)) {
						try {
							fs.rmSync(path.join(localesDir, file), { force: true });
						} catch (_e) {}
					}
				}
			}
			
			console.log('[afterPack] macOS 清理完成');
		} catch (e) {
			console.warn('[afterPack] macOS 清理遇到问题:', e.message);
		}
		return;
	}
	
	// Windows 平台的清理
	if (platform !== 'win32') {
		console.log(`[afterPack] 跳过清理，不支持的平台: ${platform}`);
		return;
	}

	try {
		// 1) Keep only zh-CN and en-US locales
		const localesDir = path.join(appOutDir, 'locales');
		const keepLocales = new Set(['zh-CN.pak', 'en-US.pak']);
		if (fs.existsSync(localesDir)) {
			for (const file of fs.readdirSync(localesDir)) {
				if (!keepLocales.has(file)) {
					try {
						fs.rmSync(path.join(localesDir, file), { force: true });
					} catch (_e) {}
				}
			}
		}

		// 2) Remove optional graphics/Vulkan/SwiftShader components not needed for most devices
		const optionalBinaries = [
			'vk_swiftshader_icd.json',
			'vk_swiftshader.dll',
			'vulkan-1.dll',
			'd3dcompiler_47.dll' // often optional; Electron can run without on modern systems
		];
		for (const bin of optionalBinaries) {
			const p = path.join(appOutDir, bin);
			if (fs.existsSync(p)) {
				try {
					fs.rmSync(p, { force: true });
				} catch (_e) {}
			}
		}

		// 3) Remove LICENSES.chromium.html if not needed
		const licenses = path.join(appOutDir, 'LICENSES.chromium.html');
		if (fs.existsSync(licenses)) {
			try { fs.rmSync(licenses, { force: true }); } catch (_e) {}
		}

		// 4) If resources has default locales again, prune them
		const resourcesPath = path.join(appOutDir, 'resources');
		const appAsar = path.join(resourcesPath, 'app.asar');
		// app.asar already compresses the app code; ensure no unpacked large maps/logs left around
		const maybeLargeDirs = ['resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin'];
		for (const f of maybeLargeDirs) {
			const p = path.join(appOutDir, f);
			if (fs.existsSync(p)) {
				// Keep these by default; removing can break startup. So skip removal here.
			}
		}

		// 5) Remove extra *.pak locales except the two kept above (safety for top folder)
		for (const file of fs.readdirSync(appOutDir)) {
			if (file.endsWith('.pak') && !['resources.pak'].includes(file)) {
				// top-level .pak files are core; do not delete blindly
			}
		}

		console.log('[afterPack] Cleanup complete to reduce artifact size');
	} catch (e) {
		console.warn('[afterPack] Cleanup encountered an issue:', e.message);
	}
}; 