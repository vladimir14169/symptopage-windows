// Brand integration point. See docs/FRONTEND_INTEGRATION.md → "Brand assets".
//
// STATUS: the official SymptoPage logo has NOT been delivered yet. Until it is,
// the app shows the text name only — no placeholder or generated logo.
//
// To connect the logo:
//   1. Put an SVG (preferred) or a PNG of at least 512×512 px in ui/brand/
//      (e.g. ui/brand/logo.svg) and record its source and licence in NOTICE.md.
//   2. Set `logo` below to the file name, and `logoAspect` to width / height.
//   3. Regenerate assets/icon.ico + assets/icon.png (scripts/brand-icons.md).
// The UI keeps the aspect ratio and never upscales a raster beyond its size.
export const brand = {
  name: "SymptoPage",
  logo: null, // e.g. "logo.svg"
  logoAspect: 1,
  logoMaxHeight: 40, // px in the sidebar; the About screen uses 96
};
