import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls, Float } from '@react-three/drei';
import * as THREE from 'three';

export interface BookSpec {
  /** Dimensions in inches (used as a 1:1 scale ratio in scene units / 4). */
  widthIn: number;
  heightIn: number;
  /** Spine thickness derived from page count (1 page ≈ 0.0035"). */
  pageCount: number;
  /** Hex color for the cover. */
  coverColor: string;
  /** Page paper color. */
  pageColor: string;
  /** Foil overlay shimmer (0 = none, 1 = full holo). */
  foilIntensity: number;
  /** Lamination gloss (0 = uncoated, 1 = high gloss). */
  laminationGloss: number;
  /** Optional cover image URL. */
  coverImageUrl?: string | null;
}

const BASE = 0.5;  // scene scale per inch

function Book({ spec }: { spec: BookSpec }) {
  const ref = useRef<THREE.Group>(null);
  const w = spec.widthIn * BASE;
  const h = spec.heightIn * BASE;
  const t = Math.max(0.05, spec.pageCount * 0.0035 * BASE * 4); // thickness ratio amplified for visibility

  // Slow idle rotation
  useFrame((_state, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.18;
  });

  const coverMaterialProps = {
    color: spec.coverColor,
    metalness: 0.05 + spec.foilIntensity * 0.85,
    roughness: 0.55 - spec.laminationGloss * 0.45 - spec.foilIntensity * 0.2,
    emissive: spec.foilIntensity > 0.1 ? new THREE.Color(spec.coverColor).multiplyScalar(0.2 * spec.foilIntensity) : new THREE.Color(0, 0, 0),
    envMapIntensity: 1 + spec.foilIntensity * 1.5,
  };

  return (
    <group ref={ref}>
      {/* Pages (interior block) — slightly inset from cover */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.97, h * 0.97, t * 0.92]} />
        <meshStandardMaterial color={spec.pageColor} roughness={0.95} />
      </mesh>

      {/* Cover (back) */}
      <mesh position={[0, 0, -t / 2 - 0.005]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.01]} />
        <meshStandardMaterial {...coverMaterialProps} />
      </mesh>

      {/* Cover (front) */}
      <mesh position={[0, 0, t / 2 + 0.005]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.01]} />
        <meshStandardMaterial {...coverMaterialProps} />
      </mesh>

      {/* Spine */}
      <mesh position={[-w / 2 - 0.005, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.01, h, t]} />
        <meshStandardMaterial {...coverMaterialProps} />
      </mesh>

      {/* Top edge, bottom edge, fore-edge — page block sides */}
      <mesh position={[w / 2 - 0.005, 0, 0]}>
        <boxGeometry args={[0.005, h * 0.97, t * 0.92]} />
        <meshStandardMaterial color={spec.pageColor} roughness={0.95} />
      </mesh>
    </group>
  );
}

export function BookPreview3D({ spec }: { spec: BookSpec }) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 360, background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: 16, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [3.5, 2, 5.2], fov: 38 }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[4, 6, 5]}
          intensity={1.4}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-3, 2, -3]} intensity={0.4} color="#80a4ff" />

        <Suspense fallback={null}>
          <Float floatIntensity={0.5} rotationIntensity={0.3} speed={1.2}>
            <Book spec={spec} />
          </Float>
          <Environment preset="city" />
        </Suspense>

        <ContactShadows
          position={[0, -2.2, 0]}
          opacity={0.45}
          scale={10}
          blur={2.5}
          far={4}
        />

        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={3}
          maxDistance={9}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.7}
        />
      </Canvas>
    </div>
  );
}
