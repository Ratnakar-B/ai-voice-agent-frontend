import type { ReactNode } from 'react';
import { AudioLines, BookOpen, ChevronDown, Headphones, Home, MessageSquare, UsersRound } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { User } from '../types';

const navItems = [
  { label: 'Dashboard', href: '/', icon: Home },
  { label: 'Agents', href: '/agents', icon: UsersRound },
  { label: 'Voice Playground', href: '/playground', icon: Headphones },
  { label: 'Knowledge Base', href: '/knowledge', icon: BookOpen },
  { label: 'Conversations', href: '/conversations', icon: MessageSquare },
];

export function Layout({ user, children }: { user: User; children: ReactNode }) {
  const { pathname } = useLocation();
  const isDashboard = pathname === '/';
  const isAgents = pathname === '/agents';
  const isPlayground = pathname === '/playground';
  const isKnowledge = pathname === '/knowledge';
  const isConversations = pathname === '/conversations';
  const isSettings = pathname === '/settings';

  return (
    <div className={`app-shell${isDashboard ? ' app-shell-dashboard' : ''}${isAgents ? ' app-shell-agents' : ''}${isPlayground ? ' app-shell-playground' : ''}${isKnowledge ? ' app-shell-knowledge' : ''}${isConversations ? ' app-shell-conversations' : ''}${isSettings ? ' app-shell-settings' : ''}`}>
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <AudioLines size={20} />
          </div>
          <div>
            <div className="brand-name">VoicePilot</div>
            <div className="brand-subtitle">AI Studio</div>
          </div>
        </div>

        <nav className="nav">
          {navItems.map(({ label, href, icon: Icon }) => (
            <NavLink key={href} to={href} end={href === '/'} className="nav-item">
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className={`main-panel${isDashboard ? ' dashboard-main' : ''}${isAgents ? ' agents-main' : ''}${isPlayground ? ' playground-main' : ''}${isKnowledge ? ' knowledge-main' : ''}${isConversations ? ' conversations-main' : ''}${isSettings ? ' settings-main' : ''}`}>
        {children}
      </main>

      <Link to="/settings" className="app-profile-nav" aria-label={`Profile settings for ${user.name}`}>
        <span className="app-profile-avatar">{user.name.trim().charAt(0).toUpperCase() || 'U'}</span>
        <span className="app-profile-copy">
          <strong>{user.name}</strong>
          <small>Workspace owner</small>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}
