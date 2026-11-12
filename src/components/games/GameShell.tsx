import { useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  /** Short status shown on the right of the header. */
  status?: ReactNode;
  onExit: () => void;
  children: ReactNode;
}

/** Full-screen frame shared by the games: back button, title, status. */
export function GameShell({ title, status, onExit, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <div className="study">
      <header className="study-head">
        <button className="btn btn-ghost" onClick={onExit}>
          ← Back
        </button>
        <span className="study-dir">{title}</span>
        <span className="study-count" aria-live="polite">
          {status}
        </span>
      </header>
      {children}
    </div>
  );
}
