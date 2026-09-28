import type * as THREE from 'three'

type DetailOptions = {
  /** Noise frequency per object-space unit for the largest octave. */
  scale: number
  /** How strongly the detail darkens and lightens the base color. */
  color: number
  /** How strongly the detail tilts the surface normal. */
  relief: number
}

// Fine rock and dust detail added in the shader, so a surface stays sharp when zoomed in without a
// bigger texture. Octaves fade out once they get smaller than a pixel, which keeps it from shimmering.
export function addSurfaceDetail(material: THREE.MeshStandardMaterial, { scale, color, relief }: DetailOptions) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObjPos;
        float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float dNoise(vec3 x) {
          vec3 i = floor(x), f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float surfaceDetail(vec3 p) {
          float footprint = length(fwidth(p));
          float sum = 0.0, amp = 0.5, freq = ${scale.toFixed(3)};
          for (int i = 0; i < 6; i++) {
            float n = dNoise(p * freq);
            // Mix smooth and ridged noise for a rocky, wind-carved look
            n = mix(n, 1.0 - abs(n * 2.0 - 1.0), 0.45);
            sum += amp * (n - 0.5) * (1.0 - smoothstep(0.15, 0.45, freq * footprint));
            freq *= 2.1; amp *= 0.55;
          }
          return sum;
        }
        float detailH;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        detailH = surfaceDetail(vObjPos);
        diffuseColor.rgb *= 1.0 + detailH * ${color.toFixed(3)};`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dFdx(detailH) * r1 + dFdy(detailH) * r2);
          normal = normalize(abs(det) * normal - ${relief.toFixed(4)} * grad);
        }`,
      )
  }
}
