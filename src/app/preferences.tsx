"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { setMotionEnabled } from "@/lib/motion";

const STORAGE_KEY = "fluina-preferences";

export type EffectPreference = "system" | "on" | "off";
export type FontPreference =
    | "default"
    | "serif"
    | "sans-serif"
    | "monospace"
    | "rounded";

interface Preferences {
    transparency: EffectPreference;
    parallax: EffectPreference;
    font: FontPreference;
}

interface PreferencesContextValue extends Preferences {
    transparencyEnabled: boolean;
    parallaxEnabled: boolean;
    setTransparency: (value: EffectPreference) => void;
    setParallax: (value: EffectPreference) => void;
    setFont: (value: FontPreference) => void;
}

const defaultPreferences: Preferences = {
    transparency: "system",
    parallax: "system",
    font: "default",
};

function normalizeFontPreference(value: unknown): FontPreference {
    if (
        value === "default" ||
        value === "serif" ||
        value === "sans-serif" ||
        value === "monospace" ||
        value === "rounded"
    ) {
        return value;
    }

    return "default";
}

function readStoredPreferences(): Preferences {
    if (typeof window === "undefined") {
        return defaultPreferences;
    }

    const storedPreferences = localStorage.getItem(STORAGE_KEY);

    if (!storedPreferences) {
        return defaultPreferences;
    }

    try {
        const parsedPreferences = JSON.parse(storedPreferences) as {
            transparency?: unknown;
            parallax?: unknown;
            transparencyEnabled?: unknown;
            parallaxEnabled?: unknown;
            font?: unknown;
        };

        return {
            transparency: normalizePreference(
                parsedPreferences.transparency ?? parsedPreferences.transparencyEnabled,
            ),
            parallax: normalizePreference(
                parsedPreferences.parallax ?? parsedPreferences.parallaxEnabled,
            ),
            font: normalizeFontPreference(parsedPreferences.font),
        };
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return defaultPreferences;
    }
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function normalizePreference(value: unknown): EffectPreference {
    if (value === "on" || value === "off" || value === "system") {
        return value;
    }

    return typeof value === "boolean" ? (value ? "on" : "off") : "system";
}

export function PreferencesProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [preferences, setPreferences] = useState(readStoredPreferences);
    const [systemEffects, setSystemEffects] = useState({
        transparency: true,
        parallax: true,
    });
    const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);

    useEffect(() => {
        const storedPreferences = readStoredPreferences();
        setPreferences(storedPreferences);
        setHasLoadedPreferences(true);
    }, []);

    useEffect(() => {
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const transparencyQuery = window.matchMedia(
            "(prefers-reduced-transparency: reduce)",
        );
        const updateSystemEffects = () => {
            setSystemEffects({
                parallax: !motionQuery.matches,
                transparency: !transparencyQuery.matches,
            });
        };

        updateSystemEffects();
        motionQuery.addEventListener("change", updateSystemEffects);
        transparencyQuery.addEventListener("change", updateSystemEffects);

        return () => {
            motionQuery.removeEventListener("change", updateSystemEffects);
            transparencyQuery.removeEventListener("change", updateSystemEffects);
        };
    }, []);

    useEffect(() => {
        if (!hasLoadedPreferences) {
            return;
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }, [hasLoadedPreferences, preferences]);

    const transparencyEnabled =
        preferences.transparency === "system"
            ? systemEffects.transparency
            : preferences.transparency === "on";
    const parallaxEnabled =
        preferences.parallax === "system"
            ? systemEffects.parallax
            : preferences.parallax === "on";

    useEffect(() => {
        document.documentElement.dataset.transparency = transparencyEnabled
            ? "on"
            : "off";
    }, [transparencyEnabled]);

    useEffect(() => {
        document.documentElement.dataset.font = preferences.font;
    }, [preferences.font]);

    setMotionEnabled(parallaxEnabled);

    if (!hasLoadedPreferences) {
        return null;
    }

    const value = {
        ...preferences,
        transparencyEnabled,
        parallaxEnabled,
        setTransparency: (transparency: EffectPreference) =>
            setPreferences((current) => ({ ...current, transparency })),
        setParallax: (parallax: EffectPreference) =>
            setPreferences((current) => ({ ...current, parallax })),
        setFont: (font: FontPreference) =>
            setPreferences((current) => ({ ...current, font })),
    };

    return (
        <PreferencesContext.Provider value={value}>
            {children}
        </PreferencesContext.Provider>
    );
}

export function usePreferences() {
    const context = useContext(PreferencesContext);

    if (!context) {
        throw new Error("usePreferences must be used within PreferencesProvider");
    }

    return context;
}