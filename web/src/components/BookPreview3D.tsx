import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls, Float, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
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
  /**
   * Binding style. Saddle-stitched comics are stapled through the fold, so
   * they have NO spine — just a crease at the left edge. Perfect-bound
   * books (graphic novels, trade paperbacks) have a flat spine whose
   * thickness scales with pageCount. Default: 'perfect'.
   */
  binding?: 'perfect' | 'saddle-stitch';
  /** Optional uploaded front cover image (URL). Replaces the procedural
   *  cover texture when present. */
  frontCoverImageUrl?: string;
  /** Optional uploaded back cover image (URL). Replaces the back cover
   *  color when present. */
  backCoverImageUrl?: string;
  /** Optional uploaded spine artwork (URL). Only meaningful for
   *  perfect-bound books — saddle-stitched comics have no spine. */
  spineImageUrl?: string;
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

  const isLight = isLightColor(spec.coverColor) || spec.hasFoil || spec.paperStyle === 'foil';

  // ---- Comic title — fits inside a fixed bounding box at the top of the
  // cover (the "logo strip" region) in thick white Comic Sans with a heavy
  // black stroke. The font size auto-shrinks so any length of title fits
  // without overflowing the box.
  const userTitle = spec.title?.trim();
  if (userTitle) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const FONT_FAMILY = '"Comic Sans MS", "Chalkboard SE", "Comic Sans", system-ui, sans-serif';
    const TITLE_BOX = {
      cx: canvas.width / 2,
      cy: 200,             // vertical center of the box
      width: canvas.width - 60,
      height: 220,
    };
    drawAutoFitTitle(ctx, userTitle.toUpperCase(), TITLE_BOX, FONT_FAMILY);
    ctx.restore();
  }

  // Size name — big bold display label sits in the middle of the cover
  // (where it always was). Only the typed comic title moves to the top.
  if (spec.subtitle) {
    ctx.fillStyle = isLight ? '#1a1a1a' : '#fff';
    ctx.font = '900 76px "Bebas Neue", "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(spec.subtitle.toUpperCase(), canvas.width / 2, canvas.height * 0.5);

    // Small "Comic Book" tag underneath
    ctx.fillStyle = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
    ctx.font = '500 26px system-ui, sans-serif';
    ctx.fillText('Comic Book', canvas.width / 2, canvas.height * 0.6);
  }

  // Decorative bottom bar + brand tag
  ctx.fillStyle = `rgba(255,255,255,${spec.paperStyle === 'foil' || spec.hasFoil ? 0.85 : 0.18})`;
  ctx.fillRect(40, canvas.height - 80, canvas.width - 80, 4);
  ctx.fillStyle = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
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

/** Load an image URL into a THREE.Texture. Returns null until the image has
 *  actually loaded so we don't flash the cover black. */
function useImageTexture(url?: string) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useMemo(() => {
    if (!url) { setTex(null); return; }
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        setTex(t);
      },
      undefined,
      () => setTex(null),
    );
  }, [url]);
  return tex;
}

function Book({ spec }: { spec: BookSpec }) {
  const ref = useRef<THREE.Group>(null);
  const isSaddle = spec.binding === 'saddle-stitch';

  // Normalize the book so its largest dimension is always ~3.2 scene units.
  const TARGET_MAX = 3.2;
  const k = TARGET_MAX / Math.max(spec.widthIn, spec.heightIn);
  const w = spec.widthIn * k;
  const h = spec.heightIn * k;

  // Saddle-stitched comics: the book forms a WEDGE — covers meet at the
  // left fold (spine = 0 thickness) and splay open to the right (fore-edge)
  // where the page count determines the stack height. Achieved by pivoting
  // each cover around the left edge at z=0 and rotating slightly around Y.
  // Perfect-bound keeps its uniform-thickness page block + flat covers.
  const COVER_T_SADDLE = 0.006;
  const COVER_T_PERFECT = 0.022;
  const coverT = isSaddle ? COVER_T_SADDLE : COVER_T_PERFECT;
  // Fore-edge thickness (saddle) or spine thickness (perfect-bound).
  const t = isSaddle
    ? Math.max(0.02, Math.min(0.28, spec.pageCount * 0.0025 * k * 6))
    : Math.max(0.06, Math.min(1.4, spec.pageCount * 0.0035 * k * 6));
  // Tilt angle for saddle-stitched covers: how many radians each cover is
  // rotated around the left-edge pivot so the right edges spread by `t`.
  // Small-angle approximation — sin ≈ θ at these sizes.
  const saddleTilt = isSaddle ? t / (2 * w) : 0;
  // Offset from page-block face to cover centre (perfect-bound only).
  const coverOffset = coverT / 2 + 0.001;

  const frontImageTex = useImageTexture(spec.frontCoverImageUrl);
  const backImageTex  = useImageTexture(spec.backCoverImageUrl);
  const spineImageTex = useImageTexture(spec.spineImageUrl);

  const proceduralCoverTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(buildCoverCanvas(spec));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [
    spec.coverColor, spec.paperStyle, spec.hasFoil, spec.title, spec.subtitle,
  ]);

  const spineTexture = useMemo(() => {
    if (isSaddle) return null;  // no spine on stapled comics
    const tex = new THREE.CanvasTexture(buildSpineCanvas(spec, t));
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [spec.coverColor, spec.hasFoil, spec.title, t, isSaddle]);

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

  // Use the uploaded image where provided; otherwise fall back to the
  // procedural render.
  const frontMap = frontImageTex ?? proceduralCoverTexture;

  return (
    <group ref={ref}>
      {/* Page block (interior). Omitted on saddle-stitch — the pages fan
          out between the tilted covers, so there's no flat stack to render.
          A real saddle-stitched comic's pages form the same wedge as the
          covers (zero at spine, full thickness at fore-edge), which the
          tilted cover meshes already communicate visually. */}
      {!isSaddle && (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w * 0.97, h * 0.97, t * 0.93]} />
          <meshStandardMaterial color={spec.pageColor} roughness={0.92} />
        </mesh>
      )}

      {isSaddle ? (
        <>
          {/* Front cover — pivots around the left fold (x=-w/2, z=0) and
              tilts up so the right edge sits at +t/2 in z. The mesh-local
              bottom-left corner coincides with the pivot. */}
          <group position={[-w / 2, 0, 0]} rotation={[0, -saddleTilt, 0]}>
            <mesh position={[w / 2, 0, coverT / 2]} castShadow receiveShadow>
              <boxGeometry args={[w, h, coverT]} />
              <meshStandardMaterial
                map={frontMap}
                metalness={coverMetalness}
                roughness={coverRoughness}
                envMapIntensity={1.2 + (spec.hasFoil ? 1.4 : 0)}
              />
            </mesh>
          </group>

          {/* Back cover — mirrored tilt so the right edge is at -t/2. */}
          <group position={[-w / 2, 0, 0]} rotation={[0, saddleTilt, 0]}>
            <mesh position={[w / 2, 0, -coverT / 2]} castShadow receiveShadow>
              <boxGeometry args={[w, h, coverT]} />
              <meshStandardMaterial
                {...(backImageTex ? { map: backImageTex } : { color: spec.coverColor })}
                metalness={coverMetalness}
                roughness={coverRoughness}
              />
            </mesh>
          </group>
        </>
      ) : (
        <>
          {/* Perfect-bound: flat cover panels parallel to the page block. */}
          <mesh
            position={[0, 0, t / 2 + coverOffset]}
            castShadow receiveShadow
          >
            <boxGeometry args={[w, h, coverT]} />
            <meshStandardMaterial
              map={frontMap}
              metalness={coverMetalness}
              roughness={coverRoughness}
              envMapIntensity={1.2 + (spec.hasFoil ? 1.4 : 0)}
            />
          </mesh>

          <mesh
            position={[0, 0, -t / 2 - coverOffset]}
            castShadow receiveShadow
          >
            <boxGeometry args={[w, h, coverT]} />
            <meshStandardMaterial
              {...(backImageTex ? { map: backImageTex } : { color: spec.coverColor })}
              metalness={coverMetalness}
              roughness={coverRoughness}
            />
          </mesh>
        </>
      )}

      {/* Spine — only on perfect-bound. Saddle-stitched comics fold along
          the left edge instead of having a spine. Uploaded spine art
          replaces the procedural (title-painted) spine texture. */}
      {!isSaddle && (spineImageTex || spineTexture) && (
        <mesh position={[-w / 2 - 0.012, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.022, h, t]} />
          <meshStandardMaterial
            map={spineImageTex ?? spineTexture}
            metalness={coverMetalness}
            roughness={coverRoughness}
          />
        </mesh>
      )}

      {/* Fore-edge (page block side facing reader's right). Only relevant
          for perfect-bound where there's an actual page stack. */}
      {!isSaddle && (
        <mesh position={[w / 2 - 0.005, 0, 0]}>
          <boxGeometry args={[0.005, h * 0.97, t * 0.93]} />
          <meshStandardMaterial color={spec.pageColor} roughness={0.95} />
        </mesh>
      )}
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
      position: 'relative',
    }}>
      {/* Watermark — bottom-right, subtle but always visible */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          right: 14,
          bottom: 12,
          zIndex: 2,
          pointerEvents: 'none',
          fontSize: '.75rem',
          fontWeight: 700,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
          textShadow: '0 1px 2px rgba(0,0,0,0.65)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Printing Comics
      </div>
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
            {/* Sparkles drift around foil books for that holo shimmer */}
            {(spec.hasFoil || spec.paperStyle === 'foil') && (
              <Sparkles
                count={60}
                scale={[3.5, 4.5, 1.5]}
                size={3}
                speed={0.4}
                color="#fde68a"
              />
            )}
          </Float>
          <Environment preset="city" />
        </Suspense>

        <ContactShadows position={[0, -2.4, 0]} opacity={0.5} scale={10} blur={2.5} far={4} />

        {/* Post-processing: bloom makes foil/UV glow, slight vignette frames the scene */}
        <EffectComposer>
          <Bloom
            intensity={spec.hasFoil || spec.paperStyle === 'foil' ? 1.4 : 0.6}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.85}
            mipmapBlur
          />
          <Vignette
            eskil={false}
            offset={0.18}
            darkness={0.65}
            blendFunction={BlendFunction.NORMAL}
          />
        </EffectComposer>

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

/** Wraps text and renders each line with a stroke outline behind the fill. */
function wrapTextStroked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, fillColor: string) {
  const words = text.split(/\s+/);
  let line = '';
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
  let lineY = y;
  for (const l of lines) {
    ctx.strokeText(l, x, lineY);
    ctx.fillStyle = fillColor;
    ctx.fillText(l, x, lineY);
    lineY += lineHeight;
  }
}

/**
 * Renders text inside a fixed-size box, auto-sizing the font down until the
 * wrapped lines fit both width and height. Heavy black stroke + white fill,
 * Comic Sans family.
 */
function drawAutoFitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { cx: number; cy: number; width: number; height: number },
  fontFamily: string,
) {
  const MAX_FONT = 130;
  const MIN_FONT = 14;

  // Single line — shrink until the entire text fits both width and height.
  let chosenFont = MIN_FONT;
  let display = text;
  for (let size = MAX_FONT; size >= MIN_FONT; size -= 2) {
    ctx.font = `900 ${size}px ${fontFamily}`;
    const w = ctx.measureText(text).width;
    if (w <= box.width && size <= box.height) {
      chosenFont = size;
      display = text;
      break;
    }
  }

  // If still too wide at min font, truncate with an ellipsis until it fits.
  if (chosenFont === MIN_FONT) {
    ctx.font = `900 ${MIN_FONT}px ${fontFamily}`;
    if (ctx.measureText(text).width > box.width) {
      let s = text;
      while (s.length > 1 && ctx.measureText(s + '…').width > box.width) {
        s = s.slice(0, -1);
      }
      display = s + '…';
    }
  }

  ctx.font = `900 ${chosenFont}px ${fontFamily}`;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(6, chosenFont * 0.14);
  ctx.strokeText(display, box.cx, box.cy);
  ctx.fillStyle = '#fff';
  ctx.fillText(display, box.cx, box.cy);
}

function wrapToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = '';
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
  return lines;
}
