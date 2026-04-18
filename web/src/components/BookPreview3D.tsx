import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls, Float } from '@react-three/drei';
import * as THREE from 'three';

export type PaperStyle = 'uncoated' | 'matte' | 'gloss' | 'foil' | 'uv';

export interface BookSpec {
  /** Dimensions in inches. */
  widthIn: number;
  heightIn: number;
  /** Spine thickness derived from page count. */
  pageCount: number;
  /** Style applied to the cover material + procedural texture. */
  paperStyle: PaperStyle;
  /** Hex color for the cover background. */
  coverColor: string;
  /** Page paper color. */
  pageColor: string;
  /** Whether the cover has foil overlay (gold shimmer). */
  hasFoil: boolean;
  /** Title text painted on the front cover. */
  title?: string;
  /** Subtitle / volume painted below the title. */
  subtitle?: string;
}

const SCALE = 0.5;  // scene units per inch

/** Build a procedural cover image to use as the front-face texture. */
function buildCoverCanvas(spec: BookSpec): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;

  // Base fill with a vertical gradient suggesting the paper sheen.
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  const base = spec.coverColor;
  grad.addColorStop(0, lighten(base, 0.12));
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, darken(base, 0.18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Per-style texture overlay.
  if (spec.paperStyle === 'uncoated') {
    // Subtle paper grain — small noise dots
    paintGrain(ctx, canvas, 1800, 0.04);
  } else if (spec.paperStyle === 'matte') {
    // Slight noise + flatter look
    paintGrain(ctx, canvas, 600, 0.025);
  } else if (spec.paperStyle === 'gloss') {
    // Bright diagonal highlight
    const sheen = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0.18)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    sheen.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (spec.paperStyle === 'uv') {
    // Spot UV — a glossy highlight box around the title area
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(ctx, 60, canvas.height * 0.6, canvas.width - 120, 110, 14);
    ctx.fill();
    ctx.restore();
  }

  // Foil overlay — diagonal holographic gradient drawn over everything else.
  if (spec.hasFoil || spec.paperStyle === 'foil') {
    const foil = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    foil.addColorStop(0, 'rgba(255, 215, 100, 0.55)');
    foil.addColorStop(0.25, 'rgba(255, 235, 180, 0.85)');
    foil.addColorStop(0.5, 'rgba(255, 215, 100, 0.95)');
    foil.addColorStop(0.75, 'rgba(255, 245, 200, 0.85)');
    foil.addColorStop(1, 'rgba(220, 180, 60, 0.55)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = foil;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Decorative top bar
  ctx.fillStyle = `rgba(255,255,255,${spec.paperStyle === 'foil' || spec.hasFoil ? 0.85 : 0.18})`;
  ctx.fillRect(40, 60, canvas.width - 80, 8);

  // Title text — wrap to fit
  const isLight = isLightColor(spec.coverColor) || spec.hasFoil || spec.paperStyle === 'foil';
  ctx.fillStyle = isLight ? '#1a1a1a' : '#fff';
  ctx.textAlign = 'center';
  const title = (spec.title ?? 'YOUR TITLE').toUpperCase();
  ctx.font = `900 ${title.length > 12 ? 56 : 76}px "Bebas Neue", "Arial Black", system-ui, sans-serif`;
  wrapText(ctx, title, canvas.width / 2, canvas.height * 0.42, canvas.width - 80, 78);

  // Subtitle
  if (spec.subtitle) {
    ctx.fillStyle = isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)';
    ctx.font = '500 26px system-ui, sans-serif';
    ctx.fillText(spec.subtitle, canvas.width / 2, canvas.height * 0.62);
  }

  // Decorative bottom bar + tag
  ctx.fillStyle = `rgba(255,255,255,${spec.paperStyle === 'foil' || spec.hasFoil ? 0.85 : 0.18})`;
  ctx.fillRect(40, canvas.height - 80, canvas.width - 80, 4);
  ctx.fillStyle = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText('PRINTING COMICS', canvas.width / 2, canvas.height - 36);

  return canvas;
}

function buildSpineCanvas(spec: BookSpec, thickness: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(64, Math.round(thickness * 256));
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, darken(spec.coverColor, 0.3));
  grad.addColorStop(0.5, spec.coverColor);
  grad.addColorStop(1, darken(spec.coverColor, 0.3));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (spec.title && canvas.width > 24) {
    const isLight = isLightColor(spec.coverColor) || spec.hasFoil;
    ctx.fillStyle = isLight ? '#1a1a1a' : '#fff';
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.min(canvas.width * 0.5, 24)}px system-ui, sans-serif`;
    ctx.fillText(spec.title.toUpperCase(), 0, 6);
    ctx.restore();
  }
  return canvas;
}

function Book({ spec }: { spec: BookSpec }) {
  const ref = useRef<THREE.Group>(null);
  // Normalize the book so its largest dimension is always ~3.2 scene units.
  // Different trim sizes still differ in aspect ratio, but they all frame
  // the same way against the static camera.
  const TARGET_MAX = 3.2;
  const k = TARGET_MAX / Math.max(spec.widthIn, spec.heightIn);
  const w = spec.widthIn * k;
  const h = spec.heightIn * k;
  const t = Math.max(0.06, Math.min(1.4, spec.pageCount * 0.0035 * k * 6));

  const coverTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(buildCoverCanvas(spec));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [
    spec.coverColor, spec.paperStyle, spec.hasFoil, spec.title, spec.subtitle,
  ]);

  const spineTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(buildSpineCanvas(spec, t));
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [spec.coverColor, spec.hasFoil, spec.title, t]);

  const coverMetalness =
    spec.paperStyle === 'foil' || spec.hasFoil ? 0.85 :
    spec.paperStyle === 'gloss' ? 0.25 :
    spec.paperStyle === 'uv' ? 0.4 : 0.05;
  const coverRoughness =
    spec.paperStyle === 'foil' || spec.hasFoil ? 0.12 :
    spec.paperStyle === 'gloss' ? 0.18 :
    spec.paperStyle === 'matte' ? 0.65 :
    spec.paperStyle === 'uv' ? 0.3 : 0.85;

  useFrame((_state, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.18;
  });

  return (
    <group ref={ref}>
      {/* Page block (interior) */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w * 0.97, h * 0.97, t * 0.93]} />
        <meshStandardMaterial color={spec.pageColor} roughness={0.92} />
      </mesh>

      {/* Front cover — textured */}
      <mesh position={[0, 0, t / 2 + 0.012]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.022]} />
        <meshStandardMaterial
          map={coverTexture}
          metalness={coverMetalness}
          roughness={coverRoughness}
          envMapIntensity={1.2 + (spec.hasFoil ? 1.4 : 0)}
        />
      </mesh>

      {/* Back cover — solid */}
      <mesh position={[0, 0, -t / 2 - 0.012]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.022]} />
        <meshStandardMaterial
          color={spec.coverColor}
          metalness={coverMetalness}
          roughness={coverRoughness}
        />
      </mesh>

      {/* Spine — textured */}
      <mesh position={[-w / 2 - 0.012, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.022, h, t]} />
        <meshStandardMaterial
          map={spineTexture}
          metalness={coverMetalness}
          roughness={coverRoughness}
        />
      </mesh>

      {/* Fore-edge (page block side facing reader's right) */}
      <mesh position={[w / 2 - 0.005, 0, 0]}>
        <boxGeometry args={[0.005, h * 0.97, t * 0.93]} />
        <meshStandardMaterial color={spec.pageColor} roughness={0.95} />
      </mesh>
    </group>
  );
}

export function BookPreview3D({ spec }: { spec: BookSpec }) {
  return (
    <div style={{
      width: '100%', height: 520,
      background: 'radial-gradient(ellipse at top, #1e293b 0%, #0f172a 100%)',
      borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 25px 60px -20px rgba(0,0,0,0.6)',
    }}>
      <Canvas shadows camera={{ position: [4, 1.2, 7.8], fov: 32 }} dpr={[1, 2]}>
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[4, 6, 5]}
          intensity={1.6}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-3, 2, -3]} intensity={0.5} color="#80a4ff" />
        <pointLight position={[3, -2, 4]} intensity={0.4} color="#fef3c7" />

        <Suspense fallback={null}>
          <Float floatIntensity={0.45} rotationIntensity={0.25} speed={1.2}>
            <Book spec={spec} />
          </Float>
          <Environment preset="city" />
        </Suspense>

        <ContactShadows position={[0, -2.4, 0]} opacity={0.5} scale={10} blur={2.5} far={4} />

        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={5}
          maxDistance={14}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.7}
        />
      </Canvas>
    </div>
  );
}

// ---- helpers ----

function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount);
}
function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount);
}
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a); const B = hexToRgb(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bb = Math.round(A.b + (B.b - A.b) * t);
  return `#${[r, g, bb].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
function hexToRgb(h: string): { r: number; g: number; b: number } {
  const c = h.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150;
}
function paintGrain(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, count: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1.5, 1.5);
  }
  ctx.restore();
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  let line = '';
  let lineY = y;
  const lines: string[] = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const totalHeight = (lines.length - 1) * lineHeight;
  lineY = y - totalHeight / 2;
  for (const l of lines) {
    ctx.fillText(l, x, lineY);
    lineY += lineHeight;
  }
}
