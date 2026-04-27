const canvas = document.getElementById("stage");
const gl = canvas.getContext("webgl", { alpha: false, antialias: false, xrCompatible: true });
const video = document.getElementById("video");
const emptyState = document.getElementById("emptyState");
const controls = document.getElementById("controls");
const fileName = document.getElementById("fileName");
const playButton = document.getElementById("playButton");
const motionButton = document.getElementById("motionButton");
const headsetButton = document.getElementById("headsetButton");
const formatButton = document.getElementById("formatButton");
const recenterButton = document.getElementById("recenterButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const xrButton = document.getElementById("xrButton");
const hideHudButton = document.getElementById("hideHudButton");
const flipButton = document.getElementById("flipButton");
const seekBar = document.getElementById("seekBar");
const timeLabel = document.getElementById("timeLabel");
const installPrompt = document.getElementById("installPrompt");
const closeInstallPrompt = document.getElementById("closeInstallPrompt");
const calibrationOverlay = document.getElementById("calibrationOverlay");
const calibrationCount = document.getElementById("calibrationCount");
const gazePointer = document.getElementById("gazePointer");
const gazeProgress = document.getElementById("gazeProgress");

let headsetMode = false;
let sideBySide = true;
let videoFlipY = false;
let motionEnabled = false;
let controlsVisible = true;
let yaw = 0;
let pitch = 0;
let dragYaw = 0;
let dragPitch = 0;
let centerYaw = 0;
let centerPitch = 0;
let latestYaw = 0;
let latestPitch = 0;
let currentQuat = [0, 0, 0, 1];
let centerQuat = [0, 0, 0, 1];
let viewQuat = [0, 0, 0, 1];
let dragging = false;
let lastPointer = { x: 0, y: 0 };
let hideControlsTimer = 0;
let shouldUploadVideoFrame = true;
let videoFrameCallbackStarted = false;
let lastUploadedVideoTime = -1;
let gazeX = window.innerWidth / 2;
let gazeY = window.innerHeight / 2;
let displayedGazeX = window.innerWidth / 2;
let displayedGazeY = window.innerHeight / 2;
let gazeTarget = null;
let gazeStartedAt = 0;
let lastGazeActionAt = 0;
let isSeeking = false;
let recenterTimer = 0;
let recenterInterval = 0;
let lastMotionAt = 0;
let lastMotionYaw = 0;
let lastMotionPitch = 0;
let lastLookDownAt = 0;
let xrSession = null;
let xrBaseReferenceSpace = null;
let xrReferenceSpace = null;
let xrSupported = false;
let latestXRQuat = [0, 0, 0, 1];

const gazeDwellMs = 900;
const gazeCooldownMs = 650;
const timelineVisibleMs = 2600;
const lookDownThreshold = degToRad(18);
const hudIdleMs = 2200;

if (!gl) {
  emptyState.querySelector("p").textContent = "This browser does not support WebGL, which is needed for spherical playback.";
}

const vertexShader = compileShader(gl.VERTEX_SHADER, `
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uMatrix;
varying vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = uMatrix * vec4(aPosition, 1.0);
}
`);

const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
precision mediump float;
uniform sampler2D uVideo;
uniform float uEye;
uniform float uSourceLayout;
uniform float uFlipY;
varying vec2 vTexCoord;
void main() {
  vec2 uv = vTexCoord;
  if (uSourceLayout > 0.5) {
    uv.x = uv.x * 0.5 + uEye * 0.5;
  }
  if (uFlipY > 0.5) {
    uv.y = 1.0 - uv.y;
  }
  gl_FragColor = texture2D(uVideo, uv);
}
`);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
gl.useProgram(program);

const locations = {
  position: gl.getAttribLocation(program, "aPosition"),
  texCoord: gl.getAttribLocation(program, "aTexCoord"),
  matrix: gl.getUniformLocation(program, "uMatrix"),
  video: gl.getUniformLocation(program, "uVideo"),
  eye: gl.getUniformLocation(program, "uEye"),
  sourceLayout: gl.getUniformLocation(program, "uSourceLayout"),
  flipY: gl.getUniformLocation(program, "uFlipY")
};

const mesh = makeHalfSphere(64, 48, 30);
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(locations.position);
gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);

const texCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, mesh.texCoords, gl.STATIC_DRAW);
gl.enableVertexAttribArray(locations.texCoord);
gl.vertexAttribPointer(locations.texCoord, 2, gl.FLOAT, false, 0, 0);

const indexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

const texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
gl.uniform1i(locations.video, 0);
gl.disable(gl.CULL_FACE);
gl.disable(gl.DEPTH_TEST);

document.getElementById("videoInput").addEventListener("change", openVideo);
document.getElementById("videoInputSmall").addEventListener("change", openVideo);

playButton.addEventListener("click", () => {
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
  updatePlayButton();
});

motionButton.addEventListener("click", enableMotion);
headsetButton.addEventListener("click", () => {
  setHeadsetMode(!headsetMode);
});
formatButton.addEventListener("click", () => {
  setSideBySide(!sideBySide);
});
flipButton.addEventListener("click", () => {
  videoFlipY = !videoFlipY;
  flipButton.classList.toggle("is-active", videoFlipY);
  flipButton.textContent = videoFlipY ? "Flip On" : "Flip Off";
});
recenterButton.addEventListener("click", startRecenterCountdown);
fullscreenButton.addEventListener("click", enterFullscreen);
xrButton.addEventListener("click", toggleXR);
hideHudButton.addEventListener("click", hideHud);
closeInstallPrompt.addEventListener("click", () => {
  installPrompt.classList.add("is-hidden");
});

seekBar.addEventListener("input", () => {
  seekToRatio(Number(seekBar.value) / Number(seekBar.max));
});

canvas.addEventListener("click", () => {
  if (controlsVisible) {
    hideHud();
  } else {
    showControlsForGaze();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  dragYaw -= dx * 0.004;
  dragPitch -= dy * 0.004;
  lastPointer = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointerup", () => {
  dragging = false;
});

video.addEventListener("play", updatePlayButton);
video.addEventListener("pause", updatePlayButton);
video.addEventListener("loadedmetadata", updateTimeline);
video.addEventListener("timeupdate", updateTimeline);
window.addEventListener("resize", resize);
updateFullscreenButton();
checkXRSupport();
resize();
requestAnimationFrame(render);

function openVideo(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  video.src = url;
  video.loop = false;
  video.muted = false;
  shouldUploadVideoFrame = true;
  lastUploadedVideoTime = -1;
  startVideoFrameCallbacks();
  video.play();
  fileName.textContent = file.name;
  emptyState.classList.add("is-hidden");
  controls.classList.remove("is-hidden");
  controlsVisible = true;
  setSideBySide(true);
  updatePlayButton();
  updateTimeline();
  scheduleControlsHide();
}

function setHeadsetMode(enabled) {
  headsetMode = enabled;
  headsetButton.classList.toggle("is-active", headsetMode);
  headsetButton.textContent = headsetMode ? "Headset On" : "Headset";

  if (headsetMode) {
    setSideBySide(true);
  }
}

function setSideBySide(enabled) {
  sideBySide = enabled;
  formatButton.classList.toggle("is-active", sideBySide);
  formatButton.textContent = sideBySide ? "SBS 3D" : "Mono";
}

async function enableMotion() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response !== "granted") return;
    }
    window.addEventListener("deviceorientation", handleOrientation, true);
    motionEnabled = true;
    motionButton.textContent = "Motion On";
    motionButton.classList.add("is-active");
    controlsVisible = true;
    controls.classList.remove("is-hidden");
    startMotionCalibration();
  } catch {
    motionButton.textContent = "Motion Blocked";
  }
}

function handleOrientation(event) {
  if (event.alpha == null || event.beta == null || event.gamma == null) return;

  const orientation = screen.orientation ? screen.orientation.angle : window.orientation || 0;
  const alpha = degToRad(event.alpha);
  const beta = degToRad(event.beta);
  const gamma = degToRad(event.gamma);

  currentQuat = deviceOrientationQuaternion(alpha, beta, gamma, degToRad(orientation || 0));
  viewQuat = qNormalize(qMultiply(qConjugate(centerQuat), currentQuat));
  updateAnglesFromQuat();

  if (Math.abs(normalizeAngle(yaw - lastMotionYaw)) > 0.003 || Math.abs(pitch - lastMotionPitch) > 0.003) {
    lastMotionAt = performance.now();
    lastMotionYaw = yaw;
    lastMotionPitch = pitch;
    showControlsForGaze();
  }

  if (pitch > lookDownThreshold) {
    lastLookDownAt = performance.now();
  }

  updateGazePosition();
}

function applyRecenter() {
  if (xrSession && xrBaseReferenceSpace) {
    const inverseOrientation = qConjugate(qNormalize(latestXRQuat));
    xrReferenceSpace = xrBaseReferenceSpace.getOffsetReferenceSpace(
      new XRRigidTransform(
        { x: 0, y: 0, z: 0 },
        {
          x: inverseOrientation[0],
          y: inverseOrientation[1],
          z: inverseOrientation[2],
          w: inverseOrientation[3]
        }
      )
    );
    lastMotionAt = performance.now();
    return;
  }

  centerQuat = currentQuat.slice();
  viewQuat = [0, 0, 0, 1];
  centerYaw = 0;
  centerPitch = 0;
  dragYaw = 0;
  dragPitch = 0;
  yaw = 0;
  pitch = 0;
  updateGazePosition();
  lastMotionAt = performance.now();
}

function startRecenterCountdown() {
  startCalibration({
    title: "Calibrating View",
    buttonText: "Calibrating",
    doneText: motionEnabled ? "Motion On" : "Enable Motion"
  });
}

function startMotionCalibration() {
  startCalibration({
    title: "Motion Setup",
    buttonText: "Setting Up",
    doneText: "Motion On"
  });
}

function startCalibration({ title, buttonText, doneText }) {
  clearTimeout(recenterTimer);
  clearInterval(recenterInterval);
  showControlsForGaze();

  const heading = calibrationOverlay.querySelector("h2");
  const message = calibrationOverlay.querySelector("p");
  if (heading) heading.textContent = title;
  if (message) {
    message.textContent = "Put the phone in the headset, face your normal forward position, and hold still.";
  }

  let remaining = 3;
  recenterButton.textContent = buttonText;
  calibrationCount.textContent = String(remaining);
  calibrationOverlay.classList.remove("is-hidden");
  gazeProgress.style.setProperty("--gaze-progress", "0deg");
  clearGazeTarget();

  recenterInterval = window.setInterval(() => {
    remaining -= 1;
    calibrationCount.textContent = remaining > 0 ? String(remaining) : "Set";
  }, 1000);

  recenterTimer = window.setTimeout(() => {
    clearInterval(recenterInterval);
    applyRecenter();
    recenterButton.textContent = "Recenter";
    motionButton.textContent = doneText;
    calibrationOverlay.classList.add("is-hidden");
    showControlsForGaze();
  }, 3200);
}

function enterFullscreen() {
  if (isIPhoneSafari() && !isStandalone()) {
    installPrompt.classList.remove("is-hidden");
    return;
  }

  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }

  if (canvas.requestFullscreen) {
    canvas.requestFullscreen();
  } else if (canvas.webkitRequestFullscreen) {
    canvas.webkitRequestFullscreen();
  } else {
    controlsVisible = false;
    controls.classList.add("is-hidden");
  }
}

function updateFullscreenButton() {
  if (isStandalone()) {
    fullscreenButton.textContent = "Hide Controls";
  } else if (isIPhoneSafari()) {
    fullscreenButton.textContent = "Install Fullscreen";
  }
}

async function checkXRSupport() {
  if (!navigator.xr) {
    xrButton.textContent = "No WebXR";
    xrButton.disabled = true;
    return;
  }

  try {
    xrSupported = await navigator.xr.isSessionSupported("immersive-vr");
    xrButton.textContent = xrSupported ? "WebXR" : "No WebXR";
    xrButton.disabled = !xrSupported;
  } catch {
    xrButton.textContent = "No WebXR";
    xrButton.disabled = true;
  }
}

async function toggleXR() {
  if (xrSession) {
    xrSession.end();
    return;
  }

  if (!navigator.xr || !xrSupported) {
    xrButton.textContent = "No WebXR";
    return;
  }

  try {
    if (gl.makeXRCompatible) {
      await gl.makeXRCompatible();
    }

    xrSession = await navigator.xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor", "bounded-floor", "dom-overlay"],
      domOverlay: { root: document.body }
    });
    xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
    xrBaseReferenceSpace = await xrSession.requestReferenceSpace("local");
    xrReferenceSpace = xrBaseReferenceSpace;
    xrButton.textContent = "Exit XR";
    xrButton.classList.add("is-active");
    document.body.classList.add("xr-active");
    document.body.classList.toggle("xr-dom-overlay", Boolean(xrSession.domOverlayState));
    controlsVisible = true;
    controls.classList.remove("is-hidden");
    xrSession.addEventListener("end", endXR);
    xrSession.requestAnimationFrame(renderXR);
  } catch {
    xrButton.textContent = "XR Failed";
  }
}

function endXR() {
  xrSession = null;
  xrBaseReferenceSpace = null;
  xrReferenceSpace = null;
  xrButton.textContent = xrSupported ? "WebXR" : "No WebXR";
  xrButton.classList.toggle("is-active", false);
  document.body.classList.remove("xr-active", "xr-dom-overlay");
  requestAnimationFrame(render);
}

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function isIPhoneSafari() {
  const ua = navigator.userAgent;
  const isIPhone = /iPhone|iPod/.test(ua);
  const isWebKit = /WebKit/.test(ua);
  const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIPhone && isWebKit && !isOtherIOSBrowser;
}

function render() {
  if (xrSession) {
    return;
  }

  resize();
  updateWorldHudPosition();
  updateIdleVisibility();
  updateGazeControls();
  updateTimeline();
  uploadVideoTextureIfNeeded();

  gl.clearColor(0.02, 0.03, 0.05, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const eyes = shouldRenderPhoneSBS() ? 2 : 1;
  const eyeWidth = canvas.width / eyes;

  for (let eye = 0; eye < eyes; eye++) {
    const x = eye * eyeWidth;
    gl.viewport(x, 0, eyeWidth, canvas.height);
    const aspect = eyeWidth / canvas.height;
    const matrix = makeViewProjection(aspect, yaw + dragYaw, pitch + dragPitch);
    gl.uniformMatrix4fv(locations.matrix, false, matrix);
    gl.uniform1f(locations.eye, eye);
    gl.uniform1f(locations.sourceLayout, sideBySide ? 1 : 0);
    gl.uniform1f(locations.flipY, videoFlipY ? 1 : 0);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  requestAnimationFrame(render);
}

function renderXR(_time, frame) {
  const session = frame.session;
  const pose = frame.getViewerPose(xrReferenceSpace);

  uploadVideoTextureIfNeeded();
  gl.bindFramebuffer(gl.FRAMEBUFFER, session.renderState.baseLayer.framebuffer);
  gl.clearColor(0.02, 0.03, 0.05, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (pose) {
    updateFromXRView(pose.views[0]);
    updateWorldHudPosition();
    updateIdleVisibility();
    updateGazeControls();
    for (const view of pose.views) {
      const viewport = session.renderState.baseLayer.getViewport(view);
      gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
      gl.uniformMatrix4fv(locations.matrix, false, multiply(view.projectionMatrix, view.transform.inverse.matrix));
      gl.uniform1f(locations.eye, view.eye === "right" ? 1 : 0);
      gl.uniform1f(locations.sourceLayout, sideBySide ? 1 : 0);
      gl.uniform1f(locations.flipY, videoFlipY ? 1 : 0);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }
  }

  session.requestAnimationFrame(renderXR);
}

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
  const width = Math.floor(canvas.clientWidth * ratio);
  const height = Math.floor(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function shouldRenderPhoneSBS() {
  return headsetMode && sideBySide && !xrSession;
}

function uploadVideoTextureIfNeeded() {
  if (!shouldUploadTexture()) {
    return;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  shouldUploadVideoFrame = false;
  lastUploadedVideoTime = video.currentTime;
}

function startVideoFrameCallbacks() {
  if (videoFrameCallbackStarted || typeof video.requestVideoFrameCallback !== "function") {
    return;
  }

  videoFrameCallbackStarted = true;
  const markFrameReady = () => {
    shouldUploadVideoFrame = true;
    video.requestVideoFrameCallback(markFrameReady);
  };
  video.requestVideoFrameCallback(markFrameReady);
}

function shouldUploadTexture() {
  if (video.readyState < 2) {
    return false;
  }

  if (typeof video.requestVideoFrameCallback === "function") {
    return shouldUploadVideoFrame;
  }

  return video.currentTime !== lastUploadedVideoTime;
}

function scheduleControlsHide() {
  clearTimeout(hideControlsTimer);
  if (motionEnabled && headsetMode) {
    return;
  }

  hideControlsTimer = setTimeout(() => {
    if (!video.paused && controlsVisible) {
      controlsVisible = false;
      controls.classList.add("is-hidden");
    }
  }, 3500);
}

function showControlsForGaze() {
  controlsVisible = true;
  controls.classList.remove("is-hidden");
  clearTimeout(hideControlsTimer);
}

function hideHud() {
  controlsVisible = false;
  controls.classList.add("is-hidden");
  gazePointer.classList.add("is-hidden");
  gazeProgress.style.setProperty("--gaze-progress", "0deg");
  clearGazeTarget();
  clearTimeout(hideControlsTimer);
}

function updatePlayButton() {
  playButton.textContent = video.paused ? "Play" : "Pause";
}

function updateTimeline() {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    seekBar.value = "0";
    timeLabel.textContent = "0:00 / 0:00";
    return;
  }

  if (!isSeeking) {
    seekBar.value = String(Math.round((video.currentTime / duration) * Number(seekBar.max)));
  }
  timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
}

function seekToRatio(ratio) {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  isSeeking = true;
  video.currentTime = clamp(ratio, 0, 1) * duration;
  shouldUploadVideoFrame = true;
  updateTimeline();
  window.setTimeout(() => {
    isSeeking = false;
  }, 150);
}

function updateGazePosition() {
  const xRange = window.innerWidth * 0.34;
  const yRange = window.innerHeight * 0.34;
  gazeX = clamp(window.innerWidth / 2 + normalizeAngle(yaw + dragYaw) * xRange, 18, window.innerWidth - 18);
  gazeY = clamp(window.innerHeight / 2 + (pitch + dragPitch) * yRange, 18, window.innerHeight - 18);
}

function updateGazeControls() {
  if (!motionEnabled) {
    gazePointer.classList.add("is-hidden");
    clearGazeTarget();
    return;
  }

  if (isHeadStill()) {
    gazePointer.classList.add("is-hidden");
    gazeProgress.style.setProperty("--gaze-progress", "0deg");
    clearGazeTarget();
    return;
  }

  displayedGazeX += (gazeX - displayedGazeX) * 0.28;
  displayedGazeY += (gazeY - displayedGazeY) * 0.28;
  gazePointer.classList.remove("is-hidden");
  gazePointer.style.transform = `translate3d(${displayedGazeX}px, ${displayedGazeY}px, 0)`;

  const element = document.elementFromPoint(displayedGazeX, displayedGazeY);
  const target = element?.closest("[data-gaze-action]");
  const now = performance.now();

  if (!target || target.disabled) {
    gazeProgress.style.setProperty("--gaze-progress", "0deg");
    clearGazeTarget();
    return;
  }

  if (target !== gazeTarget) {
    clearGazeTarget();
    gazeTarget = target;
    gazeTarget.classList.add("gaze-target");
    gazeStartedAt = now;
  }

  const progress = clamp((now - gazeStartedAt) / gazeDwellMs, 0, 1);
  gazeProgress.style.setProperty("--gaze-progress", `${Math.round(progress * 360)}deg`);

  if (progress >= 1 && now - lastGazeActionAt > gazeCooldownMs) {
    activateGazeTarget(target);
    lastGazeActionAt = now;
    gazeStartedAt = now;
    gazeProgress.style.setProperty("--gaze-progress", "0deg");
  }
}

function updateFromXRView(view) {
  if (!view?.transform?.matrix) return;

  const matrix = view.transform.matrix;
  const orientation = view.transform.orientation;
  if (orientation) {
    latestXRQuat = [orientation.x, orientation.y, orientation.z, orientation.w];
  } else {
    latestXRQuat = qFromRotationMatrix(matrix);
  }

  const forward = normalizeVector([-matrix[8], -matrix[9], -matrix[10]]);
  yaw = Math.atan2(forward[0], -forward[2]);
  pitch = Math.asin(clamp(forward[1], -1, 1));

  if (Math.abs(normalizeAngle(yaw - lastMotionYaw)) > 0.003 || Math.abs(pitch - lastMotionPitch) > 0.003) {
    lastMotionAt = performance.now();
    lastMotionYaw = yaw;
    lastMotionPitch = pitch;
    showControlsForGaze();
  }

  if (pitch > lookDownThreshold) {
    lastLookDownAt = performance.now();
  }

  updateGazePosition();
}

function updateWorldHudPosition() {
  if (!controlsVisible) return;

  const viewYaw = normalizeAngle(yaw + dragYaw);
  const viewPitch = pitch + dragPitch;
  const horizontalScale = window.innerWidth / degToRad(headsetMode ? 72 : 82);
  const verticalScale = window.innerHeight / degToRad(62);
  const offsetX = -viewYaw * horizontalScale;
  const offsetY = (viewPitch - degToRad(-25)) * verticalScale;
  controls.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
}

function updateIdleVisibility() {
  if (!motionEnabled || !headsetMode || !controlsVisible || !isHeadStill()) {
    return;
  }

  controlsVisible = false;
  controls.classList.add("is-hidden");
  gazePointer.classList.add("is-hidden");
  gazeProgress.style.setProperty("--gaze-progress", "0deg");
  clearGazeTarget();
}

function isHeadStill() {
  return performance.now() - lastMotionAt > hudIdleMs;
}

function activateGazeTarget(target) {
  if (target === seekBar) {
    const rect = seekBar.getBoundingClientRect();
    seekToRatio((displayedGazeX - rect.left) / rect.width);
    return;
  }

  target.click();
}

function clearGazeTarget() {
  if (gazeTarget) {
    gazeTarget.classList.remove("gaze-target");
    gazeTarget = null;
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function makeHalfSphere(longitudes, latitudes, radius) {
  const positions = [];
  const texCoords = [];
  const indices = [];

  for (let lat = 0; lat <= latitudes; lat++) {
    const v = lat / latitudes;
    const phi = -Math.PI / 2 + v * Math.PI;
    for (let lon = 0; lon <= longitudes; lon++) {
      const u = lon / longitudes;
      const theta = -Math.PI / 2 + u * Math.PI;
      positions.push(
        radius * Math.sin(theta) * Math.cos(phi),
        radius * Math.sin(phi),
        -radius * Math.cos(theta) * Math.cos(phi)
      );
      texCoords.push(u, 1 - v);
    }
  }

  const columns = longitudes + 1;
  for (let lat = 0; lat < latitudes; lat++) {
    for (let lon = 0; lon < longitudes; lon++) {
      const topLeft = lat * columns + lon;
      const topRight = topLeft + 1;
      const bottomLeft = (lat + 1) * columns + lon;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  return {
    positions: new Float32Array(positions),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

function makeViewProjection(aspect, viewYaw, viewPitch) {
  const projection = perspective(degToRad(headsetMode ? 92 : 82), aspect, 0.1, 100);
  if (motionEnabled) {
    const dragQuat = qFromYawPitch(dragYaw, dragPitch);
    return multiply(projection, qToViewMatrix(qNormalize(qMultiply(viewQuat, dragQuat))));
  }
  return multiply(projection, lookRotation(viewYaw, viewPitch));
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const rangeInv = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0
  ]);
}

function rotateX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
}

function rotateY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}

function lookRotation(viewYaw, viewPitch) {
  const cp = Math.cos(viewPitch);
  const forward = normalizeVector([
    Math.sin(viewYaw) * cp,
    Math.sin(viewPitch),
    -Math.cos(viewYaw) * cp
  ]);
  const fallbackRight = normalizeVector([Math.cos(viewYaw), 0, Math.sin(viewYaw)]);
  let right = cross(forward, [0, 1, 0]);

  if (length(right) < 0.0001) {
    right = fallbackRight;
  } else {
    right = normalizeVector(right);
  }

  const up = normalizeVector(cross(right, forward));

  return new Float32Array([
    right[0], up[0], -forward[0], 0,
    right[1], up[1], -forward[1], 0,
    right[2], up[2], -forward[2], 0,
    0, 0, 0, 1
  ]);
}

function deviceOrientationQuaternion(alpha, beta, gamma, orient) {
  const eulerQuat = qFromEulerYXZ(beta, alpha, -gamma);
  const correction = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  const screenCorrection = qFromAxisAngle([0, 0, 1], -orient);
  return qNormalize(qMultiply(qMultiply(eulerQuat, correction), screenCorrection));
}

function qFromEulerYXZ(x, y, z) {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);

  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3
  ];
}

function qFromYawPitch(viewYaw, viewPitch) {
  return qNormalize(qMultiply(qFromAxisAngle([0, 1, 0], viewYaw), qFromAxisAngle([1, 0, 0], viewPitch)));
}

function qFromAxisAngle(axis, angle) {
  const half = angle / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function qMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

function qConjugate(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function qNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function rotateVectorByQuat(q, vector) {
  const vectorQuat = [vector[0], vector[1], vector[2], 0];
  const rotated = qMultiply(qMultiply(q, vectorQuat), qConjugate(q));
  return [rotated[0], rotated[1], rotated[2]];
}

function updateAnglesFromQuat() {
  const forward = rotateVectorByQuat(viewQuat, [0, 0, -1]);
  latestYaw = Math.atan2(forward[0], -forward[2]);
  latestPitch = Math.asin(clamp(forward[1], -1, 1));
  yaw = latestYaw;
  pitch = latestPitch;
}

function qToViewMatrix(q) {
  const qi = qConjugate(q);
  const x = qi[0];
  const y = qi[1];
  const z = qi[2];
  const w = qi[3];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return new Float32Array([
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    0, 0, 0, 1
  ]);
}

function qFromRotationMatrix(m) {
  const m11 = m[0];
  const m12 = m[4];
  const m13 = m[8];
  const m21 = m[1];
  const m22 = m[5];
  const m23 = m[9];
  const m31 = m[2];
  const m32 = m[6];
  const m33 = m[10];
  const trace = m11 + m22 + m33;
  let x;
  let y;
  let z;
  let w;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    w = 0.25 / s;
    x = (m32 - m23) * s;
    y = (m13 - m31) * s;
    z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
    w = (m32 - m23) / s;
    x = 0.25 * s;
    y = (m12 + m21) / s;
    z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
    w = (m13 - m31) / s;
    x = (m12 + m21) / s;
    y = 0.25 * s;
    z = (m23 + m32) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
    w = (m21 - m12) / s;
    x = (m13 + m31) / s;
    y = (m23 + m32) / s;
    z = 0.25 * s;
  }

  return qNormalize([x, y, z, w]);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function length(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalizeVector(vector) {
  const vectorLength = length(vector) || 1;
  return [
    vector[0] / vectorLength,
    vector[1] / vectorLength,
    vector[2] / vectorLength
  ];
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function degToRad(value) {
  return value * Math.PI / 180;
}

function normalizeAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}
