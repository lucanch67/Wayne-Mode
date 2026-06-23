/* theme-bg.js — animated aurora/nocturne background blobs for all pages */
(function(){
  var style = document.createElement('style');
  style.id = 'wm-theme-bg-css';
  style.textContent = [
    '#wm-bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;}',
    '[data-theme="daylight"] #wm-bg{display:none;}',
    '.wm-b{position:absolute;border-radius:50%;opacity:0.7;}',
    /* Aurora blobs */
    '[data-theme="aurora"] .wm-b1{width:700px;height:700px;top:-200px;left:-150px;background:radial-gradient(ellipse at center,rgba(139,123,255,0.38) 0%,rgba(100,60,220,0.14) 55%,transparent 100%);filter:blur(90px);animation:wm-a1 22s ease-in-out infinite;}',
    '[data-theme="aurora"] .wm-b2{width:550px;height:550px;bottom:-150px;right:-120px;background:radial-gradient(ellipse at center,rgba(79,227,208,0.28) 0%,rgba(40,180,160,0.10) 55%,transparent 100%);filter:blur(80px);animation:wm-a2 28s ease-in-out infinite;}',
    '[data-theme="aurora"] .wm-b3{width:450px;height:450px;top:35%;left:35%;background:radial-gradient(ellipse at center,rgba(185,140,255,0.20) 0%,rgba(110,70,210,0.07) 55%,transparent 100%);filter:blur(100px);animation:wm-a3 18s ease-in-out infinite;}',
    '[data-theme="aurora"] .wm-b4{display:block;width:130%;height:320px;top:22%;left:-15%;background:linear-gradient(180deg,transparent 0%,rgba(139,123,255,0.07) 25%,rgba(79,227,208,0.09) 50%,rgba(139,123,255,0.06) 75%,transparent 100%);border-radius:50%;filter:blur(44px);animation:wm-ac 32s ease-in-out infinite;}',
    /* Nocturne blobs */
    '[data-theme="nocturne"] .wm-b1{width:700px;height:700px;top:-200px;left:-150px;background:radial-gradient(ellipse at center,rgba(0,255,136,0.24) 0%,rgba(0,200,100,0.09) 55%,transparent 100%);filter:blur(90px);animation:wm-n1 9s ease-in-out infinite;}',
    '[data-theme="nocturne"] .wm-b2{width:550px;height:550px;bottom:-150px;right:-120px;background:radial-gradient(ellipse at center,rgba(0,255,136,0.16) 0%,rgba(0,180,80,0.06) 55%,transparent 100%);filter:blur(80px);animation:wm-n2 14s ease-in-out infinite;}',
    '[data-theme="nocturne"] .wm-b3{width:450px;height:450px;top:35%;left:35%;background:radial-gradient(ellipse at center,rgba(0,255,136,0.11) 0%,rgba(0,150,70,0.04) 55%,transparent 100%);filter:blur(100px);animation:wm-n3 11s ease-in-out infinite;}',
    '[data-theme="nocturne"] .wm-b4{display:none;}',
    /* Keyframes — Aurora */
    '@keyframes wm-a1{0%,100%{transform:translate(0,0) scale(1)}20%{transform:translate(70px,50px) scale(1.09)}50%{transform:translate(35px,-55px) scale(0.94)}75%{transform:translate(-45px,35px) scale(1.06)}}',
    '@keyframes wm-a2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-75px,-55px) scale(1.12)}66%{transform:translate(45px,-25px) scale(0.91)}}',
    '@keyframes wm-a3{0%,100%{transform:translate(0,0) scale(1);opacity:0.65}50%{transform:translate(-55px,-75px) scale(1.22);opacity:1}}',
    '@keyframes wm-ac{0%,100%{transform:translateY(0) scaleX(1);opacity:0.45}30%{transform:translateY(-65px) scaleX(1.06);opacity:0.85}70%{transform:translateY(45px) scaleX(0.96);opacity:0.55}}',
    /* Keyframes — Nocturne */
    '@keyframes wm-n1{0%,100%{transform:scale(1);opacity:0.65}50%{transform:scale(1.20);opacity:1}}',
    '@keyframes wm-n2{0%,100%{transform:translate(0,0) scale(0.9);opacity:0.50}40%{transform:translate(-45px,-35px) scale(1.14);opacity:0.80}80%{transform:translate(25px,25px) scale(1.02);opacity:0.60}}',
    '@keyframes wm-n3{0%,100%{transform:translate(0,0) scale(1);opacity:0.38}33%{transform:translate(35px,-45px) scale(1.18);opacity:0.72}66%{transform:translate(-22px,32px) scale(0.94);opacity:0.50}}',
    '@media(prefers-reduced-motion:reduce){.wm-b{animation:none!important;}}'
  ].join('');
  document.head.appendChild(style);

  function inject() {
    if (document.getElementById('wm-bg')) return;
    var el = document.createElement('div');
    el.id = 'wm-bg';
    el.innerHTML = '<div class="wm-b wm-b1"></div><div class="wm-b wm-b2"></div><div class="wm-b wm-b3"></div><div class="wm-b wm-b4"></div>';
    document.body.insertBefore(el, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
