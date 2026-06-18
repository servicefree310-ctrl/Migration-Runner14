import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene8() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[var(--color-bg-dark)]"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5 }}
    >
      <motion.div 
        className="flex flex-col items-center gap-6"
        initial={{ y: 50 }}
        animate={{ y: 0 }}
      >
        <motion.div
          className="w-24 h-24 bg-[var(--color-primary)] clip-polygon"
          initial={{ rotate: -180, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 20 }}
        />
        <motion.h1 
          className="text-9xl font-bold tracking-tighter"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Zebvix
        </motion.h1>
      </motion.div>
      
      <motion.div
        className="mt-12 overflow-hidden"
      >
        <motion.p
          className="text-4xl text-[var(--color-text-primary)] font-medium tracking-wide"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ duration: 0.8, type: 'spring' }}
        >
          Start trading in minutes.
        </motion.p>
      </motion.div>

      <motion.div
        className="mt-16 px-12 py-4 bg-[var(--color-primary)] text-black text-2xl font-bold rounded-full"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.8, type: 'spring' }}
      >
        Get Started
      </motion.div>
    </motion.div>
  );
}
