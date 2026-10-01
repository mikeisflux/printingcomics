import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps one failing widget from taking the whole page down. The 3D book
 * preview, for instance, fetches an environment map from a CDN; when that is
 * blocked (content blockers, captive wifi, an outage) the error would
 * otherwise bubble to the router and replace the entire configurator with an
 * error screen — and the customer could no longer order. With this around it,
 * the preview shows its fallback and the rest of the page keeps working.
 */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('[ErrorBoundary] widget failed, showing fallback:', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
