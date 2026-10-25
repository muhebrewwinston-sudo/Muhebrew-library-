const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function buildBackendZip() {
  const rootDir = path.join(__dirname, '..');
  const zipPath = path.join(rootDir, 'muhebrew-backend-updated.zip');

  const pyScript = `
import zipfile, os

zip_path = 'muhebrew-backend-updated.zip'
exclude_dirs = {'.git', 'node_modules', '.cache', '.npm'}
exclude_files = {'pasthub.db', 'pasthub.db-wal', 'pasthub.db-shm', 'muhebrew-backend-updated.zip'}

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('.', followlinks=False):
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not os.path.islink(os.path.join(root, d))]
        for f in files:
            if f in exclude_files or f.endswith('.zip') or f.endswith('.db') or f.endswith('.db-wal') or f.endswith('.db-shm'):
                continue
            full_path = os.path.join(root, f)
            arc_name = os.path.relpath(full_path, '.')
            z.write(full_path, arc_name)
`;

  try {
    execSync(`python3 -c "${pyScript.replace(/"/g, '\\"')}"`, {
      cwd: rootDir,
      timeout: 30000,
      stdio: 'ignore'
    });
    console.log('[Zip] Generated muhebrew-backend-updated.zip successfully.');
    return zipPath;
  } catch (err) {
    console.error('[Zip] Generation error:', err.message);
    return null;
  }
}

module.exports = { buildBackendZip };
