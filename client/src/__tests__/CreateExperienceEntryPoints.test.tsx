import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import CreateExperiencePage from '../pages/create-experience';

// "Create experience" opens one page with two ways in: the idea phase, or the
// builder for someone who is ready. A button anywhere else that jumps straight
// to the builder skips that choice.

let authState: any;
let partnerAccess: any;

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/navigation', () => ({ default: () => <nav data-testid="site-nav" /> }));
vi.mock('@/components/CreateFlow/IdeaFlow', () => ({ default: () => <div data-testid="idea-flow" /> }));

let search = '';
const navigate = vi.fn();
vi.mock('wouter', () => ({ useSearch: () => search, useLocation: () => ['/create-experience', navigate] }));
vi.mock('@/components/PartnerToolingGate', () => ({
  usePartnerAccess: () => ({ data: partnerAccess }),
  // Stands in for the real gate: children only when access is open.
  default: ({ children }: any) =>
    partnerAccess?.canUseTooling ? <>{children}</> : <div data-testid="gate-notice">Finish your profile first</div>,
}));

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'creator' }, isAuthenticated: true, isLoading: false };
  partnerAccess = { canUseTooling: true };
  search = '';
  navigate.mockReset();
});

describe('the /create-experience page', () => {
  it('asks first: an idea, or ready to build', () => {
    render(<CreateExperiencePage />);
    expect(screen.getByText('I have an idea')).toBeInTheDocument();
    expect(screen.getByText("I'm ready to build")).toBeInTheDocument();
    expect(screen.queryByTestId('idea-flow')).not.toBeInTheDocument();
    expect(screen.getByTestId('site-nav')).toBeInTheDocument();
  });

  it('sends "I have an idea" to the idea phase', () => {
    render(<CreateExperiencePage />);
    fireEvent.click(screen.getByTestId('button-create-have-idea'));
    expect(navigate).toHaveBeenCalledWith('/create-experience?start=idea');
  });

  it(`sends "I'm ready to build" to the builder existing organisers know`, () => {
    render(<CreateExperiencePage />);
    fireEvent.click(screen.getByTestId('button-create-ready-to-build'));
    expect(navigate).toHaveBeenCalledWith('/event-builder');
  });

  it('shows the idea phase on its own, full screen, to someone the tooling is open to', () => {
    search = 'start=idea';
    render(<CreateExperiencePage />);
    expect(screen.getByTestId('idea-flow')).toBeInTheDocument();
    expect(screen.queryByTestId('site-nav')).not.toBeInTheDocument();
  });

  it('says why, inside the site navigation, to someone still waiting on approval', () => {
    search = 'start=idea';
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
      search = 'start=idea';
      render(<CreateExperiencePage />);
      expect(screen.getByTestId('idea-flow')).toBeInTheDocument();
    },
  );

  it('does not show the flow to a signed-out visitor', () => {
    search = 'start=idea';
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
  // The builder's own routing, the one registry of routes, the breadcrumb
  // lookup (a table keyed by path, not a link) and the "I'm ready to build"
  // choice on Create experience may name it.
  const exempt = ['App.tsx', join('pages', 'event-builder.tsx'), join('hooks', 'useBreadcrumbs.ts'), join('pages', 'create-experience.tsx')];
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
