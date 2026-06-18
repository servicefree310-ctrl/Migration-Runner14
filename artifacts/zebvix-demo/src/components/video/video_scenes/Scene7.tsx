import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ clipPath: 'polygon(50% 0, 50% 0, 50% 100%, 50% 100%)' }}
      animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
      exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.div
        className="w-32 h-32 mb-12 border-4 border-[var(--color-accent)] rounded-full flex items-center justify-center relative"
        initial={{ scale: 0 }}
        animate={phase >= 1 ? { scale: 1 } : { scale: 0 }}
        transition={{ type: 'spring', damping: 15 }}
      >
        <div className="absolute inset-2 bg-[var(--color-accent)]/20 rounded-full animate-pulse" />
        <div className="w-16 h-16 bg-[var(--color-accent)] rounded-full shadow-[0_0_40px_var(--color-accent)]" />
      </motion.div>

      <div className="text-center max-w-4xl relative z-20">
        <motion.h2 
          className="text-7xl font-bold leading-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
        >
          Bank-grade security. <br/>
          Full KYC compliance.
        </motion.h2>
        
        <motion.p
          className="text-3xl mt-8 text-[var(--color-accent)] font-semibold tracking-wide"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          Your assets, protected.
        </motion.p>
      </div>
    </motion.div>
  );
}
