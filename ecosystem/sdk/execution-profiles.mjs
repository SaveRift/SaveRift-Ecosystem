// SPDX-License-Identifier: Apache-2.0
// Trusted-host policy only. No manifest, MCP input or serialized object can
// manufacture one of these capabilities. Pin the reviewed immutable artifact.
import {fail} from './contracts.mjs';
const profiles = new WeakMap();
const DEFAULT = Object.freeze({id: 'default', maxPhaseMs: 10000, maxJobWallMs: 60000});
export function createReviewedLargeSaveProfile({packageDigest, profile='developer-large-save-v1'} = {}) {
  if (typeof packageDigest !== 'string' || !/^[a-f0-9]{64}$/.test(packageDigest)) fail('EXECUTION_PROFILE_INVALID', 'A reviewed immutable package digest is required.');
  if (!['developer-large-save-v1','developer-large-save-v2'].includes(profile)) fail('EXECUTION_PROFILE_INVALID', 'Select a fixed reviewed developer profile.');
  const token = Object.freeze(Object.create(null));
  profiles.set(token, Object.freeze({id: profile, packageDigest, maxPhaseMs: 30000, maxJobWallMs: 90000,...(profile==='developer-large-save-v2'?{maxJobHostCalls:8192}:{})}));
  return token;
}
export function executionProfile(token, recomputedPackageDigest) {
  if (token === undefined) return DEFAULT;
  const profile = token && typeof token === 'object' ? profiles.get(token) : undefined;
  if (!profile || profile.packageDigest !== recomputedPackageDigest) fail('EXECUTION_PROFILE_DENIED', 'The trusted execution profile does not match this immutable package.');
  return profile;
}
