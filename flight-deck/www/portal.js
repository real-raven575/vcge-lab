// Flight Deck: the clock, the tower's radio chatter and one hidden word. Nothing is fetched or stored.
(() => {
  const p = n => String(n).padStart(2, '0');
  const zulu = document.getElementById('zulu'), local = document.getElementById('local');
  function tick() {
    const d = new Date();
    zulu.textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
    const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d).find(x => x.type === 'timeZoneName').value;
    local.textContent = `${p(d.getHours())}:${p(d.getMinutes())} ${zone} local`;
  }
  tick(); setInterval(tick, 15000);

  // The tower answers when called. Calm, short, never in the way.
  const chatter = [
    'Tower to all hangars: deck is clear, lights are on. Pick your team and taxi in.',
    'Hangar 01, you are cleared for testing. Cornerstone has every build on file.',
    'Reminder from the tower: nothing on this deck talks to the internet. Radio silence is the rule.',
    'Glyph reports the Reading Room lamp is lit. Ghost reports the Wipe Trials range is swept.',
    'Hangars 02 and 03 are reserved. Lights on, doors open, waiting for pilots.',
    'Tower to Hangar 01: an elephant never forgets, but please still write your test results down.',
    'Wind calm, visibility unlimited, zero data on the runway.',
    'Every hangar has its own folder, its own address and its own ports. No taxiing through someone else\'s bay.',
    'Tower here. You called? Everything is quiet. That is how we like it.',
  ];
  const night = 'Night shift at the tower. Runway lights are steady. Builds keep landing while you sleep.';
  const radio = document.getElementById('radio');
  const h = new Date().getHours();
  if (h < 5 || h >= 23) radio.textContent = night;
  let i = 0;
  document.getElementById('tower').addEventListener('click', () => {
    i = (i + 1) % chatter.length;
    radio.textContent = chatter[i];
  });

  // Hidden word: type "formation" anywhere (not in a field) and the pilots fly over once.
  const word = 'formation'; let typed = '';
  const pilots = ['🐘', '🐢', '🦝', '🐈', '🦉', '🐙', '🦎', '🦓', '🦅'];
  const box = document.getElementById('formation');
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select') || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-word.length);
    if (typed !== word || box.childElementCount) return;
    pilots.forEach((emoji, n) => {
      const s = document.createElement('span');
      const row = Math.abs(n - 4);                 // the lead (Cornerstone) at the point of the V
      s.textContent = emoji;
      s.style.top = `${18 + row * 9}%`;
      s.style.animationDelay = `${row * 0.25}s`;
      box.appendChild(s);
    });
    radio.textContent = 'Tower: formation called. Cornerstone leads, eight pilots on the wings. Looking sharp, Team vCGE.';
    setTimeout(() => box.replaceChildren(), 8000);
  });
})();
