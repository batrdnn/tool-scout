// Open a saved file with the system opener (macOS `open`, Linux `xdg-open`, Windows `start`). Used for the `me`
// card, so people see the full-color version. Best effort: any failure is skipped quietly.
import { spawn as nodeSpawn } from 'node:child_process';

export const openCommand = (platform = process.platform) => (platform === 'darwin' ? 'open' : platform === 'linux' ? 'xdg-open' : platform === 'win32' ? 'cmd.exe' : null);

/** Start the opener without waiting for it. Returns true if it was launched, false if skipped. */
export function openFile(file, { platform = process.platform, spawn = nodeSpawn, env = process.env } = {}) {
  const cmd = openCommand(platform);
  if (!cmd) return false;
  try {
    // Windows: `start` is a cmd.exe built-in. The path travels in an environment variable inside double
    // quotes, so cmd.exe never parses it as syntax (a path can hold & or %, but not a double quote).
    const child = platform === 'win32'
      ? spawn(cmd, ['/d', '/c', 'start "" "%SCOUT_CARD%"'], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, env: { ...env, SCOUT_CARD: file } })
      : spawn(cmd, [file], { detached: true, stdio: 'ignore' });
    child.on?.('error', () => {}); // no opener installed (or no desktop): skip, never crash
    child.unref?.();
    return true;
  } catch {
    return false;
  }
}
