import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'AuraDetect | Open-Source AI Content Detector & Sentence Highlighter',
  description: '100% Free Forever open-source AI detector and sentence-level highlighter running directly in the browser via Transformers.js & ONNX.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark`}>
      <body className="bg-slate-950 text-slate-100 antialiased font-sans">{children}</body>
    </html>
  );
}
