// Open a saved file with the system opener (macOS `open`, Linux `xdg-open`). Used for the `me`
// card, so people see the full-color version. Best effort: any failure is skipped quietly.
import { spawn as nodeSpawn } from 'node:child_process';

export const openCommand = (platform = process.platform) => (platform === 'darwin' ? 'open' : platform === 'linux' ? 'xdg-open' : null);

/** Start the opener without waiting for it. Returns true if it was launched, false if skipped. */
export function openFile(file, { platform = process.platform, spawn = nodeSpawn } = {}) {
  const cmd = openCommand(platform);
  if (!cmd) return false;
  try {
    const child = spawn(cmd, [file], { detached: true, stdio: 'ignore' });
    child.on?.('error', () => {}); // no opener installed (or no desktop): skip, never crash
    child.unref?.();
    return true;
  } catch {
    return false;
  }
}
