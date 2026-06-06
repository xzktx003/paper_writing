import { useEffect, useRef, useCallback } from 'react';
import { gsap, ScrollTrigger } from './index';

/**
 * Animate elements on mount with stagger
 */
export function useStaggerReveal(
  selector: string,
  opts?: { delay?: number; duration?: number; y?: number; stagger?: number }
) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const children = el.querySelectorAll(selector);
    if (!children.length) return;

    gsap.set(children, { opacity: 0, y: opts?.y ?? 40 });
    gsap.to(children, {
      opacity: 1,
      y: 0,
      duration: opts?.duration ?? 0.8,
      stagger: opts?.stagger ?? 0.12,
      delay: opts?.delay ?? 0.3,
      ease: 'power3.out',
    });

    return () => { gsap.killTweensOf(children); };
  }, [selector, opts?.delay, opts?.duration, opts?.y, opts?.stagger]);

  return containerRef;
}

/**
 * ScrollTrigger-based reveal
 */
export function useScrollReveal(
  selector: string,
  opts?: { y?: number; duration?: number; start?: string; stagger?: number }
) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const children = el.querySelectorAll(selector);
    if (!children.length) return;

    gsap.set(children, { opacity: 0, y: opts?.y ?? 60 });

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: opts?.start ?? 'top 80%',
      once: true,
      onEnter: () => {
        gsap.to(children, {
          opacity: 1,
          y: 0,
          duration: opts?.duration ?? 1,
          stagger: opts?.stagger ?? 0.15,
          ease: 'power3.out',
        });
      },
    });

    return () => {
      trigger.kill();
      gsap.killTweensOf(children);
    };
  }, [selector, opts?.y, opts?.duration, opts?.start, opts?.stagger]);

  return containerRef;
}

/**
 * Floating particle animation
 */
export function useFloatingParticles(count: number = 20) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      size: number; opacity: number; hue: number;
    }
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.5 - 0.1,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.1,
      hue: Math.random() > 0.5 ? 220 : 200,
    }));

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) { p.y = canvas.offsetHeight + 10; p.x = Math.random() * canvas.offsetWidth; }
        if (p.x < -10) p.x = canvas.offsetWidth + 10;
        if (p.x > canvas.offsetWidth + 10) p.x = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${p.opacity})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [count]);

  return canvasRef;
}

/**
 * Mouse-follow glow effect
 */
export function useMouseGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;

    const handleMove = (e: MouseEvent) => {
      gsap.to(glow, {
        x: e.clientX,
        y: e.clientY,
        duration: 0.6,
        ease: 'power2.out',
      });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return glowRef;
}

/**
 * Text typewriter effect
 */
export function useTypewriter(text: string, delay: number = 1) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.textContent = '';

    gsap.to(ref.current, {
      textContent: text,
      duration: text.length * 0.06,
      delay,
      ease: 'none',
      snap: { textContent: 1 },
    });
  }, [text, delay]);

  return ref;
}

/**
 * Magnetic button hover effect
 */
export function useMagnetic(strength: number = 0.3) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleEnter = () => {
      el.addEventListener('mousemove', handleMove);
    };
    const handleLeave = () => {
      el.removeEventListener('mousemove', handleMove);
      gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
    };
    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * strength;
      const y = (e.clientY - rect.top - rect.height / 2) * strength;
      gsap.to(el, { x, y, duration: 0.3, ease: 'power2.out' });
    };

    el.addEventListener('mouseenter', handleEnter);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      el.removeEventListener('mouseenter', handleEnter);
      el.removeEventListener('mouseleave', handleLeave);
      el.removeEventListener('mousemove', handleMove);
    };
  }, [strength]);

  return ref;
}

/**
 * Count-up animation for numbers
 */
export function useCountUp(target: number, duration: number = 2, delay: number = 0) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target,
      duration,
      delay,
      ease: 'power2.out',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = Math.round(obj.val).toLocaleString();
      },
    });
  }, [target, duration, delay]);

  return ref;
}
