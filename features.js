// Optional parts of the game a build can leave out, listed on <html data-features="..."> by scripts/build-portal.mjs
// (the Android app: `node scripts/build-portal.mjs app --features=online`). With no data-features at all (the website
// and every other portal) nothing is left out, so they play exactly as before.
export const featureNames = ['stages', 'daily', 'online'];

export function readFeatures(attribute) {
  if (attribute === undefined || attribute === null) return Object.fromEntries(featureNames.map(name => [name, true]));
  const listed = new Set(String(attribute).toLowerCase().split(/[\s,]+/).filter(Boolean));
  return Object.fromEntries(featureNames.map(name => [name, listed.has(name)]));
}

export const features = readFeatures(globalThis.document?.documentElement?.dataset?.features);
