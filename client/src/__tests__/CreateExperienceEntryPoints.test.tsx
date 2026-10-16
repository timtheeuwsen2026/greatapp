import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import CreateExperiencePage from '../pages/create-experience';

// "Create experience opens one flow." A button that still jumps to the builder's
// old Single-Day / Multi-Day chooser quietly brings back the second door: an
// event started with no idea phase, no prefill, no concept.

let authState: any;
let partnerAccess: any;

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/navigation', () => ({ default: () => <nav data-testid="site-nav" /> }));
vi.mock('@/components/CreateFlow/IdeaFlow', () => ({ default: () => <div data-testid="idea-flow" /> }));
vi.mock('@/components/PartnerToolingGate', () => ({
  usePartnerAccess: () => ({ data: partnerAccess }),
  // Stands in for the real gate: children only when access is open.
  default: ({ children }: any) =>
    partnerAccess?.canUseTooling ? <>{children}</> : <div data-testid="gate-notice">Finish your profile first</div>,
}));

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'creator' }, isAuthenticated: true, isLoading: false };
  partnerAccess = { canUseTooling: true };
});

describe('the /create-experience page', () => {
  it('shows the flow on its own, full screen, to someone the tooling is open to', () => {
    render(<CreateExperiencePage />);
    expect(screen.getByTestId('idea-flow')).toBeInTheDocument();
    expect(screen.queryByTestId('site-nav')).not.toBeInTheDocument();
  });

  it('says why, inside the site navigation, to someone still waiting on approval', () => {
    partnerAccess = { canUseTooling: false, state: 'pending_review' };
    render(<CreateExperiencePage />);
    expect(screen.getByTestId('gate-notice')).toBeInTheDocument();
    expect(screen.getByTestId('site-nav')).toBeInTheDocument();
    expect(screen.queryByTestId('idea-flow')).not.toBeInTheDocument();
  });

  it.each(['creator', 'venue_provider', 'promoter', 'service_provider'])(
    'does not ask a %s to be a creator first',
    (role) => {
      authState = { user: { id: 'u1', role }, isAuthenticated: true, isLoading: false };
      render(<CreateExperiencePage />);
      expect(screen.getByTestId('idea-flow')).toBeInTheDocument();
    },
  );

  it('does not show the flow to a signed-out visitor', () => {
    authState = { user: null, isAuthenticated: false, isLoading: false };
    partnerAccess = undefined;
    render(<CreateExperiencePage />);
    expect(screen.queryByTestId('idea-flow')).not.toBeInTheDocument();
  });
});

// ── No stray door ───────────────────────────────────────────────────────────

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('every way of starting an event goes through Create experience', () => {
  const root = join(process.cwd(), 'client/src');
  // The builder's own routing, the one registry of routes, and the breadcrumb
  // lookup (a table keyed by path, not a link) may name it.
  const exempt = ['App.tsx', join('pages', 'event-builder.tsx'), join('hooks', 'useBreadcrumbs.ts')];
  // A bare legacy "create" URL: nothing after the path but the closing quote.
  const bareDoor = /['"`]\/(event-builder|journey-builder|create-trip)['"`]/g;

  it('no page or component links to the old builder chooser or a legacy create URL', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(root)) {
      if (exempt.some((suffix) => file.endsWith(suffix))) continue;
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(bareDoor)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${file.slice(root.length + 1)}:${line} ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the legacy create URLs redirect to Create experience, and only an edit link reaches the builder', () => {
    const app = readFileSync(join(root, 'App.tsx'), 'utf8');
    const redirect = app.slice(app.indexOf('function RedirectToEventBuilder'), app.indexOf('function RedirectToCreatorProfileSetup'));
    expect(redirect).toContain("'/create-experience'");
    expect(redirect).toContain("get('edit')");
  });

  it('the welcome email asks people to start in Create experience', () => {
    const email = readFileSync(join(process.cwd(), 'server/emailTemplates.ts'), 'utf8');
    expect(email).toContain('/create-experience');
    expect(email).not.toMatch(/\/event-builder/);
  });
});
