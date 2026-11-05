// 地金が地金を映す：反射の光線を指輪の形（BVH）に当てて、当たれば、そこに映る光を読む。
// 内側の面に向こう側の腕が映り、爪と石座の間に金が重なって、深みが出る（環境の絵だけでは出ない）。
// 重いので、見せるの中で「細かく」を選んだときだけ使う（このファイルは、そのとき初めて読み込む）。
import * as THREE from "three";
import { BVHShaderGLSL, CENTER, FloatVertexAttributeTexture, MeshBVH, MeshBVHUniformStruct } from "three-mesh-bvh";

const TRACE_FN = /* glsl */ `
  precision highp isampler2D;
  precision highp usampler2D;
  ${BVHShaderGLSL.common_functions}
  ${BVHShaderGLSL.bvh_struct_definitions}
  ${BVHShaderGLSL.bvh_ray_functions}
  uniform BVH uBvh;
  uniform sampler2D uBvhNormal;
  uniform vec3 uTint;
  varying vec3 vLocal;
  vec3 envAt(vec3 d, float roughness) { return textureLod(envMap, envMapRotation * d, roughnessToMip(roughness)).rgb * envMapIntensity; }
  vec3 traceMetal(const in vec3 viewDir, const in vec3 normal, const in float roughness) {
    vec3 d = normalize(transformDirectionByInverseViewMatrix(reflect(-viewDir, normal), viewMatrix));
    vec3 n = normalize(transformDirectionByInverseViewMatrix(normal, viewMatrix));
    vec3 o = vLocal + n * 0.006;
    vec3 tint = vec3(1.0);
    for (int i = 0; i < 2; i++) {
      uvec4 fi; vec3 fn; vec3 bc; float side; float dist;
      if (!bvhIntersectFirstHit(uBvh, o, d, fi, fn, bc, side, dist) || dist < 0.02) return tint * envAt(d, roughness);
      vec3 n2 = normalize(textureSampleBarycoord(uBvhNormal, bc, fi.xyz).xyz);
      if (dot(n2, d) > 0.0) n2 = -n2;
      o += d * dist + n2 * 0.006;
      d = reflect(d, n2);
      tint *= uTint;
    }
    return tint * envAt(d, roughness);
  }
`;

export class MetalTrace {
  readonly uniforms = {
    uBvh: { value: new MeshBVHUniformStruct() },
    uBvhNormal: { value: new FloatVertexAttributeTexture() },
    uTint: { value: new THREE.Color(1, 1, 1) },
  };

  /** 地金の形（位置と向きの付いた三角形の並び）から BVH を作る。どの形も、同じ場所に置いてあること */
  setGeometry(parts: THREE.BufferGeometry[]) {
    let points = 0;
    for (const g of parts) points += g.getAttribute("position").count;
    const pos = new Float32Array(points * 3);
    const nor = new Float32Array(points * 3);
    let k = 0;
    for (const g of parts) {
      const p = g.getAttribute("position").array as Float32Array;
      const n = g.getAttribute("normal").array as Float32Array;
      pos.set(p, k);
      nor.set(n, k);
      k += p.length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    const bvh = new MeshBVH(geo, { strategy: CENTER, maxLeafSize: 6 });
    this.uniforms.uBvh.value.updateFrom(bvh);
    this.uniforms.uBvhNormal.value.updateFrom(geo.getAttribute("normal") as THREE.BufferAttribute);
    geo.dispose();
  }

  /** 地金の材質に、光線を追う処理を足す・外す */
  set(mat: THREE.MeshPhysicalMaterial, on: boolean) {
    if (!!mat.userData.traced === on) return;
    mat.userData.traced = on;
    mat.needsUpdate = true;
    if (!on) {
      mat.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
      mat.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey;
      return;
    }
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLocal;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <envmap_physical_pars_fragment>", `#include <envmap_physical_pars_fragment>\n${TRACE_FN}`)
        .replace("#include <lights_fragment_maps>", THREE.ShaderChunk.lights_fragment_maps.replace("vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );", "vec3 iblRadiance = traceMetal( geometryViewDir, geometryNormal, material.roughness );"));
    };
    mat.customProgramCacheKey = () => "metal-trace";
  }
}
