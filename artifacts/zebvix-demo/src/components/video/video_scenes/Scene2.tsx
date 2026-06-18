import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 z-10"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 1.5, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute top-[30%] left-[10%] max-w-2xl">
        <motion.h2 
          className="text-7xl font-bold leading-tight"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          Trade 200+ <br/>
          <span className="text-[var(--color-primary)]">Crypto Pairs</span>
        </motion.h2>
        
        <motion.p
          className="text-2xl mt-6 text-[var(--color-text-secondary)]"
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={phase >= 1 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 0.8 }}
        >
          Real-time order books, lightning-fast execution, and deep liquidity.
        </motion.p>
      </div>
      
      {/* UI Elements / Mockups */}
      <motion.div 
        className="absolute right-[5%] top-[15%] w-[45vw] h-[70vh]"
        initial={{ opacity: 0, y: 100, rotateY: 20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0, rotateY: -10 } : { opacity: 0, y: 100, rotateY: 20 }}
        transition={{ duration: 1.5, type: 'spring' }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/ui-wallet.png`} 
          alt="Wallet UI" 
          className="w-full h-full object-contain filter drop-shadow-2xl"
        />
      </motion.div>
      
      {/* Candlesticks animation */}
      <div className="absolute left-[10%] bottom-[15%] flex gap-4 items-end h-[25vh]">
        {[40, 70, 50, 90, 60, 100].map((h, i) => (
          <motion.div
            key={i}
            className={`w-4 ${i % 2 === 0 ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-error)]'} rounded-t-sm relative`}
            initial={{ height: 0 }}
            animate={phase >= 2 ? { height: `${h}%` } : { height: 0 }}
            transition={{ delay: i * 0.1, duration: 0.8, type: 'spring' }}
          >
            <div className="absolute left-1/2 -translate-x-1/2 -top-6 w-[2px] h-12 bg-current opacity-50" />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
