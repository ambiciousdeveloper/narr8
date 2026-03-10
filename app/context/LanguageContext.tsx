'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { en, ko } from '../locales/translations';

type Language = 'EN' | 'KO';
type Translations = typeof en;

interface LanguageContextType {
    lang: Language;
    t: Translations;
    setLang: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Language>('EN');

    // [개선] 마운트 시 로컬 스토리지에서 언어 설정 불러오기
    useEffect(() => {
        const savedLang = localStorage.getItem('prism_lang') as Language;
        if (savedLang) {
            setLangState(savedLang);
        }
    }, []);

    const translations = lang === 'KO' ? ko : en;

    const setLang = (newLang: Language) => {
        setLangState(newLang);
        localStorage.setItem('prism_lang', newLang); // 로컬 스토리지에 저장
    };

    return (
        <LanguageContext.Provider value={{ lang, t: translations, setLang }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
