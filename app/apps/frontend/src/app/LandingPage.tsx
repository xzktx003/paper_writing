import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gsap, ScrollTrigger } from './gsap';
import { useFloatingParticles, useMouseGlow } from './gsap/hooks';

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    key: 'assistant',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    key: 'editor',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    key: 'templates',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
  },
  {
    key: 'search',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    key: 'charts',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    key: 'review',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
] as const;

export default function LandingPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [langOpen, setLangOpen] = useState(false);
  const canvasRef = useFloatingParticles(30);
  const mouseGlowRef = useMouseGlow();

  const heroRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const titleLine1Ref = useRef<HTMLSpanElement>(null);
  const titleLine2Ref = useRef<HTMLSpanElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const featuresSectionRef = useRef<HTMLDivElement>(null);
  const featuresGridRef = useRef<HTMLDivElement>(null);
  const ctaSectionRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // ── Top bar entrance ──
      gsap.from(topBarRef.current, {
        y: -60,
        opacity: 0,
        duration: 0.8,
        delay: 0.2,
        ease: 'power3.out',
      });

      // ── Hero badge ──
      gsap.from(badgeRef.current, {
        scale: 0.5,
        opacity: 0,
        duration: 0.6,
        delay: 0.5,
        ease: 'back.out(1.7)',
      });

      // ── Title lines — staggered reveal ──
      const tl = gsap.timeline({ delay: 0.7 });
      tl.from(titleLine1Ref.current, {
        y: 80,
        opacity: 0,
        rotateX: 40,
        duration: 1,
        ease: 'power3.out',
      });
      tl.from(titleLine2Ref.current, {
        y: 80,
        opacity: 0,
        rotateX: 40,
        duration: 1,
        ease: 'power3.out',
      }, '-=0.6');

      // ── Subtitle ──
      tl.from(subtitleRef.current, {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
      }, '-=0.4');

      // ── CTA button ──
      tl.from(ctaRef.current, {
        y: 30,
        opacity: 0,
        scale: 0.9,
        duration: 0.7,
        ease: 'back.out(1.7)',
      }, '-=0.4');

      // ── Meta items — staggered ──
      tl.from(metaRef.current?.children || [], {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.12,
        ease: 'power2.out',
      }, '-=0.3');

      // ── Hero background orbs floating ──
      gsap.to('.landing-hero::before', {
        rotation: 360,
        duration: 60,
        repeat: -1,
        ease: 'none',
      });

      // ── Feature cards — ScrollTrigger reveal ──
      if (featuresGridRef.current) {
        const cards = featuresGridRef.current.querySelectorAll('.landing-feature-card');
        gsap.set(cards, { y: 60, opacity: 0, scale: 0.95 });
        ScrollTrigger.create({
          trigger: featuresSectionRef.current,
          start: 'top 75%',
          once: true,
          onEnter: () => {
            gsap.to(cards, {
              y: 0,
              opacity: 1,
              scale: 1,
              duration: 0.8,
              stagger: 0.1,
              ease: 'power3.out',
            });
          },
        });
      }

      // ── CTA section — ScrollTrigger reveal ──
      if (ctaSectionRef.current) {
        gsap.set(ctaSectionRef.current, { y: 60, opacity: 0 });
        ScrollTrigger.create({
          trigger: ctaSectionRef.current,
          start: 'top 80%',
          once: true,
          onEnter: () => {
            gsap.to(ctaSectionRef.current, {
              y: 0,
              opacity: 1,
              duration: 1,
              ease: 'power3.out',
            });
          },
        });
      }

      // ── Footer entrance ──
      if (footerRef.current) {
        gsap.set(footerRef.current, { opacity: 0 });
        ScrollTrigger.create({
          trigger: footerRef.current,
          start: 'top 95%',
          once: true,
          onEnter: () => {
            gsap.to(footerRef.current, { opacity: 1, duration: 0.6 });
          },
        });
      }
    });

    return () => ctx.revert();
  }, []);

  // ── Feature card hover: magnetic + glow ──
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(card, {
      rotateY: x * 0.05,
      rotateX: -y * 0.05,
      duration: 0.4,
      ease: 'power2.out',
      transformPerspective: 800,
    });
  };

  const handleCardMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    gsap.to(e.currentTarget, {
      rotateY: 0,
      rotateX: 0,
      duration: 0.6,
      ease: 'elastic.out(1, 0.3)',
    });
  };

  return (
    <div className="landing-page">
      {/* Floating particles canvas */}
      <canvas ref={canvasRef} className="landing-particles" />

      {/* Mouse-follow glow */}
      <div ref={mouseGlowRef} className="landing-mouse-glow" />

      {/* Top bar */}
      <div className="landing-top-bar" ref={topBarRef}>
        <div className="landing-brand">
          <div className="landing-brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <span className="landing-brand-text">Paper Agent</span>
        </div>

        <div className="landing-top-right">
          <button className="landing-top-btn" onClick={() => navigate('/projects')}>
            {t('landing.startWriting')}
          </button>
          <div className="landing-lang-wrapper">
            <button
              className="landing-lang-btn"
              onClick={() => setLangOpen(!langOpen)}
              onBlur={() => setTimeout(() => setLangOpen(false), 150)}
            >
              {i18n.language === 'en-US' ? 'EN' : '中'}
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {langOpen && (
              <div className="landing-lang-dropdown">
                {([['zh-CN', '中文'], ['en-US', 'EN']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    className={`landing-lang-item ${i18n.language === val ? 'active' : ''}`}
                    onClick={() => { i18n.changeLanguage(val); setLangOpen(false); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="landing-hero" ref={heroRef}>
        {/* Animated gradient orbs */}
        <div className="landing-orb landing-orb-1" />
        <div className="landing-orb landing-orb-2" />
        <div className="landing-orb landing-orb-3" />

        <div className="landing-hero-content visible">
          <div className="landing-hero-badge" ref={badgeRef}>
            <span className="landing-hero-badge-dot" />
            {t('landing.badge')}
          </div>

          <h1 className="landing-title">
            <span className="landing-title-line" ref={titleLine1Ref}>{t('landing.titleLine1')}</span>
            <span className="landing-title-line accent" ref={titleLine2Ref}>{t('landing.titleLine2')}</span>
          </h1>

          <p className="landing-subtitle" ref={subtitleRef}>
            {t('landing.subtitle')}
          </p>

          <div className="landing-cta-row" ref={ctaRef}>
            <button className="landing-btn-primary magnetic-btn" onClick={() => navigate('/projects')}>
              {t('landing.startWriting')}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>

          <div className="landing-hero-meta" ref={metaRef}>
            <span className="landing-hero-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {t('landing.metaLocal')}
            </span>
            <span className="landing-hero-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {t('landing.metaPrivate')}
            </span>
            <span className="landing-hero-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              {t('landing.metaOpenSource')}
            </span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="landing-features" ref={featuresSectionRef}>
        <div className="landing-features-inner">
          <h2 className="landing-section-title">{t('landing.featuresTitle')}</h2>
          <div className="landing-features-grid" ref={featuresGridRef}>
            {FEATURES.map((feat) => (
              <div
                key={feat.key}
                className="landing-feature-card"
                onMouseMove={handleCardMouseMove}
                onMouseLeave={handleCardMouseLeave}
              >
                <div className="landing-feature-icon">{feat.icon}</div>
                <h3 className="landing-feature-name">{t(`landing.feat.${feat.key}.name`)}</h3>
                <p className="landing-feature-desc">{t(`landing.feat.${feat.key}.desc`)}</p>
                <div className="landing-feature-glow" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta-section" ref={ctaSectionRef}>
        <div className="landing-cta-section-inner">
          <h2 className="landing-cta-section-title">{t('landing.ctaTitle')}</h2>
          <p className="landing-cta-section-desc">{t('landing.ctaDesc')}</p>
          <button className="landing-btn-primary large magnetic-btn" onClick={() => navigate('/projects')}>
            {t('landing.startWriting')}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer" ref={footerRef}>
        <span>Paper Agent &mdash; {t('landing.footerTagline')}</span>
        <span className="landing-footer-meta">
          <a href="https://github.com/OpenDCAI/OpenPrism" target="_blank" rel="noopener noreferrer">GitHub</a>
          &middot; MIT License
        </span>
      </footer>
    </div>
  );
}
