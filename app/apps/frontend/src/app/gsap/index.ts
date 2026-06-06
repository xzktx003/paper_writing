import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TextPlugin } from 'gsap/TextPlugin';

gsap.registerPlugin(ScrollTrigger, TextPlugin);

export { gsap, ScrollTrigger, TextPlugin };

export const easings = {
  smooth: 'power3.inOut',
  snappy: 'back.out(1.7)',
  elastic: 'elastic.out(1, 0.3)',
  expo: 'expo.out',
  circ: 'circ.out',
} as const;
