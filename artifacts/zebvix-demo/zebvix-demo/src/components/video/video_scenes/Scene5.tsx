import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 z-10 bg-[var(--color-bg-dark)]"
      initial={{ y: '100%' }}
      animate={{ y: '0%' }}
      exit={{ y: '-100%' }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute top-[25%] left-[10%] max-w-xl">
        <motion.h2 
          className="text-7xl font-bold leading-tight"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          P2P Marketplace
        </motion.h2>
        
        <motion.p
          className="text-2xl mt-6 text-[var(--color-text-secondary)]"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          Buy and sell crypto peer-to-peer, your way. Multiple payment methods, zero platform fees.
        </motion.p>
      </div>

      <motion.div 
        className="absolute right-[10%] top-[30%] flex flex-col gap-4"
        initial={{ opacity: 0, x: 50 }}
        animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
        transition={{ duration: 1, type: 'spring' }}
      >
        {[1, 2, 3].map((item, i) => (
          <motion.div
            key={item}
            className="w-[30vw] p-6 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md flex items-center justify-between"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ delay: i * 0.15, duration: 0.6 }}
          >
            <div className="flex gap-4 items-center">
              <div className="w-12 h-12 rounded-full bg-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)] font-bold">
                {['USDT', 'BTC', 'ETH'][i]}
              </div>
              <div>
                <div className="text-xl font-bold">Buy {['USDT', 'BTC', 'ETH'][i]}</div>
                <div className="text-sm text-gray-400">Zero Fees</div>
              </div>
            </div>
            <div className="px-6 py-2 bg-[var(--color-primary)] text-black font-bold rounded-lg">
              Trade
            </div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
