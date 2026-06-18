import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 1.2 }}
    >
      <div className="text-center max-w-4xl relative z-20">
        <motion.h2 
          className="text-8xl font-bold leading-tight"
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          Put your assets <br/>
          <span className="text-[var(--color-accent)]">to work.</span>
        </motion.h2>
        
        <motion.p
          className="text-3xl mt-8 text-[var(--color-text-secondary)]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.8 }}
        >
          Stake, lock, and grow your portfolio with guaranteed APY products.
        </motion.p>
      </div>

      {/* Floating Orbs */}
      <motion.div
        className="absolute w-48 h-48 rounded-full border border-[var(--color-accent)]/30 backdrop-blur-sm"
        initial={{ scale: 0, opacity: 0, x: -200, y: -100 }}
        animate={phase >= 2 ? { scale: 1, opacity: 1, x: -300, y: -150 } : { scale: 0, opacity: 0, x: -200, y: -100 }}
        transition={{ duration: 1.5, type: 'spring' }}
      />
      <motion.div
        className="absolute w-64 h-64 rounded-full border border-[var(--color-primary)]/30 backdrop-blur-sm"
        initial={{ scale: 0, opacity: 0, x: 200, y: 100 }}
        animate={phase >= 2 ? { scale: 1, opacity: 1, x: 300, y: 150 } : { scale: 0, opacity: 0, x: 200, y: 100 }}
        transition={{ duration: 1.8, type: 'spring' }}
      />
    </motion.div>
  );
}
