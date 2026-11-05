import React from 'react';
import { motion } from 'framer-motion';

/**
 * ShinyText Component
 * 
 * Renders text with an animated shining gradient effect sweeping continuously from left to right.
 * 
 * Specifications:
 * - Base color: #64CEFB (light blue)
 * - Shine color: #ffffff (white)
 * - Animation speed: 3 seconds
 * - Gradient spread: 100 degrees
 * - Gradient sweeps across text continuously from left to right
 * - CSS gradient with backgroundClip: text and transparent text fill
 */
export default function ShinyText({
  children,
  text,
  baseColor = '#64CEFB',
  shineColor = '#ffffff',
  speed = 3,
  spread = 100,
  className = '',
}) {
  const content = children || text || '';

  // Gradient: sweeping from left to right
  // At 100deg, white shine band at 50% between baseColor bands
  const gradient = `linear-gradient(${spread}deg, ${baseColor} 0%, ${baseColor} 32%, ${shineColor} 50%, ${baseColor} 68%, ${baseColor} 100%)`;

  return (
    <motion.span
      className={`inline-block select-none ${className}`}
      style={{
        backgroundImage: gradient,
        backgroundSize: '200% 100%',
        backgroundRepeat: 'repeat-x',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
        display: 'inline-block',
      }}
      animate={{
        // Sweeping from left to right smoothly
        backgroundPosition: ['100% 0', '-100% 0'],
      }}
      transition={{
        duration: speed,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      {content}
    </motion.span>
  );
}
