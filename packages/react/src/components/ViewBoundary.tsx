import type { Messages } from '@redline/core';
import { Component, type ReactNode } from 'react';
import { ErrorState } from './States';

interface Props {
  m: Messages;
  /** Changing this (e.g. the view id or comparison) clears a previous failure */
  resetKey: string;
  onError?: (error: Error) => void;
  children: ReactNode;
}

/**
 * Keeps a failure inside one document view from taking down the host page.
 * The rest of the viewer (top bar, change list) stays usable.
 */
export class ViewBoundary extends Component<Props, { failedFor: string | null }> {
  state = { failedFor: null as string | null };

  static getDerivedStateFromError() {
    return { failedFor: '__pending__' };
  }

  componentDidCatch(error: Error) {
    this.setState({ failedFor: this.props.resetKey });
    this.props.onError?.(error);
  }

  render() {
    const failed = this.state.failedFor !== null && (this.state.failedFor === '__pending__' || this.state.failedFor === this.props.resetKey);
    return failed ? <ErrorState m={this.props.m} code="unknown" /> : this.props.children;
  }
}
