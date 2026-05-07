export const REVIEW_CATEGORY_REGISTRY = Object.freeze({
  "visual-hierarchy": {
    label: "Visual hierarchy",
    description: "Priority, emphasis, grouping, and scan path."
  },
  ux: {
    label: "UX",
    description: "Clarity, decision effort, workflow comprehension, and interaction expectations."
  },
  "accessibility-visible": {
    label: "Visible accessibility",
    description: "Accessibility risks visible from the screenshot, including contrast, target clarity, and focus affordance."
  },
  "design-system": {
    label: "Design system",
    description: "Component consistency, token consistency, spacing rhythm, and pattern reuse."
  },
  "enterprise-polish": {
    label: "Enterprise polish",
    description: "Professional finish, information density, trust cues, and production readiness."
  },
  "responsive-layout": {
    label: "Responsive layout",
    description: "Viewport fit, wrapping, overflow, alignment, and breakpoint resilience."
  }
});

export function categoryLabel(category) {
  return REVIEW_CATEGORY_REGISTRY[category]?.label || category;
}
