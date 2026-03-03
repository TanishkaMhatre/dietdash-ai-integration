// GSAP animations centralized for the app
if (typeof gsap !== 'undefined') {
  try {
    gsap.from('.navbar', { y: -80, opacity: 0, duration: 0.8, ease: 'power3.out' });
    gsap.from('.hero-section h1', { y: 40, opacity: 0, duration: 1, delay: 0.2, ease: 'power3.out' });
    gsap.from('.hero-section p', { y: 30, opacity: 0, duration: 1, delay: 0.35, ease: 'power3.out' });
    gsap.from('.hero-section .btn', { y: 20, opacity: 0, duration: 0.8, delay: 0.5, stagger: 0.1, ease: 'power3.out' });
    gsap.from('.feature-card', {
      scrollTrigger: { trigger: '.feature-card', start: 'top 85%' },
      y: 30, opacity: 0, duration: 0.6, stagger: 0.15, ease: 'power2.out'
    });
  } catch (e) { console.warn('GSAP anims error', e); }
}
