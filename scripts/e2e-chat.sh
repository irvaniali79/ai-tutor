#!/bin/bash
# Full E2E verification for chat + suggestions + editing features
cd /home/z/my-project
SNAP=/tmp/e2e
mkdir -p $SNAP

server_up() { curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/ 2>/dev/null; }
ensure() {
  if [ "$(server_up)" != "200" ]; then
    setsid nohup bun run dev > /dev/null 2>&1 < /dev/null &
    for i in $(seq 1 20); do [ "$(server_up)" = "200" ] && break; sleep 2; done
  fi
}
ensure
echo "SERVER: $(server_up)"

ab() { agent-browser "$@" 2>&1; }

# 1. open library, click photography course card via JS
ab open http://localhost:3000 > /dev/null
sleep 2
ensure
ab eval "const h=[...document.querySelectorAll('h3')].find(x=>x.textContent.includes('Digital Photography')); h.closest('div[role=button]').click(); 'clicked'"
sleep 4
ensure

# 2. suggestions chips
echo "=== SUGGESTIONS SECTION ==="
ab snapshot -c > $SNAP/lesson.txt
rg "Questions you might ask" -A 12 $SNAP/lesson.txt | head -16

# 3. click first suggestion chip
echo "=== CLICK FIRST SUGGESTION ==="
ab eval "const chips=[...document.querySelectorAll('button')].filter(b=>b.className.includes('rounded-full')); if(chips.length){window.__q=chips[0].textContent; chips[0].click(); 'clicked: '+window.__q} else 'NO CHIPS'"
sleep 3
ensure

# 4. wait for chat answer to stream
echo "=== WAITING FOR AI ANSWER ==="
for i in $(seq 1 24); do
  txt=$(ab eval "document.body.innerText.includes('Thinking…') ? 'streaming' : (document.body.innerText.match(/Good question|ask again|follow-ups|For beginners|The best/) ? 'answered' : 'waiting')")
  echo "t=$i: $txt"
  [ "$txt" = "answered" ] && break
  [ "$txt" = "streaming" ] || sleep 4
  sleep 1
done
sleep 2
ab snapshot -c > $SNAP/chat.txt
echo "--- chat messages ---"
rg "New chat|conversation" $SNAP/chat.txt | head -4
rg "Good question|ask again|demo model" $SNAP/chat.txt | head -4

# 5. screenshot chat panel
ab screenshot $SNAP/chat-panel.png > /dev/null
echo "screenshot: $SNAP/chat-panel.png"
