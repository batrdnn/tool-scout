// Node version check. Deliberately written in old syntax (no arrows, const, ?. or template
// strings) so it can run, and explain itself, on a Node too old for the rest of Tool Scout.

export var MIN_NODE = 18;

/** The message to show for this Node version (process.versions.node), or null when it's fine. */
export function nodeProblem(version) {
  var major = parseInt(String(version).replace(/^v/, '').split('.')[0], 10);
  if (major >= MIN_NODE) return null;
  return 'Tool Scout needs Node.js ' + MIN_NODE + ' or newer (you have v' + String(version).replace(/^v/, '') +
    '). Install it from nodejs.org or with \u0060brew install node\u0060.';
}
