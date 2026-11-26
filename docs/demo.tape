# The README demo. Record it from the repo root:  brew install vhs && vhs docs/demo.tape
# It runs `node scripts/scout.mjs all` for a made-up "webdev" user in a clean terminal: the hidden
# part below sets up a synthetic home and data folder (docs/demo-setup.mjs), so no real history
# or path shows. --offline keeps the picks the same on every take (no GitHub requests).
Output docs/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1200
Set Height 900
Set Padding 20
Set Theme "Dracula"
Set TypingSpeed 45ms
Set PlaybackSpeed 1

Hide
Type "export PS1='$ ' LANG=en_US.UTF-8" Enter
Type 'eval "$(node docs/demo-setup.mjs /tmp/scout-demo)"' Enter
Type "clear" Enter
Show

Sleep 800ms
Type "node scripts/scout.mjs all --offline"
Sleep 600ms
Enter
Sleep 9s
