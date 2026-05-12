import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Something went wrong while loading this page.',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('Route render error', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card mt-10 max-w-2xl">
          <h2 className="text-lg font-semibold text-white">{this.props.title ?? 'Page error'}</h2>
          <p className="mt-2 text-sm text-pit-text">{this.state.message}</p>
          <p className="mt-3 text-xs text-pit-muted">Refresh the page. If it keeps happening, the page render path still needs a fix.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
