import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Medical Chronology & Body Timeline Portal',
  description:
    'Demonstrative aids from medical-record chronologies — milestone timeline, body map, and pre/post-incident causation comparison.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
