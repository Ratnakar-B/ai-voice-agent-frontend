import { LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import type { User } from '../types';

export function SettingsPage({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const initial = user?.name.trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <div>
          <p className="eyebrow">Your account</p>
          <h1>Profile</h1>
          <p>View your profile information.</p>
        </div>
      </header>

      <div className="settings-content">
        <div className="settings-primary-column">
          <section className="settings-card" id="profile">
            <div className="settings-card-heading">
              <div><h2>Profile information</h2><p>Your account details associated with VoicePilot.</p></div>
              <span className="settings-card-icon"><UserRound size={17} /></span>
            </div>
            <div className="profile-summary">
              <span className="profile-avatar">{initial}</span>
              <div><strong>{user?.name ?? 'Not signed in'}</strong><span>Workspace owner</span></div>
            </div>
            <div className="profile-detail-grid">
              <div className="profile-detail">
                <span>Full name</span>
                <strong>{user?.name ?? 'Not available'}</strong>
              </div>
              <div className="profile-detail">
                <span>Email address</span>
                <strong><Mail size={14} />{user?.email ?? 'No account email'}</strong>
              </div>
              <div className="profile-detail">
                <span>Account role</span>
                <strong><span className="profile-role">Workspace owner</span></strong>
              </div>
              <div className="profile-detail">
                <span>Data access</span>
                <strong><ShieldCheck size={14} />Private to your account</strong>
              </div>
            </div>
            <button type="button" className="settings-logout-button" onClick={onLogout}>
              <LogOut size={15} />Log out
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
