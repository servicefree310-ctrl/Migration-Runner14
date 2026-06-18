import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 z-10"
      initial={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
      animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute top-[20%] right-[10%] max-w-xl text-right">
        <motion.h2 
          className="text-7xl font-bold leading-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          Let AI work <br/>
          <span className="text-[var(--color-primary)] text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-primary)] to-amber-300">for you.</span>
        </motion.h2>
        
        <motion.p
          className="text-2xl mt-6 text-[var(--color-text-secondary)]"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          Choose a plan — Starter to Elite — and earn up to 1.8% daily, automatically.
        </motion.p>
      </div>
      
      {/* Network Nodes overlay */}
      <motion.div 
        className="absolute left-0 top-[10%] w-[50vw] h-[80vh] opacity-60"
        initial={{ opacity: 0, x: -100 }}
        animate={phase >= 1 ? { opacity: 0.6, x: 0 } : { opacity: 0, x: -100 }}
        transition={{ duration: 1.5, type: 'spring' }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/network-nodes.png`} 
          alt="Network Nodes" 
          className="w-full h-full object-contain mix-blend-screen"
        />
      </motion.div>

      {/* Plans Mockup */}
      <div className="absolute right-[10%] bottom-[15%] flex gap-6">
        {['Starter', 'Pro', 'Elite'].map((plan, i) => (
          <motion.div
            key={plan}
            className="w-48 h-64 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md flex flex-col justify-between"
            initial={{ opacity: 0, y: 50 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
            transition={{ delay: i * 0.2, duration: 0.8, type: 'spring' }}
          >
            <div className="text-[var(--color-primary)] font-bold text-xl">{plan}</div>
            <div className="text-4xl font-black text-white">
              {['1.0%', '1.5%', '1.8%'][i]}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
