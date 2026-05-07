function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, numberOrZero(value)));
}

export function clampRect(rect = {}) {
  const x = clampPercent(rect.x);
  const y = clampPercent(rect.y);
  const maxWidth = 100 - x;
  const maxHeight = 100 - y;

  return {
    x,
    y,
    width: Math.min(maxWidth, Math.max(0, numberOrZero(rect.width))),
    height: Math.min(maxHeight, Math.max(0, numberOrZero(rect.height)))
  };
}

export function rectToPercent(rect = {}, imageSize = {}) {
  const width = numberOrZero(imageSize.width);
  const height = numberOrZero(imageSize.height);
  if (width <= 0 || height <= 0) {
    return clampRect(rect);
  }

  return clampRect({
    x: (numberOrZero(rect.x) / width) * 100,
    y: (numberOrZero(rect.y) / height) * 100,
    width: (numberOrZero(rect.width) / width) * 100,
    height: (numberOrZero(rect.height) / height) * 100
  });
}
