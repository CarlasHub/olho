function percentRect(bounds, viewport) {
  if (!bounds || !viewport?.width || !viewport?.height) return null;
  return {
    x: (bounds.x / viewport.width) * 100,
    y: (bounds.y / viewport.height) * 100,
    width: (bounds.width / viewport.width) * 100,
    height: (bounds.height / viewport.height) * 100
  };
}

function boundsUnion(elements = []) {
  const boxes = elements.map((element) => element.bounds).filter(Boolean);
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    right,
    bottom
  };
}

export function inferElementRegion(element, context = {}) {
  const viewport = context.viewport || {};
  const y = element?.bounds?.y ?? 0;
  if (viewport.height > 0) {
    if (y < viewport.height * 0.18) return "Header";
    if (y < viewport.height * 0.55) return "Primary content";
    if (y < viewport.height * 0.82) return "Secondary content";
  }
  return "Lower page";
}

export function elementRegionBounds(element, context = {}) {
  return percentRect(element?.bounds, context.viewport || {});
}

export function inferReviewRegions({ elements = [], viewport = {} } = {}) {
  const header = elements.filter((element) => element.bounds?.y < viewport.height * 0.18);
  const primary = elements.filter(
    (element) => element.bounds?.y >= viewport.height * 0.18 && element.bounds?.y < viewport.height * 0.55
  );
  const secondary = elements.filter(
    (element) => element.bounds?.y >= viewport.height * 0.55 && element.bounds?.y < viewport.height * 0.82
  );

  return [
    { id: "header", label: "Header", bounds: percentRect(boundsUnion(header), viewport), elementCount: header.length },
    {
      id: "primary-content",
      label: "Primary content",
      bounds: percentRect(boundsUnion(primary), viewport),
      elementCount: primary.length
    },
    {
      id: "secondary-content",
      label: "Secondary content",
      bounds: percentRect(boundsUnion(secondary), viewport),
      elementCount: secondary.length
    }
  ].filter((region) => region.elementCount > 0);
}

export function aboveFoldElements(context = {}) {
  const height = context.viewport?.height || context.image?.height || 0;
  if (!height) return [];
  return context.elements.filter((element) => element.bounds && element.bounds.y < height * 0.72);
}
