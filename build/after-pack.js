'use strict';
// Stamps the app icon and version info into the packaged .exe with a pure-JS resource
// editor, so the Windows build also works from Linux/macOS without Wine.
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit');
  const info = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, info.productFilename + '.exe');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);

  const icon = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const targets = groups.length ? groups.map((g) => ({ id: g.id, lang: g.lang })) : [{ id: 1, lang: 1033 }];
  for (const t of targets) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, t.id, t.lang, icon.icons.map((i) => i.data));
  }

  const versions = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const vi = versions[0];
  if (vi) {
    const [major, minor, patch] = info.version.split('.').map((n) => parseInt(n, 10) || 0);
    vi.setFileVersion(major, minor, patch, 0);
    vi.setProductVersion(major, minor, patch, 0);
    for (const lang of vi.getAllLanguagesForStringValues()) {
      vi.setStringValues(lang, {
        ProductName: info.productName,
        FileDescription: info.productName,
        CompanyName: 'SAGG',
        LegalCopyright: info.copyright || '',
        OriginalFilename: info.productFilename + '.exe',
        InternalName: info.productFilename
      });
    }
    vi.outputToResourceEntries(res.entries);
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • icon and version info written to', path.basename(exePath));
};
