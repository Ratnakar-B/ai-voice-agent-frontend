import { ArrowRight, AudioLines, BarChart3, Eye, EyeOff, FileText, Lock, Mail, Mic, PhoneCall, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import { useState, type FormEvent } from 'react';

export function AuthPage({
  onLogin,
  onRegister,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        await onRegister(name, email, password);
      }
    } catch (error) {
      if (axios.isAxiosError<{ message?: string }>(error)) {
        setErrorMessage(error.response?.data?.message ?? 'Unable to reach the server. Check your connection and try again.');
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-shell">
      <section className="auth-hero-panel">
        <header className="auth-header">
          <div className="voice-brand">
            <span className="auth-brand-icon"><AudioLines size={19} /></span>
            <span>VoiceAI</span>
          </div>
          <p className="header-copy">Talk. Automate. Grow.</p>
        </header>

        <div className="hero-content">
          <div className="hero-copy">
            <h1>
              Create Powerful
              <br />
              <span className="gradient-text">AI Voice</span> Agents
            </h1>
            <p>Use a browser-based AI voice agent for natural, real-time conversations. Phone calling and other expanded features are coming soon.</p>
          </div>
          <div className="auth-hero-art" aria-hidden="true">
            <img src="/voice_agent.png" alt="" />
          </div>
        </div>

        <div className="feature-grid">
          {[
            { icon: <Mic size={17} />, title: 'Browser Voice Chat', subtitle: 'Available now' },
            { icon: <PhoneCall size={17} />, title: 'Phone Calling', subtitle: 'Coming soon' },
            { icon: <FileText size={17} />, title: 'Knowledge Base', subtitle: 'Ground answers in your docs' },
            { icon: <BarChart3 size={17} />, title: 'More Capabilities', subtitle: 'Coming soon' },
          ].map((feature) => (
            <div className="feature-item" key={feature.title}>
              <div className="feature-icon">{feature.icon}</div>
              <strong>{feature.title}</strong>
              <span>{feature.subtitle}</span>
            </div>
          ))}
        </div>

        <div className="auth-stats" aria-label="VoiceAI platform highlights">
          <div><strong>10K+</strong><span>Conversations</span></div>
          <div><strong>98%</strong><span>Success rate</span></div>
          <div><strong>50+</strong><span>Businesses</span></div>
          <div><strong>24/7</strong><span>AI agents</span></div>
        </div>
      </section>

      <main className="auth-card-panel">
        <div className="auth-card-inner">
          <div className="auth-card-brand">
            <span className="auth-brand-icon"><AudioLines size={19} /></span>
            <div>
              <div className="mini-brand-title">VoiceAI</div>
              <div className="mini-brand-subtitle">AI voice platform</div>
            </div>
          </div>

          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="subtitle">{mode === 'login' ? 'Sign in to your account to continue' : 'Create an account to get started'}</p>

          <form key={mode} className="auth-form" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <label className="field-group">
                <div className="input-wrap">
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" autoComplete="name" required />
                </div>
              </label>
            )}

            <label className="field-group">
              <div className="input-wrap icon-left">
                <Mail size={16} />
              <input aria-label="Email address" value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email address" autoComplete={mode === 'login' ? 'username' : 'email'} required />
              </div>
            </label>

            <label className="field-group">
              <div className="input-wrap icon-left">
                <Lock size={16} />
                <input
                  aria-label="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? 8 : undefined}
                  maxLength={256}
                  required
                />
                <button
                  type="button"
                  className="show-password"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </label>

            {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}

            <button type="submit" className="primary-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
              {!isSubmitting && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="signup-row">
            <span>{mode === 'login' ? "Don't have an account?" : 'Already have an account?'}</span>
            <button
              type="button"
              className="account-switch"
              onClick={() => {
                setErrorMessage('');
                setShowPassword(false);
                setName('');
                setEmail('');
                setPassword('');
                setMode((state) => (state === 'login' ? 'register' : 'login'));
              }}
            >
              {mode === 'login' ? 'Create a new account' : 'Sign in'}
            </button>
          </div>
          <div className="auth-security"><ShieldCheck size={14} /> Secure sign-in</div>
        </div>
      </main>
    </div>
  );
}
