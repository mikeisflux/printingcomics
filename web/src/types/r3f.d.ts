// React 19 moved JSX.IntrinsicElements out of the React namespace into the
// global JSX namespace. R3F v8's module augmentation targets the old
// location, so all the <mesh>, <group>, <boxGeometry> etc. tags lose their
// types under React 19. This file re-augments the global namespace from
// R3F's exported ThreeElements interface so TS picks them back up.

import type { ThreeElements } from '@react-three/fiber';

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

export {};
