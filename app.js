/**
 * LumaPatch Interactive Scroll Controller
 * Handles Welcome Screen lock, continuous scroll-driven 3D choreography,
 * telemetry guidance HUD, alert card focus transitions, and animated pH chart.
 */
(function () {
  'use strict';

  const body = document.body;
  const bgLayer = document.getElementById('bg-layer');
  const welcomeScreen = document.getElementById('welcome-screen');
  const btnStart = document.getElementById('btn-start');
  const scrollExperience = document.getElementById('scroll-experience');
  const topBar = document.getElementById('top-bar');
  const globalProgress = document.getElementById('global-progress');
  const swipeCue = document.getElementById('swipe-cue');

  const tutorialTrack = document.getElementById('tutorial-stage-track');
  const alertsTrack = document.getElementById('step-alerts');
  const chartSection = document.getElementById('step-chart');
  const chartCard = document.querySelector('.chart-card');

  const uvAmbientGlow = document.getElementById('uv-ambient-glow');
  const uvButtonPointer = document.getElementById('uv-button-pointer');

  // Overlays
  const overlays = {
    patch: document.getElementById('overlay-patch'),
    device: document.getElementById('overlay-device'),
    mount: document.getElementById('overlay-mount'),
    camera: document.getElementById('overlay-camera'),
    guide: document.getElementById('overlay-guide'),
    uv: document.getElementById('overlay-uv')
  };

  // Telemetry HUD elements
  const teleAngle = document.getElementById('tele-angle');
  const teleAngleVal = document.getElementById('tele-angle-val');
  const teleAngleBadge = document.getElementById('tele-angle-badge');

  const teleDist = document.getElementById('tele-dist');
  const teleDistVal = document.getElementById('tele-dist-val');
  const teleDistBadge = document.getElementById('tele-dist-badge');

  const teleLight = document.getElementById('tele-light');
  const teleLightVal = document.getElementById('tele-light-val');
  const teleLightBadge = document.getElementById('tele-light-badge');

  const teleCaptureBanner = document.getElementById('tele-capture-banner');

  const alertCards = Array.from(document.querySelectorAll('.alert-card'));
  const stepPills = Array.from(document.querySelectorAll('.step-pill'));

  const canvas = document.getElementById('webgl-canvas');
  const scene3d = new window.LumaScene3D(canvas);

  let started = false;
  let smoothedProgress = 0;
  let targetProgress = 0;
  let lastTimestamp = performance.now();

  // Prevent scroll keys while welcome screen is locked
  window.addEventListener('keydown', (e) => {
    if (!started && ['Space', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End', 'Home'].includes(e.code)) {
      e.preventDefault();
    }
  }, { passive: false });

  // Start button unlocks continuous scrolling
  btnStart.addEventListener('click', () => {
    if (started) return;
    started = true;

    welcomeScreen.classList.add('leaving');
    body.classList.remove('locked');
    scrollExperience.classList.remove('is-hidden');
    topBar.classList.remove('hidden');

    window.scrollTo({ top: 0, behavior: 'instant' });
    updateScrollState();
  });

  // Top bar step navigation
  stepPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const targetId = pill.getAttribute('data-target');
      const el = document.getElementById(targetId);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const scrollTop = window.scrollY + rect.top;
      window.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
    });
  });

  // Clicking an alert card sets focus smoothly
  alertCards.forEach((card, idx) => {
    card.addEventListener('click', () => {
      if (!alertsTrack) return;
      const trackTop = alertsTrack.offsetTop;
      const trackScrollable = alertsTrack.offsetHeight - window.innerHeight;
      const targetOffset = trackTop + trackScrollable * ((idx + 0.5) / alertCards.length);
      window.scrollTo({ top: targetOffset, behavior: 'smooth' });
    });
  });

  // Interactive Chart Points
  const chartPoints = Array.from(document.querySelectorAll('.chart-pt'));
  const readoutDay = document.getElementById('readout-day');
  const readoutPh = document.getElementById('readout-ph');

  function selectChartPoint(pt) {
    chartPoints.forEach((el) => el.classList.remove('is-selected'));
    pt.classList.add('is-selected');
    readoutDay.textContent = pt.getAttribute('data-day');
    readoutPh.textContent = pt.getAttribute('data-ph');
  }

  chartPoints.forEach((pt) => {
    pt.addEventListener('mouseenter', () => selectChartPoint(pt));
    pt.addEventListener('click', () => selectChartPoint(pt));
    pt.addEventListener('focus', () => selectChartPoint(pt));
  });

  // Replay button
  const btnReplay = document.getElementById('btn-replay');
  if (btnReplay) {
    btnReplay.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function setActiveOverlay(name) {
    Object.entries(overlays).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('visible', key === name);
    });
  }

  function setActivePill(targetId) {
    stepPills.forEach((pill) => {
      pill.classList.toggle('active', pill.getAttribute('data-target') === targetId);
    });
  }

  function updateTelemetryHUD(p) {
    // Active between p = 0.57 and 0.80
    const angleOk = p >= 0.635;
    const distOk = p >= 0.695;
    const lightOk = p >= 0.745;
    const captured = p >= 0.755;

    teleAngle.classList.toggle('ok', angleOk);
    teleAngleVal.textContent = angleOk ? 'Allineamento centrato (0°)' : 'Inclina di 12° a destra';
    teleAngleBadge.textContent = angleOk ? 'OK ✓' : 'Guida';

    teleDist.classList.toggle('ok', distOk);
    teleDistVal.textContent = distOk ? 'Distanza ottimale (10 cm)' : 'Avvicinati a 10 cm';
    teleDistBadge.textContent = distOk ? 'OK ✓' : (angleOk ? 'Regola' : 'In attesa');

    teleLight.classList.toggle('ok', lightOk);
    teleLightVal.textContent = lightOk ? 'Illuminazione pronta' : 'Premi tasto UV sul modulo';
    teleLightBadge.textContent = lightOk ? 'OK ✓' : (distOk ? 'Azione' : 'Verifica');

    teleCaptureBanner.classList.toggle('active', captured);

    // Show physical UV button pointer arrow when asking user to press UV button (0.66 - 0.81)
    const showPointer = p >= 0.67 && p <= 0.82;
    uvButtonPointer.classList.toggle('visible', showPointer);
  }

  function updateScrollState() {
    const scrollY = window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const totalPct = Math.min(100, Math.max(0, (scrollY / maxScroll) * 100));
    globalProgress.style.width = `${totalPct.toFixed(2)}%`;

    if (!started) return;

    // 1. Tutorial Track Progress (0..1)
    const tutTop = tutorialTrack.offsetTop;
    const tutScrollable = Math.max(1, tutorialTrack.offsetHeight - window.innerHeight);
    const tutP = Math.min(1, Math.max(0, (scrollY - tutTop) / tutScrollable));
    targetProgress = tutP;

    // 2. Alerts Track Progress
    const alertsRect = alertsTrack.getBoundingClientRect();
    const alertsScrollable = Math.max(1, alertsTrack.offsetHeight - window.innerHeight);
    const alertsP = Math.min(1, Math.max(0, -alertsRect.top / alertsScrollable));

    // 3. Chart Section Visibility
    const chartRect = chartSection.getBoundingClientRect();
    const inChart = chartRect.top < window.innerHeight * 0.52;
    const inAlerts = !inChart && alertsRect.top < window.innerHeight * 0.48;

    // Swipe cue visibility
    if (swipeCue) {
      swipeCue.style.opacity = tutP > 0.92 ? '0' : '0.78';
    }

    // UV ambient glow layer
    const uvActive = tutP >= 0.78 && tutP <= 0.96;
    const uvStrength = uvActive
      ? Math.min(1, (tutP - 0.78) / 0.06) * (1 - Math.max(0, (tutP - 0.92) / 0.04))
      : 0;
    uvAmbientGlow.style.opacity = (uvStrength * 0.95).toFixed(2);

    // Phase overlays & Background colors (matching PDF Page 2 palette)
    if (inChart) {
      setActiveOverlay(null);
      setActivePill('step-chart');
      bgLayer.style.backgroundColor = '#FFFFFF';
      if (chartRect.top < window.innerHeight * 0.75) {
        chartCard.classList.add('animated');
      }
    } else if (inAlerts) {
      setActiveOverlay(null);
      setActivePill('step-alerts');

      // Focus one alert card at a time as user scrolls
      let activeIdx = 0;
      if (alertsP >= 0.34 && alertsP < 0.68) activeIdx = 1;
      else if (alertsP >= 0.68) activeIdx = 2;

      alertCards.forEach((card, i) => {
        card.classList.toggle('active', i === activeIdx);
      });
      const activeBg = alertCards[activeIdx].getAttribute('data-bg') || '#A8BDA5';
      bgLayer.style.backgroundColor = activeBg;
    } else {
      // Inside 3D Tutorial section
      if (tutP < 0.16) {
        setActiveOverlay('patch');
        setActivePill('step-patch');
        bgLayer.style.backgroundColor = '#F0E6D8'; // Sabbia
      } else if (tutP < 0.30) {
        setActiveOverlay('device');
        setActivePill('step-device');
        bgLayer.style.backgroundColor = '#F0E6D8'; // Sabbia
      } else if (tutP < 0.45) {
        setActiveOverlay('mount');
        setActivePill('step-mount');
        bgLayer.style.backgroundColor = '#F0E6D8'; // Sabbia
      } else if (tutP < 0.57) {
        setActiveOverlay('camera');
        setActivePill('step-guide');
        bgLayer.style.backgroundColor = '#DCE9EF'; // Azzurro polvere
      } else if (tutP < 0.78) {
        setActiveOverlay('guide');
        setActivePill('step-guide');
        bgLayer.style.backgroundColor = '#F0E6D8'; // Sabbia (PDF Page 9-10)
      } else {
        setActiveOverlay('uv');
        setActivePill('step-uv');
        bgLayer.style.backgroundColor = '#DCE9EF'; // Azzurro polvere (PDF Page 8)
      }

      updateTelemetryHUD(tutP);
    }
  }

  function animate(now) {
    const dt = Math.min(0.05, (now - lastTimestamp) / 1000);
    lastTimestamp = now;

    // Smooth inertia for Apple-like scroll responsiveness
    smoothedProgress += (targetProgress - smoothedProgress) * 0.16;
    scene3d.setScrollProgress(smoothedProgress);
    scene3d.update(dt);

    requestAnimationFrame(animate);
  }

  window.addEventListener('scroll', updateScrollState, { passive: true });
  window.addEventListener('resize', () => {
    scene3d.resize();
    updateScrollState();
  });

  // Initial state on load (Screen 0 static)
  setActiveOverlay('patch');
  requestAnimationFrame(animate);
})();
