/* ============================================================
 * morning-overlay.js — Wayne Mode Morning Briefing
 * Full-screen overlay, once per day, 7 AM – 11:59 AM.
 * Compact banner at 12 PM+.
 * No external dependencies. CSS injected into <head>.
 * Starfield via Canvas. Fonts: Cormorant Garamond + app fonts.
 * ============================================================ */
(function MorningOverlay() {
  'use strict';

  /* ── Constants ─────────────────────────────────────────── */
  const WATER_TARGET = 8;
  const SUBTITLES = [
    'New day. New momentum.',
    "Let's make today count.",
    'Your future self will thank you.',
    'One step at a time.',
    'Another day to build.',
  ];

  const LATE_SUBTITLES = [
    'But the day is still yours.',
    'There\'s still time to make it count.',
    'Late start. Strong finish.',
    'The afternoon is yours to own.',
    'Better now than never.',
  ];

  /* ── Storage keys ──────────────────────────────────────── */
  const KEY_LAST_SHOWN  = 'morning_last_shown';
  const KEY_STREAK      = 'morning_streak_count';
  const KEY_LAST_OPEN   = 'morning_last_open_date';
  const KEY_FRESH_START = 'morning_fresh_start';

  /* ── Storage helpers ───────────────────────────────────── */
  function lsGet(k)     { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }
  function lsStr(k)     { try { return localStorage.getItem(k) || null; } catch(e) { return null; } }
  function lsSetStr(k,v){ try { localStorage.setItem(k, v); } catch(e) {} }

  /* ── Date helpers ──────────────────────────────────────── */
  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function dateKeyYesterday() { const d = new Date(); d.setDate(d.getDate()-1); return dateKey(d); }
  function fmtDateLong(d) {
    d = d || new Date();
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Gate ──────────────────────────────────────────────── */
  const todayKey  = dateKey();
  const yestKey   = dateKeyYesterday();
  const lastShown = lsStr(KEY_LAST_SHOWN);
  if (lastShown === todayKey) return;
  const hour = new Date().getHours();
  if (hour < 7) return;
  const showFull = hour < 12;

  /* ── Streak ────────────────────────────────────────────── */
  function updateStreak() {
    let count = parseInt(lsStr(KEY_STREAK) || '1', 10) || 1;
    const lastOpen = lsStr(KEY_LAST_OPEN);
    if (lastOpen === todayKey) {
      // already counted
    } else if (lastOpen === yestKey) {
      count += 1; lsSetStr(KEY_STREAK, String(count)); lsSetStr(KEY_LAST_OPEN, todayKey);
    } else if (lastOpen) {
      if (count > 3) lsSetStr(KEY_FRESH_START, todayKey);
      count = 1; lsSetStr(KEY_STREAK, '1'); lsSetStr(KEY_LAST_OPEN, todayKey);
    } else {
      lsSetStr(KEY_STREAK, '1'); lsSetStr(KEY_LAST_OPEN, todayKey);
    }
    return { count, freshStart: lsStr(KEY_FRESH_START) === todayKey };
  }
  const { count: streakCount, freshStart: isFreshStart } = updateStreak();

  function streakLabel(n, fresh) {
    if (fresh)   return '🔄 Fresh start';
    if (n >= 30) return '🔥 ' + n + ' day streak';
    if (n >= 7)  return '🔥 ' + n + ' day streak';
    return n + ' day' + (n !== 1 ? 's' : '') + ' this week';
  }

  /* ── Read data ─────────────────────────────────────────── */
  function readData() {
    const health = (function() {
      try {
        let r = localStorage.getItem('patron_health_v1');
        if (r) { const d = JSON.parse(r); if (d && d.connected) return d; }
        r = localStorage.getItem('patron_whoop_data_v1');
        if (r) { const d = JSON.parse(r); if (d && d.connected) return Object.assign({ source:'whoop' }, d); }
      } catch(e) {}
      return null;
    })();

    const waterData   = lsGet('water_standalone_v1');
    const waterToday  = waterData && waterData.logs ? (waterData.logs[todayKey] || 0) : 0;
    const waterYest   = waterData && waterData.logs ? (waterData.logs[yestKey]  || 0) : 0;

    const suppData     = lsGet('supplements_standalone_v1');
    const suppItems    = (suppData && Array.isArray(suppData.items)) ? suppData.items : [];
    const suppTkToday  = (suppData && suppData.taken && suppData.taken[todayKey]) ? suppData.taken[todayKey] : {};
    const suppTkYest   = (suppData && suppData.taken && suppData.taken[yestKey])  ? suppData.taken[yestKey]  : {};
    const suppDoneToday = suppItems.filter(i => suppTkToday[i.id]).length;
    const suppDoneYest  = suppItems.filter(i => suppTkYest[i.id]).length;

    const finData  = lsGet('finance_standalone_v1');
    const netWorth = (finData && Array.isArray(finData.accounts) && finData.accounts.length)
      ? finData.accounts.reduce((a, x) => a + (Number(x.amountCHF) || 0), 0) : null;

    const progData    = lsGet('progress_standalone_v1');
    const entries     = (progData && Array.isArray(progData.entries)) ? progData.entries : [];
    const todayWeight = entries.find(e => e && e.dateKey === todayKey) || null;
    const lastEntry   = entries.length > 0 ? entries[entries.length - 1] : null;
    let   weightDelta = null;
    if (entries.length >= 2) {
      const a = entries[entries.length-1], b = entries[entries.length-2];
      if (a && b && a.weight != null && b.weight != null)
        weightDelta = Math.round((Number(a.weight) - Number(b.weight)) * 10) / 10;
    }

    const gymData  = lsGet('po_coach_workout_done');
    const gymToday = !!(gymData && gymData[todayKey]);
    const gymYest  = !!(gymData && gymData[yestKey]);

    const profileData = lsGet('patron_profile_v1');
    const name = (profileData && profileData.name) ? profileData.name : 'Luca';

    return { health, waterToday, waterYest, suppItems, suppDoneToday, suppDoneYest,
             netWorth, todayWeight, lastEntry, weightDelta, gymToday, gymYest, name };
  }

  const D = readData();
  const NAME = D.name;

  /* ── Tasks ─────────────────────────────────────────────── */
  function buildTasks() {
    const tasks = [];
    if (!D.health)
      tasks.push({ priority:'high',   name:'Log morning vitals',  reason:'Recovery data powers your supplement picks' });
    if (!D.todayWeight)
      tasks.push({ priority:'high',   name:"Log today's weight",  reason:'Daily tracking compounds — consistency is the system' });
    if (!D.gymToday)
      tasks.push({ priority:'high',   name:"Log today's workout", reason:'Movement keeps the streak alive' });
    if (D.suppItems.length > 0) {
      const rem = D.suppItems.length - D.suppDoneToday;
      if (rem > 0) tasks.push({ priority:'medium', name:'Supplements', reason:rem+' remaining', meta:rem+' left' });
    }
    if (D.waterToday < WATER_TARGET)
      tasks.push({ priority:'medium', name:'Hydration', reason:D.waterToday+' of '+WATER_TARGET+' drinks logged', meta:(WATER_TARGET-D.waterToday)+' to go' });
    if (D.netWorth !== null)
      tasks.push({ priority:'medium', name:'Finance check', reason:'Review latest transactions', meta:'CHF '+Math.round(D.netWorth).toLocaleString('en-US') });
    if (D.health && D.health.recovery != null) {
      const r = Math.round(D.health.recovery);
      tasks.push({ priority:'low', name:'Recovery: '+r+'%', reason: r >= 67 ? 'Good to push today' : r >= 34 ? 'Moderate load recommended' : 'Take it easy today' });
    }
    return tasks;
  }

  const tasks     = buildTasks();
  const highTasks = tasks.filter(t => t.priority === 'high');
  const medTasks  = tasks.filter(t => t.priority === 'medium');
  const lowTasks  = tasks.filter(t => t.priority === 'low');
  const focusTask = highTasks[0] || medTasks[0] || tasks[0] || null;

  /* ── Yesterday ─────────────────────────────────────────── */
  function buildYesterday() {
    const done = [];
    if (D.gymYest)  done.push('Workout logged');
    if (D.suppItems.length > 0 && D.suppDoneYest >= D.suppItems.length) done.push('All supplements taken');
    if (D.waterYest >= WATER_TARGET) done.push('Hydration goal hit');
    return done;
  }
  const yesterdayDone = buildYesterday();

  /* ── Snapshot ──────────────────────────────────────────── */
  function buildSnapshot() {
    const m = [];
    if (D.health) {
      if (D.health.recovery != null) {
        const r = Math.round(D.health.recovery);
        m.push({ label:'Recovery', value:r+'%', tone: r>=67?'pos':r>=34?'warn':'neg', pct:r });
      }
      if (D.health.sleepHours != null) {
        const sh = D.health.sleepHours, tgt = D.health.sleepTargetHours || 8;
        const pct = Math.min(100, Math.round((sh/tgt)*100));
        const hh = Math.floor(sh), mm = Math.round((sh-hh)*60);
        m.push({ label:'Sleep', value:hh+'h '+String(mm).padStart(2,'0')+'m', tone: pct>=85?'pos':pct>=60?'warn':'neg', pct });
      }
    }
    const wPct = Math.min(100, Math.round((D.waterToday/WATER_TARGET)*100));
    m.push({ label:'Hydration', value:D.waterToday+'/'+WATER_TARGET, tone: wPct>=100?'pos':wPct>=50?'warn':'neg', pct:wPct });
    if (D.suppItems.length > 0) {
      const pct = Math.round((D.suppDoneToday/D.suppItems.length)*100);
      m.push({ label:'Supplements', value: D.suppDoneToday>=D.suppItems.length?'✓ all':D.suppDoneToday+'/'+D.suppItems.length,
               tone: pct>=100?'pos':pct>0?'warn':'neg', pct });
    }
    return m.slice(0, 4);
  }
  const snapshot = buildSnapshot();

  function greetingSub(h) { return h < 9 ? 'Good morning.' : 'Late start, but still ahead.'; }

  /* ── CSS ───────────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('mo-css')) return;
    const s = document.createElement('style');
    s.id = 'mo-css';
    s.textContent = `
/* ─── Morning Overlay ─────────────────────────────────── */
#morning-overlay-root {
  position:fixed;inset:0;z-index:3000;
  background:var(--bg,#080913);
  font-family:var(--font-ui,'Space Grotesk'),system-ui,sans-serif;
  color:var(--fg,#EEF0FF);
  overflow:hidden;
}

/* canvas */
#mo-canvas {
  position:absolute;inset:0;z-index:0;
  opacity:0;animation:mo-fade 2.5s 300ms forwards;
}

/* nebula */
.mo-nebula {
  position:absolute;z-index:0;pointer-events:none;
  top:-40%;left:50%;width:180%;height:130%;
  transform:translateX(-50%);
  background:radial-gradient(ellipse at 50% 28%,
    var(--glow-1,rgba(124,107,255,0.11)) 0%,
    rgba(80,60,200,0.04) 40%,transparent 68%);
  animation:mo-breathe 8s ease-in-out infinite;
}
.mo-nebula-b {
  top:25%;left:5%;width:70%;height:70%;
  background:radial-gradient(ellipse,
    var(--glow-2,rgba(79,227,208,0.045)) 0%,transparent 65%);
  animation:mo-breathe 11s ease-in-out infinite 3s;
}

/* topbar */
.mo-topbar {
  position:absolute;z-index:2;top:0;left:0;right:0;
  display:flex;align-items:center;justify-content:space-between;
  padding:20px 28px;
  font-family:var(--font-mono,'JetBrains Mono'),monospace;
  font-size:10px;letter-spacing:0.16em;text-transform:uppercase;
  color:var(--muted,rgba(220,225,255,0.5));
  opacity:0;animation:mo-down 600ms cubic-bezier(0.16,1,0.3,1) 500ms forwards;
}

/* screen */
.mo-screen {
  position:relative;z-index:1;
  min-height:100dvh;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  padding:80px 24px 72px;
  overflow-y:auto;
}

/* greeting */
.mo-greeting { text-align:center; }
.mo-hello {
  font-family:'Cormorant Garamond',Georgia,serif;
  font-weight:300;
  font-size:clamp(2.2rem,7vw,7rem);
  letter-spacing:0.06em;
  color:var(--fg,#EEF0FF);
  line-height:1;white-space:nowrap;
  opacity:0;transform:translateY(60px);
  animation:mo-rise 1000ms cubic-bezier(0.16,1,0.3,1) 600ms forwards;
}
.mo-name {
  color:var(--brand,#8B7BFF);
  text-shadow:0 0 70px var(--brand-glow,rgba(124,107,255,0.55)),
              0 0 140px rgba(124,107,255,0.1);
}
.mo-morning {
  margin-top:22px;
  font-family:'Cormorant Garamond',Georgia,serif;
  font-size:clamp(1rem,2.4vw,1.3rem);
  font-weight:300;font-style:italic;letter-spacing:0.04em;
  color:var(--muted-strong,rgba(220,225,255,0.76));
  opacity:0;animation:mo-fade 700ms 1100ms forwards;
}
.mo-date-line {
  margin-top:6px;
  font-family:var(--font-ui,'Space Grotesk'),sans-serif;
  font-size:11px;font-weight:300;letter-spacing:0.18em;text-transform:uppercase;
  color:var(--muted,rgba(220,225,255,0.5));
  opacity:0;animation:mo-fade 700ms 1230ms forwards;
}
.mo-streak-badge {
  display:inline-flex;align-items:center;gap:8px;
  margin-top:18px;padding:5px 16px;
  border-radius:var(--radius-pill,999px);
  background:var(--brand-soft,rgba(139,123,255,0.15));
  border:1px solid var(--brand-line,rgba(139,123,255,0.32));
  font-family:var(--font-ui,'Space Grotesk'),sans-serif;
  font-size:12px;font-weight:600;color:var(--brand,#8B7BFF);
  opacity:0;animation:mo-pop 400ms cubic-bezier(0.16,1,0.3,1) 1380ms forwards;
}

/* divider */
.mo-divider {
  width:min(500px,90vw);height:1px;border:none;
  background:linear-gradient(90deg,transparent,var(--border-strong,rgba(150,160,255,0.22)),transparent);
  margin:26px auto;
  opacity:0;animation:mo-fade 800ms 1600ms forwards;
}

/* data tiles */
.mo-data-row {
  display:flex;gap:10px;flex-wrap:wrap;justify-content:center;
  opacity:0;transform:translateY(22px);
  animation:mo-rise-sm 700ms cubic-bezier(0.16,1,0.3,1) 1720ms forwards;
}
.mo-tile {
  min-width:108px;padding:12px 16px;
  border-radius:var(--radius-md,11px);
  border:1px solid var(--border,rgba(150,160,255,0.11));
  background:var(--surface,rgba(150,160,255,0.045));
  text-align:center;
}
.mo-tile-label {
  font-family:var(--font-ui,'Space Grotesk'),sans-serif;
  font-size:9px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;
  color:var(--muted,rgba(220,225,255,0.5));margin-bottom:6px;
}
.mo-tile-value {
  font-family:'Cormorant Garamond',Georgia,serif;
  font-size:22px;font-weight:400;letter-spacing:0.02em;
  font-variant-numeric:tabular-nums;
}
.mo-tile-bar  {height:2px;border-radius:1px;background:var(--track,rgba(160,170,255,0.09));margin-top:8px;overflow:hidden;}
.mo-tile-fill {height:100%;width:0%;transition:width 1400ms cubic-bezier(0.16,1,0.3,1);}

.mo-c-pos  {color:var(--pos,#4FE3D0);}
.mo-c-warn {color:var(--warn,#FFC65C);}
.mo-c-neg  {color:var(--neg,#FF6FA5);}
.mo-f-pos  {background:var(--pos,#4FE3D0);}
.mo-f-warn {background:var(--warn,#FFC65C);}
.mo-f-neg  {background:var(--neg,#FF6FA5);}

/* focus */
.mo-focus-line {
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;
  font-family:'Cormorant Garamond',Georgia,serif;
  font-size:clamp(0.9rem,2.2vw,1.1rem);
  font-weight:400;letter-spacing:0.03em;
  color:var(--muted,rgba(220,225,255,0.5));
  opacity:0;animation:mo-fade 600ms 2300ms forwards;
}
.mo-focus-arrow {color:var(--brand,#8B7BFF);}
.mo-focus-task  {font-weight:500;color:var(--fg,#EEF0FF);}

/* chips */
.mo-chips {
  display:flex;gap:8px;flex-wrap:wrap;justify-content:center;
  margin-top:12px;
  opacity:0;animation:mo-fade 500ms 2450ms forwards;
}
.mo-chip {
  padding:4px 12px;border-radius:var(--radius-pill,999px);
  font-family:var(--font-ui,'Space Grotesk'),sans-serif;
  font-size:10px;font-weight:500;letter-spacing:0.05em;border:1px solid;
}
.mo-chip-h {color:var(--neg,#FF6FA5); background:var(--neg-soft,rgba(255,111,165,0.13));  border-color:var(--neg-line,rgba(255,111,165,0.28));}
.mo-chip-m {color:var(--warn,#FFC65C);background:var(--warn-soft,rgba(255,198,92,0.11));  border-color:var(--warn-line,rgba(255,198,92,0.28));}
.mo-chip-l {color:var(--pos,#4FE3D0); background:var(--pos-soft,rgba(79,227,208,0.13));   border-color:var(--pos-line,rgba(79,227,208,0.28));}

/* yesterday */
.mo-yest {
  margin-top:10px;
  display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;
  opacity:0;animation:mo-fade 500ms 2580ms forwards;
}
.mo-yest-item {
  display:flex;align-items:center;gap:6px;
  font-family:var(--font-ui,'Space Grotesk'),sans-serif;
  font-size:11px;font-weight:400;letter-spacing:0.04em;
  color:var(--muted,rgba(220,225,255,0.5));
}
.mo-yest-badge {
  padding:2px 8px;border-radius:var(--radius-pill,999px);
  background:var(--pos-soft,rgba(79,227,208,0.13));
  border:1px solid var(--pos-line,rgba(79,227,208,0.28));
  font-family:var(--font-ui,'Space Grotesk'),sans-serif;
  font-size:9px;font-weight:600;letter-spacing:0.06em;
  color:var(--pos,#4FE3D0);
}
.mo-yest-empty {
  font-family:'Cormorant Garamond',Georgia,serif;
  font-style:italic;font-size:0.95rem;
  color:var(--muted,rgba(220,225,255,0.5));
}

/* CTA */
.mo-cta {
  display:flex;flex-direction:column;align-items:center;gap:12px;
  margin-top:36px;
  opacity:0;animation:mo-fade 700ms 2750ms forwards;
}
.mo-enter-btn {
  padding:14px 52px;
  background:var(--brand,#8B7BFF);color:var(--brand-ink,#0A0922);
  border:none;border-radius:var(--radius-md,11px);
  font-family:var(--font-ui,'Space Grotesk'),sans-serif;
  font-size:15px;font-weight:700;letter-spacing:0.02em;
  cursor:pointer;
  transition:filter 220ms,box-shadow 220ms,transform 220ms;
}
.mo-enter-btn:hover {
  filter:brightness(1.1);
  box-shadow:0 0 48px var(--brand-glow,rgba(124,107,255,0.55));
  transform:translateY(-2px);
}
.mo-skip-btn {
  background:none;border:none;cursor:pointer;
  font-family:var(--font-ui,'Space Grotesk'),sans-serif;
  font-size:13px;font-weight:400;
  color:var(--muted,rgba(220,225,255,0.5));
  transition:color 200ms;
}
.mo-skip-btn:hover {color:var(--muted-strong,rgba(220,225,255,0.76));}

/* exit */
#morning-overlay-root.mo-out {
  animation:mo-fade-out 500ms cubic-bezier(0.4,0,1,1) forwards;
}

/* banner */
.mo-banner {
  display:flex;align-items:center;gap:12px;
  padding:12px 20px;
  background:var(--bg-elevated,#12131F);
  border-bottom:1px solid var(--border,rgba(150,160,255,0.11));
  border-left:3px solid var(--brand,#8B7BFF);
  transform:translateY(-100%);
  transition:transform 300ms cubic-bezier(0.16,1,0.3,1);
}
.mo-banner.mo-banner-visible {transform:translateY(0);}
.mo-banner.mo-banner-out {transform:translateY(-100%);transition:transform 200ms cubic-bezier(0.4,0,1,1);}
.mo-banner-text {
  flex:1;font-family:var(--font-ui,'Space Grotesk'),sans-serif;
  font-size:14px;font-weight:500;
  color:var(--muted-strong,rgba(220,225,255,0.76));
}
.mo-banner-text strong {color:var(--fg,#EEF0FF);}
.mo-banner-close {
  background:transparent;border:1px solid var(--border,rgba(150,160,255,0.11));
  border-radius:50%;width:28px;height:28px;display:grid;place-items:center;
  color:var(--muted,rgba(220,225,255,0.5));font-size:16px;line-height:1;cursor:pointer;
  transition:color 200ms,border-color 200ms;
}
.mo-banner-close:hover {color:var(--fg,#EEF0FF);border-color:var(--border-strong,rgba(150,160,255,0.22));}

/* keyframes */
@keyframes mo-fade     {from{opacity:0}             to{opacity:1}}
@keyframes mo-fade-out {from{opacity:1}             to{opacity:0}}
@keyframes mo-down     {from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)}}
@keyframes mo-rise     {from{opacity:0;transform:translateY(60px)}  to{opacity:1;transform:translateY(0)}}
@keyframes mo-rise-sm  {from{opacity:0;transform:translateY(22px)}  to{opacity:1;transform:translateY(0)}}
@keyframes mo-breathe  {0%,100%{opacity:.8} 50%{opacity:1}}
@keyframes mo-pop {
  0%  {opacity:0;transform:scale(0.86);}
  65% {opacity:1;transform:scale(1.05);}
  100%{opacity:1;transform:scale(1);}
}

@media(max-width:480px){
  .mo-topbar {padding:16px 18px;}
  .mo-tile   {min-width:82px;padding:10px 12px;}
  .mo-tile-value {font-size:18px;}
  .mo-enter-btn  {padding:13px 40px;font-size:14px;}
  .mo-screen {padding:72px 20px 64px;}
  .mo-hello  {font-size:clamp(1.6rem,9vw,2.8rem);}
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important;opacity:1!important;transform:none!important;}
}
`;
    document.head.appendChild(s);
  }

  /* ── Tile HTML ─────────────────────────────────────────── */
  function tileHtml(m) {
    const fillCls = 'mo-f-' + (m.tone || 'pos');
    const valCls  = 'mo-c-' + (m.tone || 'pos');
    return '<div class="mo-tile">'
      + '<div class="mo-tile-label">' + esc(m.label) + '</div>'
      + '<div class="mo-tile-value ' + valCls + '">' + esc(m.value) + '</div>'
      + (m.pct !== null ? '<div class="mo-tile-bar"><div class="mo-tile-fill ' + fillCls + '" data-pct="' + m.pct + '"></div></div>' : '')
      + '</div>';
  }

  /* ── Full overlay HTML ─────────────────────────────────── */
  function buildFullHTML() {
    const now  = new Date();
    const subIdx = now.getDate() % SUBTITLES.length;

    const tilesHtml = snapshot.length
      ? snapshot.map(tileHtml).join('')
      : '<p style="font-size:.85rem;color:var(--muted)">No health data yet — connect Whoop or log manually.</p>';

    const chipsHtml = ''
      + (highTasks.length ? '<span class="mo-chip mo-chip-h">' + highTasks.length + ' critical</span>' : '')
      + (medTasks.length  ? '<span class="mo-chip mo-chip-m">' + medTasks.length  + ' focus</span>'    : '')
      + (lowTasks.length  ? '<span class="mo-chip mo-chip-l">' + lowTasks.length  + ' optional</span>' : '');

    const yestHtml = yesterdayDone.length
      ? yesterdayDone.map(item =>
          '<div class="mo-yest-item"><span class="mo-yest-badge">done</span>' + esc(item) + '</div>'
        ).join('')
      : '<span class="mo-yest-empty">Quiet day yesterday — today\'s your comeback.</span>';

    const focusHtml = focusTask
      ? '<span>' + esc(SUBTITLES[subIdx]) + '</span>'
        + '<span class="mo-focus-arrow">→</span>'
        + '<span class="mo-focus-task">' + esc(focusTask.name) + '</span>'
      : '';

    return `
<canvas id="mo-canvas"></canvas>
<div class="mo-nebula"></div>
<div class="mo-nebula mo-nebula-b"></div>
<div class="mo-topbar">
  <span id="mo-hud-time"></span>
  <span id="mo-hud-date"></span>
</div>
<div class="mo-screen">
  <div class="mo-greeting">
    <div class="mo-hello">Hello, <span class="mo-name">${esc(NAME)}.</span></div>
    <p class="mo-morning">${esc(greetingSub(hour))}</p>
    <p class="mo-date-line">${esc(fmtDateLong(now))}</p>
    <div class="mo-streak-badge">${esc(streakLabel(streakCount, isFreshStart))}</div>
  </div>
  <hr class="mo-divider" />
  <div class="mo-data-row">${tilesHtml}</div>
  ${focusHtml ? '<hr class="mo-divider" style="margin:20px auto" /><div class="mo-focus-line">' + focusHtml + '</div>' : ''}
  ${chipsHtml ? '<div class="mo-chips">' + chipsHtml + '</div>' : ''}
  <div class="mo-yest">${yestHtml}</div>
  <div class="mo-cta">
    <button class="mo-enter-btn" id="mo-enter">Enter</button>
    <button class="mo-skip-btn"  id="mo-skip">Skip for now</button>
  </div>
</div>`;
  }

  /* ── Late overlay HTML ────────────────────────────────── */
  function buildLateHTML() {
    const now    = new Date();
    const subIdx = now.getDate() % LATE_SUBTITLES.length;

    const tilesHtml = snapshot.length
      ? snapshot.map(tileHtml).join('')
      : '<p style="font-size:.85rem;color:var(--muted)">No health data yet — connect Whoop or log manually.</p>';

    const chipsHtml = ''
      + (highTasks.length ? '<span class="mo-chip mo-chip-h">' + highTasks.length + ' critical</span>' : '')
      + (medTasks.length  ? '<span class="mo-chip mo-chip-m">' + medTasks.length  + ' focus</span>'    : '')
      + (lowTasks.length  ? '<span class="mo-chip mo-chip-l">' + lowTasks.length  + ' optional</span>' : '');

    const focusHtml = focusTask
      ? '<span>' + esc(LATE_SUBTITLES[subIdx]) + '</span>'
        + '<span class="mo-focus-arrow">→</span>'
        + '<span class="mo-focus-task">' + esc(focusTask.name) + '</span>'
      : '';

    return `
<canvas id="mo-canvas"></canvas>
<div class="mo-nebula"></div>
<div class="mo-nebula mo-nebula-b"></div>
<div class="mo-topbar">
  <span id="mo-hud-time"></span>
  <span id="mo-hud-date"></span>
</div>
<div class="mo-screen">
  <div class="mo-greeting">
    <div class="mo-hello">You're late, <span class="mo-name">${esc(NAME)}.</span></div>
    <p class="mo-morning">But there's still time.</p>
    <p class="mo-date-line">${esc(fmtDateLong(now))}</p>
  </div>
  <hr class="mo-divider" />
  <div class="mo-data-row">${tilesHtml}</div>
  ${focusHtml ? '<hr class="mo-divider" style="margin:20px auto" /><div class="mo-focus-line">' + focusHtml + '</div>' : ''}
  ${chipsHtml ? '<div class="mo-chips">' + chipsHtml + '</div>' : ''}
  <div class="mo-cta">
    <button class="mo-enter-btn" id="mo-enter">Let's go</button>
    <button class="mo-skip-btn"  id="mo-skip">Skip</button>
  </div>
</div>`;
  }

  /* ── Starfield ─────────────────────────────────────────── */
  function initStarfield() {
    const canvas = document.getElementById('mo-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, stars = [], shooters = [];
    let nextShoot = 6000 + Math.random() * 8000, lastShootT = 0;

    const LAYERS = [
      [0.25, 1.6, 2.6, 0.07, 0.45, 0.95],
      [0.40, 0.8, 1.5, 0.03, 0.28, 0.72],
      [0.35, 0.3, 0.8, 0.01, 0.12, 0.42],
    ];

    function makeStar(L, yOverride) {
      const sz = L[1] + Math.random() * (L[2] - L[1]);
      const purp = Math.random() < 0.14;
      return {
        x: Math.random() * W,
        y: yOverride !== undefined ? yOverride : Math.random() * H,
        sz, spd: L[3] * (0.65 + Math.random() * 0.7),
        op: L[4] + Math.random() * (L[5] - L[4]),
        ph: Math.random() * Math.PI * 2,
        ts: 0.0004 + Math.random() * 0.0009,
        r: purp ? 180 : 215, g: purp ? 165 : 222, b: 255,
        sparkle: sz > 1.8 && Math.random() < 0.45,
      };
    }

    function init() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      stars = [];
      const total = Math.max(120, Math.min(Math.floor(W * H / 3800), 380));
      LAYERS.forEach(function(L) {
        const n = Math.floor(total * L[0]);
        for (let i = 0; i < n; i++) stars.push(makeStar(L));
      });
    }

    function drawSparkle(x, y, sz, op) {
      const arm = sz * 4.5;
      ctx.lineWidth = 0.8;
      const hg = ctx.createLinearGradient(x-arm, y, x+arm, y);
      hg.addColorStop(0, 'rgba(220,228,255,0)');
      hg.addColorStop(0.5, 'rgba(220,228,255,' + (op*0.5).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(220,228,255,0)');
      ctx.beginPath(); ctx.moveTo(x-arm, y); ctx.lineTo(x+arm, y);
      ctx.strokeStyle = hg; ctx.stroke();
      const vg = ctx.createLinearGradient(x, y-arm, x, y+arm);
      vg.addColorStop(0, 'rgba(220,228,255,0)');
      vg.addColorStop(0.5, 'rgba(220,228,255,' + (op*0.38).toFixed(3) + ')');
      vg.addColorStop(1, 'rgba(220,228,255,0)');
      ctx.beginPath(); ctx.moveTo(x, y-arm); ctx.lineTo(x, y+arm);
      ctx.strokeStyle = vg; ctx.stroke();
    }

    function spawnShooter() {
      const angle = 0.38 + Math.random() * 0.42, spd = 9 + Math.random() * 7;
      shooters.push({
        x: W*0.1 + Math.random()*W*0.55, y: H*0.02 + Math.random()*H*0.38,
        vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd,
        len: 110 + Math.random()*120, life: 0, max: 45 + Math.random()*35,
      });
    }

    let running = true;
    function draw(ts) {
      if (!running || !document.getElementById('morning-overlay-root')) return;
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.y -= s.spd;
        if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; }
        const twk = 0.55 + 0.45 * Math.sin(ts * s.ts + s.ph);
        const op  = s.op * twk;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.sz, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(' + s.r + ',' + s.g + ',' + s.b + ',' + op.toFixed(3) + ')';
        ctx.fill();
        if (s.sparkle && op > 0.4) drawSparkle(s.x, s.y, s.sz, op);
      }
      if (ts - lastShootT > nextShoot) {
        spawnShooter(); lastShootT = ts; nextShoot = 6000 + Math.random()*8000;
      }
      for (let j = shooters.length - 1; j >= 0; j--) {
        const sh = shooters[j];
        sh.x += sh.vx; sh.y += sh.vy; sh.life++;
        const p  = sh.life / sh.max;
        const op = (p < 0.18 ? p/0.18 : p > 0.65 ? Math.max(0, 1-(p-0.65)/0.35) : 1) * 0.85;
        const mag = Math.sqrt(sh.vx*sh.vx + sh.vy*sh.vy);
        const nx = sh.vx/mag, ny = sh.vy/mag;
        const tx = sh.x - nx*sh.len, ty = sh.y - ny*sh.len;
        const grad = ctx.createLinearGradient(tx, ty, sh.x, sh.y);
        grad.addColorStop(0, 'rgba(210,218,255,0)');
        grad.addColorStop(0.6, 'rgba(210,218,255,' + (op*0.28).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(255,255,255,' + op.toFixed(3) + ')');
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sh.x, sh.y);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.beginPath(); ctx.arc(sh.x, sh.y, 1.8, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,' + op.toFixed(3) + ')'; ctx.fill();
        if (sh.life >= sh.max || sh.x > W+50 || sh.y > H+50) shooters.splice(j, 1);
      }
      requestAnimationFrame(draw);
    }

    init();
    window.addEventListener('resize', init);
    requestAnimationFrame(draw);
    return function() { running = false; };
  }

  /* ── Dismiss helpers ───────────────────────────────────── */
  function dismiss() {
    lsSetStr(KEY_LAST_SHOWN, todayKey);
    const root = document.getElementById('morning-overlay-root');
    if (!root) return;
    root.classList.add('mo-out');
    setTimeout(function() { if (root.parentNode) root.parentNode.removeChild(root); }, 500);
  }

  function dismissBanner() {
    lsSetStr(KEY_LAST_SHOWN, todayKey);
    const bn = document.getElementById('mo-banner');
    if (!bn) return;
    bn.classList.add('mo-banner-out');
    setTimeout(function() { if (bn.parentNode) bn.parentNode.removeChild(bn); }, 250);
  }

  /* ── Banner HTML ───────────────────────────────────────── */
  function buildBanner() {
    const n = highTasks.length;
    const msg = n > 0
      ? n + ' critical task' + (n > 1 ? 's' : '') + ' need your attention'
      : 'check today\'s priorities';
    return '<div class="mo-banner" id="mo-banner">'
      + '<span class="mo-banner-text"><strong>' + esc(NAME) + '</strong> — ' + esc(msg) + '</span>'
      + '<button class="mo-banner-close" id="mo-banner-close" aria-label="Dismiss">×</button>'
      + '</div>';
  }

  /* ── Clock ─────────────────────────────────────────────── */
  function startClock() {
    function tick() {
      const el = document.getElementById('mo-hud-time');
      if (!el) return;
      const n = new Date(), p = v => String(v).padStart(2, '0');
      el.textContent = p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
      setTimeout(tick, 1000);
    }
    tick();
  }

  /* ── Mount ─────────────────────────────────────────────── */
  function mount() {
    injectCSS();
    const root = document.createElement('div');
    root.id = 'morning-overlay-root';

    if (showFull) {
      root.innerHTML = buildFullHTML();
      document.body.appendChild(root);

      initStarfield();
      startClock();

      // Date in topbar
      const dateEl = document.getElementById('mo-hud-date');
      if (dateEl) dateEl.textContent = fmtDateLong();

      // Progress bars
      setTimeout(function() {
        document.querySelectorAll('.mo-tile-fill[data-pct]').forEach(function(el) {
          const pct = parseFloat(el.getAttribute('data-pct'));
          if (isFinite(pct)) el.style.width = Math.min(100, pct) + '%';
        });
      }, 2300);

      document.getElementById('mo-enter').addEventListener('click', dismiss);
      document.getElementById('mo-skip').addEventListener('click', dismiss);
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', handler); }
      });

    } else {
      root.innerHTML = buildLateHTML();
      document.body.appendChild(root);

      initStarfield();
      startClock();

      const dateEl = document.getElementById('mo-hud-date');
      if (dateEl) dateEl.textContent = fmtDateLong();

      setTimeout(function() {
        document.querySelectorAll('.mo-tile-fill[data-pct]').forEach(function(el) {
          const pct = parseFloat(el.getAttribute('data-pct'));
          if (isFinite(pct)) el.style.width = Math.min(100, pct) + '%';
        });
      }, 2300);

      document.getElementById('mo-enter').addEventListener('click', dismiss);
      document.getElementById('mo-skip').addEventListener('click', dismiss);
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', handler); }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

})();
