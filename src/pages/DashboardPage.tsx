import {
  ArrowRight,
  AudioLines,
  Clock3,
  FileUp,
  Headphones,
  MessageSquare,
  Mic,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Agent, Conversation, Stats, User } from '../types';

const formatTalkTime = (minutes: number) => {
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hrs`;
  }
  return `${minutes} min`;
};

const getActivity = (conversations: Conversation[], now: Date) => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    const count = conversations.filter((conversation) => {
      if (!conversation.startedAt) return false;
      const startedAt = new Date(conversation.startedAt);
      return startedAt >= day && startedAt < nextDay;
    }).length;

    return {
      label: day.toLocaleDateString([], { weekday: 'short' }),
      title: day.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      count,
    };
  });
};

export function DashboardPage({
  stats,
  agents,
  conversations,
  user,
}: {
  stats: Stats;
  agents: Agent[];
  conversations: Conversation[];
  user: User;
}) {
  const [now] = useState(() => new Date());
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user.name.trim().split(/\s+/)[0] || 'there';
  const activity = getActivity(conversations, now);
  const maxActivity = Math.max(...activity.map((day) => day.count));
  const hasRecentActivity = maxActivity > 0;
  const recentConversations = [...conversations]
    .sort((left, right) => new Date(right.startedAt ?? 0).getTime() - new Date(left.startedAt ?? 0).getTime())
    .slice(0, 4);
  const recentAgents = agents.slice(0, 2);

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>{greeting}, {firstName} <span aria-hidden="true">👋</span></h1>
          <p>Here&apos;s what&apos;s happening with your AI voice agents today.</p>
        </div>
      </header>

      <section className="dashboard-metrics" aria-label="Workspace metrics">
        <article className="dashboard-metric metric-purple">
          <span className="dashboard-metric-icon"><UsersRound size={20} /></span>
          <div><span>Voice agents</span><strong>{stats.totalAgents}</strong></div>
          <Link to="/agents" aria-label="View voice agents"><ArrowRight size={17} /></Link>
        </article>
        <article className="dashboard-metric metric-green">
          <span className="dashboard-metric-icon"><MessageSquare size={20} /></span>
          <div><span>Conversations</span><strong>{stats.totalConversations}</strong></div>
          <Link to="/conversations" aria-label="View conversations"><ArrowRight size={17} /></Link>
        </article>
        <article className="dashboard-metric metric-orange">
          <span className="dashboard-metric-icon"><Clock3 size={20} /></span>
          <div><span>Talk time</span><strong>{formatTalkTime(stats.totalMinutes)}</strong></div>
          <Link to="/conversations" aria-label="View talk time history"><ArrowRight size={17} /></Link>
        </article>
        <article className="dashboard-metric metric-blue">
          <span className="dashboard-metric-icon"><AudioLines size={20} /></span>
          <div><span>Active agents</span><strong>{stats.activeAgents}</strong></div>
          <Link to="/agents" aria-label="Manage active agents"><ArrowRight size={17} /></Link>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel activity-panel">
          <div className="dashboard-panel-heading">
            <div><h2>Conversation activity</h2><p>Saved conversations over the last 7 days</p></div>
            <span className="dashboard-range">Last 7 days</span>
          </div>
          <div className="activity-chart" role="img" aria-label={`Conversation activity over the last seven days: ${activity.map((day) => `${day.title}: ${day.count}`).join(', ')}`}>
            <div className="activity-axis" aria-hidden="true">
              <span>{maxActivity}</span><span>{Math.ceil(maxActivity / 2)}</span><span>0</span>
            </div>
            <div className="activity-bars">
              {activity.map((day) => (
                <div className="activity-day" key={day.title} title={`${day.title}: ${day.count} conversations`}>
                  <div className="activity-track">
                    <span className="activity-bar" style={{ height: `${day.count ? Math.max(12, (day.count / Math.max(maxActivity, 1)) * 100) : 0}%` }} />
                  </div>
                  <span>{day.label}</span>
                </div>
              ))}
            </div>
          </div>
          {!hasRecentActivity && (
            <p className="activity-empty">
              {stats.totalConversations === 0 ? 'Your conversation activity will appear here.' : 'No conversations in the last seven days.'}
            </p>
          )}
        </section>

        <section className="dashboard-panel talk-panel">
          <div className="dashboard-panel-heading">
            <div><h2>Talk time</h2><p>Total time spent in conversations</p></div>
            <Clock3 size={18} aria-hidden="true" />
          </div>
          <div className="talk-time-summary">
            <div className="talk-time-value">{formatTalkTime(stats.totalMinutes)}</div>
            <div className="talk-time-detail">
              <span className="talk-time-mark" />
              <span>Across saved conversations</span>
              <strong>{stats.totalConversations}</strong>
            </div>
            <div className="talk-time-detail">
              <span className="talk-time-mark green" />
              <span>Active voice agents</span>
              <strong>{stats.activeAgents}</strong>
            </div>
          </div>
        </section>

        <section className="dashboard-panel recent-panel">
          <div className="dashboard-panel-heading">
            <h2>Recent conversations</h2>
            <Link to="/conversations" className="dashboard-view-all">View all <ArrowRight size={14} /></Link>
          </div>
          {recentConversations.length ? (
            <div className="recent-conversations">
              {recentConversations.map((conversation) => (
                <Link to="/conversations" className="recent-conversation" key={conversation.id}>
                  <span className="recent-conversation-icon"><Headphones size={17} /></span>
                  <span className="recent-conversation-name">
                    <strong>{conversation.agent}</strong>
                    <small>{conversation.date}</small>
                  </span>
                  <span className="recent-conversation-duration">{conversation.duration}</span>
                  <span className={`status-pill ${conversation.status === 'completed' ? 'success' : 'neutral'}`}>{conversation.status}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <MessageSquare size={20} />
              <span>Your completed conversations will appear here.</span>
            </div>
          )}
        </section>

        <div className="dashboard-side-stack">
          <section className="dashboard-panel quick-actions-panel">
            <div className="dashboard-panel-heading"><h2>Quick actions</h2></div>
            <div className="quick-actions">
              <Link to="/agents" className="quick-action action-purple"><span><UsersRound size={19} /></span>Create agent</Link>
              <Link to="/playground" className="quick-action action-green"><span><Mic size={19} /></span>Start voice chat</Link>
              <Link to="/knowledge" className="quick-action action-orange"><span><FileUp size={19} /></span>Upload document</Link>
              <Link to="/conversations" className="quick-action action-blue"><span><MessageSquare size={19} /></span>View conversations</Link>
            </div>
          </section>

          <section className="dashboard-panel agents-panel">
            <div className="dashboard-panel-heading">
              <h2>Your agents</h2>
              <Link to="/agents" className="dashboard-view-all">View all <ArrowRight size={14} /></Link>
            </div>
            {recentAgents.length ? (
              <div className="dashboard-agent-list">
                {recentAgents.map((agent) => (
                  <Link to="/agents" className="dashboard-agent" key={agent.id}>
                    <span className={`dashboard-agent-icon ${agent.status === 'active' ? 'agent-active' : ''}`}>
                      {agent.avatar ? <img src={agent.avatar} alt="" /> : <Headphones size={17} />}
                    </span>
                    <span><strong>{agent.name}</strong><small>{agent.description || 'Voice assistant'}</small></span>
                    <span className={`status-pill ${agent.status === 'active' ? 'success' : 'neutral'}`}>{agent.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty dashboard-agent-empty">
                <span>No agents yet.</span><Link to="/agents">Create your first agent <ArrowRight size={14} /></Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
