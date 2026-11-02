// SPDX-License-Identifier: Apache-2.0
// Trusted-host policy only. No manifest, MCP input or serialized object can
// manufacture one of these capabilities. Pin the reviewed immutable artifact.
import {fail} from './contracts.mjs';
const profiles = new WeakMap();
const DEFAULT = Object.freeze({id: 'default', maxPhaseMs: 10000, maxJobWallMs: 60000});
export function createReviewedLargeSaveProfile({packageDigest} = {}) {
  if (typeof packageDigest !== 'string' || !/^[a-f0-9]{64}$/.test(packageDigest)) fail('EXECUTION_PROFILE_INVALID', 'A reviewed immutable package digest is required.');
  const token = Object.freeze(Object.create(null));
  profiles.set(token, Object.freeze({id: 'developer-large-save-v1', packageDigest, maxPhaseMs: 30000, maxJobWallMs: 90000}));
  return token;
}
export function executionProfile(token, recomputedPackageDigest) {
  if (token === undefined) return DEFAULT;
  const profile = token && typeof token === 'object' ? profiles.get(token) : undefined;
  if (!profile || profile.packageDigest !== recomputedPackageDigest) fail('EXECUTION_PROFILE_DENIED', 'The trusted execution profile does not match this immutable package.');
  return profile;
}
