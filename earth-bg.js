/* ============================================================
 * earth-bg.js — the shared "Vision" background for every page.
 *
 * Ports the animated canvas (stars + nebula + spinning earth) from
 * the main dashboard so every page in the suite has the exact same
 * look: black background, starfield, drifting nebula, spinning
 * earth in the corner, and the Instrument Serif / Inter / JetBrains
 * Mono font stack. Include this once, near the top of <body>:
 *   <script src="earth-bg.js"></script>
 *
 * Vision is now the permanent, only theme — this locks data-theme
 * to "vision" (overriding any leftover per-page theme switcher) and
 * keeps it locked even if older page code tries to change it.
 * ============================================================ */
(function () {
  var html = document.documentElement;

  function lockTheme() {
    if (html.getAttribute('data-theme') !== 'vision') {
      html.setAttribute('data-theme', 'vision');
    }
    try { localStorage.setItem('patron_theme', 'vision'); } catch (e) {}
  }
  lockTheme();
  new MutationObserver(lockTheme).observe(html, { attributes: true, attributeFilter: ['data-theme'] });

  /* ── Fonts — Instrument Serif / Inter / JetBrains Mono, everywhere ── */
  if (!document.getElementById('wm-vision-fonts')) {
    var pre1 = document.createElement('link');
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    var pre2 = document.createElement('link');
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = '';
    var font = document.createElement('link');
    font.id = 'wm-vision-fonts';
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';
    document.head.appendChild(pre1);
    document.head.appendChild(pre2);
    document.head.appendChild(font);
  }

  /* ── Force the vision palette + fonts, and neutralize any leftover
   *    theme switcher / blob backgrounds from the old multi-theme system ── */
  if (!document.getElementById('wm-vision-lock-css')) {
    var css = document.createElement('style');
    css.id = 'wm-vision-lock-css';
    css.textContent =
      'html{background:#050505;}' +
      '.themeSeg,#themeSeg,.themeBtn{display:none!important;}' +
      '.bg-blobs,#wm-bg{display:none!important;}' +
      '.page{background:transparent!important;}' +
      '#main{background:transparent!important;}' +
      '#bg-canvas{position:fixed;inset:0;z-index:0;pointer-events:none;width:100%;height:100%;filter:blur(0.6px);}';
    document.head.appendChild(css);
  }

  /* ── Canvas element ── */
  function injectCanvas() {
    if (document.getElementById('bg-canvas')) return;
    var canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    initBgCanvas(canvas);
  }
  if (document.body) injectCanvas();
  else document.addEventListener('DOMContentLoaded', injectCanvas);

  /* ================================================================
   * Animated canvas — stars + nebula + spinning earth (vision only)
   * ================================================================ */
  function initBgCanvas(canvas) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ctx = canvas.getContext('2d');
    var W, H;
    function resize(){ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);

    /* ── Stars — sparse, silver-white, slow twinkle ── */
    var stars = [];
    for (var i = 0; i < 140; i++){
      stars.push({
        x: Math.random(), y: Math.random(),
        r: Math.random() * 0.9 + 0.15,
        phase: Math.random() * 6.28,
        spd: Math.random() * 0.18 + 0.06
      });
    }

    /* Constellation particles — pre-computed once */
    var visionPts = [];
    for (var vi = 0; vi < 62; vi++){
      visionPts.push({ x: Math.random(), y: Math.random()*0.84,
        dx: (Math.random()-0.5)*0.00014, dy: (Math.random()-0.5)*0.000095,
        r: Math.random()*0.85+0.25, phase: Math.random()*6.28, spd: Math.random()*0.10+0.04 });
    }

    /* ── Shooting stars (rare) ── */
    var shoots = [];
    var nextShoot = 0;

    var t = 0;
    function frame(){
      requestAnimationFrame(frame);
      t += 0.005;
      ctx.clearRect(0, 0, W, H);

      /* ── Stars ── */
      var sc = [240,240,242];
      for (var si = 0; si < stars.length; si++){
        var s = stars[si];
        if (s.y > 0.70) continue;
        var a = 0.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.spd + s.phase));
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, 6.28);
        ctx.fillStyle = 'rgba('+sc[0]+','+sc[1]+','+sc[2]+','+a.toFixed(2)+')';
        ctx.fill();
      }

      /* ── Shooting star — one at a time, every ~18 s ── */
      if (t > nextShoot){
        nextShoot = t + 16 + Math.random() * 20;
        shoots.push({ x: Math.random()*W*0.6+W*0.1, y: Math.random()*H*0.35,
          vx: (Math.random()*3+2.5), vy: Math.random()*1.5+0.8, life: 1 });
      }
      shoots = shoots.filter(function(sh){ return sh.life > 0; });
      for (var si2 = 0; si2 < shoots.length; si2++){
        var sh = shoots[si2];
        sh.x += sh.vx; sh.y += sh.vy; sh.life -= 0.014;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx*12, sh.y - sh.vy*12);
        var g = ctx.createLinearGradient(sh.x,sh.y, sh.x-sh.vx*12, sh.y-sh.vy*12);
        g.addColorStop(0, 'rgba(255,255,255,'+(sh.life*0.55).toFixed(2)+')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = sh.life * 1.2;
        ctx.stroke();
        ctx.restore();
      }

      renderVisionOrbs(ctx, W, H, t);
      renderVisionParticles(ctx, W, H, t);
      renderEarth(ctx, W, H, t);
    }

    /* ── Continent land boxes [minLat,maxLat,minLon,maxLon] ── */
    var _LB = [
      [25,70,-170,-52],[15,25,-117,-77],[8,15,-90,-77],   /* N America */
      [-55,12,-81,-34],                                    /* S America */
      [36,71,-10,35],[55,71,12,40],                        /* Europe */
      [-35,37,-17,51],[15,37,34,60],                       /* Africa + Mid-East */
      [5,35,60,100],[20,75,60,145],                        /* Asia */
      [0,25,95,122],[-8,8,96,141],                         /* SE Asia */
      [30,45,130,146],                                     /* Japan */
      [-43,-10,113,154],                                   /* Australia */
      [60,83,-73,-12],[63,67,-25,-13],                     /* Greenland/Iceland */
      [-25,-12,43,51]                                      /* Madagascar */
    ];
    function _isLand(lat,lon){
      while(lon>180)lon-=360; while(lon<-180)lon+=360;
      for(var i=0;i<_LB.length;i++){ var b=_LB[i]; if(lat>=b[0]&&lat<=b[1]&&lon>=b[2]&&lon<=b[3]) return true; }
      return false;
    }
    /* pre-compute land grid once */
    var _LS=[],_LO=[],_LG=[];
    for(var _lt=-85;_lt<=85;_lt+=5) _LS.push(_lt);
    for(var _lo=-175;_lo<=180;_lo+=5) _LO.push(_lo);
    for(var _i=0;_i<_LS.length;_i++){ _LG[_i]=[]; for(var _j=0;_j<_LO.length;_j++) _LG[_i][_j]=_isLand(_LS[_i],_LO[_j]); }

    /* ── 3 large drifting nebula glow orbs ── */
    function renderVisionOrbs(c,W2,H2,t2){
      var od=[
        {bx:0.12,by:0.28,r:0.46,spd:0.007,ph:0.00},
        {bx:0.68,by:0.16,r:0.40,spd:0.009,ph:2.09},
        {bx:0.44,by:0.60,r:0.38,spd:0.005,ph:4.19},
      ];
      for(var i=0;i<od.length;i++){
        var o=od[i];
        var ox=(o.bx+0.07*Math.sin(t2*o.spd+o.ph))*W2;
        var oy=(o.by+0.05*Math.cos(t2*o.spd*0.72+o.ph))*H2;
        var rr=Math.min(W2,H2)*o.r;
        var g=c.createRadialGradient(ox,oy,0,ox,oy,rr);
        g.addColorStop(0,'rgba(255,255,255,0.032)');
        g.addColorStop(0.38,'rgba(225,230,255,0.013)');
        g.addColorStop(0.70,'rgba(200,210,255,0.004)');
        g.addColorStop(1,'rgba(0,0,0,0)');
        c.fillStyle=g; c.beginPath(); c.arc(ox,oy,rr,0,6.28); c.fill();
      }
    }

    /* ── Drifting constellation particle mesh ── */
    function renderVisionParticles(c,W2,H2,t2){
      var cdist=Math.min(W2,H2)*0.155;
      for(var i=0;i<visionPts.length;i++){
        visionPts[i].x=(visionPts[i].x+visionPts[i].dx+1)%1;
        visionPts[i].y=(visionPts[i].y+visionPts[i].dy+1)%1;
      }
      for(var i=0;i<visionPts.length;i++){
        var p=visionPts[i], px2=p.x*W2, py2=p.y*H2;
        for(var j=i+1;j<visionPts.length;j++){
          var q=visionPts[j], qx=q.x*W2, qy=q.y*H2;
          var d=Math.sqrt((px2-qx)*(px2-qx)+(py2-qy)*(py2-qy));
          if(d<cdist){
            c.beginPath(); c.moveTo(px2,py2); c.lineTo(qx,qy);
            c.strokeStyle='rgba(255,255,255,'+((1-d/cdist)*0.09).toFixed(3)+')';
            c.lineWidth=0.5; c.stroke();
          }
        }
      }
      for(var i=0;i<visionPts.length;i++){
        var p=visionPts[i];
        var a=0.10+0.28*(0.5+0.5*Math.sin(t2*p.spd+p.phase));
        c.beginPath(); c.arc(p.x*W2,p.y*H2,p.r,0,6.28);
        c.fillStyle='rgba(255,255,255,'+a.toFixed(2)+')'; c.fill();
      }
    }

    function renderEarth(c,W2,H2,t2){
      var mob=W2<900;
      var R=Math.min(W2,H2)*(mob?0.52:0.66);
      var cx=mob?W2*0.78:W2*0.88, cy=mob?H2*0.94:H2*1.05;
      var atm=c.createRadialGradient(cx,cy,R*0.68,cx,cy,R*1.55);
      atm.addColorStop(0,'rgba(220,228,255,0.045)');
      atm.addColorStop(0.35,'rgba(200,210,255,0.018)');
      atm.addColorStop(0.7,'rgba(180,195,255,0.006)');
      atm.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=atm; c.beginPath(); c.arc(cx,cy,R*1.55,0,6.28); c.fill();
      var oc=c.createRadialGradient(cx-R*0.18,cy-R*0.18,0,cx,cy,R);
      oc.addColorStop(0,'rgba(255,255,255,0.022)');
      oc.addColorStop(0.55,'rgba(210,218,240,0.010)');
      oc.addColorStop(1,'rgba(160,170,210,0.018)');
      c.fillStyle=oc; c.beginPath(); c.arc(cx,cy,R,0,6.28); c.fill();
      var rot=t2*0.10, lD=[], oD=[];
      for(var li=0;li<_LS.length;li++){
        var laR=_LS[li]*0.017453, cosL=Math.cos(laR), sinL=Math.sin(laR);
        for(var lj=0;lj<_LO.length;lj++){
          var loR=_LO[lj]*0.017453+rot, z3=cosL*Math.cos(loR);
          if(z3<-0.04) continue;
          var x3=cosL*Math.sin(loR), px=cx+x3*R, py=cy+(-sinL)*R, dep=(z3+1)*0.5;
          if(_LG[li][lj]) lD.push(px,py,dep); else oD.push(px,py,dep);
        }
      }
      c.fillStyle='rgba(200,210,240,0.05)'; c.beginPath();
      for(var i=0;i<oD.length;i+=3){
        var dep=oD[i+2]; if(dep<0.08) continue;
        var sz=0.38+dep*0.22; c.moveTo(oD[i]+sz,oD[i+1]); c.arc(oD[i],oD[i+1],sz,0,6.28);
      }
      c.fill();
      c.fillStyle='rgba(215,222,245,0.20)'; c.beginPath();
      for(var j=0;j<lD.length;j+=3){
        if(lD[j+2]>0.52) continue;
        var sz2=0.75+lD[j+2]*0.35; c.moveTo(lD[j]+sz2,lD[j+1]); c.arc(lD[j],lD[j+1],sz2,0,6.28);
      }
      c.fill();
      c.fillStyle='rgba(245,248,255,0.46)'; c.beginPath();
      for(var k=0;k<lD.length;k+=3){
        if(lD[k+2]<=0.52) continue;
        var sz3=0.65+lD[k+2]*0.90; c.moveTo(lD[k]+sz3,lD[k+1]); c.arc(lD[k],lD[k+1],sz3,0,6.28);
      }
      c.fill();
      var vig=c.createRadialGradient(cx,cy,R*0.52,cx,cy,R*1.06);
      vig.addColorStop(0,'rgba(5,5,5,0)');
      vig.addColorStop(0.74,'rgba(5,5,5,0)');
      vig.addColorStop(0.90,'rgba(5,5,5,0.36)');
      vig.addColorStop(1,'rgba(5,5,5,0.92)');
      c.fillStyle=vig; c.beginPath(); c.arc(cx,cy,R*1.06,0,6.28); c.fill();
      var sp=c.createRadialGradient(cx-R*0.32,cy-R*0.28,0,cx,cy,R);
      sp.addColorStop(0,'rgba(255,255,255,0.06)');
      sp.addColorStop(0.38,'rgba(240,244,255,0.014)');
      sp.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=sp; c.beginPath(); c.arc(cx,cy,R,0,6.28); c.fill();
    }

    frame();
  }
})();
