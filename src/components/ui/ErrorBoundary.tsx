"use client";

import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./primitives";

interface Props {
  children: ReactNode;
  label?: string;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[CrowdCast] render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="glass m-4 flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-warn" aria-hidden />
        <p className="font-semibold">{this.props.label ?? "This section"} hit a problem</p>
        <p className="max-w-md text-sm text-muted">{this.state.error.message}</p>
        <Button onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}
