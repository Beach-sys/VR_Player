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

let headsetMode = true;
let sideBySide = true;
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
varying vec2 vTexCoord;
void main() {
  vec2 uv = vTexCoord;
  if (uSideBySide > 0.5) {
    uv.x = uv.x * 0.5 + uEye * 0.5;
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
  sideBySide: gl.getUniformLocation(program, "uSideBySide")
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
recenterButton.addEventListener("click", recenter);
fullscreenButton.addEventListener("click", enterFullscreen);

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
window.addEventListener("resize", resize);
resize();
requestAnimationFrame(render);

function openVideo(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  video.src = url;
  video.loop = false;
  video.muted = false;
  video.play();
  fileName.textContent = file.name;
  emptyState.classList.add("is-hidden");
  controls.classList.remove("is-hidden");
  controlsVisible = true;
  updatePlayButton();
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
    latestPitch = clamp(-gamma, -Math.PI / 2, Math.PI / 2);
  } else {
    latestPitch = clamp(beta - Math.PI / 2, -Math.PI / 2, Math.PI / 2);
  }

  yaw = latestYaw - centerYaw;
  pitch = latestPitch - centerPitch;
}

function recenter() {
  centerYaw = latestYaw;
  centerPitch = latestPitch;
  dragYaw = 0;
  dragPitch = 0;
}

function enterFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  if (canvas.requestFullscreen) {
    canvas.requestFullscreen();
  } else {
    document.body.classList.add("standalone-hint");
  }
}

function render() {
  resize();
  if (video.readyState >= 2) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
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
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  requestAnimationFrame(render);
}

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(canvas.clientWidth * ratio);
  const height = Math.floor(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function scheduleControlsHide() {
  clearTimeout(hideControlsTimer);
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
