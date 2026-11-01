/* شاشة البيت — a small TV "system" that runs inside the TV browser.
   Plain ES5 on purpose: the TV browser is old. */
(function () {
  var VERSION = '3';
  var $ = function (id) { return document.getElementById(id); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hasClass(el, c) { return (' ' + el.className + ' ').indexOf(' ' + c + ' ') > -1; }
  function addClass(el, c) { if (!hasClass(el, c)) el.className = (el.className + ' ' + c).replace(/^\s+/, ''); }
  function rmClass(el, c) { el.className = (' ' + el.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, ''); }
  function getJSON(url, cb) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.onreadystatechange = function () {
        if (x.readyState === 4) {
          if (x.status === 200) { try { cb(JSON.parse(x.responseText)); } catch (e) { cb(null); } } else cb(null);
        }
      };
      x.send();
    } catch (e) { cb(null); }
  }
  function data(name, cb) { getJSON('data/' + name + '?h=' + Math.floor(new Date().getTime() / 600000), cb); }

  // ---------- fit 1920x1080 stage to any screen ----------
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    var st = $('stage');
    st.style.transform = st.style.webkitTransform = 'scale(' + s + ')';
    st.style.top = ((window.innerHeight - 1080 * s) / 2) + 'px';
    st.style.right = ((window.innerWidth - 1920 * s) / 2) + 'px';
  }
  window.onresize = fit; fit();

  // ---------- time (Istanbul, UTC+3) ----------
  function istNow() { var d = new Date(); return new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 3 * 3600000); }
  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var GM = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var HM = ['محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجة'];
  function hijriCalc(d) {
    var jd = Math.floor(d.getTime() / 86400000 + 2440587.5);
    var l = jd - 1948440 + 10632, n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    var j = Math.floor((10985 - l) / 5316) * Math.floor(50 * l / 17719) + Math.floor(l / 5670) * Math.floor(43 * l / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor(17719 * j / 50) - Math.floor(j / 16) * Math.floor(15238 * j / 43) + 29;
    var m = Math.floor(24 * l / 709);
    return { d: l - Math.floor(709 * m / 24), m: m, y: 30 * n + j - 30 };
  }

  // ---------- prayer times ----------
  var NAMES = { Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
  var ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  var times = null, timesDay = '', apiHijri = null;
  function calcTimes(date) {
    var lat = 41.0082, lng = 28.9784, rad = Math.PI / 180;
    var y = date.getFullYear(), mo = date.getMonth() + 1, dd = date.getDate();
    if (mo <= 2) { y -= 1; mo += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    var D = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (mo + 1)) + dd + B - 1524.5 - lng / 360 - 2451545.0;
    var g = (357.529 + 0.98560028 * D) % 360, q = (280.459 + 0.98564736 * D) % 360;
    var L = (q + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad)) % 360;
    var e = 23.439 - 0.00000036 * D;
    var RA = (Math.atan2(Math.cos(e * rad) * Math.sin(L * rad), Math.cos(L * rad)) / rad / 15 + 24) % 24;
    var decl = Math.asin(Math.sin(e * rad) * Math.sin(L * rad)) / rad;
    var EqT = q / 15 - RA; EqT = ((EqT % 24) + 36) % 24 - 12;
    var noon = 12 + 3 - lng / 15 - EqT;
    function ha(a) { var v = (-Math.sin(a * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.cos(decl * rad)); return Math.acos(Math.max(-1, Math.min(1, v))) / rad / 15; }
    var asrA = -Math.atan(1 / (1 + Math.tan(Math.abs(lat - decl) * rad))) / rad;
    function hm(h) { var m = Math.round(h * 60); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }
    return { Fajr: hm(noon - ha(18)), Sunrise: hm(noon - ha(0.833)), Dhuhr: hm(noon + 2 / 60), Asr: hm(noon + ha(asrA)), Maghrib: hm(noon + ha(0.833)), Isha: hm(noon + ha(17)) };
  }
  function loadTimes() {
    var now = istNow(), key = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();
    if (timesDay === key && times) return;
    timesDay = key; times = calcTimes(now); apiHijri = null;
    getJSON('https://api.aladhan.com/v1/timingsByCity/' + pad(now.getDate()) + '-' + pad(now.getMonth() + 1) + '-' + now.getFullYear() + '?city=Istanbul&country=Turkey&method=13', function (r) {
      if (!r || !r.data) return;
      var t = {};
      for (var i = 0; i < ORDER.length; i++) t[ORDER[i]] = String(r.data.timings[ORDER[i]]).substr(0, 5);
      times = t;
      apiHijri = { d: +r.data.date.hijri.day, m: +r.data.date.hijri.month.number, y: +r.data.date.hijri.year };
      renderDates();
    });
  }
  function toMin(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function nextPrayer(now) {
    var cur = now.getHours() * 60 + now.getMinutes();
    for (var i = 0; i < ORDER.length; i++) if (toMin(times[ORDER[i]]) > cur) return ORDER[i];
    return null;
  }
  function renderPrayers() {
    if (!times) return;
    var now = istNow(), cur = now.getHours() * 60 + now.getMinutes(), nk = nextPrayer(now), html = '';
    for (var k = 0; k < ORDER.length; k++) {
      var n = ORDER[k], cls = 'p';
      if (n === (nk || 'Fajr')) cls += ' next'; else if (nk && toMin(times[n]) <= cur) cls += ' past';
      html += '<div class="' + cls + '"><div class="n">' + NAMES[n] + '</div><div class="t">' + times[n] + '</div></div>';
    }
    $('prayers').innerHTML = html;
    var target = nk ? toMin(times[nk]) : toMin(times.Fajr) + 1440;
    var left = target * 60 - (cur * 60 + now.getSeconds());
    var h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
    $('countdown').innerHTML = 'باقي على ' + NAMES[nk || 'Fajr'] + ' &nbsp;<b>' + (h > 0 ? h + ':' : '') + pad(m) + ':' + pad(s) + '</b>';
  }
  function renderDates() {
    var now = istNow(), h = apiHijri || hijriCalc(now), hr = now.getHours();
    $('hijri').innerHTML = DAYS[now.getDay()] + ' ' + h.d + ' ' + HM[h.m - 1] + ' ' + h.y + ' هـ';
    $('greg').innerHTML = now.getDate() + ' ' + GM[now.getMonth()] + ' ' + now.getFullYear();
    $('greet').innerHTML = hr < 5 ? 'ليلة هانئة' : hr < 12 ? 'صباح الخير' : hr < 18 ? 'نهارك سعيد' : 'مساء الخير';
  }

  // ---------- adhan ----------
  var adhanInfo = null, adhanAudio = null, adhanDone = {}, preDone = {};
  data('adhan.json', function (d) { adhanInfo = d; });
  function checkAdhan(now) {
    if (!times) return;
    var cur = now.getHours() * 60 + now.getMinutes(), day = now.getDate();
    for (var i = 0; i < ORDER.length; i++) {
      var n = ORDER[i]; if (n === 'Sunrise') continue;
      var t = toMin(times[n]), key = day + n;
      if (cur === t - 10 && !preDone[key]) { preDone[key] = 1; toast('باقي ١٠ دقايق على أذان ' + NAMES[n]); }
      if (cur === t && !adhanDone[key]) { adhanDone[key] = 1; showAdhan(n); }
    }
  }
  function showAdhan(n) {
    stopVideo(); pauseRadio(true);
    $('ad-name').innerHTML = 'أذان ' + NAMES[n];
    $('ad-time').innerHTML = times[n];
    $('ad-credit').innerHTML = adhanInfo ? esc('Adhan recording: ' + (adhanInfo.author || '') + ' · ' + (adhanInfo.license || '') + ' · Wikimedia Commons') : '';
    addClass($('adhan'), 'on'); overlayOn = true; wake();
    if (adhanInfo && adhanInfo.url) {
      try { adhanAudio = new Audio(adhanInfo.url); adhanAudio.onended = hideAdhan; var p = adhanAudio.play(); if (p && p['catch']) p['catch'](function () {}); } catch (e) {}
    }
    setTimeout(hideAdhan, 6 * 60000);
  }
  function hideAdhan() {
    if (!overlayOn) return;
    overlayOn = false; rmClass($('adhan'), 'on');
    if (adhanAudio) { try { adhanAudio.pause(); } catch (e) {} adhanAudio = null; }
    pauseRadio(false);
  }
  var overlayOn = false, toastT = null;
  function toast(msg) {
    var t = $('toast'); t.innerHTML = msg; addClass(t, 'on');
    clearTimeout(toastT); toastT = setTimeout(function () { rmClass(t, 'on'); }, 8000);
  }

  // ---------- adhkar ----------
  var ADHKAR = [
    ['سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ', ''],
    ['لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', ''],
    ['أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ', ''],
    ['أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ', 'سورة الرعد · ٢٨'],
    ['رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', 'سورة البقرة · ٢٠١'],
    ['اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ', ''],
    ['أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ وَأَتُوبُ إِلَيْهِ', ''],
    ['حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ', 'سورة التوبة · ١٢٩'],
    ['لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', ''],
    ['فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ', 'سورة البقرة · ١٥٢']
  ];
  var di = Math.floor(Math.random() * ADHKAR.length);
  function showDhikr() {
    var el = $('dhikr'); el.style.opacity = 0;
    setTimeout(function () { var a = ADHKAR[di++ % ADHKAR.length]; el.innerHTML = '<div>' + a[0] + (a[1] ? '<small>' + a[1] + '</small>' : '') + '</div>'; el.style.opacity = 1; }, 800);
  }

  // ---------- weather ----------
  var WMO = { 0: 'صافي', 1: 'صافي غالباً', 2: 'غائم جزئياً', 3: 'غائم', 45: 'ضباب', 48: 'ضباب', 51: 'رذاذ خفيف', 53: 'رذاذ', 55: 'رذاذ كثيف', 61: 'مطر خفيف', 63: 'مطر', 65: 'مطر غزير', 71: 'ثلج خفيف', 73: 'ثلج', 75: 'ثلج كثيف', 80: 'زخات مطر', 81: 'زخات مطر', 82: 'زخات قوية', 95: 'عاصفة رعدية', 96: 'عاصفة مع برد', 99: 'عاصفة مع برد' };
  function loadWeather() {
    getJSON('https://api.open-meteo.com/v1/forecast?latitude=41.01&longitude=28.98&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FIstanbul&forecast_days=1', function (r) {
      if (!r || !r.current) return;
      $('temp').innerHTML = Math.round(r.current.temperature_2m) + '°';
      $('wdesc').innerHTML = (WMO[r.current.weather_code] || '') + ' · <span class="muted" style="direction:ltr;display:inline-block">' + Math.round(r.daily.temperature_2m_min[0]) + '° / ' + Math.round(r.daily.temperature_2m_max[0]) + '°</span>';
    });
  }

  // ---------- icons ----------
  var ICONS = {
    quran: '<path d="M4 6c3-1.5 5.5-1.5 8 0v13c-2.5-1.5-5-1.5-8 0z"/><path d="M20 6c-3-1.5-5.5-1.5-8 0v13c2.5-1.5 5-1.5 8 0z"/>',
    live: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M9 3l3 3 3-3"/>',
    news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/>',
    photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
    play: '<path d="M7 5l12 7-12 7z" fill="#c9a35a"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="15.5" cy="14" r="2.5"/><path d="M7 12h4M7 16h4M6 8l12-5"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="#c9a35a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.globe) + '</svg>'; }

  // ---------- apps (the "store") ----------
  var DEFAULT_APPS = [
    { name: 'القرآن الكريم', icon: 'quran', type: 'section', target: 'quran' },
    { name: 'قنوات مباشرة', icon: 'live', type: 'section', target: 'live' },
    { name: 'الأخبار', icon: 'news', type: 'section', target: 'news' },
    { name: 'الرياضة', icon: 'ball', type: 'section', target: 'sports' },
    { name: 'الصور', icon: 'photo', type: 'section', target: 'photos' },
    { name: 'يوتيوب', icon: 'play', type: 'url', target: 'https://www.youtube.com/tv' },
    { name: 'بحث', icon: 'search', type: 'url', target: 'https://www.google.com' }
  ];
  var apps = DEFAULT_APPS;
  function renderApps() {
    var h = '';
    for (var i = 0; i < apps.length; i++) h += '<div class="app f" data-i="' + i + '">' + icon(apps[i].icon) + esc(apps[i].name) + '</div>';
    $('apps').innerHTML = h;
    var els = $('apps').getElementsByTagName('div');
    for (var k = 0; k < els.length; k++) els[k].onclick = (function (a) { return function () { openApp(a); }; })(apps[k]);
    if (current === 'home') setFocusList(true);
  }
  getJSON('apps.json?h=' + Math.floor(new Date().getTime() / 600000), function (d) { if (d && d.items && d.items.length) { apps = d.items; renderApps(); } });
  function openApp(a) {
    if (a.type === 'url') { window.location.href = a.target; return; }
    show(a.target);
  }

  // ---------- screens + focus engine ----------
  var current = 'home', focusList = [], fi = 0, homeFi = 0;
  var SCREEN = { home: 's-home', quran: 's-quran', live: 's-live', news: 's-news', sports: 's-news', photos: 's-photos', player: 's-player' };
  function show(name) {
    if (current === 'home') homeFi = fi;
    var secs = document.getElementsByTagName('section');
    for (var i = 0; i < secs.length; i++) rmClass(secs[i], 'on');
    addClass($(SCREEN[name]), 'on');
    var prev = current; current = name;
    if (prev === 'photos' && name !== 'photos') stopSlides();
    if (name === 'quran') buildQuran();
    if (name === 'live') buildLive();
    if (name === 'news' || name === 'sports') buildNews(name);
    if (name === 'photos') startSlides();
    fi = name === 'home' ? homeFi : 0;
    setFocusList(true);
  }
  function back() {
    if (overlayOn) { hideAdhan(); return; }
    if (current === 'player') { stopVideo(); show('live'); return; }
    if (current !== 'home') show('home');
  }
  function setFocusList(keep) {
    var root = $(SCREEN[current]), all = root.getElementsByTagName('*');
    focusList = [];
    for (var i = 0; i < all.length; i++) if (hasClass(all[i], 'f')) focusList.push(all[i]);
    if (!keep || fi >= focusList.length) fi = 0;
    paintFocus();
  }
  function paintFocus() {
    for (var i = 0; i < focusList.length; i++) rmClass(focusList[i], 'focus');
    var el = focusList[fi]; if (!el) return;
    addClass(el, 'focus');
    keepVisible(el);
  }
  function keepVisible(el) {
    if (current === 'home') {
      var idx = +el.getAttribute('data-i'), step = 214, visible = 8, off = Math.max(0, idx - visible + 2) * step;
      $('apps').style.right = (20 - off) + 'px';
      return;
    }
    var inner = el.parentNode; if (!inner || !hasClass(inner, 'scroll-in')) return;
    var box = inner.parentNode.offsetHeight, top = el.offsetTop, cur = -parseInt(inner.style.top || '0', 10);
    if (top < cur) cur = top;
    else if (top + el.offsetHeight > cur + box) cur = top + el.offsetHeight - box + 10;
    inner.style.top = (-cur) + 'px';
  }
  function moveFocus(dir) {
    var a = focusList[fi]; if (!a) return;
    var ra = a.getBoundingClientRect(), ax = (ra.left + ra.right) / 2, ay = (ra.top + ra.bottom) / 2;
    var best = -1, bestScore = 1e9;
    for (var i = 0; i < focusList.length; i++) {
      if (i === fi) continue;
      var r = focusList[i].getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
      var dx = x - ax, dy = y - ay, primary, secondary;
      if (dir === 'left') { if (dx > -5) continue; primary = -dx; secondary = Math.abs(dy); }
      else if (dir === 'right') { if (dx < 5) continue; primary = dx; secondary = Math.abs(dy); }
      else if (dir === 'up') { if (dy > -5) continue; primary = -dy; secondary = Math.abs(dx); }
      else { if (dy < 5) continue; primary = dy; secondary = Math.abs(dx); }
      var score = primary + secondary * 3;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best > -1) { fi = best; paintFocus(); }
  }
  function activate() { var el = focusList[fi]; if (el && el.onclick) el.onclick(); }

  // ---------- Quran radio ----------
  var radios = [], radio = null, radioIdx = -1, radioPausedByAdhan = false;
  function buildQuran() {
    function draw() {
      var h = '<div class="scroll-in">';
      for (var i = 0; i < radios.length; i++) {
        var on = i === radioIdx;
        h += '<div class="card f' + (on ? ' playing' : '') + '" data-r="' + i + '"><div class="c-name">' + esc(radios[i].name) + '</div><div class="c-sub">' + (on ? '● يتم التشغيل الآن' : riwaya(radios[i].url)) + '</div></div>';
      }
      $('quran-list').innerHTML = h + '</div>';
      var cards = $('quran-list').getElementsByTagName('div');
      for (var k = 0; k < cards.length; k++) if (cards[k].getAttribute('data-r') !== null) cards[k].onclick = (function (n) { return function () { toggleRadio(n); }; })(+cards[k].getAttribute('data-r'));
      setFocusList(true);
    }
    if (radios.length) draw(); else data('radios.json', function (d) { radios = d && d.items ? d.items : []; if (current === 'quran') draw(); });
  }
  function riwaya(u) {
    u = String(u).toLowerCase();
    if (u.indexOf('mojawwad') > -1) return 'تلاوة مجوّدة';
    if (u.indexOf('warsh') > -1) return 'رواية ورش';
    if (u.indexOf('qalon') > -1 || u.indexOf('qaloon') > -1) return 'رواية قالون';
    if (u.indexOf('mo3lim') > -1 || u.indexOf('moalim') > -1 || u.indexOf('teacher') > -1) return 'المصحف المعلّم';
    return 'تلاوة مرتّلة';
  }
  function toggleRadio(i) {
    if (radioIdx === i) { stopRadio(); } else {
      stopRadio();
      try { radio = new Audio(radios[i].url); var p = radio.play(); if (p && p['catch']) p['catch'](function () { toast('ما قدرت شغّل الإذاعة، جرّب وحدة تانية'); }); } catch (e) {}
      radioIdx = i;
    }
    var keep = fi; buildQuran(); fi = keep; paintFocus(); updateNP();
  }
  function stopRadio() { if (radio) { try { radio.pause(); radio.src = ''; } catch (e) {} } radio = null; radioIdx = -1; updateNP(); }
  function pauseRadio(on) {
    if (!radio) return;
    try { if (on) { radioPausedByAdhan = !radio.paused; radio.pause(); } else if (radioPausedByAdhan) { radio.play(); radioPausedByAdhan = false; } } catch (e) {}
  }
  function updateNP() { $('np-home').innerHTML = radioIdx > -1 ? '♪ ' + esc(radios[radioIdx].name) : ''; }

  // ---------- live channels ----------
  var channels = [], chIdx = 0, hls = null, hlsLoading = false;
  function buildLive() {
    function draw() {
      var h = '<div class="scroll-in">';
      if (!channels.length) h += '<div class="row"><div class="r-t">عم يتحمّل…</div></div>';
      for (var i = 0; i < channels.length; i++) {
        var c = channels[i];
        h += '<div class="card ch f" data-c="' + i + '">' + (c.logo ? '<img class="logo" src="' + esc(c.logo) + '" alt="">' : '') + '<div class="c-name">' + esc(c.name) + '</div></div>';
      }
      $('live-list').innerHTML = h + '</div>';
      var cards = $('live-list').getElementsByTagName('div');
      for (var k = 0; k < cards.length; k++) if (cards[k].getAttribute('data-c') !== null) cards[k].onclick = (function (n) { return function () { playChannel(n); }; })(+cards[k].getAttribute('data-c'));
      setFocusList(true);
    }
    if (channels.length) draw(); else { draw(); data('channels.json', function (d) { channels = d && d.items ? d.items : []; if (current === 'live') draw(); }); }
  }
  function playChannel(i) {
    chIdx = (i + channels.length) % channels.length;
    var c = channels[chIdx], v = $('video');
    pauseRadio(true);
    show('player');
    $('pl-info').innerHTML = esc(c.name) + '<small>▲▼ تغيير القناة · رجوع للقائمة</small>'; $('pl-info').style.opacity = 1;
    setTimeout(function () { $('pl-info').style.opacity = 0; }, 4000);
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    if (v.canPlayType && v.canPlayType('application/vnd.apple.mpegurl')) { v.src = c.url; tryPlay(v); return; }
    withHls(function (ok) {
      if (!ok) { toast('متصفح التلفزيون ما بيدعم هالنوع من البث'); return; }
      hls = new window.Hls(); hls.loadSource(c.url); hls.attachMedia(v);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () { tryPlay(v); });
      hls.on(window.Hls.Events.ERROR, function (e, d) { if (d && d.fatal) toast('القناة ما اشتغلت، جرّب غيرها ▲▼'); });
    });
  }
  function tryPlay(v) { try { var p = v.play(); if (p && p['catch']) p['catch'](function () {}); } catch (e) {} }
  function withHls(cb) {
    if (window.Hls) { cb(window.Hls.isSupported()); return; }
    if (hlsLoading) return; hlsLoading = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
    s.onload = function () { hlsLoading = false; cb(!!(window.Hls && window.Hls.isSupported())); };
    s.onerror = function () { hlsLoading = false; cb(false); };
    document.getElementsByTagName('head')[0].appendChild(s);
  }
  function stopVideo() {
    var v = $('video');
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
    if (current === 'player') pauseRadio(false);
  }

  // ---------- news / sports ----------
  var feeds = {};
  function buildNews(kind) {
    $('news-title').innerHTML = kind === 'sports' ? 'الرياضة' : 'الأخبار';
    function draw() {
      var d = feeds[kind], h = '<div class="scroll-in">';
      if (!d) h += '<div class="row"><div class="r-t">عم يتحمّل…</div></div>';
      else for (var i = 0; i < d.items.length; i++) h += '<div class="row f" data-n="' + i + '"><div class="r-t">' + esc(d.items[i].title) + '</div><div class="r-s">' + esc(d.items[i].source) + '</div></div>';
      $('news-list').innerHTML = h + '</div>';
      if (d && d.updated) { var t = new Date(d.updated); $('news-sub').innerHTML = 'آخر تحديث ' + pad((t.getUTCHours() + 3) % 24) + ':' + pad(t.getUTCMinutes()); }
      var rows = $('news-list').getElementsByTagName('div');
      for (var k = 0; k < rows.length; k++) if (rows[k].getAttribute('data-n') !== null) rows[k].onclick = (function (n) { return function () { window.location.href = feeds[kind].items[n].link; }; })(+rows[k].getAttribute('data-n'));
      setFocusList(false);
    }
    draw();
    data(kind + '.json', function (d) { if (d && d.items) { feeds[kind] = d; if (current === kind) draw(); } });
  }
  var tickI = 0;
  function tickNews() {
    var d = feeds.news; if (!d || !d.items.length) { data('news.json', function (x) { if (x && x.items) { feeds.news = x; tickNews(); } }); return; }
    var it = d.items[tickI++ % Math.min(15, d.items.length)], el = $('ticker');
    el.style.opacity = 0;
    setTimeout(function () { el.innerHTML = '<b>' + esc(it.source || 'خبر') + '</b>' + esc(it.title); el.style.opacity = 1; }, 600);
  }

  // ---------- photos / screensaver ----------
  var photos = [], pi = 0, slideT = null, useA = true, saver = false;
  function startSlides() {
    function go() {
      if (!photos.length) return;
      var p = photos[pi++ % photos.length], on = useA ? $('ph-a') : $('ph-b'), off = useA ? $('ph-b') : $('ph-a');
      var img = new Image();
      img.onload = function () {
        on.style.backgroundImage = 'url("' + p.url + '")'; addClass(on, 'show'); rmClass(off, 'show'); useA = !useA;
        $('ph-credit').innerHTML = esc('Photo: ' + (p.author || 'Wikimedia Commons') + ' · ' + p.license + ' · Wikimedia Commons');
      };
      img.src = p.url;
    }
    clearInterval(slideT);
    if (photos.length) go(); else data('photos.json', function (d) { photos = d && d.items ? shuffle(d.items) : []; go(); });
    slideT = setInterval(go, 12000);
  }
  function stopSlides() { clearInterval(slideT); slideT = null; saver = false; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var idle = 0;
  function wake() { idle = 0; }

  // ---------- keys ----------
  document.onkeydown = function (e) {
    e = e || window.event;
    var c = e.keyCode;
    idle = 0;
    if (overlayOn) { hideAdhan(); return stop(e); }
    if (saver) { saver = false; show('home'); return stop(e); }
    if (current === 'player') {
      if (c === 38) { playChannel(chIdx - 1); return stop(e); }
      if (c === 40) { playChannel(chIdx + 1); return stop(e); }
    }
    if (current === 'photos') {
      if (c === 37 || c === 39) { startSlides(); return stop(e); }
    }
    if (c === 37) { moveFocus('left'); return stop(e); }
    if (c === 39) { moveFocus('right'); return stop(e); }
    if (c === 38) { moveFocus('up'); return stop(e); }
    if (c === 40) { moveFocus('down'); return stop(e); }
    if (c === 13) { activate(); return stop(e); }
    if (c === 8 || c === 27 || c === 461 || c === 10009 || c === 166) { if (current !== 'home' || overlayOn) { back(); return stop(e); } }
  };
  function stop(e) { if (e.preventDefault) e.preventDefault(); e.returnValue = false; return false; }

  // ---------- clock tick ----------
  function tick() {
    var now = istNow();
    var hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    $('clock').innerHTML = hm + '<span class="sec">' + pad(now.getSeconds()) + '</span>';
    if (current === 'photos') $('ph-clock').innerHTML = hm + '<small>' + $('hijri').innerHTML + '</small>';
    if (now.getSeconds() === 0) { loadTimes(); renderDates(); checkAdhan(now); }
    renderPrayers();
    idle++;
    if (current === 'home' && !overlayOn && idle > 600) { show('photos'); saver = true; }
  }

  // ---------- auto-update ----------
  function checkUpdate() {
    getJSON('version.json?t=' + new Date().getTime(), function (d) { if (d && d.v && String(d.v) !== VERSION) window.location.reload(true); });
  }

  // ---------- start ----------
  renderApps(); renderDates(); loadTimes(); tick(); showDhikr(); loadWeather(); tickNews();
  setInterval(tick, 1000);
  setInterval(showDhikr, 20000);
  setInterval(tickNews, 9000);
  setInterval(loadWeather, 30 * 60000);
  setInterval(checkUpdate, 5 * 60000);
})();
