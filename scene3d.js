/**
 * LumaPatch 3D Scene Controller (Three.js)
 * Builds the 3D Bio-Optical Hydrogel Patch, Clip-on UV Smartphone Device,
 * and iPhone with live dynamic Camera UI & UV Illumination.
 */
(function (global) {
  'use strict';

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  }

  /** Creates a rounded rectangle THREE.Shape centered at (0,0) */
  function createRoundedRectShape(width, height, radius) {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;
    const r = Math.min(radius, width / 2, height / 2);

    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }

  function createExtrudedRoundedBox(width, height, depth, radius, bevelSize) {
    const shape = createRoundedRectShape(width, height, radius);
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: depth,
      bevelEnabled: bevelSize > 0,
      bevelSegments: 4,
      steps: 1,
      bevelSize: bevelSize,
      bevelThickness: bevelSize
    });
    geom.center();
    return geom;
  }

  /** Builds a procedural realistic skin texture for the iPhone viewfinder */
  function drawSkinBackground(ctx, x, y, w, h, uvGlow) {
    const baseGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    if (uvGlow > 0.05) {
      const r1 = Math.round(lerp(233, 22, uvGlow));
      const g1 = Math.round(lerp(195, 175, uvGlow));
      const b1 = Math.round(lerp(174, 215, uvGlow));
      const r2 = Math.round(lerp(214, 10, uvGlow));
      const g2 = Math.round(lerp(168, 130, uvGlow));
      const b2 = Math.round(lerp(144, 185, uvGlow));
      baseGrad.addColorStop(0, `rgb(${r1},${g1},${b1})`);
      baseGrad.addColorStop(1, `rgb(${r2},${g2},${b2})`);
    } else {
      baseGrad.addColorStop(0, '#ECC5AE');
      baseGrad.addColorStop(0.5, '#E2B49A');
      baseGrad.addColorStop(1, '#D7A388');
    }
    ctx.fillStyle = baseGrad;
    ctx.fillRect(x, y, w, h);

    // Subtle organic skin grain dots
    ctx.fillStyle = uvGlow > 0.3 ? 'rgba(0, 240, 255, 0.06)' : 'rgba(155, 95, 70, 0.06)';
    for (let i = 0; i < 140; i++) {
      const px = x + ((i * 73) % w);
      const py = y + ((i * 137) % h);
      ctx.fillRect(px, py, 2, 2);
    }

    // Radial UV illumination spill over the entire viewfinder
    if (uvGlow > 0.02) {
      const rad = ctx.createRadialGradient(
        x + w * 0.5, y + h * 0.48, w * 0.05,
        x + w * 0.5, y + h * 0.48, w * 0.72
      );
      rad.addColorStop(0, `rgba(0, 238, 255, ${0.58 * uvGlow})`);
      rad.addColorStop(0.55, `rgba(24, 200, 255, ${0.35 * uvGlow})`);
      rad.addColorStop(1, `rgba(10, 110, 170, ${0.18 * uvGlow})`);
      ctx.fillStyle = rad;
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawRoundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  class LumaScene3D {
    constructor(canvas) {
      this.canvas = canvas;
      this.ready = typeof THREE !== 'undefined';
      this.progress = 0;
      this.time = 0;
      this.lastScreenKey = '';

      if (!this.ready) {
        this.initFallback();
        return;
      }

      this.initThree();
      this.buildPatch();
      this.buildUVDevice();
      this.buildPhone();
      this.resize();
    }

    initFallback() {
      // Graceful 2D canvas fallback if Three.js CDN is unreachable offline
      this.ctx2d = this.canvas.getContext('2d');
      this.resize();
    }

    initThree() {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;

      this.scene = new THREE.Scene();

      this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      this.camera.position.set(0, 0.1, 7.6);

      // Apple-style clean studio lights
      const hemi = new THREE.HemisphereLight(0xffffff, 0xd8cfc2, 1.05);
      this.scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.25);
      keyLight.position.set(4.5, 5.5, 6.5);
      this.scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.72);
      rimLight.position.set(-5.0, 2.5, -4.0);
      this.scene.add(rimLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
      fillLight.position.set(0, -4, 3);
      this.scene.add(fillLight);

      // Dedicated UV illumination point light
      this.uvLight = new THREE.PointLight(0x00e5ff, 0, 8, 1.6);
      this.uvLight.position.set(0.3, 1.8, 1.5);
      this.scene.add(this.uvLight);

      this.rootGroup = new THREE.Group();
      this.scene.add(this.rootGroup);
    }

    buildPatch() {
      this.patchGroup = new THREE.Group();

      // 1. White breathable backing square
      const baseGeom = createExtrudedRoundedBox(2.35, 2.35, 0.08, 0.36, 0.025);
      this.patchBaseMat = new THREE.MeshStandardMaterial({
        color: 0xfbfbfd,
        roughness: 0.72,
        metalness: 0.02,
        transparent: true,
        opacity: 1
      });
      const baseMesh = new THREE.Mesh(baseGeom, this.patchBaseMat);
      this.patchGroup.add(baseMesh);

      // Subtle inner adhesive recess ring
      const recessGeom = createExtrudedRoundedBox(1.88, 1.88, 0.02, 0.28, 0.008);
      this.patchRecessMat = new THREE.MeshStandardMaterial({
        color: 0xeef2f1,
        roughness: 0.6,
        metalness: 0.0,
        transparent: true,
        opacity: 1
      });
      const recessMesh = new THREE.Mesh(recessGeom, this.patchRecessMat);
      recessMesh.position.z = 0.05;
      this.patchGroup.add(recessMesh);

      // 2. Central Transparent Hydrogel Layer
      const gelGeom = createExtrudedRoundedBox(1.56, 1.56, 0.09, 0.24, 0.03);
      this.patchGelMat = new THREE.MeshPhysicalMaterial({
        color: 0xdcf5f9,
        roughness: 0.08,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        reflectivity: 0.9,
        transparent: true,
        opacity: 0.68,
        emissive: 0x00d9ff,
        emissiveIntensity: 0.0
      });
      const gelMesh = new THREE.Mesh(gelGeom, this.patchGelMat);
      gelMesh.position.z = 0.095;
      this.patchGroup.add(gelMesh);

      // 3. Embedded optical corner markers + central bio-sensor ring
      this.patchMarkerMat = new THREE.MeshStandardMaterial({
        color: 0x5c8056,
        roughness: 0.35,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
        emissive: 0x00e5ff,
        emissiveIntensity: 0
      });

      const markerPositions = [
        [-0.54, 0.54],
        [0.54, 0.54],
        [-0.54, -0.54],
        [0.54, -0.54]
      ];
      markerPositions.forEach(([mx, my]) => {
        const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.015, 24), this.patchMarkerMat);
        dot.rotation.x = Math.PI / 2;
        dot.position.set(mx, my, 0.068);
        this.patchGroup.add(dot);
      });

      const sensorRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 16, 48), this.patchMarkerMat);
      sensorRing.position.z = 0.068;
      this.patchGroup.add(sensorRing);

      this.rootGroup.add(this.patchGroup);
    }

    buildUVDevice() {
      this.uvDeviceGroup = new THREE.Group();

      // Materials
      this.devBodyMat = new THREE.MeshStandardMaterial({
        color: 0x1e2024,
        roughness: 0.36,
        metalness: 0.45,
        transparent: true,
        opacity: 1
      });
      const accentMetalMat = new THREE.MeshStandardMaterial({
        color: 0x8b929a,
        roughness: 0.25,
        metalness: 0.85
      });
      const lensGlassMat = new THREE.MeshPhysicalMaterial({
        color: 0x1e3a5f,
        roughness: 0.05,
        metalness: 0.1,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.88
      });

      // Main housing block (aligns over upper camera area of iPhone)
      const bodyGeom = createExtrudedRoundedBox(1.24, 0.78, 0.28, 0.14, 0.02);
      const bodyMesh = new THREE.Mesh(bodyGeom, this.devBodyMat);
      this.uvDeviceGroup.add(bodyMesh);

      // Top rounded clip bridge wrapping over phone top edge
      const clipTopGeom = createExtrudedRoundedBox(1.06, 0.22, 0.54, 0.09, 0.015);
      const clipTop = new THREE.Mesh(clipTopGeom, this.devBodyMat);
      clipTop.position.set(-0.04, 0.58, 0.24);
      this.uvDeviceGroup.add(clipTop);

      // Front clip jaw (holds onto screen bezel top)
      const clipFrontGeom = createExtrudedRoundedBox(0.96, 0.34, 0.08, 0.06, 0.01);
      const clipFront = new THREE.Mesh(clipFrontGeom, this.devBodyMat);
      clipFront.position.set(-0.04, 0.36, 0.45);
      this.uvDeviceGroup.add(clipFront);

      // Optical acquisition barrel (positioned to align directly over iPhone rear camera)
      const barrelOuter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.26, 0.22, 36),
        this.devBodyMat
      );
      barrelOuter.rotation.x = Math.PI / 2;
      barrelOuter.position.set(0.23, -0.16, -0.14);
      this.uvDeviceGroup.add(barrelOuter);

      const bezelRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.022, 16, 40),
        accentMetalMat
      );
      bezelRing.position.set(0.23, -0.16, -0.25);
      this.uvDeviceGroup.add(bezelRing);

      const lensGlass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.04, 32),
        lensGlassMat
      );
      lensGlass.rotation.x = Math.PI / 2;
      lensGlass.position.set(0.23, -0.16, -0.23);
      this.uvDeviceGroup.add(lensGlass);

      // Translucent rectangular UV LED diffuser window (from PDF Page 5)
      this.uvWindowMat = new THREE.MeshPhysicalMaterial({
        color: 0xdff8ff,
        roughness: 0.14,
        metalness: 0.0,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.72,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.0
      });
      const uvWindowGeom = createExtrudedRoundedBox(0.44, 0.50, 0.18, 0.06, 0.015);
      const uvWindow = new THREE.Mesh(uvWindowGeom, this.uvWindowMat);
      uvWindow.position.set(-0.26, -0.06, -0.14);
      this.uvDeviceGroup.add(uvWindow);

      // Internal UV diode dots
      this.uvDiodeMat = new THREE.MeshBasicMaterial({ color: 0x264450 });
      [
        [-0.34, 0.05],
        [-0.18, 0.05],
        [-0.34, -0.15],
        [-0.18, -0.15]
      ].forEach(([dx, dy]) => {
        const diode = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), this.uvDiodeMat);
        diode.position.set(dx, dy, -0.16);
        this.uvDeviceGroup.add(diode);
      });

      // Side tactile UV button (pressed in Step 5/6)
      this.uvButtonMat = new THREE.MeshStandardMaterial({
        color: 0x718f6d,
        roughness: 0.3,
        metalness: 0.3,
        emissive: 0x00e5ff,
        emissiveIntensity: 0
      });
      this.uvButtonMesh = new THREE.Mesh(
        createExtrudedRoundedBox(0.11, 0.24, 0.14, 0.03, 0.008),
        this.uvButtonMat
      );
      this.uvButtonMesh.position.set(0.66, 0.16, 0.04);
      this.uvDeviceGroup.add(this.uvButtonMesh);

      // Volumetric UV Light Cone expanding outward along -Z
      const coneGeom = new THREE.ConeGeometry(1.35, 2.8, 36, 1, true);
      this.uvConeMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.uvConeMesh = new THREE.Mesh(coneGeom, this.uvConeMat);
      this.uvConeMesh.rotation.x = Math.PI / 2;
      this.uvConeMesh.position.set(-0.26, -0.06, -1.62);
      this.uvDeviceGroup.add(this.uvConeMesh);

      this.rootGroup.add(this.uvDeviceGroup);
    }

    buildPhone() {
      this.phoneGroup = new THREE.Group();

      // Brushed Titanium Frame
      const frameGeom = createExtrudedRoundedBox(1.88, 3.82, 0.17, 0.28, 0.02);
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xd4d6db,
        roughness: 0.26,
        metalness: 0.85
      });
      const frameMesh = new THREE.Mesh(frameGeom, frameMat);
      this.phoneGroup.add(frameMesh);

      // Rear White Frosted Glass (on -Z)
      const backGlassGeom = createExtrudedRoundedBox(1.78, 3.72, 0.02, 0.24, 0.005);
      const backGlassMat = new THREE.MeshPhysicalMaterial({
        color: 0xf7f7f9,
        roughness: 0.28,
        metalness: 0.04,
        clearcoat: 0.7
      });
      const backGlass = new THREE.Mesh(backGlassGeom, backGlassMat);
      backGlass.position.z = -0.098;
      this.phoneGroup.add(backGlass);

      // Minimalist rear wellness emblem ring on back
      const backLogo = new THREE.Mesh(
        new THREE.RingGeometry(0.14, 0.18, 36),
        new THREE.MeshStandardMaterial({ color: 0xc2c6cc, roughness: 0.2, metalness: 0.6, side: THREE.DoubleSide })
      );
      backLogo.position.set(0, 0.08, -0.114);
      backLogo.rotation.y = Math.PI;
      this.phoneGroup.add(backLogo);

      // Rear Camera Island (at +X, +Y on -Z so when rotated 180deg it sits top-left!)
      const islandGeom = createExtrudedRoundedBox(0.76, 0.82, 0.05, 0.16, 0.015);
      const islandMat = new THREE.MeshPhysicalMaterial({
        color: 0xeeeeef,
        roughness: 0.18,
        metalness: 0.08,
        clearcoat: 0.9
      });
      const island = new THREE.Mesh(islandGeom, islandMat);
      island.position.set(0.42, 1.32, -0.115);
      this.phoneGroup.add(island);

      // Dual Vertical Sapphire Lenses (like PDF Page 6)
      const camRingMat = new THREE.MeshStandardMaterial({ color: 0xb6bac2, roughness: 0.2, metalness: 0.9 });
      const camGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x0e1828, roughness: 0.05, metalness: 0.2, clearcoat: 1.0 });

      [
        [0.54, 1.50],
        [0.54, 1.14]
      ].forEach(([cx, cy]) => {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 28), camRingMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(cx, cy, -0.145);
        this.phoneGroup.add(ring);

        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.055, 28), camGlassMat);
        glass.rotation.x = Math.PI / 2;
        glass.position.set(cx, cy, -0.148);
        this.phoneGroup.add(glass);
      });

      // Camera LED Flash
      const flash = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.03, 20),
        new THREE.MeshStandardMaterial({ color: 0xfff5db, roughness: 0.3 })
      );
      flash.rotation.x = Math.PI / 2;
      flash.position.set(0.24, 1.44, -0.138);
      this.phoneGroup.add(flash);

      // Front Black Bezel (+Z)
      const bezelGeom = createExtrudedRoundedBox(1.80, 3.74, 0.02, 0.25, 0.004);
      const bezelMat = new THREE.MeshStandardMaterial({ color: 0x101215, roughness: 0.18, metalness: 0.2 });
      const bezel = new THREE.Mesh(bezelGeom, bezelMat);
      bezel.position.z = 0.095;
      this.phoneGroup.add(bezel);

      // Dynamic OLED Screen CanvasTexture (+Z)
      this.screenCanvas = document.createElement('canvas');
      this.screenCanvas.width = 540;
      this.screenCanvas.height = 1140;
      this.screenCtx = this.screenCanvas.getContext('2d');

      this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
      this.screenTexture.encoding = THREE.sRGBEncoding;
      this.screenTexture.minFilter = THREE.LinearFilter;

      const screenGeom = new THREE.PlaneGeometry(1.66, 3.58);
      this.screenMat = new THREE.MeshBasicMaterial({
        map: this.screenTexture
      });
      const screenMesh = new THREE.Mesh(screenGeom, this.screenMat);
      screenMesh.position.z = 0.112;
      this.phoneGroup.add(screenMesh);

      // Side Buttons on frame
      const sideBtnMat = new THREE.MeshStandardMaterial({ color: 0xc2c5cb, roughness: 0.28, metalness: 0.85 });
      const powerBtn = new THREE.Mesh(createExtrudedRoundedBox(0.03, 0.36, 0.06, 0.01, 0.004), sideBtnMat);
      powerBtn.position.set(0.96, 0.45, 0);
      this.phoneGroup.add(powerBtn);

      const volUp = new THREE.Mesh(createExtrudedRoundedBox(0.03, 0.24, 0.06, 0.01, 0.004), sideBtnMat);
      volUp.position.set(-0.96, 0.65, 0);
      this.phoneGroup.add(volUp);

      const volDown = new THREE.Mesh(createExtrudedRoundedBox(0.03, 0.24, 0.06, 0.01, 0.004), sideBtnMat);
      volDown.position.set(-0.96, 0.32, 0);
      this.phoneGroup.add(volDown);

      this.rootGroup.add(this.phoneGroup);
      this.drawPhoneScreen(0, 0, 0, 0, 0);
    }

    /**
     * Draws the live simulated iPhone Camera UI onto the 3D screen texture.
     */
    drawPhoneScreen(power, guideStep, tiltDeg, zoomScale, uvGlow, shutterFlash = 0, checkAlpha = 0) {
      const ctx = this.screenCtx;
      const W = this.screenCanvas.width;
      const H = this.screenCanvas.height;

      // Key throttling to avoid redrawing static dark screen unnecessarily
      const key = `${power.toFixed(2)}_${guideStep.toFixed(2)}_${tiltDeg.toFixed(1)}_${zoomScale.toFixed(2)}_${uvGlow.toFixed(2)}_${shutterFlash.toFixed(2)}_${checkAlpha.toFixed(2)}`;
      if (key === this.lastScreenKey) return;
      this.lastScreenKey = key;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#090b0e';
      ctx.fillRect(0, 0, W, H);

      if (power < 0.03) {
        // Screen off subtle reflection
        const offGrad = ctx.createLinearGradient(0, 0, W, H);
        offGrad.addColorStop(0, '#14181f');
        offGrad.addColorStop(0.5, '#090b0e');
        offGrad.addColorStop(1, '#10141a');
        ctx.fillStyle = offGrad;
        ctx.fillRect(0, 0, W, H);
        this.screenTexture.needsUpdate = true;
        return;
      }

      ctx.save();
      ctx.globalAlpha = power;

      // Top camera bar (like PDF Page 8: HEIC 24, icons)
      ctx.fillStyle = '#0c0e11';
      ctx.fillRect(0, 0, W, 178);

      // Dynamic Island
      drawRoundedRectPath(ctx, W / 2 - 74, 24, 148, 40, 20);
      ctx.fillStyle = '#000000';
      ctx.fill();

      // Top status pills
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      drawRoundedRectPath(ctx, 28, 108, 92, 34, 17);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HEIC 24', 74, 131);

      // UV badge at top right
      ctx.fillStyle = uvGlow > 0.2 ? 'rgba(0, 229, 255, 0.28)' : 'rgba(255,255,255,0.14)';
      drawRoundedRectPath(ctx, W - 126, 108, 98, 34, 17);
      ctx.fill();
      ctx.fillStyle = uvGlow > 0.2 ? '#44F0FF' : '#E5E7EB';
      ctx.fillText(uvGlow > 0.2 ? 'UV ON' : 'UV AUTO', W - 77, 131);

      // Viewfinder Area
      const vfY = 178;
      const vfH = 740;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, vfY, W, vfH);
      ctx.clip();

      drawSkinBackground(ctx, 0, vfY, W, vfH, uvGlow);

      // Subtle rule-of-thirds camera grid
      ctx.strokeStyle = uvGlow > 0.2 ? 'rgba(0, 240, 255, 0.22)' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.2;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo((W / 3) * i, vfY);
        ctx.lineTo((W / 3) * i, vfY + vfH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, vfY + (vfH / 3) * i);
        ctx.lineTo(W, vfY + (vfH / 3) * i);
        ctx.stroke();
      }

      // Centered Square Hydrogel Patch inside Viewfinder
      ctx.save();
      ctx.translate(W / 2, vfY + vfH / 2);
      ctx.rotate((tiltDeg * Math.PI) / 180);
      ctx.scale(zoomScale, zoomScale);

      const ps = 260;
      // Shadow under patch
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      drawRoundedRectPath(ctx, -ps / 2 + 4, -ps / 2 + 8, ps, ps, 36);
      ctx.fill();

      // White patch backing
      ctx.fillStyle = uvGlow > 0.15
        ? `rgb(${Math.round(lerp(250, 90, uvGlow))}, ${Math.round(lerp(250, 242, uvGlow))}, ${Math.round(lerp(252, 255, uvGlow))})`
        : '#FAFBFD';
      drawRoundedRectPath(ctx, -ps / 2, -ps / 2, ps, ps, 36);
      ctx.fill();

      // Hydrogel square center (fluoresces cyan-blue under UV!)
      const gelSize = 186;
      const gelGrad = ctx.createLinearGradient(-gelSize / 2, -gelSize / 2, gelSize / 2, gelSize / 2);
      if (uvGlow > 0.1) {
        gelGrad.addColorStop(0, `rgba(0, 244, 255, ${0.45 + 0.45 * uvGlow})`);
        gelGrad.addColorStop(1, `rgba(18, 198, 255, ${0.55 + 0.35 * uvGlow})`);
      } else {
        gelGrad.addColorStop(0, 'rgba(210, 242, 246, 0.78)');
        gelGrad.addColorStop(1, 'rgba(180, 224, 232, 0.85)');
      }
      ctx.fillStyle = gelGrad;
      drawRoundedRectPath(ctx, -gelSize / 2, -gelSize / 2, gelSize, gelSize, 26);
      ctx.fill();

      ctx.strokeStyle = uvGlow > 0.2 ? 'rgba(0, 255, 255, 0.9)' : 'rgba(130, 175, 185, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 4 Optical Markers on Patch
      const mOff = 64;
      [[-mOff, -mOff], [mOff, -mOff], [-mOff, mOff], [mOff, mOff]].forEach(([mx, my]) => {
        ctx.beginPath();
        ctx.arc(mx, my, 9, 0, Math.PI * 2);
        ctx.fillStyle = uvGlow > 0.2 ? '#E0FFFF' : (checkAlpha > 0.5 ? '#2E7D32' : '#5E8058');
        ctx.fill();
      });

      // Curved Tilt Guidance Arrow inside patch (PDF Page 9!)
      if (Math.abs(tiltDeg) > 1.2 && checkAlpha < 0.2) {
        ctx.save();
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, 56, -Math.PI * 0.85, Math.PI * 0.15);
        ctx.stroke();
        // Arrowhead
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.moveTo(52, 28);
        ctx.lineTo(69, 10);
        ctx.lineTo(42, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Checkmark OK (PDF Page 10!)
      if (checkAlpha > 0.05) {
        ctx.save();
        ctx.globalAlpha = checkAlpha;
        drawRoundedRectPath(ctx, -44, -44, 88, 88, 22);
        ctx.fillStyle = '#34C759';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-20, 2);
        ctx.lineTo(-4, 19);
        ctx.lineTo(24, -17);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore(); // end patch transform

      // Target framing brackets on viewfinder
      const brSize = 310;
      const bx = W / 2 - brSize / 2;
      const by = vfY + vfH / 2 - brSize / 2;
      const cornerLen = 36;
      ctx.strokeStyle = checkAlpha > 0.4 ? '#34C759' : (uvGlow > 0.2 ? '#00F0FF' : '#FBBF24');
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';

      // 4 L-brackets
      const corners = [
        [bx, by, 1, 1],
        [bx + brSize, by, -1, 1],
        [bx, by + brSize, 1, -1],
        [bx + brSize, by + brSize, -1, -1]
      ];
      corners.forEach(([cx, cy, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(cx + sx * cornerLen, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + sy * cornerLen);
        ctx.stroke();
      });

      // Floating guidance pill inside viewfinder
      let hudText = 'Inquadra il cerotto';
      let hudBg = 'rgba(15, 23, 20, 0.72)';
      if (guideStep >= 0.08 && guideStep < 0.36) {
        hudText = '↻ Ruota leggermente (12°)';
        hudBg = 'rgba(180, 100, 12, 0.85)';
      } else if (guideStep >= 0.36 && guideStep < 0.64) {
        hudText = '↔ Avvicinati · 10 cm';
        hudBg = 'rgba(180, 100, 12, 0.85)';
      } else if (guideStep >= 0.64 && guideStep < 0.82) {
        hudText = '☀ Luce bassa · Premi UV';
        hudBg = 'rgba(14, 116, 144, 0.88)';
      } else if (checkAlpha > 0.2 && uvGlow < 0.15) {
        hudText = '✓ Condizioni ottimali · Scatto!';
        hudBg = 'rgba(22, 128, 56, 0.9)';
      } else if (uvGlow >= 0.15) {
        hudText = '🔦 Fluorescenza UV Attiva';
        hudBg = 'rgba(0, 145, 195, 0.9)';
      }

      drawRoundedRectPath(ctx, W / 2 - 175, vfY + 26, 350, 46, 23);
      ctx.fillStyle = hudBg;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 21px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hudText, W / 2, vfY + 56);

      // Shutter flash overlay
      if (shutterFlash > 0.01) {
        ctx.fillStyle = `rgba(255, 255, 255, ${shutterFlash * 0.85})`;
        ctx.fillRect(0, vfY, W, vfH);
      }

      ctx.restore(); // end viewfinder clip

      // Bottom Camera Controls Bar (PDF Page 8 style)
      ctx.fillStyle = '#0c0e11';
      ctx.fillRect(0, vfY + vfH, W, H - (vfY + vfH));

      // Mode selector text
      ctx.font = '600 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8E949E';
      ctx.fillText('FOTO', W / 2 - 125, vfY + vfH + 46);
      ctx.fillStyle = uvGlow > 0.2 ? '#38BDF8' : '#FBBF24';
      ctx.fillText(uvGlow > 0.2 ? 'ANALISI UV' : 'SCANSIONE', W / 2, vfY + vfH + 46);
      ctx.fillStyle = '#8E949E';
      ctx.fillText('SPAZIALE', W / 2 + 125, vfY + vfH + 46);

      // Shutter button
      const shY = vfY + vfH + 124;
      ctx.beginPath();
      ctx.arc(W / 2, shY, 44, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(W / 2, shY, shutterFlash > 0.1 ? 30 : 36, 0, Math.PI * 2);
      ctx.fillStyle = checkAlpha > 0.5 ? '#34C759' : '#ffffff';
      ctx.fill();

      ctx.restore();
      this.screenTexture.needsUpdate = true;
    }

    /**
     * Master scroll choreography update (t in [0, 1])
     */
    setScrollProgress(p) {
      this.progress = clamp(p, 0, 1);
    }

    update(dt) {
      this.time += dt;
      const p = this.progress;

      if (!this.ready) {
        this.drawFallback(p);
        return;
      }

      const breathe = Math.sin(this.time * 1.4) * 0.035;

      // =====================================================
      // 1. CEROTTO QUADRATO (0.00 -> 0.24)
      // =====================================================
      const patchShrink = smoothstep(0.14, 0.25, p);
      const patchScale = lerp(1.0, 0.12, patchShrink);
      const patchOpacity = 1 - smoothstep(0.19, 0.25, p);

      this.patchGroup.visible = patchOpacity > 0.01;
      this.patchGroup.scale.setScalar(patchScale);
      this.patchGroup.position.set(0, lerp(-0.15, 1.55, patchShrink) + breathe * 0.5, 0);
      this.patchGroup.rotation.set(
        lerp(-0.28, -0.5, smoothstep(0, 0.18, p)) + Math.sin(this.time * 0.9) * 0.04,
        lerp(-0.32, 0.45, smoothstep(0, 0.16, p)),
        0.04
      );
      this.patchBaseMat.opacity = patchOpacity;
      this.patchRecessMat.opacity = patchOpacity;
      this.patchGelMat.opacity = 0.68 * patchOpacity;
      this.patchMarkerMat.opacity = 0.85 * patchOpacity;

      // =====================================================
      // 2. DISPOSITIVO UV & UNIONE CON IPHONE
      //    - Device enters: 0.16 -> 0.27
      //    - Phone rises from bottom & Device rotates/attaches: 0.29 -> 0.44
      //    - Coupled unit rotates to front + Zooms in: 0.44 -> 0.58
      // =====================================================
      const devAppear = smoothstep(0.16, 0.27, p);
      const mountT = smoothstep(0.30, 0.43, p);
      const flipToFront = smoothstep(0.45, 0.57, p);
      const exitFade = smoothstep(0.95, 1.0, p);

      // Phone state
      const phoneRise = smoothstep(0.28, 0.42, p);
      this.phoneGroup.visible = phoneRise > 0.01 && exitFade < 0.99;

      // Coupled assembly rotation: starts at back view (PI) then rotates to front view (2*PI == 0)
      const assemblyRotY = lerp(Math.PI + 0.22, Math.PI * 2, flipToFront);
      const assemblyRotX = lerp(0.08, 0.0, flipToFront);

      // Position of phone: rises from bottom while scaling up
      const phoneScale = lerp(0.55, 1.0, easeOutCubic(phoneRise)) * (1 - exitFade * 0.25);
      const phoneY = lerp(-4.8, -0.18, easeOutCubic(phoneRise)) + lerp(0, -0.05, flipToFront);
      const phoneX = lerp(0, 0.35, smoothstep(0.32, 0.43, p) * (1 - flipToFront));

      this.phoneGroup.position.set(phoneX, phoneY, 0);
      this.phoneGroup.scale.setScalar(phoneScale);
      this.phoneGroup.rotation.set(assemblyRotX, assemblyRotY, 0);

      // UV Device transform:
      // Before mounting (mountT < 1): standalone centered, rotating gently
      // As mountT -> 1: snaps precisely into the Phone's local attachment point!
      this.uvDeviceGroup.visible = devAppear > 0.01 && exitFade < 0.99;

      // Standalone pose
      const standScale = lerp(0.15, 1.25, easeOutCubic(devAppear));
      const standPos = new THREE.Vector3(0, lerp(-0.6, -0.1, devAppear) + breathe * 0.4, 0);
      const standRotY = lerp(-0.8, Math.PI * 1.15, smoothstep(0.18, 0.30, p));
      const standRotX = 0.22;

      // Target attached pose in Phone's local space (aligned over top camera island!)
      const localAttachPos = new THREE.Vector3(0.36, 1.48, -0.22);
      // Transform localAttachPos to world coordinates matching phoneGroup
      this.phoneGroup.updateMatrixWorld(true);
      const attachedWorldPos = localAttachPos.clone().applyMatrix4(this.phoneGroup.matrixWorld);

      const curPos = standPos.lerp(attachedWorldPos, mountT);
      const curScale = lerp(standScale, 0.78 * phoneScale, mountT);

      this.uvDeviceGroup.position.copy(curPos);
      this.uvDeviceGroup.scale.setScalar(curScale);

      if (mountT < 0.99) {
        const targetRotY = assemblyRotY;
        const targetRotX = assemblyRotX;
        this.uvDeviceGroup.rotation.set(
          lerp(standRotX, targetRotX, mountT),
          lerp(standRotY, targetRotY, mountT),
          lerp(0.12, 0, mountT)
        );
      } else {
        this.uvDeviceGroup.rotation.set(assemblyRotX, assemblyRotY, 0);
      }

      // =====================================================
      // 3. CAMERA ZOOM ON IPHONE SCREEN (0.45 -> 0.59)
      // =====================================================
      const zoomIn = smoothstep(0.46, 0.59, p);
      const zoomOutEnd = smoothstep(0.94, 1.0, p);
      const camZ = lerp(7.6, 5.15, zoomIn) + zoomOutEnd * 1.8;
      const camY = lerp(0.1, -0.04, zoomIn);
      const camX = lerp(0, 0.42, smoothstep(0.56, 0.66, p) * (window.innerWidth > 900 ? 1 : 0));

      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(camX * 0.35, camY, 0);

      // =====================================================
      // 4. SCREEN POWER, GUIDED CAPTURE & UV LIGHT
      // =====================================================
      const screenPower = smoothstep(0.53, 0.58, p);
      const guideStep = clamp((p - 0.58) / 0.20, 0, 1);

      // Tilt starts at 12 deg and straightens to 0
      const tiltDeg = lerp(12, 0, smoothstep(0.59, 0.65, p));
      // Patch distance zoom inside viewfinder starts small (0.72) -> optimal (1.0)
      const vfZoom = lerp(0.74, 1.0, smoothstep(0.64, 0.70, p));
      // Green checkmark appears 0.71 -> 0.79
      const checkAlpha = smoothstep(0.71, 0.74, p) * (1 - smoothstep(0.78, 0.81, p));
      // Shutter flash peak around 0.76
      const flashDist = Math.abs(p - 0.765);
      const shutterFlash = flashDist < 0.025 ? Math.cos((flashDist / 0.025) * Math.PI * 0.5) : 0;

      // UV Light activation (0.78 -> 0.96)
      const uvGlow = smoothstep(0.78, 0.84, p) * (1 - smoothstep(0.95, 1.0, p));

      // Animate physical UV button press + glow
      const btnPress = smoothstep(0.76, 0.80, p);
      this.uvButtonMesh.position.x = lerp(0.66, 0.61, btnPress * (1 - smoothstep(0.83, 0.87, p)));
      this.uvButtonMat.emissiveIntensity = uvGlow * 1.8;

      // Physical UV Window, Diodes, Volumetric Cone & Scene PointLight
      this.uvWindowMat.emissiveIntensity = uvGlow * 2.4;
      this.uvDiodeMat.color.setHex(uvGlow > 0.15 ? 0x55ffff : 0x264450);
      this.uvConeMat.opacity = uvGlow * 0.24;
      this.uvLight.intensity = uvGlow * 3.2;

      this.drawPhoneScreen(
        screenPower,
        guideStep,
        tiltDeg,
        vfZoom,
        uvGlow,
        shutterFlash,
        checkAlpha
      );

      this.renderer.render(this.scene, this.camera);
    }

    drawFallback(p) {
      const ctx = this.ctx2d;
      if (!ctx) return;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.fillStyle = '#23461A';
      ctx.font = '600 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Scena interattiva (${Math.round(p * 100)}%)`, 0, 0);
      ctx.restore();
    }

    resize() {
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      if (!this.ready) {
        this.canvas.width = width;
        this.canvas.height = height;
        return;
      }
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }
  }

  global.LumaScene3D = LumaScene3D;
})(window);
