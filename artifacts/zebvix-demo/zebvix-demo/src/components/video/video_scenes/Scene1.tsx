import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 1.2 }}
    >
      <motion.div 
        className="flex items-center gap-6"
        initial={{ y: 20 }}
        animate={{ y: 0 }}
      >
        <motion.div
          className="w-16 h-16 bg-[var(--color-primary)] clip-polygon"
          initial={{ rotate: -90, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 20 }}
        />
        <motion.h1 
          className="text-8xl font-bold tracking-tighter"
        >
          {"Zebvix".split('').map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ opacity: 0, y: 50, rotateX: 90 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: 0.1 * i, type: 'spring', damping: 15 }}
            >
              {char}
            </motion.span>
          ))}
        </motion.h1>
      </motion.div>
      
      <motion.p
        className="mt-8 text-2xl text-[var(--color-text-secondary)] font-medium tracking-wide"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.8 }}
      >
        The exchange built for everyone.
      </motion.p>
    </motion.div>
  );
}
