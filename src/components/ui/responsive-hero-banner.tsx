

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Menu, ArrowRight, Play } from 'lucide-react';

/**
 * Uygulama içi yollar (/giris) SPA gezinmesiyle açılır — düz <a> kullanılsa
 * sayfa baştan yüklenir ve açılış animasyonu her seferinde yeniden oynardı.
 * Çapa (#nasil-oynanir) ve dış bağlantılar normal <a> olarak kalır.
 */
const SmartLink: React.FC<{
    href: string;
    className?: string;
    children?: React.ReactNode;
}> = ({ href, className, children }) =>
    href.startsWith('/') ? (
        <Link to={href} className={className}>
            {children}
        </Link>
    ) : (
        <a href={href} className={className}>
            {children}
        </a>
    );

interface NavLink {
    label: string;
    href: string;
    isActive?: boolean;
}

interface Partner {
    logoUrl: string;
    href: string;
}

interface ResponsiveHeroBannerProps {
    showNav?: boolean;
    logoUrl?: string;
    backgroundImageUrl?: string;
    backgroundVideoUrl?: string;
    navLinks?: NavLink[];
    ctaButtonText?: string;
    ctaButtonHref?: string;
    badgeText?: string;
    badgeLabel?: string;
    title?: string;
    titleLine2?: string;
    description?: string;
    primaryButtonText?: string;
    primaryButtonHref?: string;
    secondaryButtonText?: string;
    secondaryButtonHref?: string;
    /** Üçüncü, daha sönük bağlantı — ikincil bir hedef kitle için (ör. hoca girişi) */
    tertiaryButtonText?: string;
    tertiaryButtonHref?: string;
    partnersTitle?: string;
    partners?: Partner[];
}

const ResponsiveHeroBanner: React.FC<ResponsiveHeroBannerProps> = ({
    showNav = false,
    logoUrl = "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=200&q=80",
    backgroundImageUrl = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072",
    backgroundVideoUrl,
    navLinks = [
        { label: "Home", href: "#", isActive: true },
        { label: "Missions", href: "#" },
        { label: "Destinations", href: "#" },
        { label: "Technology", href: "#" },
        { label: "Book Flight", href: "#" }
    ],
    ctaButtonText = "Reserve Seat",
    ctaButtonHref = "#",
    badgeLabel = "New",
    badgeText = "First Commercial Flight to Mars 2026",
    title = "Journey Beyond Earth",
    titleLine2 = "Into the Cosmos",
    description = "Experience the cosmos like never before. Our advanced spacecraft and cutting-edge technology make interplanetary travel accessible, safe, and unforgettable.",
    primaryButtonText = "Book Your Journey",
    primaryButtonHref = "#",
    secondaryButtonText = "Watch Launch",
    secondaryButtonHref = "#",
    tertiaryButtonText = "",
    tertiaryButtonHref = "#",
    partnersTitle = "",
    partners = []
}) => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <section className="w-full isolate min-h-screen overflow-hidden relative">
            {backgroundVideoUrl ? (
                <video
                    src={backgroundVideoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover absolute top-0 right-0 bottom-0 left-0"
                />
            ) : (
                <img
                    src={backgroundImageUrl}
                    alt=""
                    className="w-full h-full object-cover absolute top-0 right-0 bottom-0 left-0"
                />
            )}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-black/30 bg-black/40" />

            {showNav && (
                <header className="z-10 xl:top-4 relative">
                    <div className="mx-6">
                        <div className="flex items-center justify-between pt-4">
                            <a
                                href="#"
                                className="inline-flex items-center justify-center bg-center w-[100px] h-[40px] bg-cover rounded"
                                style={{ backgroundImage: `url(${logoUrl})` }}
                            />

                            <nav className="hidden md:flex items-center gap-2">
                                <div className="flex items-center gap-1 rounded-full bg-white/5 px-1 py-1 ring-1 ring-white/10 backdrop-blur">
                                    {navLinks.map((link, index) => (
                                        <a
                                            key={index}
                                            href={link.href}
                                            className={`px-3 py-2 text-sm font-medium hover:text-white font-sans transition-colors ${link.isActive ? 'text-white/90' : 'text-white/80'
                                                }`}
                                        >
                                            {link.label}
                                        </a>
                                    ))}
                                    <SmartLink
                                        href={ctaButtonHref}
                                        className="ml-1 inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-white/90 font-sans transition-colors"
                                    >
                                        {ctaButtonText}
                                        <ArrowUpRight className="h-4 w-4" />
                                    </SmartLink>
                                </div>
                            </nav>

                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur"
                                aria-expanded={mobileMenuOpen}
                                aria-label="Toggle menu"
                            >
                                <Menu className="h-5 w-5 text-white/90" />
                            </button>
                        </div>
                    </div>
                </header>
            )}

            <div className="z-10 relative">
                <div className="max-w-7xl mx-auto pt-16 sm:pt-24 md:pt-28 lg:pt-32 px-6 pb-16">
                    <div className="mx-auto max-w-3xl text-center">
                        <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-white/10 px-2.5 py-2 ring-1 ring-white/15 backdrop-blur animate-[fadeSlideIn_0.5s_ease-out_1]">
                            <span className="inline-flex items-center text-xs font-medium text-neutral-900 bg-white/90 rounded-full py-0.5 px-2 font-sans">
                                {badgeLabel}
                            </span>
                            <span className="text-sm font-medium text-white/90 font-sans">
                                {badgeText}
                            </span>
                        </div>

                        <h1 className="sm:text-5xl md:text-6xl lg:text-7xl leading-tight text-4xl text-white tracking-tight font-display font-normal animate-[fadeSlideIn_0.5s_ease-out_0.1s_1_both]">
                            {title}
                            <br className="hidden sm:block" />
                            {titleLine2}
                        </h1>

                        <p className="sm:text-lg animate-[fadeSlideIn_0.5s_ease-out_0.2s_1_both] text-base text-white/80 max-w-2xl mt-6 mx-auto">
                            {description}
                        </p>

                        <div className="flex flex-col sm:flex-row sm:gap-4 mt-10 gap-3 items-center justify-center animate-[fadeSlideIn_0.5s_ease-out_0.3s_1_both]">
                            <SmartLink
                                href={primaryButtonHref}
                                className="inline-flex items-center gap-2 hover:bg-white/15 text-sm font-medium text-white bg-white/10 ring-white/15 ring-1 rounded-full py-3 px-5 font-sans transition-colors"
                            >
                                {primaryButtonText}
                                <ArrowRight className="h-4 w-4" />
                            </SmartLink>
                            <SmartLink
                                href={secondaryButtonHref}
                                className="inline-flex items-center gap-2 rounded-full bg-transparent px-5 py-3 text-sm font-medium text-white/90 hover:text-white font-sans transition-colors"
                            >
                                {secondaryButtonText}
                                <Play className="w-4 h-4 fill-white" />
                            </SmartLink>
                        </div>

                        {tertiaryButtonText && (
                            <div className="mt-5 animate-[fadeSlideIn_0.5s_ease-out_0.4s_1_both]">
                                <SmartLink
                                    href={tertiaryButtonHref}
                                    // inline-block + py: dokunmatikte hedef alanı büyüsün
                                    className="inline-block py-2 text-sm text-white/60 underline decoration-white/30 underline-offset-4 hover:text-white/90 hover:decoration-white/60 font-sans transition-colors"
                                >
                                    {tertiaryButtonText}
                                </SmartLink>
                            </div>
                        )}
                    </div>

                    {partnersTitle && (
                        <div className="mx-auto mt-20 max-w-5xl">
                            <p className="animate-[fadeSlideIn_0.5s_ease-out_0.4s_1_both] text-sm text-white/70 text-center">
                                {partnersTitle}
                            </p>
                            {partners && partners.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 animate-[fadeSlideIn_0.5s_ease-out_0.5s_1_both] text-white/70 mt-6 items-center justify-items-center gap-4">
                                    {partners.map((partner, index) => (
                                        <a
                                            key={index}
                                            href={partner.href}
                                            className="inline-flex items-center justify-center bg-center w-[120px] h-[36px] bg-cover rounded-full opacity-80 hover:opacity-100 transition-opacity"
                                            style={{ backgroundImage: `url(${partner.logoUrl})` }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default ResponsiveHeroBanner;
