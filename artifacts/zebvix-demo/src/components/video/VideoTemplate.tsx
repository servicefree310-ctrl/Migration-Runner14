import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { Scene8 } from './video_scenes/Scene8';

export const SCENE_DURATIONS: Record<string, number> = {
  s1_logo: 5000,
  s2_spot: 10000,
  s3_ai: 12000,
  s4_earn: 10000,
  s5_p2p: 10000,
  s6_rewards: 10000,
  s7_security: 8000,
  s8_close: 10000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  s1_logo: Scene1,
  s2_spot: Scene2,
  s3_ai: Scene3,
  s4_earn: Scene4,
  s5_p2p: Scene5,
  s6_rewards: Scene6,
  s7_security: Scene7,
  s8_close: Scene8,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[var(--color-bg-dark)] font-display text-[var(--color-text-primary)]">
      {/* Background layer */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {currentScene !== null && (
          <video
            src={`${import.meta.env.BASE_URL}videos/bg-ambient.mp4`}
            autoPlay
            muted
            loop
            className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen"
          />
        )}

        {/* Ambient glow */}
        <motion.div
          className="absolute w-[60vw] h-[60vw] rounded-full blur-[120px] opacity-10"
          style={{ background: 'var(--color-primary)' }}
          animate={{
            x: ['-20%', '50%', '10%'],
            y: ['10%', '60%', '20%'],
            scale: [1, 1.2, 0.8],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Ambient overlay per scene */}
        <motion.img
          src={`${import.meta.env.BASE_URL}images/bg-trading.png`}
          className="absolute inset-0 w-full h-full object-cover mix-blend-overlay"
          animate={{
            opacity: [1, 2, 7].includes(sceneIndex) ? 0.3 : 0,
            scale: [1, 2, 7].includes(sceneIndex) ? 1.05 : 1.1,
          }}
          transition={{ duration: 2 }}
        />
      </div>

      {/* Main scenes */}
      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      {/* Background music */}
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
