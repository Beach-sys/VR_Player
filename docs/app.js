const canvas = document.getElementById("stage");
const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
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
const flipButton = document.getElementById("flipButton");
const seekBar = document.getElementById("seekBar");
const timeLabel = document.getElementById("timeLabel");
const installPrompt = document.getElementById("installPrompt");
const closeInstallPrompt = document.getElementById("closeInstallPrompt");
const gazePointer = document.getElementById("gazePointer");
const gazeProgress = document.getElementById("gazeProgress");

let headsetMode = true;
let sideBySide = true;
let videoFlipY = true;
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
let dragging = false;
let lastPointer = { x: 0, y: 0 };
let hideControlsTimer = 0;
let shouldUploadVideoFrame = true;
let videoFrameCallbackStarted = false;
let lastUploadedVideoTime = -1;
let gazeX = window.innerWidth / 2;
let gazeY = window.innerHeight / 2;
let gazeTarget = null;
let gazeStartedAt = 0;
let lastGazeActionAt = 0;
let isSeeking = false;

const gazeDwellMs = 900;
const gazeCooldownMs = 650;

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
uniform float uSideBySide;
uniform float uFlipY;
varying vec2 vTexCoord;
void main() {
  vec2 uv = vTexCoord;
  if (uSideBySide > 0.5) {
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
  sideBySide: gl.getUniformLocation(program, "uSideBySide"),
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
  headsetMode = !headsetMode;
  headsetButton.classList.toggle("is-active", headsetMode);
});
formatButton.addEventListener("click", () => {
  sideBySide = !sideBySide;
  formatButton.classList.toggle("is-active", sideBySide);
  formatButton.textContent = sideBySide ? "SBS 3D" : "Mono";
});
flipButton.addEventListener("click", () => {
  videoFlipY = !videoFlipY;
  flipButton.classList.toggle("is-active", videoFlipY);
  flipButton.textContent = videoFlipY ? "Flip On" : "Flip Off";
});
recenterButton.addEventListener("click", recenter);
fullscreenButton.addEventListener("click", enterFullscreen);
closeInstallPrompt.addEventListener("click", () => {
  installPrompt.classList.add("is-hidden");
});

seekBar.addEventListener("input", () => {
  seekToRatio(Number(seekBar.value) / Number(seekBar.max));
});

canvas.addEventListener("click", () => {
  controlsVisible = !controlsVisible;
  controls.classList.toggle("is-hidden", !controlsVisible);
  scheduleControlsHide();
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
  dragPitch = clamp(dragPitch - dy * 0.004, -Math.PI / 2, Math.PI / 2);
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
  updatePlayButton();
  updateTimeline();
  scheduleControlsHide();
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
    recenter();
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

  latestYaw = alpha;
  if (Math.abs(orientation) === 90) {
    latestPitch = clamp(gamma, -Math.PI / 2, Math.PI / 2);
  } else {
    latestPitch = clamp(beta - Math.PI / 2, -Math.PI / 2, Math.PI / 2);
  }

  yaw = normalizeAngle(latestYaw - centerYaw);
  pitch = latestPitch - centerPitch;
  updateGazePosition();
}

function recenter() {
  centerYaw = latestYaw;
  centerPitch = latestPitch;
  dragYaw = 0;
  dragPitch = 0;
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
  resize();
  updateGazeControls();
  updateTimeline();
  if (shouldUploadTexture()) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    shouldUploadVideoFrame = false;
    lastUploadedVideoTime = video.currentTime;
  }

  gl.clearColor(0.02, 0.03, 0.05, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const eyes = headsetMode ? 2 : 1;
  const eyeWidth = canvas.width / eyes;

  for (let eye = 0; eye < eyes; eye++) {
    const x = eye * eyeWidth;
    gl.viewport(x, 0, eyeWidth, canvas.height);
    const aspect = eyeWidth / canvas.height;
    const matrix = makeViewProjection(aspect, yaw + dragYaw, pitch + dragPitch);
    gl.uniformMatrix4fv(locations.matrix, false, matrix);
    gl.uniform1f(locations.eye, eyes === 2 ? eye : 0);
    gl.uniform1f(locations.sideBySide, sideBySide ? 1 : 0);
    gl.uniform1f(locations.flipY, videoFlipY ? 1 : 0);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  requestAnimationFrame(render);
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
  gazeX = clamp(window.innerWidth / 2 + normalizeAngle(yaw) * xRange, 18, window.innerWidth - 18);
  gazeY = clamp(window.innerHeight / 2 + pitch * yRange, 18, window.innerHeight - 18);
}

function updateGazeControls() {
  if (!motionEnabled || !controlsVisible) {
    gazePointer.classList.add("is-hidden");
    clearGazeTarget();
    return;
  }

  gazePointer.classList.remove("is-hidden");
  gazePointer.style.transform = `translate3d(${gazeX}px, ${gazeY}px, 0)`;

  const element = document.elementFromPoint(gazeX, gazeY);
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

function activateGazeTarget(target) {
  if (target === seekBar) {
    const rect = seekBar.getBoundingClientRect();
    seekToRatio((gazeX - rect.left) / rect.width);
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
  const rotation = multiply(rotateX(-viewPitch), rotateY(-viewYaw));
  return multiply(projection, rotation);
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
