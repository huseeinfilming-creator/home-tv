/* شاشة البيت — a small TV "system" that runs inside the TV browser.
   Plain ES5 on purpose: the TV browser is old. */
(function () {
  var VERSION = '4';
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
        if (x.readyState === 4) { if (x.status === 200) { try { cb(JSON.parse(x.responseText)); } catch (e) { cb(null); } } else cb(null); }
      };
      x.send();
    } catch (e) { cb(null); }
  }
  function data(name, cb) { getJSON('data/' + name + '?h=' + Math.floor(new Date().getTime() / 600000), cb); }

  // ---------- fit the 1920x1080 stage to any screen ----------
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080), st = $('stage');
    st.style.transform = st.style.webkitTransform = 'scale(' + s + ')';
    st.style.top = ((window.innerHeight - 1080 * s) / 2) + 'px';
    st.style.right = ((window.innerWidth - 1920 * s) / 2) + 'px';
  }
  window.onresize = fit; fit();

  // ---------- time (Istanbul, UTC+3 all year) ----------
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

  // ---------- prayer times (Diyanet via aladhan, local fallback) ----------
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
    timesDay = key; times = calcTimes(now); apiHijri = null; buildMarks();
    getJSON('https://api.aladhan.com/v1/timingsByCity/' + pad(now.getDate()) + '-' + pad(now.getMonth() + 1) + '-' + now.getFullYear() + '?city=Istanbul&country=Turkey&method=13', function (r) {
      if (!r || !r.data) return;
      var t = {};
      for (var i = 0; i < ORDER.length; i++) t[ORDER[i]] = String(r.data.timings[ORDER[i]]).substr(0, 5);
      times = t;
      apiHijri = { d: +r.data.date.hijri.day, m: +r.data.date.hijri.month.number, y: +r.data.date.hijri.year };
      renderDates(); buildMarks();
    });
  }
  function toMin(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function nextPrayer(cur) { for (var i = 0; i < ORDER.length; i++) if (toMin(times[ORDER[i]]) > cur) return ORDER[i]; return null; }

  // human countdown: "ساعة و13 دقيقة"
  function hoursAr(h) { return h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h + ' ساعات'; }
  function minsAr(m) { return m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : (m >= 3 && m <= 10) ? m + ' دقائق' : m + ' دقيقة'; }
  function untilText(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return hoursAr(h) + ' و' + minsAr(m);
    if (h) return hoursAr(h);
    return minsAr(Math.max(1, m));
  }

  // ---------- the day arc: fajr on the right, isha on the left ----------
  var ARC = { x0: 1688, y0: 160, cx: 864, cy: -40, x1: 40, y1: 160 };
  function arcPt(t) { var u = 1 - t; return { x: u * u * ARC.x0 + 2 * u * t * ARC.cx + t * t * ARC.x1, y: u * u * ARC.y0 + 2 * u * t * ARC.cy + t * t * ARC.y1 }; }
  function poly(t0, t1) { var s = '', n = 70; for (var i = 0; i <= n; i++) { var p = arcPt(t0 + (t1 - t0) * i / n); s += p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' '; } return s; }
  function dayT(min) { var a = toMin(times.Fajr), b = toMin(times.Isha); return Math.max(0, Math.min(1, (min - a) / (b - a))); }
  function buildMarks() {
    if (!times) return;
    var h = '';
    for (var i = 0; i < ORDER.length; i++) {
      var p = arcPt(dayT(toMin(times[ORDER[i]])));
      h += '<div class="mark" id="mk-' + ORDER[i] + '" style="left:' + p.x.toFixed(0) + 'px;top:' + p.y.toFixed(0) + 'px"><div class="dot"></div><div class="mn">' + NAMES[ORDER[i]] + '</div><div class="mt">' + times[ORDER[i]] + '</div></div>';
    }
    $('marks').innerHTML = h;
    $('arc-future').setAttribute('points', poly(0, 1));
    renderDay();
  }
  function renderDay() {
    if (!times) return;
    var now = istNow(), cur = now.getHours() * 60 + now.getMinutes(), nk = nextPrayer(cur), t = dayT(cur + now.getSeconds() / 60);
    $('arc-past').setAttribute('points', t > 0 ? poly(0, t) : '');
    var p = arcPt(t), sun = $('sun');
    sun.style.left = p.x.toFixed(1) + 'px'; sun.style.top = p.y.toFixed(1) + 'px';
    sun.style.opacity = (cur < toMin(times.Fajr) || cur > toMin(times.Isha)) ? 0.35 : 1;
    for (var i = 0; i < ORDER.length; i++) {
      var el = $('mk-' + ORDER[i]); if (!el) continue;
      var cls = 'mark';
      if (ORDER[i] === (nk || 'Fajr')) cls += ' next'; else if (nk && toMin(times[ORDER[i]]) <= cur) cls += ' past'; else if (!nk) cls += ' past';
      if (el.className !== cls) el.className = cls;
    }
    var target = nk ? toMin(times[nk]) : toMin(times.Fajr) + 1440;
    $('until').innerHTML = NAMES[nk || 'Fajr'] + ' بعد <b>' + untilText(target - cur) + '</b>';
  }
  function renderDates() {
    var now = istNow(), h = apiHijri || hijriCalc(now);
    $('hijri').innerHTML = DAYS[now.getDay()] + '، ' + h.d + ' ' + HM[h.m - 1] + ' ' + h.y;
    $('greg').innerHTML = now.getDate() + ' ' + GM[now.getMonth()] + ' ' + now.getFullYear();
  }

  // ---------- adhan ----------
  var adhanInfo = null, adhanAudio = null, adhanDone = {}, preDone = {}, overlayOn = false, toastT = null;
  data('adhan.json', function (d) { adhanInfo = d; });
  function checkAdhan(now) {
    if (!times) return;
    var cur = now.getHours() * 60 + now.getMinutes(), day = now.getDate();
    for (var i = 0; i < ORDER.length; i++) {
      var n = ORDER[i]; if (n === 'Sunrise') continue;
      var t = toMin(times[n]), key = day + n;
      if (cur === t - 10 && !preDone[key]) { preDone[key] = 1; toast('أذان ' + NAMES[n] + ' بعد ١٠ دقائق'); }
      if (cur === t && !adhanDone[key]) { adhanDone[key] = 1; showAdhan(n); }
    }
  }
  function showAdhan(n) {
    stopVideo(); pauseRadio(true);
    $('ad-name').innerHTML = 'أذان ' + NAMES[n];
    $('ad-time').innerHTML = times[n];
    $('ad-credit').innerHTML = adhanInfo ? esc('Adhan recording: ' + (adhanInfo.author || '') + ' / ' + (adhanInfo.license || '') + ' / Wikimedia Commons') : '';
    addClass($('adhan'), 'on'); overlayOn = true; idle = 0;
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
  function toast(msg) {
    var t = $('toast'); rmClass(t, 'on'); t.innerHTML = msg; void t.offsetWidth; addClass(t, 'on');
    clearTimeout(toastT); toastT = setTimeout(function () { rmClass(t, 'on'); }, 8000);
  }

  // ---------- adhkar ----------
  var ADHKAR = [
    ['سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ', ''],
    ['لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', ''],
    ['أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ', ''],
    ['أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ', 'الرعد ٢٨'],
    ['رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', 'البقرة ٢٠١'],
    ['اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ', ''],
    ['أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ وَأَتُوبُ إِلَيْهِ', ''],
    ['حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ', 'التوبة ١٢٩'],
    ['لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', ''],
    ['فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ', 'البقرة ١٥٢']
  ];
  var di = Math.floor(Math.random() * ADHKAR.length);
  function showDhikr(first) {
    var el = $('dhikr');
    function put() { var a = ADHKAR[di++ % ADHKAR.length]; el.innerHTML = a[0] + (a[1] ? '<small>' + a[1] + '</small>' : ''); rmClass(el, 'out'); }
    if (first) { put(); return; }
    addClass(el, 'out'); setTimeout(put, 1000);
  }

  // ---------- weather ----------
  var WMO = { 0: 'صافي', 1: 'صافي غالباً', 2: 'غائم جزئياً', 3: 'غائم', 45: 'ضباب', 48: 'ضباب', 51: 'رذاذ خفيف', 53: 'رذاذ', 55: 'رذاذ كثيف', 61: 'مطر خفيف', 63: 'مطر', 65: 'مطر غزير', 71: 'ثلج خفيف', 73: 'ثلج', 75: 'ثلج كثيف', 80: 'زخات مطر', 81: 'زخات مطر', 82: 'زخات قوية', 95: 'عاصفة رعدية', 96: 'عاصفة مع برد', 99: 'عاصفة مع برد' };
  function loadWeather() {
    getJSON('https://api.open-meteo.com/v1/forecast?latitude=41.01&longitude=28.98&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FIstanbul&forecast_days=1', function (r) {
      if (!r || !r.current) return;
      $('temp').innerHTML = Math.round(r.current.temperature_2m) + '°';
      $('wdesc').innerHTML = 'إسطنبول، ' + (WMO[r.current.weather_code] || '') + ' بين ' + Math.round(r.daily.temperature_2m_min[0]) + '° و' + Math.round(r.daily.temperature_2m_max[0]) + '°';
    });
  }

  // ---------- background photography ----------
  var photos = [], pi = 0, bgA = true, bgT = null;
  function nextBg() {
    if (!photos.length) return;
    var p = photos[pi++ % photos.length], on = bgA ? $('bg-a') : $('bg-b'), off = bgA ? $('bg-b') : $('bg-a'), img = new Image();
    img.onload = function () {
      rmClass(on, 'show'); void on.offsetWidth;
      on.style.backgroundImage = 'url("' + p.url + '")'; addClass(on, 'show'); rmClass(off, 'show'); bgA = !bgA;
      $('ph-credit').innerHTML = esc('Photo: ' + (p.author || 'Wikimedia Commons') + ' / ' + p.license + ' / Wikimedia Commons');
    };
    img.src = p.url;
  }
  function bgEvery(ms) { clearInterval(bgT); bgT = setInterval(nextBg, ms); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  data('photos.json', function (d) { photos = d && d.items ? shuffle(d.items) : []; nextBg(); bgEvery(45000); });
  function bgMode(m) { var b = $('bg'); rmClass(b, 'dim'); rmClass(b, 'clear'); if (m) addClass(b, m); }

  // ---------- icons ----------
  var ICONS = {
    quran: '<path d="M4 6c3-1.5 5.5-1.5 8 0v13c-2.5-1.5-5-1.5-8 0z"/><path d="M20 6c-3-1.5-5.5-1.5-8 0v13c2.5-1.5 5-1.5 8 0z"/>',
    live: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M8 21h8M9 3l3 3 3-3"/>',
    news: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/>',
    photo: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
    play: '<path class="fill" d="M8 5.5l11 6.5-11 6.5z" fill="#F2EDE3"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="#F2EDE3" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || ICONS.globe) + '</svg>'; }

  // ---------- apps (the "store", from apps.json) ----------
  var apps = [
    { name: 'القرآن الكريم', icon: 'quran', type: 'section', target: 'quran' },
    { name: 'قنوات مباشرة', icon: 'live', type: 'section', target: 'live' },
    { name: 'الأخبار', icon: 'news', type: 'section', target: 'news' },
    { name: 'الرياضة', icon: 'ball', type: 'section', target: 'sports' },
    { name: 'الصور', icon: 'photo', type: 'section', target: 'photos' },
    { name: 'يوتيوب', icon: 'play', type: 'url', target: 'https://www.youtube.com/tv' },
    { name: 'بحث', icon: 'search', type: 'url', target: 'https://www.google.com' }
  ];
  function renderApps() {
    var h = '';
    for (var i = 0; i < apps.length; i++) h += '<div class="app f" data-i="' + i + '"><div class="ic">' + icon(apps[i].icon) + '</div><div class="lb">' + esc(apps[i].name) + '</div></div>';
    $('dock').innerHTML = h;
    var els = $('dock').childNodes;
    for (var k = 0; k < els.length; k++) els[k].onclick = (function (a) { return function () { openApp(a); }; })(apps[k]);
    if (current === 'home') setFocusList(true);
  }
  getJSON('apps.json?h=' + Math.floor(new Date().getTime() / 600000), function (d) { if (d && d.items && d.items.length) { apps = d.items; renderApps(); } });
  function openApp(a) { if (a.type === 'url') { window.location.href = a.target; return; } show(a.target); }

  // ---------- screens + focus engine ----------
  var current = 'home', focusList = [], fi = 0, homeFi = 0;
  var SCREEN = { home: 's-home', quran: 's-quran', live: 's-live', news: 's-news', sports: 's-news', photos: 's-photos', player: 's-player' };
  function show(name) {
    if (current === 'home') homeFi = fi;
    var secs = document.getElementsByTagName('section');
    for (var i = 0; i < secs.length; i++) rmClass(secs[i], 'on');
    void $(SCREEN[name]).offsetWidth;
    addClass($(SCREEN[name]), 'on');
    current = name;
    bgMode(name === 'home' ? '' : name === 'photos' ? 'clear' : 'dim');
    bgEvery(name === 'photos' ? 12000 : 45000);
    if (name === 'photos') nextBg();
    if (name !== 'photos') saver = false;
    if (name === 'quran') buildQuran();
    if (name === 'live') buildLive();
    if (name === 'news' || name === 'sports') buildNews(name);
    fi = name === 'home' ? homeFi : 0;
    setFocusList(true);
  }
  function back() {
    if (overlayOn) { hideAdhan(); return; }
    if (current === 'player') { stopVideo(); show('live'); return; }
    if (current !== 'home') show('home');
  }
  function setFocusList(keep) {
    var all = $(SCREEN[current]).getElementsByTagName('*');
    focusList = [];
    for (var i = 0; i < all.length; i++) if (hasClass(all[i], 'f')) focusList.push(all[i]);
    if (!keep || fi >= focusList.length) fi = 0;
    paintFocus();
  }
  function paintFocus() {
    for (var i = 0; i < focusList.length; i++) rmClass(focusList[i], 'focus');
    var el = focusList[fi]; if (!el) return;
    addClass(el, 'focus'); keepVisible(el);
  }
  function keepVisible(el) {
    if (current === 'home') {
      var idx = +el.getAttribute('data-i'), visible = 9;
      $('dock').style.right = (110 - Math.max(0, idx - visible + 2) * 166) + 'px';
      return;
    }
    var inner = el.parentNode; if (!inner || !hasClass(inner, 'scroll-in')) return;
    var box = inner.parentNode.offsetHeight, top = el.offsetTop, cur = -parseInt(inner.style.top || '0', 10);
    if (top < cur + 20) cur = Math.max(0, top - 20);
    else if (top + el.offsetHeight > cur + box - 30) cur = top + el.offsetHeight - box + 30;
    inner.style.top = (-cur) + 'px';
  }
  function moveFocus(dir) {
    var a = focusList[fi]; if (!a) return;
    var ra = a.getBoundingClientRect(), ax = (ra.left + ra.right) / 2, ay = (ra.top + ra.bottom) / 2, best = -1, bestScore = 1e9;
    for (var i = 0; i < focusList.length; i++) {
      if (i === fi) continue;
      var r = focusList[i].getBoundingClientRect(), dx = (r.left + r.right) / 2 - ax, dy = (r.top + r.bottom) / 2 - ay, pr, se;
      if (dir === 'left') { if (dx > -5) continue; pr = -dx; se = Math.abs(dy); }
      else if (dir === 'right') { if (dx < 5) continue; pr = dx; se = Math.abs(dy); }
      else if (dir === 'up') { if (dy > -5) continue; pr = -dy; se = Math.abs(dx); }
      else { if (dy < 5) continue; pr = dy; se = Math.abs(dx); }
      var score = pr + se * 3;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best > -1) { fi = best; paintFocus(); }
  }
  function activate() { var el = focusList[fi]; if (el && el.onclick) el.onclick(); }

  // ---------- Quran: listening room ----------
  var radios = [], radio = null, radioIdx = -1, radioPaused = false;
  function riwaya(u) {
    u = String(u).toLowerCase();
    if (u.indexOf('mojawwad') > -1) return 'تلاوة مجوّدة';
    if (u.indexOf('warsh') > -1) return 'رواية ورش';
    if (u.indexOf('qalon') > -1 || u.indexOf('qaloon') > -1) return 'رواية قالون';
    return 'تلاوة مرتّلة';
  }
  function buildQuran() {
    function draw() {
      var h = '';
      for (var i = 0; i < radios.length; i++) h += '<div class="reciter f' + (i === radioIdx ? ' playing' : '') + '" data-r="' + i + '"><div class="rn">' + esc(radios[i].name) + '</div><div class="rs">' + riwaya(radios[i].url) + '</div></div>';
      $('quran-list').innerHTML = h;
      var rows = $('quran-list').childNodes;
      for (var k = 0; k < rows.length; k++) rows[k].onclick = (function (n) { return function () { toggleRadio(n); }; })(k);
      setFocusList(true); updateListen();
    }
    if (radios.length) draw(); else data('radios.json', function (d) { radios = d && d.items ? d.items : []; if (current === 'quran') draw(); });
  }
  function updateListen() {
    var on = radioIdx > -1;
    $('q-state').innerHTML = on ? 'يتم التشغيل الآن' : 'اختار قارئ من القائمة';
    $('q-name').innerHTML = on ? esc(radios[radioIdx].name) : 'القرآن الكريم';
    $('q-sub').innerHTML = on ? riwaya(radios[radioIdx].url) + '، بث مباشر' : 'إذاعات مباشرة على مدار الساعة';
    $('q-eq').className = on ? 'eq on' : 'eq';
    $('np-home').innerHTML = on ? '<span class="bars"><i></i><i></i><i></i></span>' + esc(radios[radioIdx].name) : '';
  }
  function toggleRadio(i) {
    var was = radioIdx;
    stopRadio();
    if (was !== i) {
      try { radio = new Audio(radios[i].url); var p = radio.play(); if (p && p['catch']) p['catch'](function () { toast('الإذاعة ما اشتغلت، جرّب قارئ تاني'); }); } catch (e) {}
      radioIdx = i;
    }
    var rows = $('quran-list').childNodes;
    for (var k = 0; k < rows.length; k++) { if (k === radioIdx) addClass(rows[k], 'playing'); else rmClass(rows[k], 'playing'); }
    updateListen();
  }
  function stopRadio() { if (radio) { try { radio.pause(); radio.src = ''; } catch (e) {} } radio = null; radioIdx = -1; updateListen(); }
  function pauseRadio(on) {
    if (!radio) return;
    try { if (on) { radioPaused = !radio.paused; radio.pause(); } else if (radioPaused) { radio.play(); radioPaused = false; } } catch (e) {}
  }

  // ---------- live channels ----------
  var channels = [], chIdx = 0, hls = null, hlsLoading = false;
  function buildLive() {
    function draw() {
      var h = '';
      if (!channels.length) h = '<div class="story"><div class="st">عم نجيب القنوات…</div></div>';
      for (var i = 0; i < channels.length; i++) {
        var c = channels[i];
        h += '<div class="chan f" data-c="' + i + '"><div class="lg">' + (c.logo ? '<img src="' + esc(c.logo) + '" alt="" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'"><span style="display:none">' : '<span>') + esc(c.name) + '</span>' + '</div><div class="cn">' + esc(c.name) + '</div></div>';
      }
      $('live-list').innerHTML = h;
      var cards = $('live-list').childNodes;
      for (var k = 0; k < cards.length; k++) if (cards[k].getAttribute && cards[k].getAttribute('data-c') !== null) cards[k].onclick = (function (n) { return function () { playChannel(n); }; })(+cards[k].getAttribute('data-c'));
      setFocusList(true);
    }
    draw();
    if (!channels.length) data('channels.json', function (d) { channels = d && d.items ? d.items : []; if (current === 'live') draw(); });
  }
  function playChannel(i) {
    chIdx = (i + channels.length) % channels.length;
    var c = channels[chIdx], v = $('video');
    pauseRadio(true);
    if (current !== 'player') show('player');
    $('pl-info').innerHTML = esc(c.name) + '<small>▲▼ القناة التالية، رجوع للقائمة</small>'; $('pl-info').style.opacity = 1;
    setTimeout(function () { $('pl-info').style.opacity = 0; }, 4000);
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    if (v.canPlayType && v.canPlayType('application/vnd.apple.mpegurl')) { v.src = c.url; tryPlay(v); return; }
    withHls(function (ok) {
      if (!ok) { toast('متصفح التلفزيون ما بيدعم هالنوع من البث'); return; }
      hls = new window.Hls(); hls.loadSource(c.url); hls.attachMedia(v);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () { tryPlay(v); });
      hls.on(window.Hls.Events.ERROR, function (e, d) { if (d && d.fatal) toast('القناة ما اشتغلت، جرّب غيرها بالسهم ▲▼'); });
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
    $('news-sub').innerHTML = '';
    function draw() {
      var d = feeds[kind], h = '';
      if (!d) h = '<div class="story"><div class="st">عم نجيب آخر العناوين…</div></div>';
      else for (var i = 0; i < d.items.length; i++) h += '<div class="story f' + (i === 0 ? ' lead' : '') + '" data-n="' + i + '"><div class="st">' + esc(d.items[i].title) + '</div><div class="ss">' + esc(d.items[i].source) + '</div></div>';
      $('news-list').innerHTML = h;
      if (d && d.updated) { var t = new Date(d.updated); $('news-sub').innerHTML = 'تحدّثت الساعة <span dir="ltr">' + pad((t.getUTCHours() + 3) % 24) + ':' + pad(t.getUTCMinutes()) + '</span>'; }
      var rows = $('news-list').childNodes;
      for (var k = 0; k < rows.length; k++) if (rows[k].getAttribute && rows[k].getAttribute('data-n') !== null) rows[k].onclick = (function (n) { return function () { window.location.href = feeds[kind].items[n].link; }; })(+rows[k].getAttribute('data-n'));
      setFocusList(false);
    }
    draw();
    data(kind + '.json', function (d) { if (d && d.items) { feeds[kind] = d; if (current === kind) draw(); } });
  }

  // ---------- keys ----------
  var idle = 0, saver = false;
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
    if (current === 'photos' && (c === 37 || c === 39)) { nextBg(); return stop(e); }
    if (c === 37) { moveFocus('left'); return stop(e); }
    if (c === 39) { moveFocus('right'); return stop(e); }
    if (c === 38) { moveFocus('up'); return stop(e); }
    if (c === 40) { moveFocus('down'); return stop(e); }
    if (c === 13) { activate(); return stop(e); }
    if (c === 8 || c === 27 || c === 461 || c === 10009 || c === 166) { if (current !== 'home') { back(); return stop(e); } }
  };
  function stop(e) { if (e.preventDefault) e.preventDefault(); e.returnValue = false; return false; }

  // ---------- clock ----------
  var lastMin = -1;
  function tick() {
    var now = istNow(), h = pad(now.getHours()), m = pad(now.getMinutes());
    if (now.getMinutes() !== lastMin) {
      var c = $('clock');
      c.innerHTML = '<span class="hh">' + h + '</span><span class="colon">:</span><span class="mm' + (lastMin > -1 ? ' tick' : '') + '">' + m + '</span>';
      $('ph-clock').innerHTML = h + ':' + m + '<small>' + $('hijri').innerHTML + '</small>';
      if (lastMin > -1) { loadTimes(); renderDates(); checkAdhan(now); }
      lastMin = now.getMinutes();
    }
    renderDay();
    idle++;
    if (current === 'home' && !overlayOn && idle > 600) { show('photos'); saver = true; }
  }

  // ---------- auto-update ----------
  function checkUpdate() { getJSON('version.json?t=' + new Date().getTime(), function (d) { if (d && d.v && String(d.v) !== VERSION) window.location.reload(true); }); }

  // ---------- start: one orchestrated entrance ----------
  addClass(document.body, 'boot');
  renderApps(); renderDates(); loadTimes(); tick(); showDhikr(true); loadWeather();
  setTimeout(function () { rmClass(document.body, 'boot'); addClass(document.body, 'ready'); }, 120);
  setInterval(tick, 1000);
  setInterval(function () { showDhikr(false); }, 25000);
  setInterval(loadWeather, 30 * 60000);
  setInterval(checkUpdate, 5 * 60000);
})();
