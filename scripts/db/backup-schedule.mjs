import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

// macOS launchd agent: one run every day at 06:30, after the 06:00 business-day boundary in Yerevan.
const label = 'am.barbar.backup';
const plist = resolve(homedir(), 'Library/LaunchAgents', `${label}.plist`);
const project = resolve(import.meta.dirname, '../..');
const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>WorkingDirectory</key><string>${escape(project)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escape(process.execPath)}</string>
    <string>scripts/db/scheduled-backup.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>BARBAR_BACKUP_ENV_FILE</key><string>.env.backup</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>${escape(resolve(project, '.barbar-backups/schedule.log'))}</string>
  <key>StandardErrorPath</key><string>${escape(resolve(project, '.barbar-backups/schedule.log'))}</string>
</dict>
</plist>
`;
const mode = process.argv[2];
if (mode === 'print') console.log(content);
else if (mode === 'install') {
  await mkdir(resolve(project, '.barbar-backups'), { recursive: true, mode: 0o700 });
  await mkdir(resolve(homedir(), 'Library/LaunchAgents'), { recursive: true });
  await writeFile(plist, content, { mode: 0o644 });
  console.log(`Written ${plist}. Activate: launchctl bootstrap gui/$(id -u) ${plist}`);
} else if (mode === 'uninstall') {
  console.log(`First run: launchctl bootout gui/$(id -u) ${plist}`);
  await unlink(plist).catch(() => {});
} else console.log('Usage: node scripts/db/backup-schedule.mjs print|install|uninstall');
