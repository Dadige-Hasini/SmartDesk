import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Menu,
  X,
  Sparkles,
  Bot,
  Ticket,
  ChevronDown,
  LayoutDashboard,
  LogIn,
  CheckCircle2,
  ShieldCheck,
  Zap,
  LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ShinyText from './ShinyText';

/**
 * FullScreenHero Component
 * 
 * Specifications:
 * - Background:
 *   - Full-screen looping video background using CloudFront URL:
 *     https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_105406_16f4600d-7a92-4292-b96e-b19156c7830a.mp4
 *   - autoPlay, loop, muted, playsInline
 *   - Background color: #000000
 * - Navigation Bar:
 *   - Logo: Circular design with a white border (2px), containing a smaller filled white circle inside,
 *     followed by logo text.
 *   - Navigation links in a rounded pill container with gray-700 border:
 *     Home, About Us, Courses / Services, Instructors / AI Desk, Testimonials / FAQs, Blog / Status, Contact us (with arrow icon)
 *   - All nav links: white/80 opacity, hover to full white
 *   - Font size: text-sm
 *   - Mobile: Show hamburger menu icon on screens smaller than lg
 *   - Max width: 7xl container with proper padding
 * - Content Layout:
 *   - Top Section (below nav):
 *     - Two-column layout on large screens, stacked on mobile
 *     - Left column: "We deliver transformative programs..." / Campus AI motive
 *     - Right column (right-aligned on lg+): "8000+ Talented Designers Launched !" / "12,000+ Student Queries Resolved !"
 *     - Both paragraphs: white/80 opacity, text-sm on mobile, text-base on desktop
 *   - Hero Section (center):
 *     - Small uppercase text above heading: "Seats for Next Program Opening Soon" (white/80 opacity, text-xs mobile, text-sm desktop, tight tracking)
 *     - Main heading:
 *       - Line 1: "Become" in white, font-medium
 *       - Line 2: "Product Leader." with animated shiny gradient effect
 *       - Font sizes: text-5xl (mobile) scaling up to text-9xl (xl screens)
 *       - Line height: 0.85
 *       - Letter spacing: tracking-tighter
 * - ShinyText Component:
 *   - Use framer-motion for animation
 *   - Base color: #64CEFB (light blue)
 *   - Shine color: #ffffff (white)
 *   - Animation speed: 3 seconds
 *   - Gradient spread: 100 degrees
 *   - Continuous sweep from left to right
 * - CTA Button:
 *   - "Apply for Next Enrollment" / "Sign In to SmartDesk" with arrow icon
 *   - Black background, hover: gray-900
 *   - Rounded-full shape, px-6 md:px-8, py-3 md:py-4
 *   - Arrow translates right on hover (group hover animation)
 * - Adapted to SmartDesk:
 *   - Live interactive toggle switch allowing switching between SmartDesk College Help Desk Motive & DesignPro Spec!
 */
export default function FullScreenHero({
  onExploreClick,
  defaultMode = 'smartdesk', // 'smartdesk' | 'designpro'
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mode, setMode] = useState(defaultMode);
  const { isAuthenticated, user, profile } = useAuth();
  const navigate = useNavigate();

  const isSmartDesk = mode === 'smartdesk';

  // Navigation Items
  const navItems = isSmartDesk
    ? [
        { name: 'Home', href: '#', isAnchor: true },
        { name: 'About Us', href: '#features', isAnchor: true },
        { name: 'Services', href: '#services', isAnchor: true },
        { name: 'AI Assistant', href: '/ai-chat', isRoute: true },
        { name: 'FAQs', href: '/faqs', isRoute: true },
        { name: 'Campus Status', href: '#status', isAnchor: true },
        { name: 'Contact us', href: '#contact', isAnchor: true, hasArrow: true },
      ]
    : [
        { name: 'Home', href: '#', isAnchor: true },
        { name: 'About Us', href: '#about', isAnchor: true },
        { name: 'Courses', href: '#courses', isAnchor: true },
        { name: 'Instructors', href: '#instructors', isAnchor: true },
        { name: 'Testimonials', href: '#testimonials', isAnchor: true },
        { name: 'Blog', href: '#blog', isAnchor: true },
        { name: 'Contact us', href: '#contact', isAnchor: true, hasArrow: true },
      ];

  // Dynamic texts per specification & adaptation
  const brandName = isSmartDesk ? 'SmartDesk' : 'DesignPro';

  const topColLeft = isSmartDesk ? (
    <>
      We deliver transformative AI assistance and campus support services that empower college{' '}
      <br className="hidden md:inline" />
      students with real-time academic solutions, instant department routing, and 24/7 verified guidance.
    </>
  ) : (
    <>
      We deliver transformative programs that empower emerging product{' '}
      <br className="hidden md:inline" />
      designers with cutting-edge expertise and vision to thrive globally.
    </>
  );

  const topColRight = isSmartDesk
    ? '12,000+ Student Queries Resolved !'
    : '8000+ Talented Designers Launched !';

  const badgeText = isSmartDesk
    ? 'Seats for Next Semester & 24/7 Campus Desk Active'
    : 'Seats for Next Program Opening Soon';

  const headingLine1 = isSmartDesk ? 'Empower Your' : 'Become';
  const headingLine2 = isSmartDesk ? 'Campus Life.' : 'Product Leader.';

  const ctaText = isSmartDesk
    ? (isAuthenticated ? 'Access Student Dashboard' : 'Sign In to SmartDesk')
    : 'Apply for Next Enrollment';

  const handleCta = () => {
    if (isSmartDesk && isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const scrollToAnchor = (href) => {
    if (onExploreClick) {
      onExploreClick(href);
    } else {
      const el = document.querySelector(href);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
      }
    }
  };

  return (
    <section className="relative w-full h-screen min-h-[640px] bg-black text-white overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* 1. Full-screen Looping Video Background */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_105406_16f4600d-7a92-4292-b96e-b19156c7830a.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
        {/* Cinematic dark scrim overlay to guarantee text contrast and vibrant shiny gradient */}
        <div className="absolute inset-0 bg-black/45 backdrop-brightness-[0.88]" />
      </div>

      {/* 2. Navigation Bar (relative z-20) */}
      <header className="relative z-20 w-full pt-6 sm:pt-8">
        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <Link to="/" className="flex items-center gap-3 group shrink-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-[1.8px] border-white flex items-center justify-center transition-transform duration-300 group-hover:scale-105 shrink-0">
                  <div
                    className={`w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full ${
                      isSmartDesk ? 'bg-[#64CEFB] shadow-[0_0_6px_#64CEFB]' : 'bg-white'
                    } transition-transform duration-300 group-hover:scale-110`}
                  />
                </div>
                <span className="font-semibold text-lg sm:text-xl tracking-tight text-white whitespace-nowrap transition-opacity group-hover:opacity-90">
                  {isSmartDesk ? (
                    <>
                      <span>Smart</span>
                      <span className="text-[#64CEFB]">Desk</span>
                    </>
                  ) : (
                    <span>DesignPro</span>
                  )}
                </span>
              </Link>

              {/* Interactive Motive Switcher Badge */}
              <button
                type="button"
                onClick={() => setMode(isSmartDesk ? 'designpro' : 'smartdesk')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-zinc-900/70 hover:bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-800 backdrop-blur-md transition-all whitespace-nowrap shrink-0 cursor-pointer"
                title="Click to toggle between SmartDesk Motive and DesignPro Spec"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#64CEFB] shrink-0" />
                <span className="whitespace-nowrap">{isSmartDesk ? 'Campus Motive' : 'DesignPro Mode'}</span>
              </button>
            </div>

            {/* Desktop Navigation Links in Rounded Pill Container with border-zinc-800 */}
            <nav className="hidden lg:flex items-center gap-5 xl:gap-7 border border-zinc-800/90 rounded-full px-6 xl:px-8 py-2.5 backdrop-blur-xl bg-zinc-950/45 shadow-2xl shrink-0">
              {navItems.map((item) => {
                const linkStyle =
                  'flex items-center gap-1 text-zinc-300 hover:text-white transition-colors duration-200 text-[13px] xl:text-sm font-normal whitespace-nowrap tracking-normal py-0.5 cursor-pointer';

                if (item.isRoute) {
                  return (
                    <Link key={item.name} to={item.href} className="group">
                      <span className={linkStyle}>
                        {item.name}
                        {item.hasArrow && (
                          <ArrowRight className="w-3.5 h-3.5 ml-0.5 transition-transform duration-200 group-hover:translate-x-0.5 inline shrink-0" />
                        )}
                      </span>
                    </Link>
                  );
                }

                return (
                  <a
                    key={item.name}
                    href={item.href}
                    onClick={(e) => {
                      if (item.href.startsWith('#')) {
                        e.preventDefault();
                        scrollToAnchor(item.href);
                      }
                    }}
                    className="group"
                  >
                    <span className={linkStyle}>
                      {item.name}
                      {item.hasArrow && (
                        <ArrowRight className="w-3.5 h-3.5 ml-0.5 transition-transform duration-200 group-hover:translate-x-0.5 inline shrink-0" />
                      )}
                    </span>
                  </a>
                );
              })}
            </nav>

            {/* Desktop Right Action: Portal Sign In / User badge */}
            <div className="hidden lg:flex items-center gap-3 shrink-0">
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium text-white bg-zinc-900/70 hover:bg-zinc-800/90 border border-zinc-800 backdrop-blur-md transition-all hover:scale-105 whitespace-nowrap shrink-0 shadow-sm"
                >
                  <LayoutDashboard className="w-4 h-4 text-[#64CEFB]" />
                  <span className="whitespace-nowrap">Dashboard</span>
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium text-white bg-zinc-900/70 hover:bg-zinc-800/90 border border-zinc-800 backdrop-blur-md transition-all hover:scale-105 whitespace-nowrap shrink-0 shadow-sm"
                >
                  <LogIn className="w-4 h-4 text-white/80" />
                  <span className="whitespace-nowrap">Sign In</span>
                </Link>
              )}
            </div>

            {/* Mobile: Hamburger menu icon on screens smaller than lg */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-full border border-gray-700 bg-black/60 text-white/90 hover:text-white backdrop-blur-md transition-colors"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Drawer */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="lg:hidden mt-3 p-5 rounded-2xl border border-gray-700 bg-black/90 backdrop-blur-xl shadow-2xl space-y-3"
              >
                <div className="flex flex-col space-y-1">
                  {navItems.map((item) => (
                    item.isRoute ? (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 text-sm font-medium transition-colors"
                      >
                        <span>{item.name}</span>
                        {item.hasArrow && <ArrowRight className="w-4 h-4" />}
                      </Link>
                    ) : (
                      <a
                        key={item.name}
                        href={item.href}
                        onClick={(e) => {
                          setMobileMenuOpen(false);
                          if (item.href.startsWith('#')) {
                            e.preventDefault();
                            scrollToAnchor(item.href);
                          }
                        }}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 text-sm font-medium transition-colors"
                      >
                        <span>{item.name}</span>
                        {item.hasArrow && <ArrowRight className="w-4 h-4" />}
                      </a>
                    )
                  ))}
                </div>

                <div className="pt-3 border-t border-gray-800 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode(isSmartDesk ? 'designpro' : 'smartdesk');
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs text-white/80 bg-white/10 border border-white/10"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#64CEFB]" />
                    <span>Switch to {isSmartDesk ? 'DesignPro Spec' : 'SmartDesk Motive'}</span>
                  </button>

                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-white text-black hover:bg-gray-100 transition-colors"
                  >
                    <span>{isAuthenticated ? 'Go to Dashboard' : 'Sign In to Student Portal'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* 3. Top Section (below nav): Two-column layout with clean breathing room */}
      <div className="relative z-10 w-full pt-10 sm:pt-12 lg:pt-14 pb-2">
        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-8">
            {/* Left column */}
            <motion.p
              key={`left-${mode}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-zinc-400 sm:text-white/75 text-sm sm:text-[15px] leading-relaxed max-w-xl xl:max-w-2xl font-normal"
            >
              {topColLeft}
            </motion.p>

            {/* Right column (aligned to top line on desktop) */}
            <motion.div
              key={`right-${mode}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex items-center md:justify-end gap-2.5 shrink-0 md:pt-1"
            >
              <span className="w-2 h-2 rounded-full bg-[#00E599] shrink-0 inline-block shadow-[0_0_8px_#00E599]" />
              <p className="text-white/90 text-sm sm:text-[15px] font-medium tracking-tight whitespace-nowrap">
                {topColRight}
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      {/* 4. Hero Section (center) */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 py-6 sm:py-10 my-auto">
        <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
          {/* Small uppercase text above heading */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#64CEFB] animate-ping" />
            <span className="text-white/80 text-xs md:text-sm tracking-tight font-medium uppercase">
              {badgeText}
            </span>
          </motion.div>

          {/* Main Heading */}
          <div className="space-y-1 sm:space-y-2">
            {/* Line 1: white, font-medium */}
            <motion.h1
              key={`line1-${mode}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-medium text-white tracking-tighter leading-[0.95] sm:leading-[0.9]"
            >
              {headingLine1}
            </motion.h1>

            {/* Line 2: with animated shiny gradient effect */}
            <motion.div
              key={`line2-${mode}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-extrabold tracking-tighter leading-[0.95] sm:leading-[0.9]"
            >
              <ShinyText
                text={headingLine2}
                baseColor="#64CEFB"
                shineColor="#ffffff"
                speed={3}
                spread={100}
              />
            </motion.div>
          </div>

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="pt-4 sm:pt-6 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            {/* Primary CTA button: black background, hover: gray-900, rounded-full, px-6 md:px-8 py-3 md:py-4, translating arrow on hover */}
            <button
              type="button"
              onClick={handleCta}
              className="group inline-flex items-center gap-3 px-6 md:px-8 py-3 md:py-4 rounded-full bg-black hover:bg-gray-900 border border-gray-700/80 text-white font-medium text-base shadow-2xl hover:border-gray-500 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              <span>{ctaText}</span>
              <ArrowRight className="w-5 h-5 text-white transition-transform duration-300 group-hover:translate-x-1.5" />
            </button>

            {/* Secondary Free Trial / Demo button */}
            {isSmartDesk && (
              <Link
                to="/ai-chat"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/90 text-sm font-medium backdrop-blur-md transition-all hover:scale-105"
              >
                <Bot className="w-4 h-4 text-[#64CEFB]" />
                <span>Launch AI Chat (Live Demo)</span>
              </Link>
            )}
          </motion.div>
        </div>
      </div>

      {/* 5. Bottom Cue: Explore Features / Status info */}
      <div className="relative z-10 w-full pb-6">
        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12 flex items-center justify-between text-xs text-white/60">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="hidden sm:inline">SmartDesk AI Engine & SLA Routing Active</span>
              <span className="sm:hidden">Help Desk Online</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => scrollToAnchor('#features')}
            className="flex items-center gap-1.5 hover:text-white transition-colors group cursor-pointer"
          >
            <span className="font-medium">Explore Features</span>
            <ChevronDown className="w-4 h-4 transition-transform duration-300 group-hover:translate-y-1" />
          </button>
        </div>
      </div>
    </section>
  );
}
