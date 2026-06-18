import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 z-10"
      initial={{ opacity: 0, rotateY: -90 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 1.5, type: 'spring' }}
    >
      <div className="absolute top-[25%] right-[10%] max-w-xl text-right">
        <motion.h2 
          className="text-7xl font-bold leading-tight"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          Creator <span className="text-[var(--color-primary)]">Rewards</span>
        </motion.h2>
        
        <motion.p
          className="text-2xl mt-6 text-[var(--color-text-secondary)]"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          Earn from every trade your network makes. Build your community, grow your passive income.
        </motion.p>
      </div>

      {/* Network visualization */}
      <motion.div 
        className="absolute left-[10%] top-[20%] w-[40vw] h-[60vh] opacity-80"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={phase >= 2 ? { opacity: 0.8, scale: 1 } : { opacity: 0, scale: 0.8 }}
        transition={{ duration: 1.5, type: 'spring' }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/network-nodes.png`} 
          alt="Network" 
          className="w-full h-full object-contain mix-blend-screen hue-rotate-180"
        />
      </motion.div>
    </motion.div>
  );
}
