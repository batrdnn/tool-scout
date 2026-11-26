// Shared by the tests (not a test file): what Windows can't do, as skip reasons, so a skipped test says why.
export const WIN = process.platform === 'win32';
export const NO_MODES = 'POSIX file modes (0600/0700) do not exist on Windows: the data folder is protected by the user profile\'s own permissions (see the README Requirements)';
export const NO_SH_SHIM = 'needs a fake `claude` that is a #!/bin/sh script, which Windows can\'t run: the claude.exe lookup is tested in claude-command.test.mjs';
