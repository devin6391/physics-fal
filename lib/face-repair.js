// Reference-guided luma repair. Vision supplies landmarks, while the original
// frame supplies motion, lighting, and the protected eyes and mouth.
const FEATURES = ["contour", "left_eye", "right_eye", "left_brow", "right_brow", "nose", "outer_lips"];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (value) => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

export const usableFace = (face) => face.contour.length === 17 && FEATURES.every((key) => face[key].length);

function meanPoint(points) {
  const total = points.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
  return total.map((value) => value / points.length);
}

function faceGeometry(face) {
  const eyes = [meanPoint(face.left_eye), meanPoint(face.right_eye)].sort((a, b) => a[0] - b[0]);
  const center = meanPoint(eyes);
  const dx = eyes[1][0] - eyes[0][0];
  const dy = eyes[1][1] - eyes[0][1];
  const distance = Math.hypot(dx, dy);
  const across = [dx / Math.max(distance, 1e-8), dy / Math.max(distance, 1e-8)];
  const projected = face.contour.map(([x, y]) => x * across[0] + y * across[1]);
  const width = Math.max(...projected) - Math.min(...projected);
  return { center, eyes, distance, across, width };
}

function fromAxes({ center, across: [ax, ay], distance }, x, y) {
  return [center[0] + distance * (x * ax - y * ay), center[1] + distance * (x * ay + y * ax)];
}

function anchors(face, geometry) {
  const stride = (points, every) => points.filter((_, index) => index % every === 0);
  return [...stride(face.contour, 2), meanPoint(face.left_eye), meanPoint(face.right_eye),
    ...stride(face.left_brow, 2), ...stride(face.right_brow, 2), ...stride(face.nose, 2),
    ...stride(face.outer_lips, 3), fromAxes(geometry, -.72, -.75), fromAxes(geometry, 0, -.98),
    fromAxes(geometry, .72, -.75)];
}

function normalize(points, { center, width }) {
  return points.map(([x, y]) => [(x - center[0]) / width, (y - center[1]) / width]);
}

function boxBlur(values, width, height, radius) {
  const horizontal = new Float64Array(values.length);
  const output = new Float64Array(values.length);
  const size = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    const at = (x) => values[offset + clamp(x, 0, width - 1)];
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += at(x);
    for (let x = 0; x < width; x++) {
      horizontal[offset + x] = sum / size;
      sum += at(x + radius + 1) - at(x - radius);
    }
  }
  for (let x = 0; x < width; x++) {
    const at = (y) => horizontal[clamp(y, 0, height - 1) * width + x];
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += at(y);
    for (let y = 0; y < height; y++) {
      output[y * width + x] = sum / size;
      sum += at(y + radius + 1) - at(y - radius);
    }
  }
  return output;
}

function bilinear(values, width, height, px, py) {
  const x = clamp(px, 0, width - 1), y = clamp(py, 0, height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const dx = x - x0, dy = y - y0;
  return (values[y0 * width + x0] * (1 - dx) + values[y0 * width + x1] * dx) * (1 - dy)
    + (values[y1 * width + x0] * (1 - dx) + values[y1 * width + x1] * dx) * dy;
}

const kernel = (radiusSquared) => .5 * radiusSquared * Math.log(Math.max(radiusSquared, 1e-10));

// Solve the regularized thin-plate spline for both portrait coordinates.
function fitWarp(points, targets) {
  const count = points.length;
  const size = count + 3;
  const matrix = Array.from({ length: size }, () => new Float64Array(size + 2));
  points.forEach(([x, y], row) => {
    points.forEach(([px, py], col) => {
      matrix[row][col] = kernel((x - px) ** 2 + (y - py) ** 2) + (row === col ? .002 : 0);
    });
    [1, x, y].forEach((value, i) => {
      matrix[row][count + i] = value;
      matrix[count + i][row] = value;
    });
    matrix[row].set(targets[row], size);
  });
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-10) return null;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const divisor = matrix[col][col];
    for (let i = col; i < size + 2; i++) matrix[col][i] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let i = col; i < size + 2; i++) matrix[row][i] -= factor * matrix[col][i];
    }
  }
  const coeff = matrix.map((row) => row.slice(size));
  return (x, y) => {
    let u = coeff[count][0] + x * coeff[count + 1][0] + y * coeff[count + 2][0];
    let v = coeff[count][1] + x * coeff[count + 1][1] + y * coeff[count + 2][1];
    points.forEach(([px, py], i) => {
      const radial = kernel((x - px) ** 2 + (y - py) ** 2);
      u += radial * coeff[i][0];
      v += radial * coeff[i][1];
    });
    return [u, v];
  };
}

function polygonMask(x, y, vertices) {
  let inside = false, closest = Infinity;
  vertices.forEach(([px, py], i) => {
    const [qx, qy] = vertices[(i + 1) % vertices.length];
    const dx = qx - px, dy = qy - py;
    if ((py > y) !== (qy > y) && x < (y - py) * dx / dy + px) inside = !inside;
    const along = clamp(((x - px) * dx + (y - py) * dy) / Math.max(dx * dx + dy * dy, 1e-8), 0, 1);
    closest = Math.min(closest, (x - px - along * dx) ** 2 + (y - py - along * dy) ** 2);
  });
  return inside ? smooth(Math.sqrt(closest) / 4) : 0;
}

function protectFeature(x, y, [cx, cy], [ax, ay], width, height) {
  const dx = x - cx, dy = y - cy;
  return smooth((Math.hypot((dx * ax + dy * ay) / width, (-dx * ay + dy * ax) / height) - .75) / .52);
}

function median(values) {
  values.sort((a, b) => a - b);
  return (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
}

export function preparePortrait(rgb, width, height, face, fullRange) {
  const black = fullRange ? 0 : 16;
  const span = fullRange ? 255 : 219;
  const geometry = faceGeometry(face);
  if (geometry.width < 40 || geometry.distance < 15) throw new Error("The reference face is too small for this repair.");
  if (rgb.length !== width * height * 3) throw new Error("Incomplete decoded reference image.");
  const luma = new Float64Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    luma[i] = black + span * (.2126 * rgb[3 * i] + .7152 * rgb[3 * i + 1] + .0722 * rgb[3 * i + 2]) / 255;
  }
  const blur = boxBlur(luma, width, height, Math.max(2, Math.floor(geometry.width * .165)));
  return { width, height, black, span, luma, detail: luma.map((value, i) => value - blur[i]), geometry,
    anchors: normalize(anchors(face, geometry), geometry) };
}

export function repairFace(frame, frameWidth, frameHeight, face, portrait, strength, protectSide) {
  const geometry = faceGeometry(face);
  const { width, distance, center, eyes, across: [ax, ay] } = geometry;
  if (width < 40 || distance < 15 || strength <= 0) return false;
  const points = normalize(anchors(face, geometry), geometry);
  if (points.length !== portrait.anchors.length) return false;
  const map = fitWarp(points, portrait.anchors);
  if (!map) return false;
  const contour = face.contour[0][0] < face.contour.at(-1)[0] ? [...face.contour].reverse() : face.contour;
  const polygon = [...contour, fromAxes(geometry, -.70, -.99), fromAxes(geometry, .70, -.99)];
  const xs = polygon.map(([x]) => x), ys = polygon.map(([, y]) => y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 4), y0 = Math.max(0, Math.floor(Math.min(...ys)) - 4);
  const x1 = Math.min(frameWidth, Math.ceil(Math.max(...xs)) + 5), y1 = Math.min(frameHeight, Math.ceil(Math.max(...ys)) + 5);
  if (x1 <= x0 || y1 <= y0) return false;
  const patchWidth = x1 - x0, patchHeight = y1 - y0;
  const old = new Float64Array(patchWidth * patchHeight);
  for (let row = 0; row < patchHeight; row++) {
    const offset = (y0 + row) * frameWidth + x0;
    old.set(frame.subarray(offset, offset + patchWidth), row * patchWidth);
  }
  const blurred = boxBlur(old, patchWidth, patchHeight, Math.max(2, Math.floor(width * .155)));
  const mask = new Float64Array(old.length);
  const referenceLuma = new Float64Array(old.length);
  const structure = new Float64Array(old.length);
  const qualifiedReference = [], qualifiedOriginal = [];
  const mouth = meanPoint(face.outer_lips), nose = meanPoint(face.nose);
  const { black, span } = portrait;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y - y0) * patchWidth + x - x0;
      const valid = polygonMask(x, y, polygon);
      if (!valid) continue;
      let protection = protectFeature(x, y, mouth, geometry.across, .23 * width, .13 * width);
      for (const eye of eyes) protection *= protectFeature(x, y, eye, geometry.across, .14 * width, .105 * width);
      if (protectSide) {
        const across = (x - nose[0]) * ax + (y - nose[1]) * ay;
        const sign = protectSide === "left" ? 1 : -1;
        protection *= .27 + .73 * smooth((sign * across + .37 * width) / (.24 * width));
      }
      if (!protection) continue;
      const [u, v] = map((x - center[0]) / width, (y - center[1]) / width);
      const px = u * portrait.geometry.width + portrait.geometry.center[0];
      const py = v * portrait.geometry.width + portrait.geometry.center[1];
      const photo = bilinear(portrait.luma, portrait.width, portrait.height, px, py);
      const photoDetail = bilinear(portrait.detail, portrait.width, portrait.height, px, py);
      const skin = smooth((photo - black - .137 * span) / (.183 * span));
      const exposure = .70 + .32 * smooth((old[i] - black - .096 * span) / (.274 * span));
      mask[i] = strength * valid * skin * protection * smooth((old[i] - black - .045 * span) / (.10 * span));
      referenceLuma[i] = photo;
      structure[i] = photoDetail * exposure - (old[i] - blurred[i]);
      if (valid > .8 && skin > .7 && protection > .72 && old[i] > black + .11 * span) {
        qualifiedReference.push(photo);
        qualifiedOriginal.push(old[i]);
      }
    }
  }
  const useTone = qualifiedReference.length > 32;
  const referenceMid = useTone ? median(qualifiedReference) : 0;
  const sourceMid = useTone ? median(qualifiedOriginal) : 0;
  let changed = false;
  for (let i = 0; i < old.length; i++) {
    if (!mask[i]) continue;
    const tonal = useTone ? clamp((referenceLuma[i] - referenceMid) * .67 + sourceMid - old[i], -21, 21) : 0;
    const corrected = Math.round(clamp(old[i] + mask[i] * clamp(.77 * structure[i] + .23 * tonal, -24, 24), 0, 255));
    if (corrected !== old[i]) {
      frame[(y0 + Math.floor(i / patchWidth)) * frameWidth + x0 + i % patchWidth] = corrected;
      changed = true;
    }
  }
  return changed;
}

export function trackedStrength(tracked, index, strength, yaw) {
  const neighbors = [-2, -1, 1, 2].filter((offset) => tracked.has(index + offset)).length;
  return strength * neighbors / 4 * (1 - .55 * smooth(Math.abs(yaw) / 1.05));
}
