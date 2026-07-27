// Map dimensions, split out from usmap.ts so importing them doesn't drag the
// 1.5 MB TopoJSON into a bundle that only needs two numbers.
//
// us-atlas ships pre-fitted to this box; keeping it avoids re-fitting the
// projection. Anything that draws the map must use the same values, or outlines
// and pins stop agreeing.
export const MAP_WIDTH = 975
export const MAP_HEIGHT = 610
