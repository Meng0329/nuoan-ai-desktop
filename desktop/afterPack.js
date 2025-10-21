const fs = require('fs');
const path = require('path');

/**
 * electron-builder afterPack hook
 * Removes unnecessary locales and optional runtime files to shrink artifact size.
 */
exports.default = async function afterPack(context) {
	const appOutDir = context.appOutDir; // e.g., dist/诺安AI桌面程序-win32-x64
	
	// 只在 Windows 平台执行清理
	if (context.electronPlatformName !== 'win32') {
		console.log('[afterPack] 跳过 macOS 清理，仅在 Windows 平台执行');
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