function rounded(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

export function componentSignature(element) {
  const style = element?.style || {};
  return {
    fontSize: rounded(style.fontSize),
    fontFamily: String(style.fontFamily || "").toLowerCase(),
    radius: rounded(style.borderRadius),
    shadow: String(style.boxShadow || "none").replace(/\s+/g, " ").trim().toLowerCase(),
    backgroundColor: String(style.backgroundColor || "").toLowerCase(),
    color: String(style.color || "").toLowerCase(),
    borderColor: String(style.borderColor || "").toLowerCase()
  };
}

export function signatureDistance(a, b) {
  const first = componentSignature(a);
  const second = componentSignature(b);
  let distance = 0;
  if (Math.abs(first.fontSize - second.fontSize) > 2) distance += 1;
  if (first.fontFamily && second.fontFamily && first.fontFamily !== second.fontFamily) distance += 1;
  if (Math.abs(first.radius - second.radius) > 3) distance += 1;
  if (first.shadow !== second.shadow) distance += 1;
  if (first.backgroundColor && second.backgroundColor && first.backgroundColor !== second.backgroundColor) distance += 1;
  if (first.color && second.color && first.color !== second.color) distance += 1;
  return distance;
}

export function inconsistentSignaturePairs(elements = [], threshold = 3) {
  const pairs = [];
  for (let a = 0; a < elements.length; a += 1) {
    for (let b = a + 1; b < elements.length; b += 1) {
      const distance = signatureDistance(elements[a], elements[b]);
      if (distance >= threshold) {
        pairs.push({ first: elements[a], second: elements[b], distance });
      }
    }
  }
  return pairs;
}
