import React, { createContext, useContext, useState } from 'react';

export type ThemeColor = 'slate' | 'emerald' | 'indigo' | 'rose' | 'amber' | 'cyan' | 'fuchsia' | 'orange';
export type ThemeFont = 'sans' | 'mono' | 'serif' | 'display' | 'handwriting';

interface ThemeContextType {
  color: ThemeColor;
  font: ThemeFont;
  isDarkMode: boolean;
  setColor: (c: ThemeColor) => void;
  setFont: (f: ThemeFont) => void;
  setIsDarkMode: (d: boolean) => void;
  getBgClass: () => string;
  getSidebarClass: () => string;
  getAccentClass: () => string;
  getTextClass: () => string;
  getBorderClass: () => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [color, setColor] = useState<ThemeColor>('slate');
  const [font, setFont] = useState<ThemeFont>('sans');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  const getBgClass = () => {
    if (!isDarkMode) {
      switch (color) {
        case 'emerald':
          return 'bg-emerald-50';
        case 'indigo':
          return 'bg-indigo-50';
        case 'rose':
          return 'bg-rose-50';
        case 'amber':
          return 'bg-amber-50';
        case 'cyan':
          return 'bg-cyan-50';
        case 'fuchsia':
          return 'bg-fuchsia-50';
        case 'orange':
          return 'bg-orange-50';
        default:
          return 'bg-slate-50';
      }
    }
    switch (color) {
      case 'emerald':
        return 'bg-emerald-950';
      case 'indigo':
        return 'bg-indigo-950';
      case 'rose':
        return 'bg-rose-950';
      case 'amber':
        return 'bg-amber-950';
      case 'cyan':
        return 'bg-cyan-950';
      case 'fuchsia':
        return 'bg-fuchsia-950';
      case 'orange':
        return 'bg-orange-950';
      default:
        return 'bg-slate-900';
    }
  };

  const getSidebarClass = () => {
    if (!isDarkMode) {
      switch (color) {
        case 'emerald':
          return 'bg-emerald-100';
        case 'indigo':
          return 'bg-indigo-100';
        case 'rose':
          return 'bg-rose-100';
        case 'amber':
          return 'bg-amber-100';
        case 'cyan':
          return 'bg-cyan-100';
        case 'fuchsia':
          return 'bg-fuchsia-100';
        case 'orange':
          return 'bg-orange-100';
        default:
          return 'bg-slate-100';
      }
    }
    switch (color) {
      case 'emerald':
        return 'bg-emerald-900';
      case 'indigo':
        return 'bg-indigo-900';
      case 'rose':
        return 'bg-rose-900';
      case 'amber':
        return 'bg-amber-900';
      case 'cyan':
        return 'bg-cyan-900';
      case 'fuchsia':
        return 'bg-fuchsia-900';
      case 'orange':
        return 'bg-orange-900';
      default:
        return 'bg-slate-800';
    }
  };

  const getAccentClass = () => {
    if (!isDarkMode) {
      switch (color) {
        case 'emerald':
          return 'text-emerald-600';
        case 'indigo':
          return 'text-indigo-600';
        case 'rose':
          return 'text-rose-600';
        case 'amber':
          return 'text-amber-600';
        case 'cyan':
          return 'text-cyan-600';
        case 'fuchsia':
          return 'text-fuchsia-600';
        case 'orange':
          return 'text-orange-600';
        default:
          return 'text-slate-600';
      }
    }
    switch (color) {
      case 'emerald':
        return 'text-emerald-400';
      case 'indigo':
        return 'text-indigo-400';
      case 'rose':
        return 'text-rose-400';
      case 'amber':
        return 'text-amber-400';
      case 'cyan':
        return 'text-cyan-400';
      case 'fuchsia':
        return 'text-fuchsia-400';
      case 'orange':
        return 'text-orange-400';
      default:
        return 'text-emerald-400';
    }
  };

  const getTextClass = () => {
    if (!isDarkMode) {
      switch (color) {
        case 'emerald':
          return 'text-emerald-950';
        case 'indigo':
          return 'text-indigo-950';
        case 'rose':
          return 'text-rose-950';
        case 'amber':
          return 'text-amber-950';
        case 'cyan':
          return 'text-cyan-950';
        case 'fuchsia':
          return 'text-fuchsia-950';
        case 'orange':
          return 'text-orange-950';
        default:
          return 'text-slate-900';
      }
    }
    switch (color) {
      case 'emerald':
        return 'text-emerald-50';
      case 'indigo':
        return 'text-indigo-50';
      case 'rose':
        return 'text-rose-50';
      case 'amber':
        return 'text-amber-50';
      case 'cyan':
        return 'text-cyan-50';
      case 'fuchsia':
        return 'text-fuchsia-50';
      case 'orange':
        return 'text-orange-50';
      default:
        return 'text-slate-50';
    }
  };

  const getBorderClass = () => {
    if (!isDarkMode) {
      switch (color) {
        case 'emerald':
          return 'border-emerald-200';
        case 'indigo':
          return 'border-indigo-200';
        case 'rose':
          return 'border-rose-200';
        case 'amber':
          return 'border-amber-200';
        case 'cyan':
          return 'border-cyan-200';
        case 'fuchsia':
          return 'border-fuchsia-200';
        case 'orange':
          return 'border-orange-200';
        default:
          return 'border-slate-200';
      }
    }
    switch (color) {
      case 'emerald':
        return 'border-emerald-800';
      case 'indigo':
        return 'border-indigo-800';
      case 'rose':
        return 'border-rose-800';
      case 'amber':
        return 'border-amber-800';
      case 'cyan':
        return 'border-cyan-800';
      case 'fuchsia':
        return 'border-fuchsia-800';
      case 'orange':
        return 'border-orange-800';
      default:
        return 'border-slate-700';
    }
  };

  const getFontClass = () => {
    switch (font) {
      case 'mono':
        return 'font-mono';
      case 'serif':
        return 'font-serif';
      case 'display':
        return 'font-display';
      case 'handwriting':
        return 'font-handwriting';
      default:
        return 'font-sans';
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        color,
        font,
        isDarkMode,
        setColor,
        setFont,
        setIsDarkMode,
        getBgClass,
        getSidebarClass,
        getAccentClass,
        getTextClass,
        getBorderClass
      }}
    >
      <div className={`h-full w-full ${getFontClass()} ${getBgClass()} ${getTextClass()}`}>{children}</div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
